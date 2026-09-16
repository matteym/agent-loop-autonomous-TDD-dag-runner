import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findSimilarFailures,
  recordObservedFailure,
  recordVerifiedSolution,
} from "./failure-learning.js";
import { normalizeFailure } from "./normalize-failure.js";

const evidence = {
  run_id: "run-failure-learning-1",
  node_id: "failure-learning",
  tests: ["diagnostics/failure-learning.test.ts"],
};

describe("failure learning", () => {
  let memoryRoot: string;

  afterEach(() => {
    if (memoryRoot) {
      rmSync(memoryRoot, { recursive: true, force: true });
    }
  });

  it("retrieves stored successful_solution for the same failure signature", () => {
    memoryRoot = mkdtempSync(path.join(tmpdir(), "failure-learning-"));

    const signature = "AssertionError: expected false to be true // token rotation";
    const normalized = normalizeFailure({
      type: "validation",
      signature,
      stack: "at lib/token.test.ts:12:5",
      files: ["lib/token.ts"],
      symbols: ["rotateRefreshToken"],
      tests: ["lib/token.test.ts"],
      output: signature,
      attempted_solutions: ["Added logging only"],
      evidence,
    });

    recordObservedFailure({ memory_root: memoryRoot, failure: normalized });

    const solutionText =
      "Call rotateRefreshToken after detecting refresh token reuse in login handler.";
    recordVerifiedSolution({
      memory_root: memoryRoot,
      signature,
      files: ["lib/token.ts"],
      symbols: ["rotateRefreshToken"],
      successful_solution: solutionText,
      attempted_solutions: normalized.attempted_solutions,
      evidence,
    });

    const hits = findSimilarFailures({
      memory_root: memoryRoot,
      signature,
      files: ["lib/token.ts"],
    });

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.signature).toBe(signature);
    expect(hits[0]?.successful_solution).toContain("rotateRefreshToken");
  });
});
