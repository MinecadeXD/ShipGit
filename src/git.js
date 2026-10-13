import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
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
export async function isGitRepo(dir) {
  try { await run("git", ["-C", dir, "rev-parse", "--is-inside-work-tree"]); return true; }
  catch { return false; }
}
export async function prepareRepository({ sourceType, repoUrl, localPath, branch, targetDir }) {
  if (sourceType === "clone") {
    if (!repoUrl) throw new Error("Repository URL is required.");
    try { await fs.access(targetDir); throw new Error("Clone destination already exists: " + targetDir); }
    catch (e) { if (e.code !== "ENOENT") throw e; }
    await fs.mkdir(path.dirname(targetDir), { recursive: true });
    await run("git", ["clone", "--", repoUrl, targetDir]);
    if (branch) await run("git", ["-C", targetDir, "checkout", branch]);
    return path.resolve(targetDir);
  }
  if (!(await isGitRepo(localPath))) throw new Error("The selected path is not a Git working tree.");
  return path.resolve(localPath);
}
export async function updateRepository(repoPath, branch) {
  if (!(await isGitRepo(repoPath))) throw new Error("Configured repository is not a Git repository.");
  await run("git", ["-C", repoPath, "fetch", "--prune", "origin"]);
  await run("git", ["-C", repoPath, "checkout", branch]);
  await run("git", ["-C", repoPath, "pull", "--ff-only", "origin", branch]);
  return run("git", ["-C", repoPath, "rev-parse", "--short", "HEAD"]);
}
