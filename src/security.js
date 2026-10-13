import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

const expand = (value) => path.resolve(value.replace(/^~(?=$|\/)/, os.homedir()));

function runQuiet(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => reject(new Error(command + " could not start: " + error.message)));
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr.trim() || command + " exited with code " + code)));
  });
}

async function ensureNewPath(target) {
  try {
    await fs.access(target);
    throw new Error("File already exists; choose another path to avoid overwriting it: " + target);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

export async function storePastedKey(keyText, destination) {
  if (!keyText.includes("-----BEGIN") || !keyText.includes("PRIVATE KEY-----") || !keyText.includes("-----END")) {
    throw new Error("That does not look like a complete SSH private key.");
  }
  const target = expand(destination);
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await ensureNewPath(target);
  await fs.writeFile(target, keyText.endsWith("\n") ? keyText : keyText + "\n", { mode: 0o600, flag: "wx" });
  await fs.chmod(target, 0o600).catch(() => {});
  return target;
}

export async function generateKey(destination) {
  const target = expand(destination);
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await ensureNewPath(target);
  await runQuiet("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", target, "-C", "ShipGit key"]);
  await fs.chmod(target, 0o600);
  await fs.chmod(target + ".pub", 0o644).catch(() => {});
  await fs.access(target);
  await fs.access(target + ".pub");
  return target;
}

export async function storeGitHubToken(token, destination) {
  if (typeof token !== "string" || !token.trim()) throw new Error("GitHub token is required.");
  const target = expand(destination);
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await fs.writeFile(target, token.trim() + "\n", { mode: 0o600, flag: "wx" });
  await fs.chmod(target, 0o600).catch(() => {});
  return target;
}
