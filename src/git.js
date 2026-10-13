import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    let out = "", err = "";
    child.stdout?.on("data", (d) => { out += d; });
    child.stderr?.on("data", (d) => { err += d; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || command + " exited with code " + code)));
  });
}

async function runGit(args, tokenPath) {
  if (!tokenPath) return run("git", args);
  const token = (await fs.readFile(tokenPath, "utf8")).trim();
  if (!token) throw new Error("Stored GitHub token is empty. Update it in sub-app config.");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shipgit-askpass-"));
  const askpass = path.join(tempDir, "askpass.sh");
  try {
    await fs.writeFile(askpass, "#!/bin/sh\ncase \"$1\" in\n  *Username*) printf '%s\\n' 'x-access-token' ;;\n  *) printf '%s\\n' \"$SHIPGIT_GITHUB_TOKEN\" ;;\nesac\n", { mode: 0o700 });
    await fs.chmod(askpass, 0o700);
    return await run("git", args, {
      env: { ...process.env, GIT_ASKPASS: askpass, GIT_TERMINAL_PROMPT: "0", SHIPGIT_GITHUB_TOKEN: token }
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function isGitRepo(dir) {
  try { await run("git", ["-C", dir, "rev-parse", "--is-inside-work-tree"]); return true; }
  catch { return false; }
}

export async function prepareRepository({ sourceType, repoUrl, localPath, branch, targetDir, githubTokenPath }) {
  if (sourceType === "clone") {
    if (!repoUrl) throw new Error("Repository URL is required.");
    try { await fs.access(targetDir); throw new Error("Clone destination already exists: " + targetDir); }
    catch (e) { if (e.code !== "ENOENT") throw e; }
    await fs.mkdir(path.dirname(targetDir), { recursive: true });
    await runGit(["clone", "--", repoUrl, targetDir], githubTokenPath);
    if (branch) await run("git", ["-C", targetDir, "checkout", branch]);
    return path.resolve(targetDir);
  }
  if (!(await isGitRepo(localPath))) throw new Error("The selected path is not a Git working tree.");
  return path.resolve(localPath);
}

export async function updateRepository(repoPath, branch, githubTokenPath) {
  if (!(await isGitRepo(repoPath))) throw new Error("Configured repository is not a Git repository.");
  await runGit(["-C", repoPath, "fetch", "--prune", "origin"], githubTokenPath);
  await run("git", ["-C", repoPath, "checkout", branch]);
  await runGit(["-C", repoPath, "pull", "--ff-only", "origin", branch], githubTokenPath);
  return run("git", ["-C", repoPath, "rev-parse", "--short", "HEAD"]);
}
