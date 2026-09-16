import type { CheckpointPhase, LoopPhaseEvent } from "./types.js";

/** Maps dag/src/loop.ts phase hooks to append-only checkpoint phases. */
export const LOOP_EVENT_CHECKPOINT_PHASE: Record<LoopPhaseEvent, CheckpointPhase> = {
  run_started: "RUN_STARTED",
  plan_created: "PLAN_CREATED",
  node_started: "NODE_STARTED",
  context_built: "CONTEXT_BUILT",
  red_started: "RED_STARTED",
  red_completed: "RED_COMPLETED",
  green_started: "GREEN_STARTED",
  green_completed: "GREEN_COMPLETED",
  verification_started: "VERIFICATION_STARTED",
  verification_completed: "VERIFICATION_COMPLETED",
  commit_created: "COMMIT_CREATED",
  repair_started: "REPAIR_STARTED",
  repair_completed: "REPAIR_COMPLETED",
  node_archived: "NODE_COMPLETED",
  node_failed: "NODE_FAILED",
  run_completed: "RUN_COMPLETED",
};

export const LOOP_ORCHESTRATOR_PHASE_EVENTS: LoopPhaseEvent[] = [
  "plan_created",
  "node_started",
  "context_built",
  "red_started",
  "green_started",
  "verification_started",
  "verification_completed",
  "commit_created",
  "node_archived",
  "node_failed",
];
