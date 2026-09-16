import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

describe("knowledge package scaffold", () => {
  it("exports the state barrel", async () => {
    const mod = await import("./index.js");
    expect(mod).toBeDefined();
  });

  it("has expected module folders", () => {
    for (const dir of ["state", "codebase", "memory", "context", "diagnostics"]) {
      expect(existsSync(path.join(packageRoot, dir))).toBe(true);
      expect(existsSync(path.join(packageRoot, dir, "index.ts"))).toBe(true);
    }
  });
});
