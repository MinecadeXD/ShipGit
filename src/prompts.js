import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
export class Prompts {
  constructor() { this.rl = readline.createInterface({ input: stdin, output: stdout }); }
  async ask(label, { defaultValue = "", required = false } = {}) {
    const suffix = defaultValue ? " [" + defaultValue + "]" : "";
    const value = (await this.rl.question(label + suffix + ": ")).trim() || defaultValue;
    if (required && !value) { console.log("A value is required."); return this.ask(label, { defaultValue, required }); }
    return value;
  }
  async choose(label, choices) {
    console.log("\n" + label);
    choices.forEach((choice, i) => console.log("  " + (i + 1) + ". " + choice));
    const n = Number(await this.ask("Choose number", { required: true }));
    if (!Number.isInteger(n) || n < 1 || n > choices.length) { console.log("Invalid choice."); return this.choose(label, choices); }
    return n - 1;
  }
  async confirm(label, defaultYes = false) {
    const raw = (await this.ask(label + (defaultYes ? " (Y/n)" : " (y/N)"))).toLowerCase();
    return raw ? raw === "y" || raw === "yes" : defaultYes;
  }
  close() { this.rl.close(); }
}
