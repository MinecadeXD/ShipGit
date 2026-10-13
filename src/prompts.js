import readline from "node:readline/promises";
import { emitKeypressEvents } from "node:readline";
import { stdin, stdout } from "node:process";
import { color, error, muted, success, info } from "./terminal.js";

export class Prompts {
  constructor() { this.rl = readline.createInterface({ input: stdin, output: stdout }); }

  async ask(label, { defaultValue = "", required = false, validate } = {}) {
    const suffix = defaultValue ? muted(" [" + defaultValue + "]") : "";
    const raw = (await this.rl.question(color(label, "cyan") + suffix + ": ")).trim();
    if (stdin.isTTY && stdout.isTTY) {
      stdout.write("\\x1b[1A\\x1b[2K\\r");
      console.log(success(label + " accepted"));
    }
    const value = raw || defaultValue;
    if (required && !value) {
      console.log(error("A value is required."));
      return this.ask(label, { defaultValue, required, validate });
    }
    if (validate) {
      const result = await validate(value);
      if (result !== true) {
        console.log(error(typeof result === "string" ? result : "Invalid value."));
        return this.ask(label, { defaultValue, required, validate });
      }
    }
    return value;
  }

  async askSecret(label, { required = false } = {}) {
    stdout.write(color(label, "cyan") + ": ");
    const original = this.rl._writeToOutput;
    this.rl._writeToOutput = () => {};
    let value;
    try { value = (await this.rl.question("")).trim(); }
    finally { this.rl._writeToOutput = original; stdout.write("\n"); }
    if (required && !value) {
      console.log(error("A value is required."));
      return this.askSecret(label, { required });
    }
    return value;
  }

  async choose(label, choices) {
    if (stdin.isTTY && stdout.isTTY && typeof stdin.setRawMode === "function") {
      return this.chooseWithArrows(label, choices);
    }
    console.log("\n" + color(label, "bold"));
    choices.forEach((choice, i) => console.log("  " + color(String(i + 1) + ".", "cyan") + " " + choice));
    const n = Number(await this.ask("Choose number", { required: true, validate: (v) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= choices.length || "Choose a number from 1 to " + choices.length + "." }));
    return n - 1;
  }

  async chooseWithArrows(label, choices) {
    emitKeypressEvents(stdin);
    this.rl.pause();
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    let selected = 0;
    let drawn = false;
    const draw = () => {
      if (drawn) stdout.write("\x1b[" + (choices.length + 2) + "A\x1b[J");
      drawn = true;
      stdout.write("\x1b[?25l\x1b[2K\r" + color(label, "bold") + "\n");
      choices.forEach((choice, i) => {
        stdout.write("\x1b[2K\r" + (i === selected ? color(" ❯ " + choice, "cyan") : "   " + choice) + "\n");
      });
      stdout.write("\x1b[2K\r" + muted("↑/↓ Navigate · Enter Select · Ctrl+C Cancel") + "\n");
    };
    draw();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        stdin.removeListener("keypress", onKey);
        if (!wasRaw) stdin.setRawMode(false);
        stdout.write("\x1b[?25h\n");
        this.rl.resume();
      };
      const onKey = (_str, key = {}) => {
        if (key.name === "up") selected = (selected - 1 + choices.length) % choices.length;
        else if (key.name === "down") selected = (selected + 1) % choices.length;
        else if (key.name === "return" || key.name === "enter") {
          cleanup();
          console.log(success("Selected: " + choices[selected]));
          resolve(selected);
          return;
        } else if (key.ctrl && key.name === "c") {
          cleanup();
          reject(new Error("Selection cancelled."));
          return;
        } else return;
        draw();
      };
      stdin.on("keypress", onKey);
    });
  }

  async confirm(label, defaultYes = false) {
    const hint = defaultYes ? " (Y/n)" : " (y/N)";
    const raw = (await this.rl.question(color(label, "cyan") + muted(hint) + ": ")).trim().toLowerCase();
    if (!raw) return defaultYes;
    if (["y", "yes"].includes(raw)) return true;
    if (["n", "no"].includes(raw)) return false;
    console.log(error("Please answer yes or no."));
    return this.confirm(label, defaultYes);
  }

  close() { this.rl.close(); }
}
