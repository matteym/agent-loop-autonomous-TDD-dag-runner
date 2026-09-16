import type { MemoryEvidence } from "../memory/types.js";

export type NormalizedFailure = {
  type: string;
  signature: string;
  stack_snippet: string;
  files: string[];
  symbols: string[];
  tests: string[];
  root_cause?: string;
  attempted_solutions: string[];
  successful_solution?: string;
  evidence: MemoryEvidence;
};

export type NormalizeFailureInput = {
  type: string;
  signature: string;
  stack?: string;
  files?: string[];
  symbols?: string[];
  tests?: string[];
  root_cause?: string;
  attempted_solutions?: string[];
  output?: string;
  evidence: MemoryEvidence;
};

export type SimilarFailureQuery = {
  memory_root: string;
  signature: string;
  files?: string[];
};

export type SimilarFailureHit = {
  signature: string;
  successful_solution?: string;
  failure_memory_id?: string;
  solution_memory_id?: string;
};

export type RecordObservedFailureInput = {
  memory_root: string;
  failure: NormalizedFailure;
};

export type RecordVerifiedSolutionInput = {
  memory_root: string;
  signature: string;
  files: string[];
  symbols: string[];
  successful_solution: string;
  attempted_solutions?: string[];
  evidence: MemoryEvidence;
};
