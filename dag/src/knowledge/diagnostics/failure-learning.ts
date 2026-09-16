import path from "node:path";
import { MemoryGate } from "../memory/gate.js";
import { MemoryStore } from "../memory/store.js";
import type { MemoryEntry } from "../memory/types.js";
import type {
  NormalizedFailure,
  RecordObservedFailureInput,
  RecordVerifiedSolutionInput,
  SimilarFailureHit,
  SimilarFailureQuery,
} from "./types.js";

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function modulesFromFiles(files: string[]): string[] {
  const modules = new Set<string>();
  for (const file of files) {
    const dir = path.dirname(normalizePath(file));
    if (dir && dir !== ".") {
      modules.add(dir);
    }
  }
  return [...modules];
}

function parseContentField(content: string, key: string): string | undefined {
  const pattern = new RegExp(`^${key}:\\s*(.+)$`, "m");
  const match = content.match(pattern);
  return match?.[1]?.trim();
}

function failureContent(failure: NormalizedFailure): string {
  const lines = [
    `failure_signature: ${failure.signature}`,
    `failure_type: ${failure.type}`,
    `stack_snippet: ${failure.stack_snippet}`,
  ];
  if (failure.tests.length > 0) {
    lines.push(`tests: ${failure.tests.join(", ")}`);
  }
  if (failure.root_cause) {
    lines.push(`root_cause: ${failure.root_cause}`);
  }
  if (failure.attempted_solutions.length > 0) {
    lines.push(`attempted_solutions: ${failure.attempted_solutions.join(" | ")}`);
  }
  return lines.join("\n");
}

function scopeFromFailure(failure: NormalizedFailure) {
  return {
    files: failure.files,
    modules: modulesFromFiles(failure.files),
    symbols: failure.symbols,
  };
}

function matchesFileScope(entry: MemoryEntry, hintFiles: Set<string>): boolean {
  if (hintFiles.size === 0) {
    return true;
  }
  const scoped = entry.scope?.files.map(normalizePath) ?? [];
  return scoped.some((file) => hintFiles.has(file));
}

function memoryGate(memoryRoot: string): MemoryGate {
  return new MemoryGate(new MemoryStore({ memory_root: memoryRoot }));
}

export function recordObservedFailure(input: RecordObservedFailureInput): MemoryEntry {
  const gate = memoryGate(input.memory_root);
  const failure = input.failure;
  return gate.persist({
    type: "FAILURE",
    title: `Observed ${failure.type} failure`,
    content: failureContent(failure),
    scope: scopeFromFailure(failure),
    evidence: failure.evidence,
    status: "verified",
  });
}

export function recordVerifiedSolution(input: RecordVerifiedSolutionInput): MemoryEntry {
  const gate = memoryGate(input.memory_root);
  const lines = [
    `failure_signature: ${input.signature}`,
    `successful_solution: ${input.successful_solution}`,
  ];
  if (input.attempted_solutions && input.attempted_solutions.length > 0) {
    lines.push(`attempted_solutions: ${input.attempted_solutions.join(" | ")}`);
  }
  return gate.persist({
    type: "SOLUTION",
    title: "Verified fix for observed failure",
    content: lines.join("\n"),
    scope: {
      files: input.files,
      modules: modulesFromFiles(input.files),
      symbols: input.symbols,
    },
    evidence: input.evidence,
    status: "verified",
  });
}

export function findSimilarFailures(query: SimilarFailureQuery): SimilarFailureHit[] {
  const gate = memoryGate(query.memory_root);
  const hintFiles = new Set((query.files ?? []).map(normalizePath));
  const candidates = gate.search(query.signature);

  let failureEntry: MemoryEntry | undefined;
  let solutionEntry: MemoryEntry | undefined;

  for (const entry of candidates) {
    const signature = parseContentField(entry.content, "failure_signature");
    if (signature !== query.signature) {
      continue;
    }
    if (!matchesFileScope(entry, hintFiles)) {
      continue;
    }
    if (entry.type === "FAILURE") {
      failureEntry = entry;
    }
    if (entry.type === "SOLUTION") {
      solutionEntry = entry;
    }
  }

  if (!solutionEntry) {
    return [];
  }

  const successful_solution = parseContentField(
    solutionEntry.content,
    "successful_solution",
  );

  return [
    {
      signature: query.signature,
      ...(successful_solution !== undefined ? { successful_solution } : {}),
      ...(failureEntry !== undefined ? { failure_memory_id: failureEntry.id } : {}),
      solution_memory_id: solutionEntry.id,
    },
  ];
}
