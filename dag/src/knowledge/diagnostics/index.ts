export type {
  NormalizeFailureInput,
  NormalizedFailure,
  RecordObservedFailureInput,
  RecordVerifiedSolutionInput,
  SimilarFailureHit,
  SimilarFailureQuery,
} from "./types.js";
export { normalizeFailure } from "./normalize-failure.js";
export {
  findSimilarFailures,
  recordObservedFailure,
  recordVerifiedSolution,
} from "./failure-learning.js";
export {
  evaluateRepeatFailureFixRound,
  recordRepairAttempt,
  deriveValidationFailurePair,
} from "./repeat-failure-strategy.js";
export type {
  EvaluateRepeatFailureFixRoundInput,
  RecordRepairAttemptInput,
  RepeatFailureFixRoundAdvice,
  RepeatFailureNextAction,
  RepairAttemptRow,
  StrategyStats,
} from "./repeat-strategy-types.js";
export { LOCAL_BENCHMARK_FIXTURES } from "./benchmark-fixtures.js";
export { defaultBenchmarkQuestions, runRetrievalBenchmark } from "./benchmark-retrieval.js";
export { appendTraceRecord, readTraceRecords } from "./trace-record.js";
export {
  promoteVerifiedRunMemoryToProject,
  resolveProjectMemoryRootFromBase,
  resolveRunMemoryRoot,
  writeRunOnlyNote,
} from "./run-memory-split.js";
export type {
  AppendTraceInput,
  BenchmarkComparison,
  BenchmarkQuestion,
  BenchmarkScore,
  PromoteVerifiedMemoryInput,
  PromoteVerifiedMemoryResult,
  RunBenchmarkInput,
  TraceRecord,
} from "./benchmark-trace-types.js";
