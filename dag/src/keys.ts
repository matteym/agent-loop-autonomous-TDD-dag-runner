import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { dagDir, engineRoot, repoRoot } from "./paths.js";

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function readKeysFromFile(
  filePath: string,
  names: string[]
): Partial<Record<string, string>> {
  const found: Partial<Record<string, string>> = {};
  if (!existsSync(filePath)) {
    return found;
  }
  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    for (const name of names) {
      const match = line.match(
        new RegExp("^(?:export\\s+)?" + name + "\\s*=\\s*(.*)$")
      );
      if (!match) {
        continue;
      }
      const value = stripQuotes(match[1] || "");
      if (value) {
        found[name] = value;
      }
    }
  }
  return found;
}

const cursorNames = ["CURSOR_API_KEY", "CURSOR_SDK_API"];
const claudeNames = ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"];

function mergeFiles(names: string[]): string | undefined {
  const files = [
    join(repoRoot, ".env"),
    join(engineRoot, ".env"),
    join(dagDir, ".env"),
    join(repoRoot, "Server", ".env"),
  ];
  for (const file of files) {
    const found = readKeysFromFile(file, names);
    for (const name of names) {
      if (found[name]) {
        return found[name];
      }
    }
  }
  return undefined;
}

export function resolveCursorKey(): string | undefined {
  return (
    process.env.CURSOR_API_KEY ||
    process.env.CURSOR_SDK_API ||
    mergeFiles(cursorNames)
  );
}

export function resolveClaudeKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || mergeFiles(claudeNames);
}
