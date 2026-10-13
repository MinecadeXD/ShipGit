const enabled = () => process.stdout.isTTY && !process.env.NO_COLOR && !process.argv.includes("--no-color");
const codes = {
  reset: "\x1b[0m", bold: "\x1b[1m",
  red: "\x1b[91m", green: "\x1b[92m", yellow: "\x1b[93m",
  blue: "\x1b[94m", magenta: "\x1b[95m", cyan: "\x1b[96m",
  white: "\x1b[97m", gray: "\x1b[37m"
};
export function color(value, tone = "reset") {
  const text = String(value);
  return enabled() && codes[tone] ? codes[tone] + text + codes.reset : text;
}
export const title = (value) => color(value, "bold") + color("", "reset");
export const managerTitle = (value) => color(value, "magenta");
export const appTitle = (value) => color(value, "blue");
export const success = (value) => color("✓ " + value, "green");
export const error = (value) => color("✗ " + value, "red");
export const warning = (value) => color("! " + value, "yellow");
export const info = (value) => color("› " + value, "blue");
export const muted = (value) => color(value, "white");
export function step(current, total, label) {
  console.log("\n" + color("Step " + current + " of " + total + " · " + label, "cyan"));
}
export function section(value) {
  console.log("\n" + color(value, "bold"));
}
