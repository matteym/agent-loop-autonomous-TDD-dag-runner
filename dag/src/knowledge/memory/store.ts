import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { projectMemoryLogPath, resolveProjectMemoryRoot } from "./paths.js";
import type {
  MemoryEntry,
  MemoryEntryUpdate,
  MemoryStoreOptions,
  NewMemoryEntry,
} from "./types.js";

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
    const full: MemoryEntry = {
      id: entry.id ?? randomUUID(),
      title: entry.title,
      content: entry.content,
    };
    return this.persist(full);
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
      if (entry.invalidated) {
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
      invalidated_at: new Date().toISOString(),
      ...(reason !== undefined ? { invalidate_reason: reason } : {}),
    };
    return this.persist(invalidated);
  }
}
