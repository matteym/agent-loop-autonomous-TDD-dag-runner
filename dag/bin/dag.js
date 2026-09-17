#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dagRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const hasCommand = argv[0] === "init" || argv[0] === "task";
const command = hasCommand ? argv[0] : "task";
const rest = hasCommand ? argv.slice(1) : argv;
const yarnArgs = command === "init" ? ["run", "init", ...rest] : ["task", ...rest];
const child = spawn("yarn", yarnArgs, {
  cwd: dagRoot,
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
child.on("error", (err) => {
  process.stderr.write(String(err) + "\n");
  process.exit(1);
});
