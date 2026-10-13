#!/usr/bin/env node
import { startApp } from "../src/app.js";
import { error } from "../src/terminal.js";

function restoreTerminal() {
  if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function" && process.stdin.isRaw) {
    process.stdin.setRawMode(false);
  }
  if (process.stdout.isTTY) process.stdout.write("\x1b[0m\x1b[?25h");
}

process.once("SIGINT", () => {
  restoreTerminal();
  process.exit(130);
});

try {
  await startApp();
} catch (err) {
  restoreTerminal();
  if (err?.code === "SHIPGIT_CANCELLED" || err?.name === "AbortError" || err?.code === "ABORT_ERR") {
    process.exitCode = 130;
  } else {
    console.error(error("ShipGit: " + (err?.message || String(err))));
    process.exitCode = 1;
  }
} finally {
  restoreTerminal();
}
