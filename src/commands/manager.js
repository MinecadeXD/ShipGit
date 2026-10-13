import fs from "node:fs/promises";
import { Prompts } from "../prompts.js";
import { appDir, listApps, readConfig } from "../utils.js";
import { setupApp } from "../setup.js";
import { configureApp } from "../config.js";
import { subAppPrompt, deployApp } from "./subapp.js";
import { managerTitle, success, error, info, muted, warning, section } from "../terminal.js";

async function selectApp(prompts, label) {
  const apps = await listApps();
  if (!apps.length) {
    console.log(warning("No apps are configured yet."));
    return null;
  }
  const choice = await prompts.choose(label, [...apps.map((app) => app.name), "Cancel"]);
  return choice === apps.length ? null : apps[choice].name;
}

async function afterSetup(name, prompts) {
  const next = await prompts.choose("Setup saved. What next?", [
    "Deploy now",
    "Open app command prompt",
    "Return to main menu"
  ]);
  if (next === 2) return "menu";
  if (next === 1) {
    await subAppPrompt(name, prompts);
    return "continue";
  }
  await deployApp(name, prompts, false);
  return "continue";
}

async function manageApps(prompts) {
  while (true) {
    section("Manage Apps");
    const choice = await prompts.choose("Choose an action", [
      "Create a new app",
      "Open an app",
      "Configure an app",
      "Delete an app",
      "List apps",
      "Back to main menu"
    ]);
    if (choice === 5) return "menu";
    if (choice === 0) {
      try {
        const name = await setupApp(prompts);
        if (await afterSetup(name, prompts) === "menu") return "menu";
      } catch (err) { console.log(error("Setup failed: " + err.message)); }
      continue;
    }
    if (choice === 1) {
      const name = await selectApp(prompts, "Select an app to open");
      if (name) {
        try { await readConfig(name); await subAppPrompt(name, prompts); }
        catch (err) { console.log(error("Cannot open app: " + err.message)); }
      }
      continue;
    }
    if (choice === 2) {
      const name = await selectApp(prompts, "Select an app to configure");
      if (name) {
        try { await configureApp(name, prompts); }
        catch (err) { console.log(error("Config error: " + err.message)); }
      }
      continue;
    }
    if (choice === 3) {
      const name = await selectApp(prompts, "Select an app to delete");
      if (!name) continue;
      console.log(warning("Only ShipGit settings and ShipGit-managed files for this app are removed. External local repositories and remote hosting files are untouched."));
      if (await prompts.confirm("Permanently delete app '" + name + "'?", false)) {
        await fs.rm(appDir(name), { recursive: true, force: true });
        console.log(success("App '" + name + "' deleted. Remote hosting files were not changed."));
      } else console.log(muted("Deletion cancelled."));
      continue;
    }
    if (choice === 4) {
      const apps = await listApps();
      if (!apps.length) console.log(warning("No apps are configured yet."));
      else {
        section("Configured Apps");
        for (const { name, config } of apps) {
          console.log("  " + success(name) + muted(" · branch " + (config.branch || "not set")) + muted(" · alias " + (config.deployAlias ? "sg " + config.deployAlias : "not set")));
        }
      }
    }
  }
}

export async function managerPrompt() {
  const prompts = new Prompts();
  console.log(managerTitle("\nShipGit Manager"));
  console.log(info("Git-to-SFTP deployment manager"));
  try {
    while (true) {
      const choice = await prompts.choose("What would you like to do?", [
        "Create a new app",
        "Manage existing apps",
        "Exit ShipGit"
      ]);
      if (choice === 2) break;
      if (choice === 1) {
        await manageApps(prompts);
        continue;
      }
      try {
        const name = await setupApp(prompts);
        if (await afterSetup(name, prompts) === "menu") continue;
      } catch (err) { console.log(error("Setup failed: " + err.message)); }
    }
  } finally { prompts.close(); }
}
