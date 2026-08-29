import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function parseKeys(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq < 1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1);
    if (key && !out.has(key)) {
      out.set(key, value);
    }
  }
  return out;
}

export function syncEnvFromExample(repoRoot: string): string[] {
  const examplePath = join(repoRoot, ".env.example");
  const envPath = join(repoRoot, ".env");
  if (!existsSync(examplePath)) {
    return [];
  }
  const example = parseKeys(readFileSync(examplePath, "utf8"));
  const current = existsSync(envPath) ? parseKeys(readFileSync(envPath, "utf8")) : new Map();
  const added: string[] = [];
  let body = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  if (body && !body.endsWith("\n")) {
    body += "\n";
  }
  for (const [key, value] of example) {
    if (current.has(key)) {
      continue;
    }
    body += key + "=" + value + "\n";
    added.push(key);
  }
  if (added.length) {
    writeFileSync(envPath, body);
  }
  return added;
}
