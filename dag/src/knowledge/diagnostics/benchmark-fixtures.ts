import type { BenchmarkQuestion } from "./benchmark-trace-types.js";

export const LOCAL_BENCHMARK_FIXTURES: BenchmarkQuestion[] = [
  {
    question: "where is auth login handler",
    expected_files: ["lib/auth/handler.ts"],
  },
  {
    question: "which tests protect rotateRefreshToken",
    expected_files: ["lib/token.test.ts"],
  },
  {
    question: "what failure hit refresh token on reuse",
    expected_files: ["lib/token.ts"],
    expected_memory_substrings: ["refresh token failure on reuse"],
  },
];
