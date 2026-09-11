import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizePlannedDag } from "./plan-normalize.js";
import { buildPlannerPrompt, maxPlanTasks, validateDag } from "./task.js";
import type { Dag, TestSpec } from "./types.js";

const pyTests: TestSpec = {
  cwd: "src/backend",
  cmd: "uv",
  args: ["run", "python", "-m", "pytest", "-q"],
};

function dagWith(taskExtra: Record<string, unknown>, tests = [pyTests]): Dag {
  return {
    title: "content autopilot",
    model: "composer-2.5",
    cwd: "..",
    tasks: [
      {
        id: "scaffold-content-autopilot-package",
        prompt: "scaffold a python package under src/backend",
        commit: "feat(backend): scaffold content-autopilot package",
        tests,
        ...taskExtra,
      },
    ],
  };
}

describe("planner limits", () => {
  it("allows up to 10 features per yarn task", () => {
    expect(maxPlanTasks).toBe(10);
  });
});

describe("normalizePlannedDag", () => {
  it("hoists task-level optionalCwd onto tests and strips it from the task", () => {
    const root = mkdtempSync(join(tmpdir(), "dag-plan-"));
    try {
      const normalized = normalizePlannedDag(
        dagWith({ optionalCwd: true }),
        [],
        root
      );
      expect(normalized.tasks[0].tests[0].optionalCwd).toBe(true);
      expect("optionalCwd" in normalized.tasks[0]).toBe(false);
      expect(validateDag(normalized, [], root)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("sets optionalCwd when the planner omits it for a fillable new package", () => {
    const root = mkdtempSync(join(tmpdir(), "dag-plan-"));
    try {
      const normalized = normalizePlannedDag(dagWith({}), [], root);
      expect(normalized.tasks[0].tests[0].optionalCwd).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not mark inventoried packages as optionalCwd", () => {
    const normalized = normalizePlannedDag(
      dagWith({}, [{ cwd: "src/api", cmd: "yarn", args: ["test"] }]),
      ["src/api"]
    );
    expect(normalized.tasks[0].tests[0].optionalCwd).toBeUndefined();
  });
});

describe("validateDag", () => {
  it("rejects a new cwd when optionalCwd is missing", () => {
    const dag = dagWith({});
    expect(validateDag(dag, [])).toMatch(/cwd not in inventory/);
  });

  it("accepts optionalCwd on the tests entry", () => {
    const root = mkdtempSync(join(tmpdir(), "dag-plan-"));
    try {
      const dag = dagWith({}, [{ ...pyTests, optionalCwd: true }]);
      expect(validateDag(dag, [], root)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("planner prompt", () => {
  it("puts optionalCwd inside tests[] and tells the model never to set it on the task", () => {
    const prompt = buildPlannerPrompt("add a fastapi cli", [], "composer-2.5");
    expect(prompt).toContain('"optionalCwd":true');
    expect(prompt).toContain("never on the task object");
    expect(prompt).toContain("put optionalCwd true on that tests[] entry");
  });
});
