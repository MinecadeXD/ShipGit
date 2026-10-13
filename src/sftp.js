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

export async function deployFiles(config, files, { dryRun = false } = {}) {
  if (dryRun) return files.map((file) => ({ path: file.relative, action: "would-check-and-upload-if-changed" }));
  return withSftp(config, async (client) => {
    const root = config.remoteDir || ".";
    if (!isDirectoryStat(await client.stat(root))) throw new Error("Remote destination is not a directory.");
    const results = [];
    for (const file of files) {
      const remote = path.posix.join(root.replace(/\\/g, "/"), file.relative.split(path.sep).join("/"));
      let remoteStat;
      try {
        remoteStat = await client.stat(remote);
      } catch (error) {
        if (!isMissingRemote(error)) throw new Error("Cannot inspect remote file " + remote + ": " + error.message);
      }

      if (!remoteStat) {
        await client.mkdir(path.posix.dirname(remote), true);
        await client.put(file.absolute, remote);
        results.push({ path: file.relative, action: "uploaded-new" });
        continue;
      }
      if (!isFileStat(remoteStat)) throw new Error("Remote path exists but is not a regular file: " + remote);
      if (Number(remoteStat.size) !== file.size) {
        await client.mkdir(path.posix.dirname(remote), true);
        await client.put(file.absolute, remote);
        results.push({ path: file.relative, action: "uploaded-size-changed" });
        continue;
      }

      // Size is only a quick filter. Same-sized files are downloaded to a temporary
      // file and compared by SHA-256 so changed content is never skipped by size alone.
      let digest;
      try {
        digest = await remoteHash(client, remote);
      } catch (error) {
        throw new Error("Could not verify remote content for " + remote + ": " + error.message);
      }
      if (digest === file.sha256) {
        results.push({ path: file.relative, action: "skipped-identical" });
      } else {
        await client.put(file.absolute, remote);
        results.push({ path: file.relative, action: "uploaded-content-changed" });
      }
    }
    return results;
  });
}
