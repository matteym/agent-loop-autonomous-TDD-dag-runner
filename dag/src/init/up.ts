import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { log } from "./log.js";

function winShell(): boolean {
  return process.platform === "win32";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function composeUp(repoRoot: string, appPort: number) {
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
  if (compose.status !== 0) {
    const err = (compose.stderr || compose.stdout || "docker compose failed").trim();
    log(err);
    if (/docker/i.test(err) && /not found|cannot connect|daemon/i.test(err)) {
      throw new Error("docker daemon is not running; start Docker Desktop and retry");
    }
    throw new Error("docker compose up --build -d failed");
  }
  const url = "http://127.0.0.1:" + String(appPort) + "/health";
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const body = (await res.json()) as { ok?: boolean };
        if (body.ok === true) {
          return;
        }
      }
    } catch {
      await sleep(500);
      continue;
    }
    await sleep(500);
  }
  throw new Error("health check failed after compose up");
}
