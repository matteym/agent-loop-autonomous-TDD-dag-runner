import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

export const dagAgentPackageName = "@local/dag-agent";
export const dagFileDependency = "file:dag";
export const productPostinstallHook = "node dag/scripts/product-postinstall.mjs";

const skipVendorParts = new Set(["node_modules", "logs", "coverage", "dist", ".venv"]);

type StringMap = { [key: string]: string };

export type ProductPackage = {
  private: boolean;
  scripts: StringMap;
  dependencies: StringMap;
  [key: string]: unknown;
};

function asStringMap(value: unknown): StringMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const out: StringMap = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") {
      out[key] = item;
    }
  }
  return out;
}

function asRecord(value: unknown): { [key: string]: unknown } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return { ...(value as { [key: string]: unknown }) };
}

function appendHook(existing: string | undefined, hook: string): string {
  if (!existing || !existing.trim()) {
    return hook;
  }
  if (existing.includes("product-postinstall")) {
    return existing;
  }
  return existing + " && " + hook;
}

export function mergeProductPackage(existing: unknown): ProductPackage {
  const base = asRecord(existing);
  const scripts = asStringMap(base.scripts);
  const dependencies = asStringMap(base.dependencies);
  if (!scripts.dag) {
    scripts.dag = "dag";
  }
  if (!scripts["dag:mobile"]) {
    scripts["dag:mobile"] = "yarn --cwd dag mobile";
  }
  if (!scripts["dag:desktop"]) {
    scripts["dag:desktop"] = "yarn --cwd dag desktop";
  }
  const self = base.name === dagAgentPackageName;
  if (!self) {
    scripts.postinstall = appendHook(scripts.postinstall, productPostinstallHook);
    if (!dependencies[dagAgentPackageName]) {
      dependencies[dagAgentPackageName] = dagFileDependency;
    }
  }
  const rest = asRecord(existing);
  return {
    ...rest,
    private: true,
    scripts,
    dependencies,
  };
}

export function writeProductPackage(repoRoot: string): void {
  const path = join(repoRoot, "package.json");
  const existing = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  writeFileSync(path, JSON.stringify(mergeProductPackage(existing), null, 2) + "\n");
}

function shouldSkipVendor(fromRoot: string, src: string): boolean {
  const rel = relative(fromRoot, src).replace(/\\/g, "/");
  if (!rel || rel === ".") {
    return false;
  }
  return rel.split("/").some((part) => skipVendorParts.has(part));
}

export function vendorDagIntoProduct(engineDag: string, productDag: string): boolean {
  const from = resolve(engineDag);
  const to = resolve(productDag);
  if (from === to) {
    return false;
  }
  if (existsSync(join(to, "package.json"))) {
    return false;
  }
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, {
    recursive: true,
    filter: (src) => !shouldSkipVendor(from, src),
  });
  return true;
}
