const enabled = () =>
  Boolean(process.stdout.isTTY) &&
  !process.env.NO_COLOR &&
  !process.argv.includes("--no-color");

const codes = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[38;5;203m",
  green: "\x1b[38;5;82m",
  yellow: "\x1b[38;5;220m",
  orange: "\x1b[38;5;208m",
  blue: "\x1b[38;5;75m",
  magenta: "\x1b[38;5;213m",
  cyan: "\x1b[38;5;51m",
  teal: "\x1b[38;5;43m",
  lime: "\x1b[38;5;154m",
  pink: "\x1b[38;5;205m",
  lavender: "\x1b[38;5;147m",
  white: "\x1b[38;5;255m",
  gray: "\x1b[38;5;244m",
  selected: "\x1b[1;38;5;231;48;5;24m"
};

let alternateScreenActive = false;

export function color(value, tone = "reset") {
  const text = String(value);
  return enabled() && codes[tone] ? codes[tone] + text + codes.reset : text;
}

export const title = (value) => color(value, "bold");
export const managerTitle = (value) => color(value, "magenta") + color("", "reset");
export const appTitle = (value) => color(value, "blue") + color("", "reset");
export const success = (value) => color("✓ " + value, "green");
export const error = (value) => color("✗ " + value, "red");
export const warning = (value) => color("! " + value, "yellow");
export const info = (value) => color("› " + value, "cyan");
export const muted = (value) => color(value, "gray");
export const selectedOption = (value) => color(" ❯ " + value, "selected");
export const option = (value) => color("   " + value, "lavender");

export function step(current, total, label) {
  console.log("\n" + color("Step " + current + " of " + total + " · " + label, "teal"));
}

export function section(value) {
  console.log("\n" + color(value, "pink"));
}

export function startTerminalSession() {
  if (
    alternateScreenActive ||
    !process.stdout.isTTY ||
    process.env.SHIPGIT_NO_ALT_SCREEN ||
    process.env.TERM === "dumb"
  ) return;

  process.stdout.write("\x1b[?1049h\x1b[?25h\x1b[2J\x1b[H");
  alternateScreenActive = true;
}

export function endTerminalSession() {
  if (!alternateScreenActive) return;
  process.stdout.write("\x1b[0m\x1b[?25h\x1b[?1049l");
  alternateScreenActive = false;
}

export function clearScreen() {
  if (process.stdout.isTTY) process.stdout.write("\x1b[2J\x1b[H");
}
