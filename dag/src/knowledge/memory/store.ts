import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { projectMemoryLogPath, resolveProjectMemoryRoot } from "./paths.js";
import type {
  MemoryEntry,
  MemoryEntryUpdate,
  MemoryStoreOptions,
  NewMemoryEntry,
} from "./types.js";
import { assertEvidenceForAdd } from "./validate.js";

function loadLatestById(logPath: string): Map<string, MemoryEntry> {
  const map = new Map<string, MemoryEntry>();
  if (!existsSync(logPath)) {
    return map;
  }
  const text = readFileSync(logPath, "utf8");
  for (const line of text.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    const entry = JSON.parse(line) as MemoryEntry;
    map.set(entry.id, entry);
  }
  return map;
}

function isHiddenFromSearch(entry: MemoryEntry): boolean {
  if (entry.invalidated) {
    return true;
  }
  return entry.status === "invalidated" || entry.status === "stale";
}

function buildEntry(entry: NewMemoryEntry): MemoryEntry {
  assertEvidenceForAdd(entry);
  const now = new Date().toISOString();
  const typed = entry.type !== undefined;
  return {
    id: entry.id ?? randomUUID(),
    title: entry.title,
    content: entry.content,
    ...(entry.type !== undefined ? { type: entry.type } : {}),
    ...(entry.scope !== undefined ? { scope: entry.scope } : {}),
    ...(entry.evidence !== undefined ? { evidence: entry.evidence } : {}),
    ...(entry.confidence !== undefined ? { confidence: entry.confidence } : {}),
    ...(entry.created_at !== undefined
      ? { created_at: entry.created_at }
      : typed
        ? { created_at: now }
        : {}),
    ...(entry.last_verified_at !== undefined ? { last_verified_at: entry.last_verified_at } : {}),
    ...(typed ? { status: entry.status ?? "candidate" } : {}),
  };
}

export class MemoryStore {
  private readonly projectRoot: string;

  constructor(options: MemoryStoreOptions = {}) {
    if (options.memory_root) {
      this.projectRoot = options.memory_root;
    } else {
      this.projectRoot = resolveProjectMemoryRoot(options.repo_root ?? process.cwd());
    }
  }

  private logPath(): string {
    return projectMemoryLogPath(this.projectRoot);
  }

  private readAllLatest(): Map<string, MemoryEntry> {
    return loadLatestById(this.logPath());
  }

  private persist(entry: MemoryEntry): MemoryEntry {
    mkdirSync(this.projectRoot, { recursive: true });
    appendFileSync(this.logPath(), JSON.stringify(entry) + "\n", "utf8");
    return entry;
  }

  add(entry: NewMemoryEntry): MemoryEntry {
    return this.persist(buildEntry(entry));
  }

  get(id: string): MemoryEntry | undefined {
    return this.readAllLatest().get(id);
  }

  search(query: string): MemoryEntry[] {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return [];
    }
    const hits: MemoryEntry[] = [];
    for (const entry of this.readAllLatest().values()) {
      if (isHiddenFromSearch(entry)) {
        continue;
      }
      const haystack = `${entry.title}\n${entry.content}`.toLowerCase();
      if (haystack.includes(needle)) {
        hits.push(entry);
      }
    }
    return hits;
  }

  update(id: string, patch: MemoryEntryUpdate): MemoryEntry {
    const existing = this.get(id);
    if (!existing) {
      throw new Error(`memory entry not found: ${id}`);
    }
    const updated: MemoryEntry = {
      ...existing,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.content !== undefined ? { content: patch.content } : {}),
      ...(patch.scope !== undefined ? { scope: patch.scope } : {}),
      ...(patch.evidence !== undefined ? { evidence: patch.evidence } : {}),
      ...(patch.confidence !== undefined ? { confidence: patch.confidence } : {}),
      ...(patch.last_verified_at !== undefined
        ? { last_verified_at: patch.last_verified_at }
        : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
    };
    return this.persist(updated);
  }

  invalidate(id: string, reason?: string): MemoryEntry {
    const existing = this.get(id);
    if (!existing) {
      throw new Error(`memory entry not found: ${id}`);
    }
    const invalidated: MemoryEntry = {
      ...existing,
      invalidated: true,
      status: "invalidated",
      invalidated_at: new Date().toISOString(),
      ...(reason !== undefined ? { invalidate_reason: reason } : {}),
    };
    return this.persist(invalidated);
  }
}
