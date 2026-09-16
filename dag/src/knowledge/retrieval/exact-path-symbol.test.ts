import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryGate } from "../memory/gate.js";
import { MemoryStore } from "../memory/store.js";
import { retrieveExactPathSymbol } from "./exact-path-symbol.js";

const evidence = {
  run_id: "run-retrieval-1",
  node_id: "retrieval-exact-path-symbol",
  tests: ["retrieval/exact-path-symbol.test.ts"],
};

function writeFixture(root: string, rel: string, content: string): void {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
}

describe("retrieveExactPathSymbol", () => {
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

  it("finds token.ts and scoped FAILURE memory for a refresh token query", () => {
    codebaseRoot = mkdtempSync(path.join(tmpdir(), "codebase-retrieval-"));
    memoryRoot = mkdtempSync(path.join(tmpdir(), "memory-retrieval-"));

    writeFixture(
      codebaseRoot,
      "lib/token.ts",
      `export function rotateRefreshToken() {}
export function verifyRefreshToken() {}
`,
    );
    writeFixture(codebaseRoot, "lib/unrelated.ts", "export function other() {}\n");

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

    const hits = retrieveExactPathSymbol({
      query: "refresh token",
      codebase_root: codebaseRoot,
      memory_root: memoryRoot,
    });

    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((hit) => hit.file === "lib/token.ts")).toBe(true);
    expect(
      hits.some(
        (hit) =>
          hit.kind === "memory" &&
          hit.title?.toLowerCase().includes("refresh token"),
      ),
    ).toBe(true);

    const sorted = [...hits].sort((a, b) => b.score - a.score);
    expect(hits.map((hit) => hit.score)).toEqual(sorted.map((hit) => hit.score));

    const symbolHit = hits.find(
      (hit) => hit.file === "lib/token.ts" && hit.kind === "symbol",
    );
    const pathHit = hits.find(
      (hit) => hit.file === "lib/token.ts" && hit.kind === "path",
    );
    if (symbolHit && pathHit) {
      expect(symbolHit.score).toBeGreaterThan(pathHit.score);
    }
    const exactHit = hits.find((hit) => hit.kind === "exact");
    if (exactHit && symbolHit) {
      expect(exactHit.score).toBeGreaterThanOrEqual(symbolHit.score);
    }
  });
});
