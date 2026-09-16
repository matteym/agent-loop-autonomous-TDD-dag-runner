import type { MemoryEntry, NewMemoryEntry } from "./types.js";
import { assertGateAllowsPersist } from "./gate-check.js";
import { MemoryStore } from "./store.js";

export class MemoryGate {
  private readonly store: MemoryStore;

  constructor(store: MemoryStore) {
    this.store = store;
  }

  /** Persist only entries that pass factual/evidence/scope gate checks. */
  persist(entry: NewMemoryEntry): MemoryEntry {
    assertGateAllowsPersist(entry);
    return this.store.add(entry);
  }

  invalidate(id: string, reason: string): MemoryEntry {
    return this.store.invalidate(id, reason);
  }

  markStale(id: string): MemoryEntry {
    return this.store.update(id, { status: "stale" });
  }

  get(id: string): MemoryEntry | undefined {
    return this.store.get(id);
  }

  search(query: string): MemoryEntry[] {
    return this.store.search(query);
  }
}
