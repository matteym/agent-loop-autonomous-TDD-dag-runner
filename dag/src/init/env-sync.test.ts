import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  alignEnvAliases,
  hostUrlFromDockerUrl,
  syncEnvFromExample,
  syncProductEnv,
} from "./env-sync.js";

describe("syncEnvFromExample", () => {
  it("appends missing keys and does not overwrite existing ones", () => {
    const dir = mkdtempSync(join(tmpdir(), "dag-env-"));
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, ".env"), "APP_PORT=3000\nMONGO_PASSWORD=keep\n");
      writeFileSync(
        join(dir, ".env.example"),
        "APP_PORT=3000\nMONGO_PASSWORD=changeme\nMONGO_URL=mongodb://app:changeme@mongodb:27017\n"
      );
      const added = syncEnvFromExample(dir);
      expect(added).toEqual(["MONGO_URL"]);
      const env = readFileSync(join(dir, ".env"), "utf8");
      expect(env).toContain("MONGO_PASSWORD=keep");
      expect(env).toContain("MONGO_URL=mongodb://app:changeme@mongodb:27017");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("alignEnvAliases", () => {
  it("copies typo and vendor aliases onto canonical keys without overwriting", () => {
    const dir = mkdtempSync(join(tmpdir(), "dag-env-alias-"));
    try {
      writeFileSync(
        join(dir, ".env"),
        [
          "XAI_API_KEY=xai-secret",
          "X_ACCES_TOKEN=access-typo",
          "X_ACCES_SECRET=secret-typo",
          "GROK_API_KEY=keep-grok",
          "",
        ].join("\n")
      );
      const added = alignEnvAliases(dir);
      expect(added).toEqual(["X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"]);
      const env = readFileSync(join(dir, ".env"), "utf8");
      expect(env).toContain("GROK_API_KEY=keep-grok");
      expect(env).toContain("X_ACCESS_TOKEN=access-typo");
      expect(env).toContain("X_ACCESS_TOKEN_SECRET=secret-typo");
      expect(env).not.toMatch(/GROK_API_KEY=xai-secret/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("derives DATABASE_URL_HOST from the docker hostname URL", () => {
    const dir = mkdtempSync(join(tmpdir(), "dag-env-host-"));
    try {
      writeFileSync(
        join(dir, ".env"),
        "DATABASE_URL=postgres://app:changeme@postgres:5432/app\n"
      );
      const added = alignEnvAliases(dir);
      expect(added).toEqual(["DATABASE_URL_HOST"]);
      const env = readFileSync(join(dir, ".env"), "utf8");
      expect(env).toContain(
        "DATABASE_URL_HOST=postgres://app:changeme@127.0.0.1:5432/app"
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("hostUrlFromDockerUrl", () => {
  it("rewrites docker service hostnames to 127.0.0.1", () => {
    expect(hostUrlFromDockerUrl("postgres://app:x@postgres:5432/app")).toBe(
      "postgres://app:x@127.0.0.1:5432/app"
    );
    expect(hostUrlFromDockerUrl("postgres://app:x@127.0.0.1:5432/app")).toBeUndefined();
  });
});

describe("syncProductEnv", () => {
  it("adds example keys then aliases", () => {
    const dir = mkdtempSync(join(tmpdir(), "dag-env-product-"));
    try {
      writeFileSync(
        join(dir, ".env.example"),
        "GROK_API_KEY=\nDATABASE_URL=postgres://app:changeme@postgres:5432/app\n"
      );
      writeFileSync(join(dir, ".env"), "XAI_API_KEY=from-xai\n");
      const added = syncProductEnv(dir);
      expect(added).toContain("GROK_API_KEY");
      expect(added).toContain("DATABASE_URL");
      expect(added).toContain("DATABASE_URL_HOST");
      const env = readFileSync(join(dir, ".env"), "utf8");
      expect(env).toContain("XAI_API_KEY=from-xai");
      expect(env).toContain("GROK_API_KEY=from-xai");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
