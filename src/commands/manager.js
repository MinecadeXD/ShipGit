import fs from "node:fs/promises";
import { Prompts } from "../prompts.js";
import { appDir, listApps, readConfig } from "../utils.js";
import { setupApp } from "../setup.js";
import { subAppPrompt } from "./subapp.js";
import { deploy } from "../deploy.js";
import { title, success, error, info, muted, warning } from "../terminal.js";

async function afterSetup(name, prompts) {
  const next = await prompts.choose("What would you like to do next?", [
    "Deploy now",
    "Open app command prompt",
    "Return to main menu"
  ]);
  if (next === 2) return "menu";
  if (next === 1) {
    await subAppPrompt(name, prompts);
    return "continue";
  }
  if (!(await prompts.confirm("Deploy " + name + " to the configured SFTP destination?", false))) {
    console.log(muted("Deployment cancelled; setup remains saved."));
    return "continue";
  }
  try {
    console.log(info("Starting deployment…"));
    const result = await deploy(await readConfig(name));
    console.log(success("Deployment finished · scanned " + result.total + " files."));
    for (const item of result.results) {
      const prefix = item.action.startsWith("skipped") ? muted("SKIP") : success("UPLOAD");
      console.log("  " + prefix + "  " + item.path + muted(" · " + item.action));
    }
    console.log(muted("Remote deletion is disabled."));
  } catch (err) {
    console.log(error("Deployment failed: " + err.message));
  }
  return "continue";
}

async function managerCommands(prompts) {
  console.log(title("\nManage existing apps"));
  console.log(muted("Commands: setup, open <name>, list, delete <name>, menu, help, exit"));
  while (true) {
    const raw = (await prompts.ask("\nshipgit>")).trim();
    if (!raw) continue;
    const [verb, name, ...rest] = raw.split(/\s+/);
    if (verb === "exit" || verb === "quit") return "exit";
    if (verb === "menu" && !name) return "menu";
    if (verb === "help" && !name) {
      console.log(info("Commands: setup, open <name>, list, delete <name>, menu, help, exit"));
      continue;
    }
    if (verb === "list" && !name) {
      const apps = await listApps();
      if (!apps.length) console.log(warning("No sub-apps yet. Run setup to create one."));
      else apps.forEach(({ name: appName, config }) => console.log("  " + success(appName) + muted(" · branch " + (config.branch || "not set"))));
      continue;
    }
    if (verb === "setup" && !name) {
      try {
        const created = await setupApp(prompts);
        if (await afterSetup(created, prompts) === "menu") return "menu";
      } catch (e) { console.log(error("Setup failed: " + e.message)); }
      continue;
    }
    if (verb === "open" && name && !rest.length) {
      try { await readConfig(name); await subAppPrompt(name, prompts); }
      catch (e) { console.log(error("Cannot open sub-app: " + e.message)); }
      continue;
    }
    if ((verb === "remove" || verb === "delete") && name && !rest.length) {
      if (!(await listApps()).some((app) => app.name === name)) { console.log(error("Sub-app not found.")); continue; }
      console.log(warning("This removes ShipGit settings and any ShipGit-managed clone/token. External local repositories and remote hosting files are untouched."));
      if (await prompts.confirm("Delete sub-app " + name + "?")) {
        await fs.rm(appDir(name), { recursive: true, force: true });
        console.log(success("Sub-app deleted. Remote hosting files were not changed."));
      } else console.log(muted("Deletion cancelled."));
      continue;
    }
    console.log(error("Unknown manager command. Type help."));
  }
}

export async function managerPrompt() {
  const prompts = new Prompts();
  console.log(title("\nShipGit"));
  console.log(muted("Git-to-SFTP deployment manager"));
  try {
    while (true) {
      const choice = await prompts.choose("What would you like to do?", [
        "Create a new app",
        "Manage existing apps",
        "Exit ShipGit"
      ]);
      if (choice === 2) break;
      if (choice === 1) {
        const result = await managerCommands(prompts);
        if (result === "exit") break;
        continue;
      }
      try {
        const name = await setupApp(prompts);
        if (await afterSetup(name, prompts) === "menu") continue;
      } catch (e) { console.log(error("Setup failed: " + e.message)); }
    }
  } finally { prompts.close(); }
}
