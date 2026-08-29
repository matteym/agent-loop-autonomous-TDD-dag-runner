import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { syncEnvFromExample } from "./env-sync.js";

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
