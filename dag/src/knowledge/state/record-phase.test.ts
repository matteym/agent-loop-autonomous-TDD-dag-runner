import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CheckpointStore } from "./checkpoint-store.js";
import {
  LOOP_EVENT_CHECKPOINT_PHASE,
  LOOP_ORCHESTRATOR_PHASE_EVENTS,
} from "./loop-phases.js";
import { recordPhase } from "./record-phase.js";
import { NodeStateStore, RunStateStore } from "./run-store.js";
import { LOOP_PHASE_EVENTS } from "./types.js";

const workspace = { branch: "agent/test", commit: "abc123" };

describe("loop phase mapping", () => {
  it("maps every loop hook event to a checkpoint phase", () => {
    for (const event of LOOP_PHASE_EVENTS) {
      expect(LOOP_EVENT_CHECKPOINT_PHASE[event]).toBeDefined();
    }
  });

  it("covers orchestrator phases used by the DAG loop", () => {
    for (const event of LOOP_ORCHESTRATOR_PHASE_EVENTS) {
      expect(LOOP_EVENT_CHECKPOINT_PHASE[event]).toMatch(
        /^(PLAN_CREATED|NODE_STARTED|RED_STARTED|GREEN_STARTED|VERIFICATION_STARTED|VERIFICATION_COMPLETED|COMMIT_CREATED|NODE_COMPLETED|NODE_FAILED)$/,
      );
    }
  });
});

describe("recordPhase", () => {
  let memoryRoot: string;

  afterEach(() => {
    if (memoryRoot) {
      rmSync(memoryRoot, { recursive: true, force: true });
    }
  });

  it("appends PLAN_CREATED and persists run state after plan is written", () => {
    memoryRoot = mkdtempSync(path.join(tmpdir(), "agent-memory-record-"));
    const runId = "run-plan";

    recordPhase({
      run_id: runId,
      dag_title: "codebase intelligence",
      node_id: "",
      event: "plan_created",
      workspace,
      next_action: "start-first-node",
      memory_root: memoryRoot,
    });

    const checkpoints = new CheckpointStore(memoryRoot).readForRun(runId);
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0]?.phase).toBe("PLAN_CREATED");
    expect(checkpoints[0]?.next_action).toBe("start-first-node");

    const run = new RunStateStore(memoryRoot).load(runId);
    expect(run?.run_id).toBe(runId);
    expect(run?.dag_title).toBe("codebase intelligence");
    expect(run?.status).toBe("running");
  });

  it("records node start and RED without losing checkpoint order", () => {
    memoryRoot = mkdtempSync(path.join(tmpdir(), "agent-memory-record-"));
    const runId = "run-node-red";
    const nodeId = "wire-loop-checkpoints";

    recordPhase({
      run_id: runId,
      dag_title: "dag",
      node_id: nodeId,
      event: "node_started",
      workspace,
      next_action: "tdd-red",
      memory_root: memoryRoot,
    });
    recordPhase({
      run_id: runId,
      dag_title: "dag",
      node_id: nodeId,
      event: "red_started",
      workspace,
      next_action: "agent-red-send",
      memory_root: memoryRoot,
    });

    const checkpoints = new CheckpointStore(memoryRoot).readForRun(runId);
    expect(checkpoints.map((row) => row.phase)).toEqual(["NODE_STARTED", "RED_STARTED"]);

    const node = new NodeStateStore(memoryRoot).load(runId, nodeId);
    expect(node?.node_id).toBe(nodeId);
    expect(node?.status).toBe("red");
  });

  it("writes VERIFICATION checkpoints and marks tests on guard/test", () => {
    memoryRoot = mkdtempSync(path.join(tmpdir(), "agent-memory-record-"));
    const runId = "run-verify";
    const nodeId = "some-node";

    recordPhase({
      run_id: runId,
      dag_title: "dag",
      node_id: nodeId,
      event: "verification_started",
      workspace,
      next_action: "run-guard-and-tests",
      memory_root: memoryRoot,
    });
    recordPhase({
      run_id: runId,
      dag_title: "dag",
      node_id: nodeId,
      event: "verification_completed",
      workspace,
      next_action: "commit-or-fix",
      memory_root: memoryRoot,
      tests: { passed: 4, failed: 0 },
    });

    const checkpoints = new CheckpointStore(memoryRoot).readForRun(runId);
    expect(checkpoints.at(-1)?.phase).toBe("VERIFICATION_COMPLETED");
    expect(checkpoints.at(-1)?.tests).toEqual({ passed: 4, failed: 0 });
  });

  it("fail-closed node_failed checkpoint updates node and run status", () => {
    memoryRoot = mkdtempSync(path.join(tmpdir(), "agent-memory-record-"));
    const runId = "run-fail";
    const nodeId = "broken-node";

    recordPhase({
      run_id: runId,
      dag_title: "dag",
      node_id: nodeId,
      event: "node_failed",
      workspace,
      next_action: "stop-run",
      memory_root: memoryRoot,
      status: "failed",
      failure: { type: "validation", signature: "tests-red" },
    });

    const latest = new CheckpointStore(memoryRoot).latestForRun(runId);
    expect(latest?.phase).toBe("NODE_FAILED");
    expect(latest?.status).toBe("failed");
    expect(latest?.failure?.signature).toBe("tests-red");

    const node = new NodeStateStore(memoryRoot).load(runId, nodeId);
    expect(node?.status).toBe("failed");
    expect(node?.finished_at).not.toBeNull();

    const run = new RunStateStore(memoryRoot).load(runId);
    expect(run?.status).toBe("failed");
  });

  it("survives process exit: new store instances reload persisted state", () => {
    memoryRoot = mkdtempSync(path.join(tmpdir(), "agent-memory-record-"));
    const runId = "run-reload";
    const nodeId = "archive-node";

    recordPhase({
      run_id: runId,
      dag_title: "dag",
      node_id: nodeId,
      event: "commit_created",
      workspace,
      next_action: "archive",
      memory_root: memoryRoot,
    });
    recordPhase({
      run_id: runId,
      dag_title: "dag",
      node_id: nodeId,
      event: "node_archived",
      workspace,
      next_action: "next-node",
      memory_root: memoryRoot,
    });

    const checkpoints = new CheckpointStore(memoryRoot).readForRun(runId);
    expect(checkpoints.map((row) => row.phase)).toEqual([
      "COMMIT_CREATED",
      "NODE_COMPLETED",
    ]);

    const runReload = new RunStateStore(memoryRoot).load(runId);
    expect(runReload?.node_id).toBe(nodeId);
    expect(runReload?.status).toBe("running");

    const nodeReload = new NodeStateStore(memoryRoot).load(runId, nodeId);
    expect(nodeReload?.status).toBe("completed");
    expect(nodeReload?.finished_at).not.toBeNull();
  });
});
