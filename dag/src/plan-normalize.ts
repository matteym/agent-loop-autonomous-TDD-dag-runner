import { isAllowedNewTestSpec, isFillableCwd } from "./new-cwd.js";
import { repoRoot } from "./paths.js";
import type { Dag, Task } from "./types.js";

type PlannedTask = Task & { optionalCwd?: boolean };

export function normalizePlannedDag(
  dag: Dag,
  inventoried: readonly string[] = [],
  root: string = repoRoot
): Dag {
  const known = new Set(inventoried);
  const copy = JSON.parse(JSON.stringify(dag)) as Dag;
  for (const task of copy.tasks || []) {
    const planned = task as PlannedTask;
    const hoist = planned.optionalCwd === true;
    delete planned.optionalCwd;
    task.tests = (task.tests || []).map((spec) => {
      const cwd = (spec.cwd || "").replace(/\\/g, "/");
      let optional = spec.optionalCwd === true || hoist;
      if (
        !optional &&
        !known.has(cwd) &&
        isFillableCwd(root, cwd) &&
        isAllowedNewTestSpec(spec.cmd, spec.args || [])
      ) {
        optional = true;
      }
      return optional ? { ...spec, optionalCwd: true } : spec;
    });
  }
  return copy;
}
