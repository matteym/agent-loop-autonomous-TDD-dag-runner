import { CheckpointStore } from "./checkpoint-store.js";
import { LOOP_EVENT_CHECKPOINT_PHASE } from "./loop-phases.js";
import { resolveAgentMemoryRoot } from "./paths.js";
import { NodeStateStore, RunStateStore } from "./run-store.js";
import type {
  LoopPhaseEvent,
  NodeState,
  RecordPhaseInput,
  RecordPhaseResult,
  RunState,
} from "./types.js";

function checkpointStatus(input: RecordPhaseInput): "ok" | "failed" {
  if (input.status) {
    return input.status;
  }
  return input.event === "node_failed" ? "failed" : "ok";
}

function applyRunEvent(run: RunState, event: LoopPhaseEvent, nodeId: string, now: string): void {
  switch (event) {
    case "run_started":
    case "plan_created":
      run.status = "running";
      run.finished_at = null;
      break;
    case "node_started":
      run.node_id = nodeId;
      run.status = "running";
      run.finished_at = null;
      break;
    case "node_archived":
      run.node_id = nodeId;
      run.status = "running";
      break;
    case "node_failed":
      run.status = "failed";
      run.finished_at = now;
      break;
    case "run_completed":
      run.status = "completed";
      run.finished_at = now;
      break;
    default:
      if (nodeId) {
        run.node_id = nodeId;
      }
      break;
  }
}

function applyNodeEvent(node: NodeState, event: LoopPhaseEvent, now: string): void {
  switch (event) {
    case "node_started":
      node.status = "running";
      node.finished_at = null;
      break;
    case "red_started":
      node.status = "red";
      break;
    case "red_completed":
      node.status = "red";
      break;
    case "green_started":
    case "green_completed":
      node.status = "green";
      break;
    case "verification_started":
    case "verification_completed":
      node.status = "verifying";
      break;
    case "commit_created":
      node.status = "committing";
      break;
    case "node_archived":
      node.status = "completed";
      node.finished_at = now;
      break;
    case "node_failed":
      node.status = "failed";
      node.finished_at = now;
      break;
    default:
      break;
  }
}

/** Called from dag/src/loop.ts at each phase transition. */
export function recordPhase(input: RecordPhaseInput): RecordPhaseResult {
  const memoryRoot =
    input.memory_root ?? resolveAgentMemoryRoot(input.repo_root ?? process.cwd());
  const now = new Date().toISOString();

  const runStore = new RunStateStore(memoryRoot);
  const nodeStore = new NodeStateStore(memoryRoot);
  const checkpointStore = new CheckpointStore(memoryRoot);

  const existingRun = runStore.load(input.run_id);
  const run: RunState = existingRun ?? {
    run_id: input.run_id,
    dag_title: input.dag_title,
    node_id: "",
    status: "running",
    started_at: now,
    finished_at: null,
  };

  run.dag_title = input.dag_title;
  applyRunEvent(run, input.event, input.node_id, now);
  runStore.save(run);

  let node_state: NodeState | undefined;
  if (input.node_id.length > 0) {
    const existingNode = nodeStore.load(input.run_id, input.node_id);
    const node: NodeState = existingNode ?? {
      run_id: input.run_id,
      node_id: input.node_id,
      status: "running",
      started_at: now,
      finished_at: null,
    };
    applyNodeEvent(node, input.event, now);
    nodeStore.save(node);
    node_state = node;
  }

  const checkpoint = checkpointStore.append({
    run_id: input.run_id,
    node_id: input.node_id,
    phase: LOOP_EVENT_CHECKPOINT_PHASE[input.event],
    status: checkpointStatus(input),
    workspace: input.workspace,
    context: input.context ?? { memory_ids: [], files: [] },
    tests: input.tests ?? { passed: 0, failed: 0 },
    next_action: input.next_action,
    ...(input.failure !== undefined ? { failure: input.failure } : {}),
  });

  return { checkpoint, run_state: run, node_state };
}
