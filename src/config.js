import { readConfig, saveConfig, redactConfig } from "./utils.js";
import { testConnection } from "./sftp.js";
export async function configureApp(name, prompts) {
  const config = await readConfig(name);
  while (true) {
    const choice = await prompts.choose("Configure " + name, ["Repository path / URL / branch", "SFTP connection", "SSH private key path", "Exclude paths", "Test SFTP connection", "View non-secret config", "Back"]);
    if (choice === 6) return;
    if (choice === 0) {
      config.branch = await prompts.ask("Branch", { defaultValue: config.branch, required: true });
      if (config.sourceType === "clone") config.repoUrl = await prompts.ask("Repository URL", { defaultValue: config.repoUrl, required: true });
      else config.repoPath = await prompts.ask("Local repository path", { defaultValue: config.repoPath, required: true });
    } else if (choice === 1) {
      config.sftp.host = await prompts.ask("SFTP host", { defaultValue: config.sftp.host, required: true });
      const port = Number(await prompts.ask("SFTP port", { defaultValue: String(config.sftp.port), required: true }));
      if (!Number.isInteger(port) || port < 1 || port > 65535) { console.log("Invalid port; change discarded."); continue; }
      config.sftp.port = port;
      config.sftp.username = await prompts.ask("Username", { defaultValue: config.sftp.username, required: true });
      config.sftp.remoteDir = await prompts.ask("Remote destination", { defaultValue: config.sftp.remoteDir, required: true });
    } else if (choice === 2) config.sftp.privateKeyPath = await prompts.ask("Private key path", { defaultValue: config.sftp.privateKeyPath, required: true });
    else if (choice === 3) config.exclude = (await prompts.ask("Comma-separated excludes", { defaultValue: (config.exclude || []).join(",") })).split(",").map((x) => x.trim()).filter(Boolean);
    else if (choice === 4) {
      try { await testConnection(config.sftp); console.log("SFTP connection passed; no files changed."); }
      catch (e) { console.log("Connection failed: " + e.message); }
      continue;
    } else if (choice === 5) { console.log(JSON.stringify(redactConfig(config), null, 2)); continue; }
    if (await prompts.confirm("Save changes?", true)) { await saveConfig(name, config); console.log("Saved; nothing was deployed."); }
    else console.log("Changes discarded.");
  }
}
