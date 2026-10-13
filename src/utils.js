import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

export const DATA_DIR = path.join(process.env.SHIPGIT_HOME || os.homedir(), ".shipgit");
export const APPS_DIR = path.join(DATA_DIR, "apps");
export function validAppName(name) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,49}$/.test(name) && name !== "." && name !== "..";
}
export async function ensureDirs() {
  await fs.mkdir(APPS_DIR, { recursive: true, mode: 0o700 });
  await fs.chmod(DATA_DIR, 0o700).catch(() => {});
  await fs.chmod(APPS_DIR, 0o700).catch(() => {});
}
export const appDir = (name) => path.join(APPS_DIR, name);
export const configPath = (name) => path.join(appDir(name), "config.json");
export async function listApps() {
  await ensureDirs();
  const entries = await fs.readdir(APPS_DIR, { withFileTypes: true });
  const apps = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try { apps.push({ name: entry.name, config: JSON.parse(await fs.readFile(configPath(entry.name), "utf8")) }); }
    catch { /* Ignore incomplete or invalid entries. */ }
  }
  return apps.sort((a, b) => a.name.localeCompare(b.name));
}
export async function saveConfig(name, config) {
  await ensureDirs();
  await fs.mkdir(appDir(name), { recursive: true, mode: 0o700 });
  const target = configPath(name), temp = target + ".tmp";
  await fs.writeFile(temp, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  await fs.rename(temp, target);
  await fs.chmod(target, 0o600).catch(() => {});
}
export async function readConfig(name) { return JSON.parse(await fs.readFile(configPath(name), "utf8")); }
export function redactConfig(config) {
  const copy = structuredClone(config);
  if (copy.sftp) delete copy.sftp.privateKeyText;
  return copy;
}
