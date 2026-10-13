#!/usr/bin/env node
import { startApp } from "../src/app.js";
import { error } from "../src/terminal.js";
startApp().catch((err) => {
  console.error(error("ShipGit: " + err.message));
  process.exitCode = 1;
});
