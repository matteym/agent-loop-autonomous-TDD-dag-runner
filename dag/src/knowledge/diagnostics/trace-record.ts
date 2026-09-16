import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { MemoryGate } from "../memory/gate.js";
import { MemoryStore } from "../memory/store.js";
import { retrieveHybridRank } from "../retrieval/hybrid-rank.js";
import type {
  AppendTraceInput,
  TraceRecord,
} from "./benchmark-trace-types.js";

const TRACE_LOG = "trace-records.jsonl";

export function appendTraceRecord(input: AppendTraceInput): TraceRecord {
  const record: TraceRecord = {
    intent: input.intent,
    run_id: input.run_id,
    node_id: input.node_id,
    memory_ids: [...input.memory_ids],
    files: [...input.files],
    tests: [...input.tests],
    commit_sha: input.commit_sha,
    recorded_at: new Date().toISOString(),
  };
  mkdirSync(input.storage_root, { recursive: true });
  appendFileSync(
    path.join(input.storage_root, TRACE_LOG),
    JSON.stringify(record) + "\n",
    "utf8",
  );
  return record;
}

export function readTraceRecords(storageRoot: string, runId: string): TraceRecord[] {
  const logPath = path.join(storageRoot, TRACE_LOG);
  if (!existsSync(logPath)) {
    return [];
  }
  const rows: TraceRecord[] = [];
  for (const line of readFileSync(logPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    const record = JSON.parse(line) as TraceRecord;
    if (record.run_id === runId) {
      rows.push(record);
    }
  }
  return rows;
}
