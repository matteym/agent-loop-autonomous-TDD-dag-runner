import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Copy these source keys onto the canonical name when the canonical key is blank. */
const ENV_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ["XAI_API_KEY", "GROK_API_KEY"],
  ["X_ACCES_TOKEN", "X_ACCESS_TOKEN"],
  ["X_ACCES_SECRET", "X_ACCESS_TOKEN_SECRET"],
  ["X_ACCESS_SECRET", "X_ACCESS_TOKEN_SECRET"],
];

const HOST_URL_KEYS = new Set([
  "DATABASE_URL",
  "REDIS_URL",
  "MONGO_URL",
  "NEO4J_URI",
  "MYSQL_URL",
]);

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

export function hostUrlFromDockerUrl(url: string): string | undefined {
  const next = url.replace(
    /@(postgres|redis|mongodb|neo4j|mysql)(?=[:/])/g,
    "@127.0.0.1"
  );
  if (next === url) {
    return undefined;
  }
  return next;
}

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

function writeKey(body: string, key: string, value: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp("^" + escaped + "=.*$", "m");
  if (pattern.test(body)) {
    return body.replace(pattern, key + "=" + value);
  }
  const next = body.endsWith("\n") || body === "" ? body : body + "\n";
  return next + key + "=" + value + "\n";
}

export function syncEnvFromExample(repoRoot: string): string[] {
  const examplePath = join(repoRoot, ".env.example");
  const envPath = join(repoRoot, ".env");
  if (!existsSync(examplePath)) {
    return [];
  }
  const example = parseKeys(readFileSync(examplePath, "utf8"));
  const current = existsSync(envPath)
    ? parseKeys(readFileSync(envPath, "utf8"))
    : new Map();
  const added: string[] = [];
  let body = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  if (body && !body.endsWith("\n")) {
    body += "\n";
  }
  for (const [key, value] of example) {
    if (!isBlank(current.get(key))) {
      continue;
    }
    body = writeKey(body, key, value);
    current.set(key, value);
    added.push(key);
  }
  if (added.length) {
    writeFileSync(envPath, body);
  }
  return added;
}

export function alignEnvAliases(repoRoot: string): string[] {
  const envPath = join(repoRoot, ".env");
  if (!existsSync(envPath)) {
    return [];
  }
  const current = parseKeys(readFileSync(envPath, "utf8"));
  const added: string[] = [];
  let body = readFileSync(envPath, "utf8");
  if (body && !body.endsWith("\n")) {
    body += "\n";
  }

  for (const [from, to] of ENV_ALIASES) {
    const source = current.get(from);
    if (source === undefined || isBlank(source) || !isBlank(current.get(to))) {
      continue;
    }
    body = writeKey(body, to, source);
    current.set(to, source);
    added.push(to);
  }

  for (const [key, value] of current) {
    if (!HOST_URL_KEYS.has(key)) {
      continue;
    }
    const companion = key + "_HOST";
    if (!isBlank(current.get(companion))) {
      continue;
    }
    const hostUrl = hostUrlFromDockerUrl(value);
    if (!hostUrl) {
      continue;
    }
    body = writeKey(body, companion, hostUrl);
    current.set(companion, hostUrl);
    added.push(companion);
  }

  if (added.length) {
    writeFileSync(envPath, body);
  }
  return added;
}

export function syncProductEnv(repoRoot: string): string[] {
  const aligned = alignEnvAliases(repoRoot);
  const fromExample = syncEnvFromExample(repoRoot);
  const hostUrls = alignEnvAliases(repoRoot);
  return [...aligned, ...fromExample, ...hostUrls];
}
