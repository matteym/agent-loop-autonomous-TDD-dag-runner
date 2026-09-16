import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryStore } from "./store.js";

describe("MemoryStore", () => {
  let memoryRoot: string;

  afterEach(() => {
    if (memoryRoot) {
      rmSync(memoryRoot, { recursive: true, force: true });
    }
  });

  it("adds and gets entries persisted to project JSONL", () => {
    memoryRoot = mkdtempSync(path.join(tmpdir(), "agent-memory-project-"));
    const store = new MemoryStore({ memory_root: memoryRoot });
    const created = store.add({
      title: "Refresh rotation",
      content: "Rotate refresh tokens on each login.",
    });

    expect(created.id.length).toBeGreaterThan(0);
    expect(created.title).toBe("Refresh rotation");

    const reload = new MemoryStore({ memory_root: memoryRoot });
    expect(reload.get(created.id)).toEqual(created);
  });

  it("searches by substring in title or content", () => {
    memoryRoot = mkdtempSync(path.join(tmpdir(), "agent-memory-project-"));
    const store = new MemoryStore({ memory_root: memoryRoot });
    store.add({ title: "Auth middleware", content: "Bearer JWT userId number." });
    store.add({ title: "Chat TTL", content: "Redis ephemeral message TTL." });

    const hits = store.search("jwt");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.title).toBe("Auth middleware");

    expect(store.search("redis")).toHaveLength(1);
    expect(store.search("missing")).toHaveLength(0);
  });

  it("updates title and content", () => {
    memoryRoot = mkdtempSync(path.join(tmpdir(), "agent-memory-project-"));
    const store = new MemoryStore({ memory_root: memoryRoot });
    const entry = store.add({ title: "Old title", content: "Old body" });

    const updated = store.update(entry.id, {
      title: "New title",
      content: "New body",
    });

    expect(updated.title).toBe("New title");
    expect(updated.content).toBe("New body");
    expect(store.get(entry.id)?.content).toBe("New body");
  });

  it("invalidates entries so search hides them but get still returns", () => {
    memoryRoot = mkdtempSync(path.join(tmpdir(), "agent-memory-project-"));
    const store = new MemoryStore({ memory_root: memoryRoot });
    const entry = store.add({
      title: "Stale convention",
      content: "Do not use legacy logout route.",
    });

    store.invalidate(entry.id, "superseded");

    expect(store.search("legacy")).toHaveLength(0);
    const loaded = store.get(entry.id);
    expect(loaded?.invalidated).toBe(true);
    expect(loaded?.invalidate_reason).toBe("superseded");
  });
});
