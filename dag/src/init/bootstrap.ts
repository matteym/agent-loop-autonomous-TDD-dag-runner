import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { srcDir } from "./port.js";

const ignoreLines = [
  ".env",
  "node_modules/",
  "dist/",
  ".venv/",
  "dag/node_modules/",
  "dag/metadata/state.json",
  "dag/metadata/task.json",
  "dag/metadata/*.done.json",
  "dag/metadata/agent-id",
  "dag/history/*",
  "!dag/history/.gitkeep",
  "dag/logs/*.log",
  "dag/logs/status",
  "dag/logs/next-run.sh",
  ".agent-memory/",
];

function writeFile(path: string, contents: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function mergeGitignore(repoRoot: string, extraIgnore: string[]) {
  const path = join(repoRoot, ".gitignore");
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const have = new Set(
    existing
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  );
  const extra = [...ignoreLines, ...extraIgnore].filter((line) => !have.has(line));
  if (!extra.length && existing) {
    return;
  }
  const body = existing.trimEnd();
  const next = (body ? body + "\n" : "") + extra.join("\n") + "\n";
  writeFileSync(path, next);
}

export function copyEngineCursor(engineRoot: string, productRoot: string): void {
  if (resolve(engineRoot) === resolve(productRoot)) {
    return;
  }
  const from = join(engineRoot, ".cursor");
  if (!existsSync(from)) {
    return;
  }
  cpSync(from, join(productRoot, ".cursor"), {
    recursive: true,
    force: true,
    filter: (src) => basename(src) !== "mcp.json",
  });
}

export function writeBootstrap(repoRoot: string, extraIgnore: string[] = []): void {
  mergeGitignore(repoRoot, extraIgnore);
  writeFile(join(repoRoot, srcDir, ".gitkeep"), "");
}
