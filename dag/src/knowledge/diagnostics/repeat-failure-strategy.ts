import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type {
  EvaluateRepeatFailureFixRoundInput,
  RecordRepairAttemptInput,
  RepairAttemptRow,
  RepeatFailureFixRoundAdvice,
  StrategyStats,
} from "./repeat-strategy-types.js";

const DEFAULT_REPEAT_THRESHOLD = 3;
const REPAIR_LOG = "repair-attempts.jsonl";

function resolveRepeatThreshold(): number {
  const raw = process.env.REPEAT_FAILURE_STRATEGY_THRESHOLD?.trim();
  if (!raw) {
    return DEFAULT_REPEAT_THRESHOLD;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_REPEAT_THRESHOLD;
  }
  return parsed;
}

function repairLogPath(storageRoot: string): string {
  return path.join(storageRoot, REPAIR_LOG);
}

function readRows(storageRoot: string): RepairAttemptRow[] {
  const logPath = repairLogPath(storageRoot);
  if (!existsSync(logPath)) {
    return [];
  }
  const rows: RepairAttemptRow[] = [];
  for (const line of readFileSync(logPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    rows.push(JSON.parse(line) as RepairAttemptRow);
  }
  return rows;
}

function appendRow(storageRoot: string, row: RepairAttemptRow): void {
  mkdirSync(storageRoot, { recursive: true });
  appendFileSync(repairLogPath(storageRoot), JSON.stringify(row) + "\n", "utf8");
}

function computeStats(
  rows: RepairAttemptRow[],
  signature: string,
  attempted_solution: string,
): StrategyStats {
  const matching = rows.filter(
    (row) =>
      row.signature === signature && row.attempted_solution === attempted_solution,
  );
  return {
    signature,
    attempted_solution,
    fail_count: matching.filter((row) => !row.passed).length,
    pass_count: matching.filter((row) => row.passed).length,
  };
}

function buildAdvice(stats: StrategyStats): RepeatFailureFixRoundAdvice {
  const threshold = resolveRepeatThreshold();
  const repeat_detected = stats.fail_count >= threshold;
  return {
    stats,
    repeat_detected,
    next_action: repeat_detected ? "strategy-change" : "continue-fix",
  };
}

export function deriveValidationFailurePair(output: string): {
  signature: string;
  attempted_solution: string;
} {
  const normalized = output.trim();
  const lines = normalized.split(/\r?\n/).filter(Boolean);
  const failLine =
    lines.find((line) => /FAIL|Error|AssertionError|expected/i.test(line)) ??
    lines[0] ??
    normalized.slice(0, 120);
  const signature = failLine.trim().slice(0, 300);
  const attempted_solution = normalized.slice(0, 500);
  return { signature, attempted_solution };
}

export function recordRepairAttempt(input: RecordRepairAttemptInput): StrategyStats {
  appendRow(input.storage_root, {
    signature: input.signature.trim(),
    attempted_solution: input.attempted_solution.trim(),
    passed: input.passed,
    recorded_at: new Date().toISOString(),
  });
  const rows = readRows(input.storage_root);
  return computeStats(rows, input.signature.trim(), input.attempted_solution.trim());
}

export function evaluateRepeatFailureFixRound(
  input: EvaluateRepeatFailureFixRoundInput,
): RepeatFailureFixRoundAdvice {
  const stats = recordRepairAttempt(input);
  return buildAdvice(stats);
}
