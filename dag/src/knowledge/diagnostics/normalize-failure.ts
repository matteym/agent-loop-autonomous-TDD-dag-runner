import type { MemoryEvidence } from "../memory/types.js";
import type { NormalizeFailureInput, NormalizedFailure } from "./types.js";

const DEFAULT_STACK_SNIPPET_CHARS = 400;

function resolveStackSnippetLimit(): number {
  const raw = process.env.DIAGNOSTICS_STACK_SNIPPET_CHARS?.trim();
  if (!raw) {
    return DEFAULT_STACK_SNIPPET_CHARS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_STACK_SNIPPET_CHARS;
  }
  return parsed;
}

function truncateStack(stack: string): string {
  const limit = resolveStackSnippetLimit();
  const trimmed = stack.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, limit - 1)}…`;
}

/** Map raw validation output into a stable failure record shape. */
export function normalizeFailure(input: NormalizeFailureInput): NormalizedFailure {
  const stackSource = input.stack ?? input.output ?? "";
  return {
    type: input.type.trim(),
    signature: input.signature.trim(),
    stack_snippet: truncateStack(stackSource),
    files: [...new Set((input.files ?? []).map((file) => file.replace(/\\/g, "/")))],
    symbols: [...new Set(input.symbols ?? [])],
    tests: [...new Set((input.tests ?? []).map((file) => file.replace(/\\/g, "/")))],
    ...(input.root_cause !== undefined ? { root_cause: input.root_cause.trim() } : {}),
    attempted_solutions: [...new Set(input.attempted_solutions ?? [])],
    evidence: input.evidence,
  };
}

export type { MemoryEvidence };
