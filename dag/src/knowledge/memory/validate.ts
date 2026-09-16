import { EVIDENCE_REQUIRED_TYPES } from "./types.js";
import type { MemoryEvidence, NewMemoryEntry } from "./types.js";

function hasValidEvidence(evidence: MemoryEvidence | undefined): boolean {
  if (!evidence) {
    return false;
  }
  if (!evidence.run_id.trim() || !evidence.node_id.trim()) {
    return false;
  }
  return Array.isArray(evidence.tests) && evidence.tests.length > 0;
}

export function assertEvidenceForAdd(entry: NewMemoryEntry): void {
  if (!entry.type) {
    return;
  }
  if (!EVIDENCE_REQUIRED_TYPES.includes(entry.type)) {
    return;
  }
  if (!hasValidEvidence(entry.evidence)) {
    throw new Error(`memory entry type ${entry.type} requires evidence`);
  }
}
