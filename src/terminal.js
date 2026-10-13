const enabled = () =>
  Boolean(process.stdout.isTTY) &&
  !process.env.NO_COLOR &&
  !process.argv.includes("--no-color");

const codes = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[38;5;196m",
  green: "\x1b[38;5;46m",
  yellow: "\x1b[38;5;226m",
  orange: "\x1b[38;5;208m",
  blue: "\x1b[38;5;39m",
  magenta: "\x1b[38;5;201m",
  cyan: "\x1b[38;5;51m",
  teal: "\x1b[38;5;49m",
  lime: "\x1b[38;5;118m",
  pink: "\x1b[38;5;213m",
  lavender: "\x1b[38;5;141m",
  white: "\x1b[38;5;255m",
  gray: "\x1b[38;5;244m",
  selected: "\x1b[1;38;5;51;48;5;17m"
};

export function color(value, tone = "reset") {
  const text = String(value);
  return enabled() && codes[tone] ? codes[tone] + text + codes.reset : text;
}

export const title = (value) => color(value, "bold");
export const managerTitle = (value) => color(value, "magenta");
export const appTitle = (value) => color(value, "cyan");
export const success = (value) => color("✓ " + value, "lime");
export const error = (value) => color("✗ " + value, "red");
export const warning = (value) => color("! " + value, "orange");
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

export function clearScreen() {
  if (process.stdout.isTTY) process.stdout.write("\x1b[2J\x1b[H");
}
