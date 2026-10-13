import { managerPrompt } from "./commands/manager.js";
import { Prompts } from "./prompts.js";
import { listApps } from "./utils.js";
import { deployApp } from "./commands/subapp.js";
import { error } from "./terminal.js";

export async function startApp(args = process.argv.slice(2)) {
  if (!args.length) {
    await managerPrompt();
    return;
  }
  const [alias, mode, ...extra] = args;
  if (!alias || extra.length || (mode && mode !== "dry-run")) {
    throw new Error("Usage: sg <deploy-alias> [dry-run]");
  }
  const app = (await listApps()).find(({ config }) =>
    config.deployAlias && config.deployAlias.toLowerCase() === alias.toLowerCase()
  );
  if (!app) throw new Error("No app has the deploy alias '" + alias + "'. Configure one in ShipGit → Manage Apps → Config.");
  const prompts = new Prompts();
  try {
    await deployApp(app.name, prompts, mode === "dry-run");
  } finally {
    prompts.close();
  }
}
