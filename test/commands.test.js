import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { collectFiles } from "../src/deploy.js";
import { hashFile } from "../src/sftp.js";
import { storeGitHubToken } from "../src/security.js";

test("collectFiles excludes .git and configured paths and calculates content hashes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shipgit-files-"));
  await fs.mkdir(path.join(root, ".git"));
  await fs.writeFile(path.join(root, ".git", "secret"), "x");
  await fs.writeFile(path.join(root, "index.html"), "hello");
  await fs.mkdir(path.join(root, "private"));
  await fs.writeFile(path.join(root, "private", "data.txt"), "hidden");
  const files = await collectFiles({ repoPath: root, exclude: ["private"] });
  assert.deepEqual(files.map((f) => f.relative), ["index.html"]);
  assert.equal(files[0].sha256, await hashFile(path.join(root, "index.html")));
  assert.match(files[0].sha256, /^[a-f0-9]{64}$/);
});

test("SHA-256 detects content changes even when file sizes are identical", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shipgit-hash-"));
  const file = path.join(root, "same-size.txt");
  await fs.writeFile(file, "alpha");
  const first = await hashFile(file);
  await fs.writeFile(file, "bravo");
  const second = await hashFile(file);
  assert.equal((await fs.stat(file)).size, 5);
  assert.notEqual(first, second);
});

test("GitHub token is stored separately with restrictive permissions", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shipgit-token-"));
  const tokenPath = path.join(root, "github-token");
  try {
    await storeGitHubToken("ghp-test-token", tokenPath);
    assert.equal(await fs.readFile(tokenPath, "utf8"), "ghp-test-token\n");
    const mode = (await fs.stat(tokenPath)).mode & 0o777;
    if (process.platform !== "win32") assert.equal(mode, 0o600);
    await assert.rejects(() => storeGitHubToken("another-token", tokenPath));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
