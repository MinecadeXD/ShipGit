import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { collectFiles } from "../src/deploy.js";
test("collectFiles excludes .git and configured paths", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shipgit-files-"));
  await fs.mkdir(path.join(root, ".git"));
  await fs.writeFile(path.join(root, ".git", "secret"), "x");
  await fs.writeFile(path.join(root, "index.html"), "hello");
  await fs.mkdir(path.join(root, "private"));
  await fs.writeFile(path.join(root, "private", "data.txt"), "hidden");
  const files = await collectFiles({ repoPath: root, exclude: ["private"] });
  assert.deepEqual(files.map((f) => f.relative), ["index.html"]);
});
