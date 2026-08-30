import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { backendDir, frontendDir } from "./port.js";

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
];

function writeFile(path: string, contents: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function mergeGitignore(repoRoot: string) {
  const path = join(repoRoot, ".gitignore");
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const have = new Set(
    existing
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  );
  const extra = ignoreLines.filter((line) => !have.has(line));
  if (!extra.length && existing) {
    return;
  }
  const body = existing.trimEnd();
  const next = (body ? body + "\n" : "") + extra.join("\n") + "\n";
  writeFileSync(path, next);
}

export function writeBootstrap(repoRoot: string): void {
  mergeGitignore(repoRoot);
  writeFile(join(repoRoot, backendDir, ".gitkeep"), "");
  writeFile(join(repoRoot, frontendDir, ".gitkeep"), "");
}
