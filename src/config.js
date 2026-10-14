import fs from "node:fs/promises";
import path from "node:path";
import { readConfig, saveConfig, appDir, validDeployAlias, listApps } from "./utils.js";
import { testConnection, listRemoteDirectory } from "./sftp.js";
import { listRemoteBranches, listLocalBranches, run } from "./git.js";
import { success, error, info, muted, warning, section } from "./terminal.js";

const expand = (value) => path.resolve(String(value).replace(/^~(?=$|\/)/, process.env.HOME || ""));
const validRemotePath = (value) => {
  const normalized = String(value).replace(/\\/g, "/");
  if (normalized === "." || normalized === "/") return true;
  return normalized.startsWith("/") && !normalized.split("/").includes("..") &&
    path.posix.normalize(normalized) === normalized.replace(/\/$/, "");
};
const validPort = (value) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 65535 || "Port must be a number from 1 to 65535.";
const validBranch = async (value) => { try { await run("git", ["check-ref-format", "--branch", value]); return true; } catch { return "Enter a valid Git branch name."; } };

async function chooseBranch(config, prompts) {
  while (true) {
    try {
      const branches = config.sourceType === "clone"
        ? await listRemoteBranches(config.repoUrl, config.githubTokenPath)
        : await listLocalBranches(config.repoPath);
      if (!branches.length) throw new Error("No branches were found.");
      const choice = await prompts.choose("Select deployment branch", [...branches, "Enter a branch manually", "Refresh branch list"]);
      if (choice < branches.length) return branches[choice];
      if (choice === branches.length) return prompts.ask("Branch name", { defaultValue: config.branch, required: true, validate: validBranch });
    } catch (err) {
      console.log(warning("Automatic branch discovery failed: " + err.message));
      const next = await prompts.choose("How would you like to continue?", ["Enter branch manually", "Retry branch discovery", "Cancel branch change"]);
      if (next === 0) return prompts.ask("Branch name", { defaultValue: config.branch, required: true, validate: validBranch });
      if (next === 2) return null;
    }
  }
}

export async function configureApp(name, prompts) {
  const config = await readConfig(name);
  while (true) {
    const choices = [
      "Repository and branch",
      ...(config.sourceType === "clone" ? ["Set/update GitHub token"] : []),
      "SFTP connection",
      "SSH private key path",
      "Exclude paths",
      "Remote deletion: " + (config.deletion?.enabled ? "ON" : "OFF"),
      "Deploy alias",
      "Test SFTP connection",
      "Back"
    ];
    const choice = await prompts.choose("Config · " + name, choices);
    const action = choices[choice];
    if (action === "Back") return;

    if (action === "Set/update GitHub token") {
      let parsed;
      try { parsed = new URL(config.repoUrl); } catch {}
      if (!parsed || parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== "github.com" || parsed.username || parsed.password) {
        console.log(error("GitHub tokens require a clean https://github.com/OWNER/REPO.git URL."));
        continue;
      }
      const token = await prompts.askSecret("GitHub Personal Access Token", { required: true });
      if (!(await prompts.confirm("Replace the stored GitHub token?", true))) {
        console.log(muted("Token change cancelled."));
        continue;
      }
      const tokenPath = config.githubTokenPath || path.join(appDir(name), "github-token");
      await fs.mkdir(path.dirname(tokenPath), { recursive: true, mode: 0o700 });
      const tempPath = tokenPath + ".tmp";
      await fs.writeFile(tempPath, token.trim() + "\n", { mode: 0o600 });
      await fs.rename(tempPath, tokenPath);
      await fs.chmod(tokenPath, 0o600).catch(() => {});
      config.githubTokenPath = tokenPath;
      await saveConfig(name, config);
      console.log(success("GitHub token saved securely."));
      continue;
    }

    if (action === "Repository and branch") {
      const candidate = { ...config };
      if (config.sourceType === "clone") {
        candidate.repoUrl = await prompts.ask("Repository URL", {
          defaultValue: config.repoUrl, required: true,
          validate: (v) => {
            try {
              const u = new URL(v);
              return (u.protocol === "https:" && !u.username && !u.password) || (u.protocol === "ssh:" && u.username === "git" && !u.password) || "Enter a valid repository URL without embedded credentials.";
            } catch { return /^git@[a-zA-Z0-9.-]+:[a-zA-Z0-9._/-]+(?:\.git)?$/.test(v) || "Enter a valid repository URL."; }
          }
        });
      } else {
        candidate.repoPath = expand(await prompts.ask("Local repository path", { defaultValue: config.repoPath, required: true }));
      }
      const branch = await chooseBranch(candidate, prompts);
      if (branch === null) continue;
      config.repoUrl = candidate.repoUrl;
      config.repoPath = candidate.repoPath;
      config.branch = branch;
    } else if (action === "SFTP connection") {
      const candidate = { ...config.sftp };
      candidate.host = await prompts.ask("SFTP host", { defaultValue: candidate.host, required: true, validate: (v) => /^[a-zA-Z0-9][a-zA-Z0-9.:-]*$/.test(v) || "Enter a hostname or IP address." });
      candidate.port = Number(await prompts.ask("SFTP port", { defaultValue: String(candidate.port || 22), required: true, validate: validPort }));
      candidate.username = await prompts.ask("SFTP username", { defaultValue: candidate.username, required: true });
      let cancelled = false;
      while (true) {
        candidate.remoteDir = await prompts.ask("Remote destination", {
          defaultValue: candidate.remoteDir || ".",
          required: true,
          validate: (v) => validRemotePath(v) || "Use '.', or an absolute path without '..' segments."
        });
        try {
          await testConnection(candidate);
          const entries = await listRemoteDirectory(candidate);
          console.log(section("Remote path preview · " + candidate.remoteDir));
          if (!entries.length) console.log(muted("(Directory is empty.)"));
          else {
            for (const entry of entries) {
              const label = entry.type === "d" ? "DIR " : entry.type === "l" ? "LINK" : "FILE";
              console.log("  " + color(label.padEnd(5), entry.type === "d" ? "cyan" : entry.type === "l" ? "orange" : "white") + entry.name);
            }
          }
          const choice = await prompts.choose("Use this remote destination?", ["Confirm path", "Edit path"]);
          if (choice === 0) break;
        } catch (err) {
          console.log(error("Could not preview remote path: " + err.message));
          const choice = await prompts.choose("Remote path preview failed", ["Edit path", "Retry preview", "Cancel SFTP changes"]);
          if (choice === 0) continue;
          if (choice === 1) continue;
          cancelled = true;
          break;
        }
      }
      if (cancelled) {
        console.log(muted("SFTP changes discarded."));
        continue;
      }
      try {
        await testConnection(candidate);
        if (!(await prompts.confirm("Connection verified. Save these SFTP settings?", true))) {
          console.log(muted("SFTP changes discarded."));
          continue;
        }
        config.sftp = candidate;
        await saveConfig(name, config);
        console.log(success("SFTP settings saved and verified. No remote files changed."));
      } catch (err) { console.log(error("SFTP test failed; settings were not changed: " + err.message)); }
      continue;
    } else if (action === "SSH private key path") {
      const candidate = expand(await prompts.ask("Private key path", { defaultValue: config.sftp.privateKeyPath, required: true }));
      try {
        const stat = await fs.stat(candidate);
        if (!stat.isFile()) throw new Error("That path is not a file.");
        await fs.access(candidate);
        const sftp = { ...config.sftp, privateKeyPath: candidate };
        await testConnection(sftp);
        if (!(await prompts.confirm("SSH key verified. Save this key path?", true))) continue;
        config.sftp = sftp;
        await saveConfig(name, config);
        console.log(success("SSH key path saved and verified."));
      } catch (err) { console.log(error("SSH key check failed; existing setting kept: " + err.message)); }
      continue;
    } else if (action === "Exclude paths") {
      const value = await prompts.ask("Comma-separated relative paths to exclude", {
        defaultValue: (config.exclude || []).join(", "),
        validate: (v) => v.split(",").map((x) => x.trim()).filter(Boolean).every((x) => !path.isAbsolute(x) && !x.split(/[\\/]/).includes("..")) || "Exclusions must be relative and cannot contain '..'."
      });
      const exclude = value.split(",").map((x) => x.trim().replace(/\\/g, "/")).filter(Boolean);
      if (await prompts.confirm("Save exclusions?", true)) {
        config.exclude = exclude;
        await saveConfig(name, config);
        console.log(success("Exclusions saved."));
      } else console.log(muted("Exclusion changes discarded."));
      continue;
    } else if (action.startsWith("Remote deletion:")) {
      const currentlyEnabled = Boolean(config.deletion?.enabled);
      if (!currentlyEnabled) {
        const remote = String(config.sftp.remoteDir || ".").replace(/\\/g, "/");
        if (!validRemotePath(remote)) {
          console.log(error("Choose '.', or an absolute remote path without '..' segments before enabling remote deletion."));
          continue;
        }
        console.log(warning("When enabled, files inside the configured remote directory that are not present locally may be deleted."));
        if (remote === "/" || remote === ".") {
          console.log(warning("DANGER: this destination is broad. Remote deletion may remove files unrelated to this app."));
          if (!(await prompts.confirm("I understand the risk of enabling deletion at '" + remote + "'. Continue?", false))) {
            console.log(muted("Remote deletion remains OFF."));
            continue;
          }
        }
        if (!(await prompts.confirm("Enable remote deletion for this app?", false))) {
          console.log(muted("Remote deletion remains OFF."));
          continue;
        }
        config.deletion = { ...(config.deletion || {}), enabled: true };
      } else {
        if (!(await prompts.confirm("Disable remote deletion and preserve extra remote files?", true))) continue;
        config.deletion = { ...(config.deletion || {}), enabled: false };
      }
      await saveConfig(name, config);
      console.log(success("Remote deletion is now " + (config.deletion.enabled ? "ON" : "OFF") + "."));
      continue;
    } else if (action === "Deploy alias") {
      const current = config.deployAlias || "";
      const next = await prompts.choose("Deploy alias", [
        current ? "Change alias (" + current + ")" : "Set a new alias",
        current ? "Remove alias" : "Leave unset",
        "Back"
      ]);
      if (next === 2) continue;
      if (next === 1) {
        if (!current) continue;
        if (await prompts.confirm("Remove deploy alias '" + current + "'?", false)) {
          delete config.deployAlias;
          await saveConfig(name, config);
          console.log(success("Deploy alias removed."));
        }
        continue;
      }
      const alias = await prompts.ask("Alias (used as: sg <alias>)", {
        defaultValue: current, required: true,
        validate: (v) => validDeployAlias(v) || "Use 1–40 letters, numbers, dots, underscores or hyphens. Built-in commands are reserved."
      });
      const apps = await listApps();
      if (apps.some((app) => app.name !== name && app.config.deployAlias?.toLowerCase() === alias.toLowerCase())) {
        console.log(error("That alias is already assigned to another app."));
        continue;
      }
      if (await prompts.confirm("Save alias 'sg " + alias + "'?", true)) {
        config.deployAlias = alias;
        await saveConfig(name, config);
        console.log(success("Deploy alias saved. Use 'sg " + alias + "' or 'sg " + alias + " dry-run' from any directory."));
      }
      continue;
    } else if (action === "Test SFTP connection") {
      try { await testConnection(config.sftp); console.log(success("SFTP connection passed; no files changed.")); }
      catch (err) { console.log(error("SFTP connection failed: " + err.message)); }
      continue;
    }

    if (await prompts.confirm("Save changes?", true)) {
      await saveConfig(name, config);
      console.log(success("Changes saved; nothing was deployed."));
    } else console.log(warning("Changes discarded."));
  }
}
