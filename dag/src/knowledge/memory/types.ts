export const MEMORY_ENTRY_TYPES = [
  "FACT",
  "DECISION",
  "CONVENTION",
  "ARCHITECTURE",
  "FAILURE",
  "SOLUTION",
  "LESSON",
  "INVARIANT",
  "TEST_INSIGHT",
  "DEPENDENCY",
] as const;

export type MemoryEntryType = (typeof MEMORY_ENTRY_TYPES)[number];

export const MEMORY_ENTRY_STATUSES = [
  "candidate",
  "verified",
  "stale",
  "invalidated",
] as const;

export type MemoryEntryStatus = (typeof MEMORY_ENTRY_STATUSES)[number];

export type MemoryScope = {
  files: string[];
  modules: string[];
  symbols: string[];
};

export type MemoryEvidence = {
  run_id: string;
  node_id: string;
  tests: string[];
};

export type MemoryEntry = {
  id: string;
  title: string;
  content: string;
  type?: MemoryEntryType;
  scope?: MemoryScope;
  evidence?: MemoryEvidence;
  confidence?: number;
  created_at?: string;
  last_verified_at?: string;
  status?: MemoryEntryStatus;
  invalidated?: boolean;
  invalidated_at?: string;
  invalidate_reason?: string;
};

export type NewMemoryEntry = {
  id?: string;
  title: string;
  content: string;
  type?: MemoryEntryType;
  scope?: MemoryScope;
  evidence?: MemoryEvidence;
  confidence?: number;
  created_at?: string;
  last_verified_at?: string;
  status?: MemoryEntryStatus;
};

export type MemoryEntryUpdate = Partial<
  Pick<
    MemoryEntry,
    "title" | "content" | "scope" | "evidence" | "confidence" | "last_verified_at" | "status"
  >
>;

export type MemoryStoreOptions = {
  memory_root?: string;
  repo_root?: string;
};

/** Types that require run/node/test evidence before persisting. */
export const EVIDENCE_REQUIRED_TYPES: MemoryEntryType[] = ["FACT", "DECISION", "ARCHITECTURE"];
