import type { MemoryEvidence } from "../memory/types.js";

export type BenchmarkQuestion = {
  question: string;
  expected_files: string[];
  expected_memory_substrings?: string[];
};

export type BenchmarkScore = {
  hit_rate: number;
  hits: number;
  total: number;
};

export type BenchmarkComparison = {
  baseline: BenchmarkScore;
  retrieval: BenchmarkScore;
};

export type RunBenchmarkInput = {
  codebase_root: string;
  memory_root: string;
  questions?: BenchmarkQuestion[];
};

export type TraceRecord = {
  intent: string;
  run_id: string;
  node_id: string;
  memory_ids: string[];
  files: string[];
  tests: string[];
  commit_sha: string;
  recorded_at: string;
};

export type AppendTraceInput = Omit<TraceRecord, "recorded_at"> & {
  storage_root: string;
};

export type RunOnlyNoteInput = {
  run_memory_root: string;
  title: string;
  content: string;
};

export type PromoteVerifiedMemoryInput = {
  run_memory_root: string;
  project_memory_root: string;
  verified: Array<{
    type: "FAILURE" | "SOLUTION" | "FACT";
    title: string;
    content: string;
    scope: { files: string[]; modules: string[]; symbols: string[] };
    evidence: MemoryEvidence;
  }>;
  run_only_notes?: RunOnlyNoteInput[];
};

export type PromoteVerifiedMemoryResult = {
  promoted_ids: string[];
  project_memory_ids: string[];
};
