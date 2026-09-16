export type RepairAttemptRow = {
  signature: string;
  attempted_solution: string;
  passed: boolean;
  recorded_at: string;
};

export type StrategyStats = {
  signature: string;
  attempted_solution: string;
  fail_count: number;
  pass_count: number;
};

export type RepeatFailureNextAction = "continue-fix" | "strategy-change";

export type RecordRepairAttemptInput = {
  storage_root: string;
  signature: string;
  attempted_solution: string;
  passed: boolean;
};

export type EvaluateRepeatFailureFixRoundInput = RecordRepairAttemptInput;

export type RepeatFailureFixRoundAdvice = {
  stats: StrategyStats;
  repeat_detected: boolean;
  next_action: RepeatFailureNextAction;
};
