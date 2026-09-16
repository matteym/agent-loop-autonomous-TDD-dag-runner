import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CheckpointStore } from "./state/checkpoint-store.js";
import { resumeFromCheckpoint } from "./state/resume.js";
import type { NewCheckpointRecord } from "./state/types.js";

const baseRecord = (
  partial: Partial<NewCheckpointRecord> & Pick<NewCheckpointRecord, "run_id" | "node_id" | "phase">,
): NewCheckpointRecord => ({
  status: "ok",
  workspace: { branch: "agent/test", commit: "abc111" },
  context: { memory_ids: [], files: [] },
  tests: { passed: 0, failed: 0 },
  next_action: "continue",
  ...partial,
});

describe("resumeFromCheckpoint", () => {
  let memoryRoot: string;

  afterEach(() => {
    if (memoryRoot) {
      rmSync(memoryRoot, { recursive: true, force: true });
    }
  });

  it("lists NODE_COMPLETED nodes and returns latest next_action without redoing finished work", () => {
    memoryRoot = mkdtempSync(path.join(tmpdir(), "agent-memory-resume-"));
    const store = new CheckpointStore(memoryRoot);
    const runId = "run-resume-1";
    const headCommit = "abc111";

    store.append(
      baseRecord({
        run_id: runId,
        node_id: "",
        phase: "RUN_STARTED",
        created_at: "2026-01-01T00:00:00.000Z",
        next_action: "plan",
      }),
    );
    store.append(
      baseRecord({
        run_id: runId,
        node_id: "scaffold-knowledge-package",
        phase: "NODE_COMPLETED",
        created_at: "2026-01-01T00:01:00.000Z",
        next_action: "start-next-node",
        workspace: { branch: "agent/test", commit: headCommit },
      }),
    );
    store.append(
      baseRecord({
        run_id: runId,
        node_id: "durable-run-node-state",
        phase: "RED_STARTED",
        created_at: "2026-01-01T00:02:00.000Z",
        next_action: "tdd-red",
        workspace: { branch: "agent/test", commit: headCommit },
      }),
    );

    const result = resumeFromCheckpoint({
      run_id: runId,
      head_commit: headCommit,
      memory_root: memoryRoot,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.completed_node_ids).toEqual(["scaffold-knowledge-package"]);
    expect(result.next_action).toBe("tdd-red");
    expect(result.latest_checkpoint.node_id).toBe("durable-run-node-state");
    expect(result.latest_checkpoint.phase).toBe("RED_STARTED");
  });

  it("refuses resume when checkpoint workspace commit does not match HEAD (fail closed)", () => {
    memoryRoot = mkdtempSync(path.join(tmpdir(), "agent-memory-resume-"));
    const store = new CheckpointStore(memoryRoot);
    const runId = "run-mismatch";
    const checkpointCommit = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
    const currentHead = "cafebabecafebabecafebabecafebabecafebabe";

    store.append(
      baseRecord({
        run_id: runId,
        node_id: "append-only-checkpoints",
        phase: "NODE_COMPLETED",
        workspace: { branch: "agent/test", commit: checkpointCommit },
        next_action: "resume-node",
        created_at: "2026-01-01T00:03:00.000Z",
      }),
    );

    const result = resumeFromCheckpoint({
      run_id: runId,
      head_commit: currentHead,
      memory_root: memoryRoot,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reason).toBe("workspace_commit_mismatch");
    expect(result.expected_commit).toBe(checkpointCommit);
    expect(result.actual_commit).toBe(currentHead);
  });
});
