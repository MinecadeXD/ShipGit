import fs from "node:fs/promises";
import { Prompts } from "../prompts.js";
import { appDir, listApps, readConfig } from "../utils.js";
import { setupApp } from "../setup.js";
import { subAppPrompt } from "./subapp.js";
export async function managerPrompt() {
  const prompts = new Prompts();
  console.log("ShipGit — interactive Git-to-SFTP deployment");
  try {
    while (true) {
      const raw = (await prompts.ask("\nshipgit>")).trim();
      if (!raw) continue;
      const [verb, name, ...rest] = raw.split(/\s+/);
      if (verb === "exit" || verb === "quit") break;
      if (verb === "help" && !name) { console.log("Commands: setup, open <name>, list, remove <name>, help, exit"); continue; }
      if (verb === "list" && !name) {
        const apps = await listApps();
        if (!apps.length) console.log("No sub-apps yet. Run setup.");
        else apps.forEach(({ name: appName, config }) => console.log("- " + appName + " (" + (config.branch || "no branch") + ")"));
        continue;
      }
      if (verb === "setup" && !name) { try { await setupApp(prompts); } catch (e) { console.log("Setup failed: " + e.message); } continue; }
      if (verb === "open" && name && !rest.length) {
        try { await readConfig(name); await subAppPrompt(name, prompts); }
        catch (e) { console.log("Cannot open sub-app: " + e.message); }
        continue;
      }
      if (verb === "remove" && name && !rest.length) {
        if (!(await listApps()).some((app) => app.name === name)) { console.log("Sub-app not found."); continue; }
        console.log("Only local ShipGit config is removed; source and remote files are untouched.");
        if (await prompts.confirm("Remove " + name + "?")) { await fs.rm(appDir(name), { recursive: true, force: true }); console.log("Sub-app removed."); }
        continue;
      }
      console.log("Unknown manager command. Type help.");
    }
  } finally { prompts.close(); }
}
