export type Lang = "ts" | "py";
export type Runtime = Lang | "both";
export type Architecture = "monolith" | "monorepo" | "microservices";

export type InitAnswers = {
  runtime: Runtime;
  architecture: Architecture;
  appName: string;
  appPort: number;
  postgres: boolean;
  redis: boolean;
};

const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function defaultAnswers(): InitAnswers {
  return {
    runtime: "ts",
    architecture: "monolith",
    appName: "app",
    appPort: 3000,
    postgres: true,
    redis: true,
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

export function parseDatastores(raw: string): { postgres: boolean; redis: boolean } | null {
  const v = raw.trim().toLowerCase();
  if (!v || v === "1" || v === "both" || v === "all") {
    return { postgres: true, redis: true };
  }
  if (v === "2") {
    return { postgres: true, redis: false };
  }
  if (v === "3" || v === "none" || v === "0" || v === "no") {
    return { postgres: false, redis: false };
  }
  const parts = v.split(/[,\s]+/).filter(Boolean);
  let postgres = false;
  let redis = false;
  for (const part of parts) {
    if (part === "postgres" || part === "pg") {
      postgres = true;
      continue;
    }
    if (part === "redis") {
      redis = true;
      continue;
    }
    return null;
  }
  return { postgres, redis };
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
  const postgres = Boolean(rec.postgres);
  const redis = Boolean(rec.redis);
  if (rec.postgres === undefined && rec.redis === undefined) {
    return {
      runtime,
      architecture,
      appName,
      appPort,
      postgres: true,
      redis: true,
    };
  }
  return { runtime, architecture, appName, appPort, postgres, redis };
}

export function summarize(answers: InitAnswers): string {
  const dbs: string[] = [];
  if (answers.postgres) {
    dbs.push("postgres");
  }
  if (answers.redis) {
    dbs.push("redis");
  }
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
    return "services/api";
  }
  if (answers.architecture === "monorepo" || answers.runtime === "both") {
    return "apps/api";
  }
  return ".";
}

export function secondLangDirRel(answers: InitAnswers): string | null {
  if (answers.runtime !== "both") {
    return null;
  }
  return answers.architecture === "microservices" ? "services/py" : "apps/py";
}

export function composeBuildContext(answers: InitAnswers): string {
  const rel = appDirRel(answers);
  return rel === "." ? "." : "./" + rel;
}

export function layoutHint(answers: InitAnswers): string {
  const primary = appDirRel(answers);
  const extra = secondLangDirRel(answers);
  const a = primary === "." ? "racine" : primary;
  return extra ? a + " + " + extra : a;
}
