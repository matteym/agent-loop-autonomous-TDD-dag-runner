import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryGate } from "../memory/gate.js";
import { MemoryStore } from "../memory/store.js";
import { retrieveHybridRank } from "./hybrid-rank.js";

const evidence = {
  run_id: "run-hybrid-1",
  node_id: "retrieval-hybrid-rank",
  tests: ["retrieval/hybrid-rank.test.ts"],
};

function writeFixture(root: string, rel: string, content: string): void {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
}

describe("retrieveHybridRank", () => {
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

  it("ranks FAILURE memories above unrelated FACT for a failure-like query", () => {
    codebaseRoot = mkdtempSync(path.join(tmpdir(), "hybrid-codebase-"));
    memoryRoot = mkdtempSync(path.join(tmpdir(), "hybrid-memory-"));

    writeFixture(
      codebaseRoot,
      "lib/token.ts",
      `export function rotateRefreshToken() {}
`,
    );

    const gate = new MemoryGate(new MemoryStore({ memory_root: memoryRoot }));
    const failure = gate.persist({
      type: "FAILURE",
      title: "Refresh token failure on reuse",
      content: "Rotation did not run when refresh token failure was detected.",
      scope: { files: ["lib/token.ts"], modules: ["lib"], symbols: ["rotateRefreshToken"] },
      evidence,
      status: "verified",
    });
    const fact = gate.persist({
      type: "FACT",
      title: "Tooling note",
      content: "Docs mention refresh token failure modes in a glossary entry.",
      scope: { files: ["docs/glossary.md"], modules: ["docs"], symbols: [] },
      evidence,
      status: "verified",
    });

    const query = "refresh token failure";
    const result = retrieveHybridRank({
      query,
      codebase_root: codebaseRoot,
      memory_root: memoryRoot,
    });

    expect(result.semantic).toEqual([]);

    const failureHit = result.hits.find((hit) => hit.memory_id === failure.id);
    const factHit = result.hits.find((hit) => hit.memory_id === fact.id);
    expect(failureHit).toBeDefined();
    expect(factHit).toBeDefined();
    expect(failureHit?.memory_type).toBe("FAILURE");
    expect(factHit?.memory_type).toBe("FACT");
    expect(failureHit!.score).toBeGreaterThan(factHit!.score);

    const sorted = [...result.hits].sort((a, b) => b.score - a.score);
    expect(result.hits.map((hit) => hit.score)).toEqual(sorted.map((hit) => hit.score));
  });

  it("returns stable scores for the same query and fixtures", () => {
    codebaseRoot = mkdtempSync(path.join(tmpdir(), "hybrid-codebase-"));
    memoryRoot = mkdtempSync(path.join(tmpdir(), "hybrid-memory-"));

    writeFixture(codebaseRoot, "lib/a.ts", "export function alpha() {}\n");

    const gate = new MemoryGate(new MemoryStore({ memory_root: memoryRoot }));
    gate.persist({
      type: "DECISION",
      title: "Alpha naming",
      content: "Use alpha for the entrypoint.",
      scope: { files: ["lib/a.ts"], modules: ["lib"], symbols: ["alpha"] },
      evidence,
      status: "verified",
    });

    const input = {
      query: "alpha",
      codebase_root: codebaseRoot,
      memory_root: memoryRoot,
    };
    const first = retrieveHybridRank(input);
    const second = retrieveHybridRank(input);

    expect(first.hits.map((hit) => hit.score)).toEqual(second.hits.map((hit) => hit.score));
    expect(first.hits.length).toBeGreaterThan(0);
  });
});
