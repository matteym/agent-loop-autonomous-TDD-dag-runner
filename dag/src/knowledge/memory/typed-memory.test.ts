import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryStore } from "./store.js";
import type { MemoryEvidence } from "./types.js";

const evidence: MemoryEvidence = {
  run_id: "run-typed-1",
  node_id: "memory-types-evidence",
  tests: ["memory/typed-memory.test.ts"],
};

describe("typed memory entries", () => {
  let memoryRoot: string;

  afterEach(() => {
    if (memoryRoot) {
      rmSync(memoryRoot, { recursive: true, force: true });
    }
  });

  it.each(["FACT", "DECISION", "ARCHITECTURE"] as const)(
    "rejects %s without evidence",
    (type) => {
      memoryRoot = mkdtempSync(path.join(tmpdir(), "agent-memory-typed-"));
      const store = new MemoryStore({ memory_root: memoryRoot });

      expect(() =>
        store.add({
          type,
          title: "Unverified prose",
          content: "LLM-only claim with no run linkage.",
        }),
      ).toThrow(/evidence/i);
    },
  );

  it("accepts CONVENTION without evidence", () => {
    memoryRoot = mkdtempSync(path.join(tmpdir(), "agent-memory-typed-"));
    const store = new MemoryStore({ memory_root: memoryRoot });

    const entry = store.add({
      type: "CONVENTION",
      title: "Naming",
      content: "Use env vars for service URLs.",
    });

    expect(entry.type).toBe("CONVENTION");
    expect(entry.status).toBe("candidate");
  });

  it("stores scope, evidence, confidence, and timestamps for verified FACT", () => {
    memoryRoot = mkdtempSync(path.join(tmpdir(), "agent-memory-typed-"));
    const store = new MemoryStore({ memory_root: memoryRoot });

    const entry = store.add({
      type: "FACT",
      title: "JWT shape",
      content: "Auth JWT payload includes userId number.",
      scope: {
        files: ["Server/src/profile/middlewares/auth.middleware.ts"],
        modules: ["profile"],
        symbols: ["auth.middleware"],
      },
      evidence,
      confidence: 0.95,
      status: "verified",
      created_at: "2026-01-01T00:00:00.000Z",
      last_verified_at: "2026-01-02T00:00:00.000Z",
    });

    expect(entry.evidence).toEqual(evidence);
    expect(entry.scope?.files[0]).toContain("auth.middleware.ts");
    expect(entry.confidence).toBe(0.95);
    expect(entry.status).toBe("verified");
    expect(entry.created_at).toBe("2026-01-01T00:00:00.000Z");
    expect(entry.last_verified_at).toBe("2026-01-02T00:00:00.000Z");
  });

  it("supports candidate, stale, and invalidated status values", () => {
    memoryRoot = mkdtempSync(path.join(tmpdir(), "agent-memory-typed-"));
    const store = new MemoryStore({ memory_root: memoryRoot });

    const candidate = store.add({
      type: "LESSON",
      title: "Lesson",
      content: "Always mock GCS in tests.",
      evidence,
      status: "candidate",
    });
    expect(candidate.status).toBe("candidate");

    const stale = store.update(candidate.id, { status: "stale" });
    expect(stale.status).toBe("stale");

    const invalidated = store.update(candidate.id, { status: "invalidated" });
    expect(invalidated.status).toBe("invalidated");
  });
});
