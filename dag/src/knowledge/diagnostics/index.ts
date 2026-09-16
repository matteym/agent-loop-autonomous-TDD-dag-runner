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
