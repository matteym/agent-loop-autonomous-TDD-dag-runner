import { describe, expect, it } from "vitest";
import { renderCompose } from "./compose.js";
import { composeHasRealServices } from "./up.js";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("renderCompose", () => {
  it("writes an empty services map for init", () => {
    const yaml = renderCompose();
    expect(yaml).toContain("services: {}");
    expect(yaml).not.toContain("postgres:");
    expect(yaml).not.toContain("build:");
  });
});

describe("composeHasRealServices", () => {
  it("is false for the init stub and true after a task adds a service", () => {
    const dir = mkdtempSync(join(tmpdir(), "dag-compose-"));
    try {
      writeFileSync(join(dir, "docker-compose.yml"), renderCompose());
      expect(composeHasRealServices(dir)).toBe(false);
      writeFileSync(
        join(dir, "docker-compose.yml"),
        "services:\n  mongodb:\n    image: mongo:7\n"
      );
      expect(composeHasRealServices(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
