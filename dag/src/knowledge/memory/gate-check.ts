import { hasValidEvidence } from "./validate.js";
import type { MemoryScope, NewMemoryEntry } from "./types.js";

const SPECULATIVE_RE = /\b(maybe|perhaps|guess|might|probably)\b/i;

function hasScope(scope: MemoryScope | undefined): boolean {
  if (!scope) {
    return false;
  }
  return (
    scope.files.length > 0 || scope.modules.length > 0 || scope.symbols.length > 0
  );
}

function isFactual(entry: NewMemoryEntry): boolean {
  return !SPECULATIVE_RE.test(entry.title) && !SPECULATIVE_RE.test(entry.content);
}

function isUsefulLater(entry: NewMemoryEntry): boolean {
  return entry.title.trim().length >= 8 && entry.content.trim().length >= 16;
}

export function assertGateAllowsPersist(entry: NewMemoryEntry): void {
  if (!hasValidEvidence(entry.evidence)) {
    throw new Error("memory gate rejected: entry requires evidence");
  }
  if (!hasScope(entry.scope)) {
    throw new Error("memory gate rejected: entry requires scope");
  }
  if (!isFactual(entry)) {
    throw new Error("memory gate rejected: entry must be factual");
  }
  if (!isUsefulLater(entry)) {
    throw new Error("memory gate rejected: entry must be useful later");
  }
}
