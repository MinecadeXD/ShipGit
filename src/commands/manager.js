import fs from "node:fs/promises";
import { Prompts } from "../prompts.js";
import { appDir, listApps, readConfig } from "../utils.js";
import { setupApp } from "../setup.js";
import { subAppPrompt } from "./subapp.js";
import { title, success, error, info, muted, warning } from "../terminal.js";

export async function managerPrompt() {
  const prompts = new Prompts();
  console.log(title("\nShipGit"));
  console.log(muted("Git-to-SFTP deployment manager · type help for commands"));
  try {
    while (true) {
      const raw = (await prompts.ask("\nshipgit>")).trim();
      if (!raw) continue;
      const [verb, name, ...rest] = raw.split(/\s+/);
      if (verb === "exit" || verb === "quit") break;
      if (verb === "help" && !name) {
        console.log(info("Commands: setup, open <name>, list, delete <name>, help, exit"));
        continue;
      }
      if (verb === "list" && !name) {
        const apps = await listApps();
        if (!apps.length) console.log(warning("No sub-apps yet. Run setup to create one."));
        else apps.forEach(({ name: appName, config }) => console.log("  " + success(appName) + muted(" · branch " + (config.branch || "not set"))));
        continue;
      }
      if (verb === "setup" && !name) {
        try { await setupApp(prompts); }
        catch (e) { console.log(error("Setup failed: " + e.message)); }
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
  } finally { prompts.close(); }
}
