import fs from "node:fs/promises";
import path from "node:path";
import { updateRepository } from "./git.js";
async function walk(root, current, excludes, output) {
  for (const entry of await fs.readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name), relative = path.relative(root, absolute);
    if (excludes.some((pattern) => relative === pattern || relative.startsWith(pattern + "/") || entry.name === pattern)) continue;
    if (entry.isDirectory()) await walk(root, absolute, excludes, output);
    else if (entry.isFile()) output.push({ absolute, relative, size: (await fs.stat(absolute)).size });
  }
}
export async function collectFiles(config) {
  const files = [];
  await walk(config.repoPath, config.repoPath, [".git", ...(config.exclude || [])], files);
  return files;
}
export async function deploy(config, { dryRun = false } = {}) {
  let commit = null;
  if (config.sourceType === "clone" && config.updateBeforeDeploy !== false) commit = await updateRepository(config.repoPath, config.branch);
  const files = await collectFiles(config);
  const { deployFiles } = await import("./sftp.js");
  const results = await deployFiles(config.sftp, files, { dryRun });
  return { commit, total: files.length, results, dryRun };
}
