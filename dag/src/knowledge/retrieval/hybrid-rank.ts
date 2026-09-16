import { MemoryGate } from "../memory/gate.js";
import { MemoryStore } from "../memory/store.js";
import type { MemoryEntryType } from "../memory/types.js";
import { retrieveGitDeps } from "./git-deps.js";
import type { HybridRetrievalResult, RetrievalHit, RetrieveHybridInput } from "./types.js";

const FAILURE_LIKE_TERMS = ["failure", "error", "bug", "regression"] as const;

const FAILURE_LIKE_TYPE_BOOST: Partial<Record<MemoryEntryType, number>> = {
  FAILURE: 80,
  SOLUTION: 60,
  DECISION: 40,
};

function isFailureLikeQuery(query: string): boolean {
  const normalized = query.trim().toLowerCase();
  return FAILURE_LIKE_TERMS.some((term) => normalized.includes(term));
}

function applyMemoryTypeBoost(
  hit: RetrievalHit,
  memoryType: MemoryEntryType | undefined,
  failureLike: boolean,
): void {
  if (hit.kind !== "memory" || !memoryType) {
    return;
  }
  hit.memory_type = memoryType;
  if (!failureLike) {
    return;
  }
  const boost = FAILURE_LIKE_TYPE_BOOST[memoryType] ?? 0;
  hit.score += boost;
}

export function retrieveHybridRank(input: RetrieveHybridInput): HybridRetrievalResult {
  const failureLike = isFailureLikeQuery(input.query);
  const hits = retrieveGitDeps({
    query: input.query,
    codebase_root: input.codebase_root,
    repo_root: input.repo_root,
    memory_root: input.memory_root,
  });

  if (input.memory_root) {
    const gate = new MemoryGate(new MemoryStore({ memory_root: input.memory_root }));
    for (const hit of hits) {
      if (hit.kind !== "memory" || !hit.memory_id) {
        continue;
      }
      const entry = gate.get(hit.memory_id);
      applyMemoryTypeBoost(hit, entry?.type, failureLike);
    }
  }

  hits.sort((left, right) => right.score - left.score);
  return { hits, semantic: [] };
}
