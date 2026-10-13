import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { listApps, saveConfig, validAppName, appDir } from "./utils.js";
import { prepareRepository } from "./git.js";
import { generateKey, storePastedKey, storeGitHubToken } from "./security.js";
import { testConnection } from "./sftp.js";
const expand = (value) => path.resolve(value.replace(/^~(?=$|\/)/, os.homedir()));
export async function setupApp(prompts) {
  const name = await prompts.ask("Sub-app name", { required: true });
  if (!validAppName(name)) throw new Error("Invalid name: use 1–50 letters, numbers, dots, underscores or hyphens.");
  if ((await listApps()).some((app) => app.name.toLowerCase() === name.toLowerCase())) throw new Error("A sub-app with that name already exists.");
  const sourceChoice = await prompts.choose("Repository source", ["Clone a remote Git repository", "Use an existing local Git repository"]);
  const sourceType = sourceChoice === 0 ? "clone" : "local";
  const repoUrl = sourceType === "clone" ? await prompts.ask("Git repository URL", { required: true }) : null;
  const localPath = sourceType === "local" ? expand(await prompts.ask("Local repository path", { required: true })) : null;
  let githubTokenPath = null;
  if (sourceType === "clone") {
    if (/^https?:\/\//i.test(repoUrl)) {
      const parsed = new URL(repoUrl);
      if (parsed.username || parsed.password) throw new Error("Do not put credentials in the repository URL; use the private-repository token prompt.");
    }
    const visibility = await prompts.choose("Repository visibility", ["Public repository", "Private GitHub repository (use a token)"]);
    if (visibility === 1) {
      let parsed;
      try { parsed = new URL(repoUrl); } catch { throw new Error("Private-repository token authentication requires an HTTPS GitHub URL."); }
      if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== "github.com" || parsed.username || parsed.password) {
        throw new Error("Private-repository token authentication requires a clean https://github.com/OWNER/REPO.git URL.");
      }
      const token = await prompts.askSecret("GitHub Personal Access Token", { required: true });
      githubTokenPath = path.join(appDir(name), "github-token");
      await storeGitHubToken(token, githubTokenPath);
    }
  }
  const branch = await prompts.ask("Branch to deploy", { defaultValue: "main", required: true });
  const repoPath = sourceType === "clone" ? path.join(appDir(name), "repository") : localPath;
  let prepared;
  try {
    prepared = await prepareRepository({ sourceType, repoUrl, localPath, branch, targetDir: repoPath, githubTokenPath });
  } catch (error) {
    if (githubTokenPath) await fs.rm(githubTokenPath, { force: true }).catch(() => {});
    throw error;
  }
  const host = await prompts.ask("SFTP host", { required: true });
  const port = Number(await prompts.ask("SFTP port", { defaultValue: "22", required: true }));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SFTP port must be 1–65535.");
  const username = await prompts.ask("SFTP username", { required: true });
  const remoteDir = await prompts.ask("Remote destination directory", { required: true });
  const keyChoice = await prompts.choose("SSH private key", ["Use existing key file", "Paste private key text manually", "Generate Ed25519 key"]);
  let privateKeyPath;
  if (keyChoice === 0) privateKeyPath = expand(await prompts.ask("Private key path", { required: true }));
  if (keyChoice === 1) {
    console.log("Paste the private key line by line; finish with a line containing only ENDKEY. Input may be visible in this terminal.");
    const lines = [];
    while (true) { const line = await prompts.ask("key>"); if (line === "ENDKEY") break; lines.push(line); }
    const dest = expand(await prompts.ask("Save key path", { defaultValue: path.join(os.homedir(), ".ssh", "shipgit-" + name) }));
    privateKeyPath = await storePastedKey(lines.join("\n"), dest);
  }
  if (keyChoice === 2) {
    const dest = expand(await prompts.ask("Save generated key path", { defaultValue: path.join(os.homedir(), ".ssh", "shipgit-" + name) }));
    privateKeyPath = await generateKey(dest);
    console.log("Register this public key with your hosting provider:");
    console.log(await fs.readFile(privateKeyPath + ".pub", "utf8"));
  }
  await fs.access(privateKeyPath);
  const exclude = (await prompts.ask("Exclude paths (comma-separated, blank for none)")).split(",").map((x) => x.trim()).filter(Boolean);
  const config = { name, sourceType, repoUrl, repoPath: prepared, branch, updateBeforeDeploy: sourceType === "clone", ...(githubTokenPath ? { githubTokenPath } : {}), exclude, deletion: { enabled: false }, sftp: { host, port, username, remoteDir, privateKeyPath } };
  console.log("Testing SFTP authentication and destination access (read-only)...");
  await testConnection(config.sftp);
  console.log("Connection test passed; no remote files changed.");
  console.log(JSON.stringify({ name, sourceType, repoPath: prepared, branch, sftp: { host, port, username, remoteDir, privateKeyPath }, exclude, remoteDeletion: "disabled" }, null, 2));
  if (!(await prompts.confirm("Save configuration?"))) throw new Error("Setup cancelled; no configuration saved.");
  await saveConfig(name, config);
  console.log("Created " + name + ". It has not been deployed.");
  return name;
}
