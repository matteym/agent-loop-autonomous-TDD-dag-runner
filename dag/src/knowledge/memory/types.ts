export type MemoryEntry = {
  id: string;
  title: string;
  content: string;
  invalidated?: boolean;
  invalidated_at?: string;
  invalidate_reason?: string;
};

export type NewMemoryEntry = {
  id?: string;
  title: string;
  content: string;
};

export type MemoryEntryUpdate = Partial<Pick<MemoryEntry, "title" | "content">>;

export type MemoryStoreOptions = {
  memory_root?: string;
  repo_root?: string;
};
