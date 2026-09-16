import { randomUUID } from "node:crypto";
import { mkdirSync, appendFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { checkpointsLogPath } from "./paths.js";
import type { CheckpointRecord, NewCheckpointRecord } from "./types.js";

export class CheckpointStore {
  readonly memoryRoot: string;

  constructor(memoryRoot: string) {
    this.memoryRoot = memoryRoot;
  }

  private logPath(): string {
    return checkpointsLogPath(this.memoryRoot);
  }

  append(record: NewCheckpointRecord): CheckpointRecord {
    const full: CheckpointRecord = {
      checkpoint_id: record.checkpoint_id ?? randomUUID(),
      created_at: record.created_at ?? new Date().toISOString(),
      run_id: record.run_id,
      node_id: record.node_id,
      phase: record.phase,
      status: record.status,
      workspace: record.workspace,
      context: record.context,
      tests: record.tests,
      next_action: record.next_action,
      ...(record.failure !== undefined ? { failure: record.failure } : {}),
    };
    const dir = path.dirname(this.logPath());
    mkdirSync(dir, { recursive: true });
    appendFileSync(this.logPath(), JSON.stringify(full) + "\n", "utf8");
    return full;
  }

  readAll(): CheckpointRecord[] {
    const file = this.logPath();
    if (!existsSync(file)) {
      return [];
    }
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n").filter((line) => line.trim().length > 0);
    return lines.map((line) => JSON.parse(line) as CheckpointRecord);
  }

  readForRun(runId: string): CheckpointRecord[] {
    return this.readAll().filter((row) => row.run_id === runId);
  }

  latestForRun(runId: string): CheckpointRecord | undefined {
    const rows = this.readForRun(runId);
    if (rows.length === 0) {
      return undefined;
    }
    return rows.reduce((latest, row) =>
      row.created_at >= latest.created_at ? row : latest,
    );
  }
}
