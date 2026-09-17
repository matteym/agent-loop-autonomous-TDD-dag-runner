import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type StatusState = "RUNNING" | "PAUSED" | "SKIPPED" | "COMPLETED";

export type StatusSnapshot = {
  ts: string;
  runId: string;
  dagFile: string;
  nodeId: string;
  progress: string;
  phase: string;
  lastTest: string;
  tokenUsage: string;
  state: StatusState;
};

export function formatStatusPage(snapshot: StatusSnapshot): string {
  const lines = [
    "ts " + snapshot.ts,
    "run " + snapshot.runId,
    "dag " + snapshot.dagFile,
    "node " + snapshot.nodeId + " (" + snapshot.progress + ")",
    "phase " + snapshot.phase,
    "test " + snapshot.lastTest,
    "tokens " + snapshot.tokenUsage,
    "state " + snapshot.state,
  ];
  return lines.slice(0, 20).join("\n") + "\n";
}

export function writeStatusFile(filePath: string, snapshot: StatusSnapshot): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, formatStatusPage(snapshot), "utf8");
}
