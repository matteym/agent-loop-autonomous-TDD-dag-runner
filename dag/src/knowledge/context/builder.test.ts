import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryGate } from "../memory/gate.js";
import { MemoryStore } from "../memory/store.js";
import { ContextBuilder } from "./builder.js";

const evidence = {
  run_id: "run-context-1",
  node_id: "context-builder",
  tests: ["context/builder.test.ts"],
};

function writeFixture(root: string, rel: string, content: string): void {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
}

describe("ContextBuilder.build", () => {
  let codebaseRoot: string;
  let memoryRoot: string;

  afterEach(() => {
    if (codebaseRoot) {
      rmSync(codebaseRoot, { recursive: true, force: true });
    }
    if (memoryRoot) {
      rmSync(memoryRoot, { recursive: true, force: true });
    }
  });

  it("includes scoped FAILURE memory for a hinted file and omits unrelated paths", () => {
    codebaseRoot = mkdtempSync(path.join(tmpdir(), "context-codebase-"));
    memoryRoot = mkdtempSync(path.join(tmpdir(), "context-memory-"));

    writeFixture(
      codebaseRoot,
      "lib/token.ts",
      `export function rotateRefreshToken() {}
`,
    );
    writeFixture(codebaseRoot, "lib/unrelated.ts", "export function otherFeature() {}\n");
    writeFixture(codebaseRoot, "lib/noise.ts", "export function noise() {}\n");

    const gate = new MemoryGate(new MemoryStore({ memory_root: memoryRoot }));
    gate.persist({
      type: "FAILURE",
      title: "Refresh token rotation missed",
      content: "Login did not rotate refresh token on reuse.",
      scope: {
        files: ["lib/token.ts"],
        modules: ["lib"],
        symbols: ["rotateRefreshToken"],
      },
      evidence,
      status: "verified",
    });

    const context = ContextBuilder.build({
      nodePrompt: "Fix refresh token rotation in lib/token.ts",
      filesHint: ["lib/token.ts"],
      codebase_root: codebaseRoot,
      memory_root: memoryRoot,
    });

    expect(context.objective.length).toBeGreaterThan(0);
    expect(context.files).toContain("lib/token.ts");
    expect(context.files).not.toContain("lib/unrelated.ts");
    expect(context.files).not.toContain("lib/noise.ts");
    expect(context.files.length).toBeLessThanOrEqual(8);

    expect(
      context.similar_failures.some((line) =>
        line.toLowerCase().includes("refresh token rotation missed"),
      ),
    ).toBe(true);
  });
});
