import { configureApp } from "../config.js";
import { readConfig } from "../utils.js";
import { deploy } from "../deploy.js";
import { testConnection } from "../sftp.js";
import { title, success, error, info, muted, warning, section, color } from "../terminal.js";

export async function subAppPrompt(name, prompts) {
  console.log(title("\nOpened " + name));
  console.log(muted("Commands: deploy [--dry-run], config, status, help, back"));
  while (true) {
    const raw = (await prompts.ask(name + ">")).trim();
    if (!raw) continue;
    const [command, ...args] = raw.toLowerCase().split(/\s+/);
    if (command === "back" && !args.length) return;
    if (command === "help" && !args.length) {
      console.log(info("Commands: deploy [--dry-run], config, status, help, back"));
      continue;
    }
    if (command === "config" && !args.length) {
      try { await configureApp(name, prompts); }
      catch (e) { console.log(error("Config error: " + e.message)); }
      continue;
    }
    if (command === "status" && !args.length) {
      try {
        const c = await readConfig(name);
        section("App status");
        for (const [label, value] of [
          ["Name", name], ["Source", c.sourceType], ["Repository", c.repoPath],
          ["Branch", c.branch], ["SFTP host", c.sftp.host + ":" + c.sftp.port],
          ["Remote directory", c.sftp.remoteDir], ["Remote deletion", "Disabled"]
        ]) console.log(color(label.padEnd(18), "cyan") + value);
        await testConnection(c.sftp);
        console.log(success("SFTP destination is accessible."));
      } catch (e) { console.log(error("Status check failed: " + e.message)); }
      continue;
    }
    if (command === "deploy" && args.every((a) => a === "--dry-run") && args.length <= 1) {
      const dryRun = args.includes("--dry-run");
      try {
        const c = await readConfig(name);
        if (!dryRun && !(await prompts.confirm("Deploy to the configured SFTP destination?", false))) {
          console.log(muted("Deployment cancelled."));
          continue;
        }
        console.log(info(dryRun ? "Preparing a dry run…" : "Starting deployment…"));
        const result = await deploy(c, { dryRun });
        console.log(success((dryRun ? "Dry run" : "Deployment") + " finished · scanned " + result.total + " files."));
        for (const item of result.results) {
          const prefix = item.action.startsWith("skipped") ? muted("SKIP") : item.action.startsWith("would-") ? info("PLAN") : success("UPLOAD");
          console.log("  " + prefix + "  " + item.path + muted(" · " + item.action));
        }
        console.log(muted("Remote deletion is disabled."));
      } catch (e) { console.log(error("Deployment failed: " + e.message)); }
      continue;
    }
    console.log(error("Unknown sub-app command. Type help."));
  }
}
