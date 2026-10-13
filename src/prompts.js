import readline from "node:readline/promises";
import { emitKeypressEvents } from "node:readline";
import { stdin, stdout } from "node:process";
import { color, error, muted, success, selectedOption, option } from "./terminal.js";

export class Prompts {
  constructor() {
    this.rl = readline.createInterface({ input: stdin, output: stdout });
    this.closed = false;
    this.cleanedUp = false;
    this.activeQuestion = null;
    this.onReadlineInterrupt = () => process.emit("SIGINT");
    this.rl.on("SIGINT", this.onReadlineInterrupt);
  }

  async question(query) {
    const controller = new AbortController();
    this.activeQuestion = controller;
    try {
      return await this.rl.question(query, { signal: controller.signal });
    } finally {
      if (this.activeQuestion === controller) this.activeQuestion = null;
    }
  }

  clearAcceptedInput() {
    if (stdin.isTTY && stdout.isTTY) stdout.write("\x1b[1A\x1b[2K\r\x1b[1B\r");
  }

  async ask(label, { defaultValue = "", required = false, validate } = {}) {
    const suffix = defaultValue ? muted(" [" + defaultValue + "]") : "";
    const promptTone = label.endsWith(">")
      ? (label === "shipgit>" ? "magenta" : "blue")
      : "cyan";
    const raw = (await this.question(color(label, promptTone) + suffix + ": ")).trim();
    this.clearAcceptedInput();
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
    const original = this.rl._writeToOutput;
    stdout.write(color(label, "cyan") + ": ");
    this.rl._writeToOutput = () => {};
    let value;
    try {
      value = (await this.question("")).trim();
    } finally {
      this.rl._writeToOutput = original;
      stdout.write("\n");
    }
    this.clearAcceptedInput();
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
    console.log("\n" + color(label, "pink"));
    choices.forEach((choice, i) =>
      console.log("  " + color(String(i + 1) + ".", "teal") + " " + option(choice))
    );
    const n = Number(await this.ask("Choose number", {
      required: true,
      validate: (v) => Number.isInteger(Number(v)) &&
        Number(v) >= 1 && Number(v) <= choices.length ||
        "Choose a number from 1 to " + choices.length + "."
    }));
    return n - 1;
  }

  async chooseWithArrows(label, choices) {
    emitKeypressEvents(stdin);
    this.rl.pause();
    const wasRaw = Boolean(stdin.isRaw);
    stdin.setRawMode(true);
    stdin.resume();
    let selected = 0;
    let drawn = false;
    let cleaned = false;
    let settled = false;

    const draw = () => {
      if (drawn) stdout.write("\x1b[" + (choices.length + 2) + "A\x1b[J");
      drawn = true;
      stdout.write("\x1b[?25l\x1b[2K\r" + color(label, "pink") + "\n");
      choices.forEach((choice, i) => {
        stdout.write("\x1b[2K\r" +
          (i === selected ? selectedOption(choice) : option(choice)) + "\n");
      });
      stdout.write("\x1b[2K\r" + muted("↑/↓ Navigate · Enter Select · Ctrl+C Exit") + "\n");
    };

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        stdin.removeListener("keypress", onKey);
        if (stdin.isTTY && typeof stdin.setRawMode === "function" && Boolean(stdin.isRaw) !== wasRaw) {
          stdin.setRawMode(wasRaw);
        }
        stdout.write("\x1b[?25h");
        if (!this.closed && !this.rl.closed) this.rl.resume();
      };

      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback(value);
      };

      const onKey = (_str, key = {}) => {
        if (settled) return;
        if (key.ctrl && key.name === "c") {
          process.emit("SIGINT");
          finish(reject, Object.assign(new Error("Selection cancelled."), { code: "SHIPGIT_CANCELLED" }));
          return;
        }
        if (key.name === "up") selected = (selected - 1 + choices.length) % choices.length;
        else if (key.name === "down") selected = (selected + 1) % choices.length;
        else if (key.name === "return" || key.name === "enter") {
          finish(resolve, selected);
          console.log(success("Selected: " + choices[selected]));
          return;
        } else return;
        draw();
      };

      draw();
      stdin.on("keypress", onKey);
    });
  }

  async confirm(label, defaultYes = false) {
    const hint = defaultYes ? " (Y/n)" : " (y/N)";
    const raw = (await this.question(color(label, "orange") + muted(hint) + ": ")).trim().toLowerCase();
    this.clearAcceptedInput();
    if (!raw) return defaultYes;
    if (["y", "yes"].includes(raw)) return true;
    if (["n", "no"].includes(raw)) return false;
    console.log(error("Please answer yes or no."));
    return this.confirm(label, defaultYes);
  }

  close() {
    if (this.cleanedUp) return;
    this.cleanedUp = true;
    this.closed = true;
    if (this.activeQuestion) this.activeQuestion.abort();
    this.rl.removeListener("SIGINT", this.onReadlineInterrupt);
    if (!this.rl.closed) this.rl.close();
  }
}