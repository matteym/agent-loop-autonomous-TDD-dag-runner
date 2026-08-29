import { parseStoreToken, uniqueStores, type StoreId } from "./stores.js";

export type Lang = "ts" | "py";
export type Runtime = Lang | "both";
export type Architecture = "monolith" | "monorepo" | "microservices";
export type { StoreId };

export type InitAnswers = {
  runtime: Runtime;
  architecture: Architecture;
  appName: string;
  appPort: number;
  datastores: StoreId[];
};

const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function defaultAnswers(): InitAnswers {
  return {
    runtime: "ts",
    architecture: "monolith",
    appName: "app",
    appPort: 3000,
    datastores: ["postgres", "redis"],
  };
}

export function parseRuntime(raw: string): Runtime | null {
  const v = raw.trim().toLowerCase();
  if (!v || v === "1" || v === "ts" || v === "typescript" || v === "node" || v === "js") {
    return "ts";
  }
  if (v === "2" || v === "py" || v === "python") {
    return "py";
  }
  if (v === "3" || v === "both" || v === "ts,py" || v === "py,ts" || v === "all") {
    return "both";
  }
  return null;
}

export function parseArchitecture(raw: string): Architecture | null {
  const v = raw.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (!v || v === "monolith" || v === "mono" || v === "1") {
    return "monolith";
  }
  if (v === "monorepo" || v === "mono-repo" || v === "2") {
    return "monorepo";
  }
  if (
    v === "microservices" ||
    v === "microservice" ||
    v === "micro-services" ||
    v === "micro-service" ||
    v === "micro" ||
    v === "3"
  ) {
    return "microservices";
  }
  return null;
}

function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function parseSlug(raw: string, fallback: string): string | null {
  const v = normalizeSlug(raw) || fallback;
  if (!slugRe.test(v)) {
    return null;
  }
  return v;
}

export function parsePort(raw: string, fallback: number): number | null {
  const v = raw.trim();
  const n = v ? Number(v) : fallback;
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    return null;
  }
  return n;
}

export function parseDatastores(raw: string): StoreId[] | null {
  const v = raw.trim().toLowerCase();
  if (!v || v === "default") {
    return ["postgres", "redis"];
  }
  const parts = v.split(/[,\s]+/).filter(Boolean);
  if (!parts.length) {
    return ["postgres", "redis"];
  }
  const ids: StoreId[] = [];
  for (const part of parts) {
    const token = parseStoreToken(part);
    if (!token) {
      return null;
    }
    if (token === "none") {
      return [];
    }
    ids.push(token);
  }
  return uniqueStores(ids);
}

export function validateAnswers(value: unknown): InitAnswers | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const rec = value as Record<string, unknown>;
  const runtime = parseRuntime(String(rec.runtime ?? "ts"));
  const architecture = parseArchitecture(String(rec.architecture ?? "monolith"));
  const appName = parseSlug(String(rec.appName ?? "app"), "app");
  const appPort = parsePort(String(rec.appPort ?? 3000), 3000);
  if (!runtime || !architecture || !appName || appPort === null) {
    return null;
  }
  const datastores = storesFromRecord(rec);
  if (!datastores) {
    return null;
  }
  return { runtime, architecture, appName, appPort, datastores };
}

function storesFromRecord(rec: Record<string, unknown>): StoreId[] | null {
  if (Array.isArray(rec.datastores)) {
    if (!rec.datastores.length) {
      return [];
    }
    return parseDatastores(rec.datastores.map(String).join(","));
  }
  const hasFlags =
    rec.postgres !== undefined ||
    rec.redis !== undefined ||
    rec.mongodb !== undefined ||
    rec.neo4j !== undefined ||
    rec.mysql !== undefined;
  if (!hasFlags) {
    return ["postgres", "redis"];
  }
  const ids: StoreId[] = [];
  if (rec.postgres) {
    ids.push("postgres");
  }
  if (rec.redis) {
    ids.push("redis");
  }
  if (rec.mongodb) {
    ids.push("mongodb");
  }
  if (rec.neo4j) {
    ids.push("neo4j");
  }
  if (rec.mysql) {
    ids.push("mysql");
  }
  return uniqueStores(ids);
}

export function summarize(answers: InitAnswers): string {
  const dbs = answers.datastores;
  const tools =
    answers.runtime === "both"
      ? { test: "vitest+pytest", pkg: "yarn+uv" }
      : answers.runtime === "py"
        ? { test: "pytest", pkg: "uv" }
        : { test: "vitest", pkg: "yarn" };
  return [
    "runtime=" + answers.runtime,
    "architecture=" + answers.architecture,
    "appName=" + answers.appName,
    "appPort=" + String(answers.appPort),
    "datastores=" + (dbs.join(",") || "none"),
    "tests=" + tools.test,
    "packages=" + tools.pkg,
  ].join(" ");
}

export function hasLang(answers: InitAnswers, lang: Lang): boolean {
  return answers.runtime === "both" || answers.runtime === lang;
}

export function appDirRel(answers: InitAnswers): string {
  if (answers.architecture === "microservices") {
    return "backend/" + answers.appName;
  }
  return "backend";
}

export function frontendDirRel(answers: InitAnswers): string | null {
  return answers.architecture === "monorepo" ? "frontend" : null;
}

export function secondLangDirRel(answers: InitAnswers): string | null {
  if (answers.runtime !== "both") {
    return null;
  }
  if (answers.architecture === "microservices") {
    return "backend/" + answers.appName + "-py";
  }
  return "python";
}

export function composeBuildContext(answers: InitAnswers): string {
  const rel = appDirRel(answers);
  return rel === "." ? "." : "./" + rel;
}

export function layoutHint(answers: InitAnswers): string {
  const parts = [appDirRel(answers)];
  const front = frontendDirRel(answers);
  if (front) {
    parts.push(front);
  }
  const extra = secondLangDirRel(answers);
  if (extra) {
    parts.push(extra);
  }
  return parts.join(" + ");
}
