import { CheckpointStore } from "./checkpoint-store.js";
import { resolveAgentMemoryRoot } from "./paths.js";
import type { ResumeFromCheckpointInput, ResumeResult } from "./types.js";

/** Resume a DAG run from the latest checkpoint without redoing finished nodes. */
export function resumeFromCheckpoint(input: ResumeFromCheckpointInput): ResumeResult {
  const repoRoot = input.repo_root ?? process.cwd();
  const memoryRoot = input.memory_root ?? resolveAgentMemoryRoot(repoRoot);
  const store = new CheckpointStore(memoryRoot);

  const latest = store.latestForRun(input.run_id);
  if (!latest) {
    return { ok: false, reason: "no_checkpoints", run_id: input.run_id };
  }

  if (latest.workspace.commit !== input.head_commit) {
    return {
      ok: false,
      reason: "workspace_commit_mismatch",
      run_id: input.run_id,
      expected_commit: latest.workspace.commit,
      actual_commit: input.head_commit,
    };
  }

  const completed_node_ids: string[] = [];
  const seen = new Set<string>();
  for (const row of store.readForRun(input.run_id)) {
    if (row.phase !== "NODE_COMPLETED" || row.node_id.length === 0) {
      continue;
    }
    if (seen.has(row.node_id)) {
      continue;
    }
    seen.add(row.node_id);
    completed_node_ids.push(row.node_id);
  }

  return {
    ok: true,
    run_id: input.run_id,
    completed_node_ids,
    next_action: latest.next_action,
    latest_checkpoint: latest,
  };
}
