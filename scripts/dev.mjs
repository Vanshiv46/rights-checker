// Starts the whole app for local development: all backend services (gateway on :4000) and the
// Vite frontend (http://localhost:5173), in one terminal. Ctrl+C stops both.
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const run = (name, dir, script) => {
  const child = spawn(npm, ["run", script], {
    cwd: join(root, dir),
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  child.on("exit", (code) => {
    console.log(`[${name}] exited with code ${code}`);
    stop();
  });
  return child;
};
const children = [
  run("backend", "backend", "start:all"),
  run("frontend", "frontend", "dev"),
];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill();
  setTimeout(() => process.exit(0), 500);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
