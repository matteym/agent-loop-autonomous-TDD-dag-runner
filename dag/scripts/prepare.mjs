#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dagRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const marker = join(dagRoot, "node_modules", "tsx");
if (existsSync(marker)) {
  process.exit(0);
}
const result = spawnSync("yarn", ["install"], {
  cwd: dagRoot,
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
