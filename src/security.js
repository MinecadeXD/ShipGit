import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
function runInteractive(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(command + " exited with code " + code)));
  });
}
const expand = (value) => path.resolve(value.replace(/^~(?=$|\/)/, os.homedir()));
export async function storePastedKey(keyText, destination) {
  if (!keyText.includes("-----BEGIN") || !keyText.includes("PRIVATE KEY-----")) throw new Error("That does not look like an SSH private key.");
  const target = expand(destination);
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  try { await fs.access(target); throw new Error("Key file already exists: " + target); }
  catch (e) { if (e.code !== "ENOENT") throw e; }
  await fs.writeFile(target, keyText.endsWith("\n") ? keyText : keyText + "\n", { mode: 0o600, flag: "wx" });
  await fs.chmod(target, 0o600).catch(() => {});
  return target;
}
export async function generateKey(destination) {
  const target = expand(destination);
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  try { await fs.access(target); throw new Error("Key file already exists: " + target); }
  catch (e) { if (e.code !== "ENOENT") throw e; }
  console.log("ssh-keygen will ask for an optional passphrase in the terminal.");
  await runInteractive("ssh-keygen", ["-t", "ed25519", "-f", target, "-C", "ShipGit key"]);
  await fs.chmod(target, 0o600).catch(() => {});
  return target;
}
