import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dirHasPackageMarker, engineKnowledgeCwd, testByLang } from "./inventory.js";
import { normalizePlannedDag } from "./plan-normalize.js";
import { dagDir, donePathFor, repoRoot } from "./paths.js";
import { buildPlannerPrompt, maxPlanTasks, validateDag } from "./task.js";
import type { Dag, Task, TestSpec } from "./types.js";

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
  it("allows up to 20 features per yarn task", () => {
    expect(maxPlanTasks).toBe(20);
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

const knowledgeTests: TestSpec[] = [
  {
    cwd: "dag/src/knowledge",
    cmd: "yarn",
    args: ["test"],
    optionalCwd: true,
  },
];

function readArchivedTasks(donePath: string): Task[] {
  if (!existsSync(donePath)) {
    return [];
  }
  const parsed = JSON.parse(readFileSync(donePath, "utf8")) as { tasks?: Task[] };
  return parsed.tasks ?? [];
}

function knowledgeInventory(): { rel: string; test: { cmd: string; args: string[] } }[] {
  const abs = join(repoRoot, engineKnowledgeCwd);
  if (existsSync(abs) && dirHasPackageMarker(abs)) {
    return [{ rel: engineKnowledgeCwd, test: testByLang.ts }];
  }
  return [];
}

describe("codebase-intelligence dagfile", () => {
  it("covers 20 sequential dag/src/knowledge nodes across live and archive files", () => {
    const dagPath = join(dagDir, "dags", "codebase-intelligence.json");
    const dag = JSON.parse(readFileSync(dagPath, "utf8")) as Dag;
    const byId = new Map<string, Task>();
    for (const task of [...readArchivedTasks(donePathFor(dagPath)), ...dag.tasks]) {
      byId.set(task.id, task);
    }
    const allTasks = [...byId.values()];
    expect(allTasks).toHaveLength(20);
    expect(allTasks.every((task) => task.tests[0]?.cwd === engineKnowledgeCwd)).toBe(true);
    expect(allTasks.every((task) => task.tests[0]?.optionalCwd === true)).toBe(true);
    if (dag.tasks.length) {
      expect(validateDag(dag, knowledgeInventory())).toBeNull();
    }
  });

  it("rejects tests.cwd dag as unsafe", () => {
    const dag = dagWith(
      {},
      [{ cwd: "dag", cmd: "yarn", args: ["test"], optionalCwd: true }]
    );
    expect(validateDag(dag, [])).toMatch(/unsafe new cwd/);
  });

  it("accepts optionalCwd on dag/src/knowledge", () => {
    const root = mkdtempSync(join(tmpdir(), "dag-knowledge-"));
    try {
      const dag: Dag = {
        title: "knowledge",
        model: "composer-2.5",
        cwd: "..",
        tasks: [
          {
            id: "scaffold-knowledge-package",
            prompt: "TypeScript vitest package in dag/src/knowledge",
            commit: "feat(knowledge): scaffold local knowledge package",
            tests: knowledgeTests,
          },
        ],
      };
      expect(validateDag(dag, [], root)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
