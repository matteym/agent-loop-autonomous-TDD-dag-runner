import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const skipNames = new Set([
  "node_modules",
  ".git",
  "dag",
  ".cursor",
  "dist",
  ".venv",
  "coverage",
  "logs",
]);

function dirHasMarker(dir: string): boolean {
  return existsSync(join(dir, "package.json")) || existsSync(join(dir, "pyproject.toml"));
}

function hasTestScript(dir: string): boolean {
  const pkgPath = join(dir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        scripts?: Record<string, string>;
      };
      return Boolean(pkg.scripts?.test);
    } catch {
      return false;
    }
  }
  return existsSync(join(dir, "pyproject.toml"));
}

function walkProductMarkers(dir: string, depth: number, hits: string[]) {
  if (depth >= 4) {
    return;
  }
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || skipNames.has(entry.name) || entry.name.startsWith(".")) {
      continue;
    }
    const child = join(dir, entry.name);
    if (dirHasMarker(child)) {
      hits.push(child);
    }
    walkProductMarkers(child, depth + 1, hits);
  }
}

export function repoHasServerSrc(repoRoot: string): boolean {
  return existsSync(join(repoRoot, "Server", "src"));
}

export function hasCompose(repoRoot: string): boolean {
  return existsSync(join(repoRoot, "docker-compose.yml"));
}

export function hasRails(repoRoot: string): boolean {
  if (!hasCompose(repoRoot)) {
    return false;
  }
  if (dirHasMarker(repoRoot) && hasTestScript(repoRoot)) {
    return true;
  }
  const appsApi = join(repoRoot, "apps", "api");
  if (dirHasMarker(appsApi) && hasTestScript(appsApi)) {
    return true;
  }
  const servicesApi = join(repoRoot, "services", "api");
  return dirHasMarker(servicesApi) && hasTestScript(servicesApi);
}

export function isEmptyTarget(repoRoot: string): boolean {
  if (hasCompose(repoRoot)) {
    return false;
  }
  if (existsSync(join(repoRoot, "apps")) || existsSync(join(repoRoot, "services"))) {
    return false;
  }
  if (existsSync(join(repoRoot, "src"))) {
    return false;
  }
  if (repoHasServerSrc(repoRoot)) {
    return false;
  }
  if (dirHasMarker(repoRoot)) {
    return false;
  }
  const hits: string[] = [];
  walkProductMarkers(repoRoot, 0, hits);
  return hits.length === 0;
}
