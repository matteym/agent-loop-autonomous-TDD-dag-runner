import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryStore } from "../memory/store.js";
import { projectMemoryLogPath } from "../memory/paths.js";
import { LOCAL_BENCHMARK_FIXTURES } from "./benchmark-fixtures.js";
import { runRetrievalBenchmark } from "./benchmark-retrieval.js";
import {
  promoteVerifiedRunMemoryToProject,
  resolveProjectMemoryRootFromBase,
  resolveRunMemoryRoot,
  writeRunOnlyNote,
} from "./run-memory-split.js";
import { appendTraceRecord, readTraceRecords } from "./trace-record.js";

const evidence = {
  run_id: "run-benchmark-trace-1",
  node_id: "benchmarks-and-trace",
  tests: ["diagnostics/benchmark-trace.test.ts"],
};

function writeFixture(root: string, rel: string, content: string): void {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
}

describe("benchmarks and trace", () => {
  let codebaseRoot: string;
  let memoryRoot: string;
  let traceRoot: string;

  afterEach(() => {
    for (const dir of [codebaseRoot, memoryRoot, traceRoot]) {
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it("scores retrieval above filename baseline on local fixtures", () => {
    codebaseRoot = mkdtempSync(path.join(tmpdir(), "benchmark-codebase-"));
    memoryRoot = mkdtempSync(path.join(tmpdir(), "benchmark-memory-"));

    writeFixture(
      codebaseRoot,
      "lib/auth/handler.ts",
      "export function loginHandler() {}\n",
    );
    writeFixture(
      codebaseRoot,
      "lib/token.ts",
      "export function rotateRefreshToken() {}\n",
    );
    writeFixture(
      codebaseRoot,
      "lib/token.test.ts",
      "import { rotateRefreshToken } from './token.js';\n",
    );

    const projectRoot = path.join(memoryRoot, "project");
    mkdirSync(projectRoot, { recursive: true });
    const gateStore = new MemoryStore({ memory_root: projectRoot });
    gateStore.add({
      type: "FAILURE",
      title: "Refresh token failure on reuse",
      content: "Rotation did not run when refresh token failure was detected.",
      scope: { files: ["lib/token.ts"], modules: ["lib"], symbols: ["rotateRefreshToken"] },
      evidence,
      status: "verified",
    });

    const comparison = runRetrievalBenchmark({
      codebase_root: codebaseRoot,
      memory_root: memoryRoot,
      questions: LOCAL_BENCHMARK_FIXTURES,
    });

    expect(comparison.retrieval.hit_rate).toBeGreaterThan(comparison.baseline.hit_rate);
  });

  it("round-trips trace records in JSONL storage", () => {
    traceRoot = mkdtempSync(path.join(tmpdir(), "benchmark-trace-"));
    const record = appendTraceRecord({
      storage_root: traceRoot,
      intent: "fix token rotation",
      run_id: "run-trace-1",
      node_id: "benchmarks-and-trace",
      memory_ids: ["mem-1"],
      files: ["lib/token.ts"],
      tests: ["lib/token.test.ts"],
      commit_sha: "abc123def",
    });

    expect(record.intent).toBe("fix token rotation");
    const loaded = readTraceRecords(traceRoot, "run-trace-1");
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({
      intent: "fix token rotation",
      run_id: "run-trace-1",
      node_id: "benchmarks-and-trace",
      memory_ids: ["mem-1"],
      files: ["lib/token.ts"],
      tests: ["lib/token.test.ts"],
      commit_sha: "abc123def",
    });
  });

  it("keeps run-only notes out of the project memory store", () => {
    memoryRoot = mkdtempSync(path.join(tmpdir(), "benchmark-memory-"));
    const runRoot = resolveRunMemoryRoot(memoryRoot, "run-promote-1");
    const projectRoot = resolveProjectMemoryRootFromBase(memoryRoot);

    writeRunOnlyNote({
      run_memory_root: runRoot,
      title: "Scratch run note",
      content: "Temporary orchestrator note not verified for project memory.",
    });

    promoteVerifiedRunMemoryToProject({
      run_memory_root: runRoot,
      project_memory_root: projectRoot,
      verified: [
        {
          type: "FACT",
          title: "Verified project fact",
          content: "Token rotation lives in lib/token.ts for reuse handling.",
          scope: { files: ["lib/token.ts"], modules: ["lib"], symbols: [] },
          evidence,
        },
      ],
    });

    const projectLog = projectMemoryLogPath(projectRoot);
    expect(existsSync(projectLog)).toBe(true);
    const text = readFileSync(projectLog, "utf8");
    expect(text.toLowerCase()).toContain("verified project fact");
    expect(text.toLowerCase()).not.toContain("scratch run note");
  });
});
