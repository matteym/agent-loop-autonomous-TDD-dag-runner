import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasCompose, hasRails, isEmptyTarget, repoHasServerSrc } from "./detect.js";

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "dag-detect-"));
}

describe("detect", () => {
  it("flags Server/src only when that tree exists", () => {
    const dir = scratch();
    try {
      expect(repoHasServerSrc(dir)).toBe(false);
      mkdirSync(join(dir, "Server", "src"), { recursive: true });
      expect(repoHasServerSrc(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("treats compose apps and services as a non-empty target", () => {
    const dir = scratch();
    try {
      expect(isEmptyTarget(dir)).toBe(true);
      writeFileSync(join(dir, "docker-compose.yml"), "services: {}\n");
      expect(hasCompose(dir)).toBe(true);
      expect(isEmptyTarget(dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("treats a backend/ folder as occupied", () => {
    const dir = scratch();
    try {
      mkdirSync(join(dir, "backend"));
      expect(isEmptyTarget(dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("hasRails for a backend microservice package", () => {
    const dir = scratch();
    try {
      writeFileSync(join(dir, "docker-compose.yml"), "services: {}\n");
      mkdirSync(join(dir, "backend", "zeub"), { recursive: true });
      writeFileSync(
        join(dir, "backend", "zeub", "package.json"),
        JSON.stringify({ scripts: { test: "vitest run" } })
      );
      expect(hasRails(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
