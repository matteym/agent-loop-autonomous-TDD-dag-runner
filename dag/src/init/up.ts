import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { syncEnvFromExample } from "./env-sync.js";
import { log } from "./log.js";

function winShell(): boolean {
  return process.platform === "win32";
}

export function composeHasRealServices(repoRoot: string): boolean {
  const path = join(repoRoot, "docker-compose.yml");
  if (!existsSync(path)) {
    return false;
  }
  const raw = readFileSync(path, "utf8");
  return /^\s{2}[a-zA-Z][a-zA-Z0-9_-]*:\s*$/m.test(raw);
}

export function composeReload(repoRoot: string): { ok: boolean; output: string } {
  const added = syncEnvFromExample(repoRoot);
  if (added.length) {
    log("synced .env keys from .env.example: " + added.join(","));
  }
  if (!composeHasRealServices(repoRoot)) {
    return { ok: true, output: "compose has no services yet" };
  }
  const compose = spawnSync(
    "docker",
    [
      "compose",
      "-f",
      join(repoRoot, "docker-compose.yml"),
      "--env-file",
      join(repoRoot, ".env"),
      "up",
      "--build",
      "-d",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      shell: winShell(),
      timeout: 180000,
    }
  );
  const output = ((compose.stdout || "") + (compose.stderr || "")).trim();
  if (compose.status !== 0) {
    log(output || "docker compose failed");
    return { ok: false, output: output || "docker compose up --build -d failed" };
  }
  log("compose reloaded");
  return { ok: true, output };
}
