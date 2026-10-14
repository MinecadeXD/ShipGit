import SftpClient from "ssh2-sftp-client";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export async function withSftp(config, callback) {
  const client = new SftpClient("shipgit");
  const options = { host: config.host, port: Number(config.port || 22), username: config.username, privateKey: await fs.readFile(config.privateKeyPath) };
  if (config.passphrase) options.passphrase = config.passphrase;
  try { await client.connect(options); return await callback(client); }
  finally { await client.end().catch(() => {}); }
}

export async function testConnection(config) {
  return withSftp(config, async (client) => {
    const remote = config.remoteDir || ".";
    const stat = await client.stat(remote);
    if (!isDirectoryStat(stat)) throw new Error("Remote destination exists but is not a directory.");
    return { connected: true, remote };
  });
}

export async function listRemoteDirectory(config) {
  return withSftp(config, async (client) => {
    const remote = config.remoteDir || ".";
    const stat = await client.stat(remote);
    if (!isDirectoryStat(stat)) throw new Error("Remote destination exists but is not a directory.");
    const entries = await client.list(remote);
    return entries
      .filter((entry) => entry.name && entry.name !== "." && entry.name !== ".." && !entry.name.includes("/") && !entry.name.includes("\\\\"))
      .map((entry) => ({
        name: entry.name,
        type: entry.type,
        size: Number(entry.size || 0),
        modifyTime: Number(entry.modifyTime || 0)
      }))
      .sort((a, b) => (a.type === "d" ? 0 : 1) - (b.type === "d" ? 0 : 1) || a.name.localeCompare(b.name));
  });
}

export async function hashFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function isDirectoryStat(stat) {
  return typeof stat.isDirectory === "function" ? stat.isDirectory() : Boolean(stat.isDirectory);
}
function isFileStat(stat) {
  return typeof stat.isFile === "function" ? stat.isFile() : Boolean(stat.isFile);
}
function isMissingRemote(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "ENOENT" || error?.code === 2 ||
    message.includes("no such file") || message.includes("does not exist") ||
    message.includes("not found");
}
function shouldExclude(relative, excludes = []) {
  const normalized = relative.split(path.sep).join("/");
  const base = path.posix.basename(normalized);
  return excludes.some((pattern) => {
    const p = String(pattern).replace(/\\/g, "/").replace(/^\.\//, "");
    return normalized === p || normalized.startsWith((p.endsWith("/") ? p.slice(0, -1) : p) + "/") || base === p;
  });
}
export function assertSafeDeletionRoot(root) {
  const value = String(root || "").replace(/\\\\/g, "/");
  if (value === "." || value === "/") return;
  if (!value.startsWith("/") || value.split("/").includes("..") || path.posix.normalize(value) !== value.replace(/\/$/, "")) {
    throw new Error("Remote deletion requires '.', '/', or a normalized absolute remote directory without '..' segments.");
  }
}

async function remoteHash(client, remotePath) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shipgit-compare-"));
  const tempFile = path.join(tempDir, "remote-file");
  try {
    await client.get(remotePath, tempFile);
    return await hashFile(tempFile);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function listRemoteFiles(client, root) {
  const files = [];
  async function walk(current) {
    const entries = await client.list(current);
    for (const entry of entries) {
      if (!entry.name || entry.name === "." || entry.name === ".." || entry.name.includes("/") || entry.name.includes("\\")) continue;
      const remotePath = path.posix.join(current, entry.name);
      if (entry.type === "l") continue; // Never follow or delete symlinks.
      if (entry.type === "d") await walk(remotePath);
      else files.push({ remotePath, relative: path.posix.relative(root, remotePath) });
    }
  }
  await walk(root);
  return files;
}

export async function deployFiles(config, files, { dryRun = false, deletion = { enabled: false }, excludes = [] } = {}) {
  const root = String(config.remoteDir || ".").replace(/\\/g, "/");
  const deletionEnabled = Boolean(deletion?.enabled);
  if (deletionEnabled) assertSafeDeletionRoot(root);
  if (deletionEnabled && !dryRun && files.length === 0) throw new Error("Refusing remote deletion because the local deployment contains no files.");
  return withSftp(config, async (client) => {
    if (!isDirectoryStat(await client.stat(root))) throw new Error("Remote destination is not a directory.");
    const results = [];
    const localPaths = new Set(files.map((file) => file.relative.split(path.sep).join("/")));

    for (const file of files) {
      const relative = file.relative.split(path.sep).join("/");
      const remote = path.posix.join(root, relative);
      let remoteStat;
      try { remoteStat = await client.stat(remote); }
      catch (error) {
        if (!isMissingRemote(error)) throw new Error("Cannot inspect remote file " + remote + ": " + error.message);
      }

      let action;
      if (!remoteStat) action = "new";
      else {
        if (!isFileStat(remoteStat)) throw new Error("Remote path exists but is not a regular file: " + remote);
        if (Number(remoteStat.size) !== file.size) action = "size-changed";
        else {
          let digest;
          try { digest = await remoteHash(client, remote); }
          catch (error) { throw new Error("Could not verify remote content for " + remote + ": " + error.message); }
          action = digest === file.sha256 ? "identical" : "content-changed";
        }
      }

      if (dryRun) {
        results.push({ path: relative, action: action === "identical" ? "would-skip-identical" : "would-upload-" + action });
      } else if (action === "identical") {
        results.push({ path: relative, action: "skipped-identical" });
      } else {
        await client.mkdir(path.posix.dirname(remote), true);
        await client.put(file.absolute, remote);
        results.push({ path: relative, action: "uploaded-" + action });
      }
    }

    if (deletionEnabled) {
      const remoteFiles = await listRemoteFiles(client, root);
      for (const item of remoteFiles) {
        if (localPaths.has(item.relative) || shouldExclude(item.relative, excludes)) continue;
        if (dryRun) results.push({ path: item.relative, action: "would-delete-obsolete" });
        else {
          await client.delete(item.remotePath);
          results.push({ path: item.relative, action: "deleted-obsolete" });
        }
      }
    }
    return results;
  });
}
