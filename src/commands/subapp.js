import { configureApp } from "../config.js";
import { readConfig } from "../utils.js";
import { deploy } from "../deploy.js";
import { testConnection } from "../sftp.js";
import { appTitle, success, error, info, muted, warning, section, color } from "../terminal.js";

export async function deployApp(name, prompts, dryRun = false) {
  const c = await readConfig(name);
  const confirmation = c.deletion?.enabled
    ? "Remote deletion is ON. Extra files inside '" + c.sftp.remoteDir + "' may be deleted. Continue deploying '" + name + "'?"
    : "Deploy '" + name + "' to its configured SFTP destination?";
  if (!dryRun && !(await prompts.confirm(confirmation, false))) {
    console.log(muted("Deployment cancelled."));
    return null;
  }
  console.log(info(dryRun ? "Checking the deployment plan. No SFTP files will be changed…" : "Starting deployment…"));
  const result = await deploy(c, { dryRun });
  console.log(success((dryRun ? "Dry run" : "Deployment") + " finished · scanned " + result.total + " local files."));
  for (const item of result.results) {
    let prefix = success("UPLOAD");
    if (item.action.startsWith("skipped") || item.action.startsWith("would-skip")) prefix = muted("SKIP");
    else if (item.action.startsWith("would-delete")) prefix = warning("PLAN DELETE");
    else if (item.action.startsWith("would-")) prefix = info("PLAN");
    else if (item.action.startsWith("deleted")) prefix = warning("DELETED");
    console.log("  " + prefix + "  " + item.path + muted(" · " + item.action));
  }
  if (dryRun) console.log(info("Dry run complete. No remote files were uploaded or deleted."));
  else console.log(info("Remote deletion is " + (c.deletion?.enabled ? "ENABLED" : "disabled") + "."));
  return result;
}

async function showStatus(name) {
  const c = await readConfig(name);
  section("App status · " + name);
  const values = [
    ["Source", c.sourceType || "unknown"],
    ["Repository", c.sourceType === "clone" ? (c.repoUrl || c.repoPath) : c.repoPath],
    ["Branch", c.branch || "not set"],
    ["SFTP host", (c.sftp.host || "not set") + ":" + (c.sftp.port || 22)],
    ["SFTP username", c.sftp.username || "not set"],
    ["Remote directory", c.sftp.remoteDir || "not set"],
    ["SSH key path", c.sftp.privateKeyPath || "not set"],
    ["GitHub token", c.githubTokenPath ? "configured (value hidden)" : "not configured"],
    ["Excluded paths", c.exclude?.length ? c.exclude.join(", ") : "none"],
    ["Remote deletion", c.deletion?.enabled ? "ON" : "OFF"],
    ["Deploy alias", c.deployAlias ? "sg " + c.deployAlias : "not set"]
  ];
  for (const [label, value] of values) console.log(color(label.padEnd(19), "cyan") + String(value));
  try {
    await testConnection(c.sftp);
    console.log(success("SFTP destination is accessible."));
  } catch (err) {
    console.log(error("SFTP connection check failed: " + err.message));
  }
}

export async function subAppPrompt(name, prompts) {
  console.log(appTitle("\nApp Prompt · " + name));
  console.log(info("Commands: deploy, dry-run, config, status, help, back"));
  while (true) {
    const raw = (await prompts.ask(name + ">")).trim();
    const commandLine = raw || ["deploy", "dry-run", "config", "status", "help", "back"][
      await prompts.choose("Choose an app command", ["Deploy", "Dry run", "Config", "Status", "Help", "Back"])
    ];
    const [command, ...args] = commandLine.split(/\s+/);
    const verb = command.toLowerCase();
    if (verb === "back" && !args.length) return;
    if (verb === "help" && !args.length) {
      console.log(info("Commands: deploy, dry-run, config, status, help, back"));
      console.log(muted("Use 'deploy' for a real deployment or 'dry-run' for a preview. They are separate commands."));
      continue;
    }
    if (verb === "config" && !args.length) {
      try { await configureApp(name, prompts); }
      catch (err) { console.log(error("Config error: " + err.message)); }
      continue;
    }
    if (verb === "status" && !args.length) {
      try { await showStatus(name); }
      catch (err) { console.log(error("Status check failed: " + err.message)); }
      continue;
    }
    if (verb === "deploy" && !args.length) {
      try { await deployApp(name, prompts, false); }
      catch (err) { console.log(error("Deployment failed: " + err.message)); }
      continue;
    }
    if (verb === "dry-run" && !args.length) {
      try { await deployApp(name, prompts, true); }
      catch (err) { console.log(error("Dry run failed: " + err.message)); }
      continue;
    }
    if (verb === "deploy" && args.length) {
      console.log(error("Use 'dry-run' as a separate command; 'deploy --dry-run' is no longer supported."));
      continue;
    }
    console.log(error("Unknown command. Type help."));
  }
}
