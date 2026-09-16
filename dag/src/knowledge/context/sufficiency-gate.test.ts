import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryGate } from "../memory/gate.js";
import { MemoryStore } from "../memory/store.js";
import { ContextBuilder } from "./builder.js";
import { ContextSufficiencyGate } from "./sufficiency-gate.js";
import type { AgentContext } from "./types.js";

const evidence = {
  run_id: "run-sufficiency-1",
  node_id: "context-sufficiency-gate",
  tests: ["context/sufficiency-gate.test.ts"],
};

function emptyAgentContext(): AgentContext {
  return {
    objective: "",
    files: [],
    symbols: [],
    deps: [],
    tests: [],
    conventions: [],
    architecture: [],
    historical_decisions: [],
    similar_failures: [],
    solutions: [],
    recent_git: [],
    invariants: [],
  };
}

function writeFixture(root: string, rel: string, content: string): void {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
}

describe("ContextSufficiencyGate", () => {
  let codebaseRoot: string;
  let memoryRoot: string;

  afterEach(() => {
    if (codebaseRoot) {
      rmSync(codebaseRoot, { recursive: true, force: true });
    }
    if (memoryRoot) {
      rmSync(memoryRoot, { recursive: true, force: true });
    }
  });

  it("blocks mayModify when context is empty", () => {
    const gate = new ContextSufficiencyGate(emptyAgentContext());
    const flags = gate.assess();

    expect(gate.mayModify()).toBe(false);
    expect(flags.files_understood).toBe(false);
    expect(flags.failures_checked).toBe(false);
  });

  it("allows mayModify when a built context has essential coverage", () => {
    codebaseRoot = mkdtempSync(path.join(tmpdir(), "sufficiency-codebase-"));
    memoryRoot = mkdtempSync(path.join(tmpdir(), "sufficiency-memory-"));

    writeFixture(
      codebaseRoot,
      "lib/token.ts",
      `export function rotateRefreshToken() {}
`,
    );
    writeFixture(
      codebaseRoot,
      "lib/token.test.ts",
      `import { rotateRefreshToken } from "./token.js";
`,
    );

    const gateMem = new MemoryGate(new MemoryStore({ memory_root: memoryRoot }));
    gateMem.persist({
      type: "FAILURE",
      title: "Refresh token failure on reuse",
      content: "Rotation did not run when refresh token failure was detected.",
      scope: {
        files: ["lib/token.ts"],
        modules: ["lib"],
        symbols: ["rotateRefreshToken"],
      },
      evidence,
      status: "verified",
    });
    gateMem.persist({
      type: "ARCHITECTURE",
      title: "Auth token module layout",
      content: "Token helpers live under lib/token.ts for rotation.",
      scope: { files: ["lib/token.ts"], modules: ["lib"], symbols: [] },
      evidence,
      status: "verified",
    });

    const context = ContextBuilder.build({
      nodePrompt: "Fix refresh token rotation in lib/token.ts",
      filesHint: ["lib/token.ts"],
      codebase_root: codebaseRoot,
      memory_root: memoryRoot,
    });

    const gate = new ContextSufficiencyGate(context);
    const flags = gate.assess();

    expect(flags.files_understood).toBe(true);
    expect(flags.failures_checked).toBe(true);
    expect(flags.architecture_found).toBe(true);
    expect(gate.mayModify()).toBe(true);
  });
});
