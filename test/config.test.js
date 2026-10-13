import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "shipgit-test-"));
process.env.SHIPGIT_HOME = temp;
const { validAppName, saveConfig, readConfig, listApps } = await import("../src/utils.js");
const { storePastedKey } = await import("../src/security.js");
test("validates app names", () => {
  assert.equal(validAppName("my-app_1"), true);
  assert.equal(validAppName("../bad"), false);
  assert.equal(validAppName(""), false);
});
test("saves and lists app config with restrictive permissions", async () => {
  const config = { name: "demo", branch: "main", sftp: { host: "example.invalid" } };
  await saveConfig("demo", config);
  assert.deepEqual(await readConfig("demo"), config);
  assert.equal((await listApps()).some((app) => app.name === "demo"), true);
  const stat = await fs.stat(path.join(temp, ".shipgit", "apps", "demo", "config.json"));
  assert.equal(stat.mode & 0o077, 0);
});
test("pasted private key is protected and not overwritten", async () => {
  const target = path.join(temp, "key");
  await storePastedKey("-----BEGIN OPENSSH PRIVATE KEY-----\nexample\n-----END OPENSSH PRIVATE KEY-----", target);
  assert.equal((await fs.stat(target)).mode & 0o077, 0);
  await assert.rejects(() => storePastedKey("-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----", target), /already exists/);
});
