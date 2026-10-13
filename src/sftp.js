import SftpClient from "ssh2-sftp-client";
import fs from "node:fs/promises";
import path from "node:path";
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
    if (!stat.isDirectory) throw new Error("Remote destination exists but is not a directory.");
    return { connected: true, remote };
  });
}
export async function deployFiles(config, files, { dryRun = false } = {}) {
  if (dryRun) return files.map((file) => ({ path: file.relative, action: "would-upload" }));
  return withSftp(config, async (client) => {
    const root = config.remoteDir || ".";
    if (!(await client.stat(root)).isDirectory) throw new Error("Remote destination is not a directory.");
    const results = [];
    for (const file of files) {
      const remote = path.posix.join(root.replace(/\\/g, "/"), file.relative.split(path.sep).join("/"));
      await client.mkdir(path.posix.dirname(remote), true);
      let upload = true;
      try { const stat = await client.stat(remote); upload = !stat.isFile || Number(stat.size) !== file.size; }
      catch (e) { if (!/no such file|not exist|does not exist|failure/i.test(e.message)) throw e; }
      if (upload) { await client.put(file.absolute, remote); results.push({ path: file.relative, action: "uploaded" }); }
      else results.push({ path: file.relative, action: "skipped-same-size" });
    }
    return results;
  });
}
