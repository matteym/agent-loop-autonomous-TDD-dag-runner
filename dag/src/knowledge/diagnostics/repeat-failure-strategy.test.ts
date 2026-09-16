import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateRepeatFailureFixRound } from "./repeat-failure-strategy.js";

describe("repeat failure strategy", () => {
  let storageRoot: string;

  afterEach(() => {
    if (storageRoot) {
      rmSync(storageRoot, { recursive: true, force: true });
    }
  });

  it("trips strategy-change after three identical fail and solution pairs", () => {
    storageRoot = mkdtempSync(path.join(tmpdir(), "repeat-strategy-"));
    mkdirSync(storageRoot, { recursive: true });

    const signature = "AssertionError: expected false to be true // token rotation";
    const attempted_solution = "Add logging around rotateRefreshToken only";

    let advice = evaluateRepeatFailureFixRound({
      storage_root: storageRoot,
      signature,
      attempted_solution,
      passed: false,
    });
    expect(advice.next_action).toBe("continue-fix");
    expect(advice.stats.fail_count).toBe(1);
    expect(advice.stats.pass_count).toBe(0);

    advice = evaluateRepeatFailureFixRound({
      storage_root: storageRoot,
      signature,
      attempted_solution,
      passed: false,
    });
    expect(advice.next_action).toBe("continue-fix");
    expect(advice.stats.fail_count).toBe(2);

    advice = evaluateRepeatFailureFixRound({
      storage_root: storageRoot,
      signature,
      attempted_solution,
      passed: false,
    });

    expect(advice.repeat_detected).toBe(true);
    expect(advice.next_action).toBe("strategy-change");
    expect(advice.stats).toEqual({
      signature,
      attempted_solution,
      fail_count: 3,
      pass_count: 0,
    });
  });
});
