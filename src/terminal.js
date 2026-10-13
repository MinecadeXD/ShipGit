const enabled = () => process.stdout.isTTY && !process.env.NO_COLOR && !process.argv.includes("--no-color");
const codes = { reset: "\x1b[0m", bold: "\x1b[1m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", blue: "\x1b[34m", cyan: "\x1b[36m", gray: "\x1b[90m" };
export function color(value, tone = "reset") {
  const text = String(value);
  return enabled() && codes[tone] ? codes[tone] + text + codes.reset : text;
}
export const title = (value) => color(value, "bold");
export const success = (value) => color("✓ " + value, "green");
export const error = (value) => color("✗ " + value, "red");
export const warning = (value) => color("! " + value, "yellow");
export const info = (value) => color("› " + value, "cyan");
export const muted = (value) => color(value, "gray");
export function step(current, total, label) {
  console.log(color("\nStep " + current + " of " + total + " · " + label, "cyan"));
}
export function section(value) {
  console.log("\n" + color(value, "bold"));
}
