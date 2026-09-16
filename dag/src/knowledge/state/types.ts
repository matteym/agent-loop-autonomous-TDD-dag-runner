export const CHECKPOINT_PHASES = [
  "RUN_STARTED",
  "PLAN_CREATED",
  "NODE_STARTED",
  "CONTEXT_BUILT",
  "RED_STARTED",
  "RED_COMPLETED",
  "GREEN_STARTED",
  "GREEN_COMPLETED",
  "VERIFICATION_STARTED",
  "VERIFICATION_COMPLETED",
  "NODE_COMPLETED",
  "NODE_FAILED",
  "REPAIR_STARTED",
  "REPAIR_COMPLETED",
  "COMMIT_CREATED",
  "RUN_COMPLETED",
] as const;

export type CheckpointPhase = (typeof CHECKPOINT_PHASES)[number];

export type CheckpointStatus = "ok" | "failed";

export type CheckpointWorkspace = {
  branch: string;
  commit: string;
};

export type CheckpointContext = {
  memory_ids: string[];
  files: string[];
};

export type CheckpointTests = {
  passed: number;
  failed: number;
};

export type CheckpointFailure = {
  type: string;
  signature: string;
};

export type CheckpointRecord = {
  checkpoint_id: string;
  run_id: string;
  node_id: string;
  phase: CheckpointPhase;
  status: CheckpointStatus;
  workspace: CheckpointWorkspace;
  context: CheckpointContext;
  tests: CheckpointTests;
  failure?: CheckpointFailure;
  next_action: string;
  created_at: string;
};

export type NewCheckpointRecord = Omit<CheckpointRecord, "checkpoint_id" | "created_at"> & {
  checkpoint_id?: string;
  created_at?: string;
};

export type RunState = {
  run_id: string;
  dag_title: string;
  node_id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
};

export type NodeState = {
  run_id: string;
  node_id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
};

export type ResumeSuccess = {
  ok: true;
  run_id: string;
  completed_node_ids: string[];
  next_action: string;
  latest_checkpoint: CheckpointRecord;
};

export type ResumeFailure = {
  ok: false;
  reason: "no_checkpoints" | "workspace_commit_mismatch";
  run_id: string;
  expected_commit?: string;
  actual_commit?: string;
};

export type ResumeResult = ResumeSuccess | ResumeFailure;

export type ResumeFromCheckpointInput = {
  run_id: string;
  /** Current git HEAD commit sha (caller resolves). */
  head_commit: string;
  /** Repo root used to resolve AGENT_MEMORY_ROOT when memory_root omitted. */
  repo_root?: string;
  memory_root?: string;
};

/** Orchestrator loop hook events mapped to checkpoint phases in recordPhase. */
export const LOOP_PHASE_EVENTS = [
  "run_started",
  "plan_created",
  "node_started",
  "context_built",
  "red_started",
  "red_completed",
  "green_started",
  "green_completed",
  "verification_started",
  "verification_completed",
  "commit_created",
  "repair_started",
  "repair_completed",
  "node_archived",
  "node_failed",
  "run_completed",
] as const;

export type LoopPhaseEvent = (typeof LOOP_PHASE_EVENTS)[number];

export type RecordPhaseInput = {
  run_id: string;
  dag_title: string;
  node_id: string;
  event: LoopPhaseEvent;
  workspace: CheckpointWorkspace;
  next_action: string;
  memory_root?: string;
  repo_root?: string;
  context?: CheckpointContext;
  tests?: CheckpointTests;
  status?: CheckpointStatus;
  failure?: CheckpointFailure;
};

export type RecordPhaseResult = {
  checkpoint: CheckpointRecord;
  run_state: RunState;
  node_state?: NodeState;
};
