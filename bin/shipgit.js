#!/usr/bin/env node
import { startApp } from "../src/app.js";
startApp().catch((error) => {
  console.error("ShipGit: " + error.message);
  process.exitCode = 1;
});
