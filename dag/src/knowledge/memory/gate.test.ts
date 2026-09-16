import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryGate } from "./gate.js";
import { MemoryStore } from "./store.js";
import type { MemoryEvidence, NewMemoryEntry } from "./types.js";

const evidence: MemoryEvidence = {
  run_id: "run-gate-1",
  node_id: "memory-gate-invalidate",
  tests: ["memory/gate.test.ts"],
};

const gatedFact = (overrides: Partial<NewMemoryEntry> = {}): NewMemoryEntry => ({
  type: "FACT",
  title: "JWT payload shape",
  content: "Bearer tokens decode to userId as a number.",
  scope: {
    files: ["Server/src/profile/middlewares/auth.middleware.ts"],
    modules: ["profile"],
    symbols: ["auth.middleware"],
  },
  evidence,
  status: "candidate",
  ...overrides,
});

describe("MemoryGate", () => {
  let memoryRoot: string;

  afterEach(() => {
    if (memoryRoot) {
      rmSync(memoryRoot, { recursive: true, force: true });
    }
  });

  it("drops candidate entries without evidence instead of persisting", () => {
    memoryRoot = mkdtempSync(path.join(tmpdir(), "agent-memory-gate-"));
    const gate = new MemoryGate(new MemoryStore({ memory_root: memoryRoot }));

    expect(() =>
      gate.persist({
        type: "FACT",
        title: "Guess",
        content: "Maybe auth uses cookies.",
        scope: { files: ["auth.ts"], modules: [], symbols: [] },
        status: "candidate",
      }),
    ).toThrow(/requires evidence|without evidence|gate rejected/i);

    expect(gate.search("cookies")).toHaveLength(0);
  });

  it("persists factual entries with evidence and scope", () => {
    memoryRoot = mkdtempSync(path.join(tmpdir(), "agent-memory-gate-"));
    const gate = new MemoryGate(new MemoryStore({ memory_root: memoryRoot }));

    const saved = gate.persist(gatedFact());
    expect(saved.id.length).toBeGreaterThan(0);
    expect(gate.search("Bearer")).toHaveLength(1);
  });

  it("invalidate hides from default search but get still returns the record", () => {
    memoryRoot = mkdtempSync(path.join(tmpdir(), "agent-memory-gate-"));
    const gate = new MemoryGate(new MemoryStore({ memory_root: memoryRoot }));
    const saved = gate.persist(gatedFact());

    gate.invalidate(saved.id, "superseded by refresh rotation");

    expect(gate.search("Bearer")).toHaveLength(0);
    expect(gate.get(saved.id)?.status).toBe("invalidated");
    expect(gate.get(saved.id)?.invalidate_reason).toBe("superseded by refresh rotation");
  });

  it("markStale excludes entries from default search", () => {
    memoryRoot = mkdtempSync(path.join(tmpdir(), "agent-memory-gate-"));
    const gate = new MemoryGate(new MemoryStore({ memory_root: memoryRoot }));
    const saved = gate.persist(gatedFact());

    gate.markStale(saved.id);

    expect(gate.get(saved.id)?.status).toBe("stale");
    expect(gate.search("Bearer")).toHaveLength(0);
  });
});
