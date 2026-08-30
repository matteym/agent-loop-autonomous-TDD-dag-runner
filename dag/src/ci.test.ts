import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderCiYaml, syncCiWorkflow } from "./ci.js";

describe("renderCiYaml", () => {
  it("runs each language and skips when the package or toolchain is missing", () => {
    const yaml = renderCiYaml();
    expect(yaml).toContain("generated-by: agent-loop");
    expect(yaml).toContain("yarn install && yarn test");
    expect(yaml).toContain("uv run python -m pytest -q");
    expect(yaml).toContain("go test ./...");
    expect(yaml).toContain("cargo test");
    expect(yaml).toContain("no TypeScript test packages, skip");
    expect(yaml).toContain("uv missing, skip");
    expect(yaml).toContain("go missing, skip");
    expect(yaml).toContain("cargo missing, skip");
    expect(yaml).toContain("continue-on-error: true");
  });
});

describe("syncCiWorkflow", () => {
  it("writes ci.yml even on an empty layout and is a no-op the second time", () => {
    const dir = mkdtempSync(join(tmpdir(), "dag-ci-"));
    try {
      mkdirSync(join(dir, "src", "backend"), { recursive: true });
      writeFileSync(join(dir, "src", "backend", ".gitkeep"), "");
      const first = syncCiWorkflow(dir);
      expect(first.changed).toBe(true);
      const body = readFileSync(join(dir, ".github", "workflows", "ci.yml"), "utf8");
      expect(body).toContain("yarn install && yarn test");
      expect(syncCiWorkflow(dir).changed).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
