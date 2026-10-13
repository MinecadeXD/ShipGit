import { configureApp } from "../config.js";
import { readConfig } from "../utils.js";
import { deploy } from "../deploy.js";
import { testConnection } from "../sftp.js";
export async function subAppPrompt(name, prompts) {
  console.log("Opened " + name + ". Type help for commands; back returns to manager mode.");
  while (true) {
    const raw = (await prompts.ask(name + ">")).trim();
    if (!raw) continue;
    const [command, ...args] = raw.toLowerCase().split(/\s+/);
    if (command === "back" && !args.length) return;
    if (command === "help" && !args.length) { console.log("Commands: deploy [--dry-run], config, status, help, back"); continue; }
    if (command === "config" && !args.length) { try { await configureApp(name, prompts); } catch (e) { console.log("Config error: " + e.message); } continue; }
    if (command === "status" && !args.length) {
      try {
        const c = await readConfig(name);
        console.log(JSON.stringify({ name, sourceType: c.sourceType, repoPath: c.repoPath, branch: c.branch, host: c.sftp.host, port: c.sftp.port, remoteDir: c.sftp.remoteDir, remoteDeletion: "disabled" }, null, 2));
        await testConnection(c.sftp); console.log("SFTP destination accessible.");
      } catch (e) { console.log("Status failed: " + e.message); }
      continue;
    }
    if (command === "deploy" && args.every((a) => a === "--dry-run") && args.length <= 1) {
      const dryRun = args.includes("--dry-run");
      try {
        const c = await readConfig(name);
        if (!dryRun && !(await prompts.confirm("Deploy to configured SFTP destination?"))) { console.log("Cancelled."); continue; }
        const result = await deploy(c, { dryRun });
        console.log((dryRun ? "Dry run" : "Deployment") + " finished; scanned " + result.total + " files.");
        for (const item of result.results) console.log("  " + item.action + ": " + item.path);
        console.log("Remote deletion is disabled.");
      } catch (e) { console.log("Deployment failed: " + e.message); }
      continue;
    }
    console.log("Unknown sub-app command. Type help.");
  }
}
