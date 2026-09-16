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
