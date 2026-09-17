import {
  PARENT_HISTORY_MAX_LINES,
  PARENT_HISTORY_MAX_NODES,
  capText,
} from "./send-budget.js";
import type { TokenUsage } from "./token-usage.js";

export type HistoryNodeRow = {
  ts?: string;
  dagFile?: string;
  nodeId?: string;
  commit?: string;
  sha?: string;
  durationMs?: number;
  status?: string;
  tokens?: TokenUsage;
};

function parseRow(line: string): HistoryNodeRow | null {
  try {
    return JSON.parse(line) as HistoryNodeRow;
  } catch {
    return null;
  }
}

export function readHistoryRows(jsonl: string): HistoryNodeRow[] {
  const rows: HistoryNodeRow[] = [];
  for (const line of jsonl.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    const row = parseRow(line);
    if (row) {
      rows.push(row);
    }
  }
  return rows;
}

function tokenLine(tokens: TokenUsage | undefined): string {
  if (!tokens) {
    return "tokens: unknown";
  }
  return "tokens: " + String(tokens.total);
}

export function formatParentHistory(input: {
  jsonl: string;
  dagFile: string;
  memoryLines?: string[];
}): string {
  const finished = readHistoryRows(input.jsonl)
    .filter(
      (row) =>
        row.status === "finished" &&
        row.nodeId &&
        (row.dagFile === input.dagFile || !row.dagFile)
    )
    .slice(-PARENT_HISTORY_MAX_NODES);
  if (!finished.length) {
    return "";
  }
  const blocks: string[] = ["PARENT NODES"];
  for (const row of finished) {
    const lines = [
      row.nodeId + " " + (row.status || "unknown") + " " + (row.commit || "unknown"),
      "sha " + (row.sha || "unknown") + " " + tokenLine(row.tokens),
    ];
    const extras = (input.memoryLines ?? []).slice(0, 2);
    for (const extra of extras) {
      lines.push(capText(extra, 160));
    }
    blocks.push(lines.slice(0, PARENT_HISTORY_MAX_LINES).join("\n"));
  }
  return blocks.join("\n");
}
