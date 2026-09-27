// Runs the production standalone server the way the Docker image does (used by the E2E suite).
// Usage: npm run build && npm run start:standalone
import { cpSync, existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const standalone = path.join(root, ".next/standalone");
if (!existsSync(path.join(standalone, "server.js"))) {
  console.error("No standalone build found. Run `npm run build` first.");
  process.exit(1);
}
cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
cpSync(path.join(root, ".next/static"), path.join(standalone, ".next/static"), { recursive: true });

const env = { ...process.env, HOSTNAME: process.env.HOSTNAME ?? "0.0.0.0", PORT: process.env.PORT ?? "3100" };
const child = spawn(process.execPath, ["server.js"], { cwd: standalone, stdio: "inherit", env });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
