import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { listApps, saveConfig, validAppName, appDir } from "./utils.js";
import { prepareRepository, isGitRepo, run } from "./git.js";
import { generateKey, storePastedKey, storeGitHubToken } from "./security.js";
import { testConnection } from "./sftp.js";
import { color, title, success, error, warning, info, muted, step, section } from "./terminal.js";

const expand = (value) => path.resolve(value.replace(/^~(?=$|\/)/, os.homedir()));
const validRepoUrl = (value) => {
  if (/^git@[a-zA-Z0-9.-]+:[a-zA-Z0-9._/-]+(?:\.git)?$/.test(value)) return true;
  try {
    const url = new URL(value);
    const https = url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
    const ssh = url.protocol === "ssh:" && Boolean(url.hostname) && url.username === "git" && !url.password;
    return https || ssh;
  } catch { return false; }
};
const validBranch = async (branch) => {
  if (!branch || branch.startsWith("-")) return "Enter a valid branch name.";
  try { await run("git", ["check-ref-format", "--branch", branch]); return true; }
  catch { return "Git does not consider that a valid branch name."; }
};
const existingReadableFile = async (value) => {
  try {
    const stat = await fs.stat(expand(value));
    if (!stat.isFile()) return "Choose a file, not a directory.";
    await fs.access(expand(value), fs.constants ? fs.constants.R_OK : undefined);
    return true;
  } catch { return "File not found or not readable. Check the path and try again."; }
};
const hostValid = (value) => /^[a-zA-Z0-9][a-zA-Z0-9.:-]*$/.test(value) && !value.includes("://") || "Enter a hostname or IP address, without sftp://.";
const remotePathValid = (value) => value.startsWith("/") || value === "." || "Use an absolute remote path (for example /public_html) or .";

export async function setupApp(prompts) {
  let name;
  let repoPath;
  let githubTokenPath = null;
  let sourceType;
  let prepared;
  let configSaved = false;
  try {
    console.log(title("\nShipGit · New app setup"));
    console.log(muted("You can use ↑/↓ and Enter in interactive terminals, or numbered choices in fallback terminals."));

    step(1, 5, "App name");
    name = await prompts.ask("App name", {
      required: true,
      validate: async (value) => {
        if (!validAppName(value)) return "Use 1–50 letters, numbers, dots, underscores or hyphens; start with a letter or number.";
        if ((await listApps()).some((app) => app.name.toLowerCase() === value.toLowerCase())) return "An app with that name already exists.";
        return true;
      }
    });
    console.log(success("App name is valid and available."));

    step(2, 5, "Repository source");
    const sourceChoice = await prompts.choose("Where is your repository?", [
      "Clone a GitHub or remote Git repository",
      "Use an existing local Git repository"
    ]);
    sourceType = sourceChoice === 0 ? "clone" : "local";
    let repoUrl = null;
    let localPath = null;

    if (sourceType === "clone") {
      repoUrl = await prompts.ask("Repository URL", {
        required: true,
        validate: (value) => validRepoUrl(value) || "Enter a valid HTTPS or SSH Git repository URL. Do not include credentials."
      });
      console.log(success("Repository URL format looks valid."));
      const visibility = await prompts.choose("Repository visibility", ["Public repository", "Private GitHub repository"]);
      if (visibility === 1) {
        let parsed;
        try { parsed = new URL(repoUrl); } catch {}
        if (!parsed || parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== "github.com" || parsed.username || parsed.password) {
          throw new Error("Private-repository token authentication requires a clean https://github.com/OWNER/REPO.git URL.");
        }
        section("Private GitHub repository");
        console.log(info("A GitHub Personal Access Token is required now so ShipGit can clone this private repository."));
        console.log(muted("Use a token with access to this repository. Your input will be hidden, stored separately from the repository URL, and never printed."));
        const token = await prompts.askSecret("GitHub token", { required: true });
        githubTokenPath = path.join(appDir(name), "github-token");
        await storeGitHubToken(token, githubTokenPath);
        console.log(success("Token stored with restricted file permissions. Checking repository access by cloning…"));
      } else {
        console.log(info("Public repositories do not need a GitHub token."));
      }
    } else {
      localPath = expand(await prompts.ask("Local repository path", {
        required: true,
        validate: async (value) => await isGitRepo(expand(value)) || "That path is not a Git working tree. Check the path and try again."
      }));
      console.log(success("Local Git repository found."));
    }

    step(3, 5, "Deployment branch");
    const branch = await prompts.ask("Branch to deploy", {
      defaultValue: "main",
      required: true,
      validate: validBranch
    });

    repoPath = sourceType === "clone" ? path.join(appDir(name), "repository") : localPath;
    if (sourceType === "clone") {
      try {
        console.log(info("Cloning repository and checking branch…"));
        prepared = await prepareRepository({ sourceType, repoUrl, localPath, branch, targetDir: repoPath, githubTokenPath });
        console.log(success("Repository cloned and branch checked out."));
      } catch (err) {
        if (githubTokenPath) await fs.rm(githubTokenPath, { force: true }).catch(() => {});
        if (repoPath) await fs.rm(repoPath, { recursive: true, force: true }).catch(() => {});
        throw new Error("Repository setup failed: " + err.message + (githubTokenPath ? " Check that the token has access to this repository." : ""));
      }
    } else {
      const hasBranch = await run("git", ["-C", localPath, "show-ref", "--verify", "--quiet", "refs/heads/" + branch]).then(() => true).catch(() => false);
      if (!hasBranch) throw new Error("Branch '" + branch + "' does not exist in the selected local repository.");
      prepared = path.resolve(localPath);
      console.log(success("Branch exists in the local repository."));
    }

    step(4, 5, "SSH authentication");
    const keyChoice = await prompts.choose("How would you like to configure SSH authentication?", [
      "Use an existing private key file",
      "Paste private key text securely",
      "Generate a new Ed25519 key in the background"
    ]);
    let privateKeyPath;

    if (keyChoice === 0) {
      privateKeyPath = expand(await prompts.ask("Private key file path", {
        required: true,
        validate: async (value) => await existingReadableFile(value)
      }));
      console.log(success("Private key file is readable."));
    } else if (keyChoice === 1) {
      section("Secure private-key input");
      console.log(muted("Paste one line at a time. Nothing you type will be echoed. Enter ENDKEY on its own line when finished."));
      const lines = [];
      while (true) {
        const line = await prompts.askSecret("key line");
        if (line === "ENDKEY") break;
        lines.push(line);
      }
      const dest = expand(await prompts.ask("Save private key as", {
        defaultValue: path.join(os.homedir(), ".ssh", "shipgit-" + name),
        required: true,
        validate: async (value) => {
          try { await fs.access(expand(value)); return "That file already exists. Choose a different path to avoid overwriting it."; }
          catch (err) { return err.code === "ENOENT" ? true : "Cannot access that path."; }
        }
      }));
      privateKeyPath = await storePastedKey(lines.join("\n"), dest);
      console.log(success("Private key saved with restricted permissions."));
    } else {
      const dest = expand(await prompts.ask("Save generated key as", {
        defaultValue: path.join(os.homedir(), ".ssh", "shipgit-" + name),
        required: true,
        validate: async (value) => {
          try { await fs.access(expand(value)); return "That file already exists. Choose a different path to avoid overwriting it."; }
          catch (err) { return err.code === "ENOENT" ? true : "Cannot access that path."; }
        }
      }));
      console.log(info("Generating Ed25519 key quietly…"));
      privateKeyPath = await generateKey(dest);
      console.log(success("SSH key created. Private key permissions are restricted."));
      console.log(warning("This key has no passphrase. Register its public key with your hosting provider before deploying."));
      console.log(muted("Public key (safe to share with your hosting provider):"));
      console.log((await fs.readFile(privateKeyPath + ".pub", "utf8")).trim());
    }

    step(5, 5, "SFTP hosting connection");
    let sftp;
    while (true) {
      const host = await prompts.ask("SFTP host", { required: true, validate: hostValid });
      const port = Number(await prompts.ask("SFTP port", {
        defaultValue: "22",
        required: true,
        validate: (value) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 65535 || "Port must be a number from 1 to 65535."
      }));
      const username = await prompts.ask("SFTP username", { required: true });
      const remoteDir = await prompts.ask("Remote destination directory", {
        required: true,
        validate: remotePathValid
      });
      sftp = { host, port, username, remoteDir, privateKeyPath };
      console.log(info("Testing SSH authentication and remote-directory access (read-only)…"));
      try {
        await testConnection(sftp);
        console.log(success("SFTP authentication and destination access verified. No remote files were changed."));
        break;
      } catch (err) {
        console.log(error("SFTP connection check failed: " + err.message));
        if (!(await prompts.confirm("Re-enter the SFTP connection details?", true))) throw new Error("Setup cancelled before saving. No remote files were changed.");
      }
    }

    const excludeInput = await prompts.ask("Exclude paths (comma-separated, blank for none)", {
      validate: (value) => {
        const entries = value.split(",").map((x) => x.trim()).filter(Boolean);
        if (entries.some((item) => path.isAbsolute(item) || item.split(/[\\/]/).includes(".."))) return "Exclude paths must be relative and cannot contain '..'.";
        return true;
      }
    });
    const exclude = excludeInput.split(",").map((x) => x.trim().replace(/\\/g, "/")).filter(Boolean);
    const config = {
      name, sourceType, repoUrl, repoPath: prepared, branch,
      updateBeforeDeploy: sourceType === "clone",
      ...(githubTokenPath ? { githubTokenPath } : {}),
      exclude, deletion: { enabled: false }, sftp
    };

    section("Review your app");
    const review = [
      ["App name", name],
      ["Repository", sourceType === "clone" ? repoUrl : prepared],
      ["Visibility", sourceType === "clone" ? (githubTokenPath ? "Private GitHub (token stored securely)" : "Public / remote Git") : "Local repository"],
      ["Branch", branch],
      ["SSH key", privateKeyPath],
      ["SFTP host", sftp.host + ":" + sftp.port],
      ["Username", sftp.username],
      ["Remote directory", sftp.remoteDir],
      ["Excluded paths", exclude.length ? exclude.join(", ") : "None"],
      ["Remote deletion", "Disabled"]
    ];
    for (const [label, value] of review) console.log(color(label.padEnd(19), "cyan") + value);
    console.log(muted("\nSetup only saves configuration; it will not upload files."));
    const next = await prompts.choose("Finish setup?", ["Save configuration and finish", "Cancel setup"]);
    if (next !== 0) throw new Error("Setup cancelled; configuration was not saved.");
    await saveConfig(name, config);
    configSaved = true;
    console.log(success("Setup completed. Configuration saved."));
    console.log(info("No files have been deployed. Choose 'Deploy now' from the next menu when you're ready."));
    return name;
  } catch (err) {
    if (!configSaved && sourceType === "clone" && name) {
      await fs.rm(appDir(name), { recursive: true, force: true }).catch(() => {});
    }
    throw err;
  }
}
