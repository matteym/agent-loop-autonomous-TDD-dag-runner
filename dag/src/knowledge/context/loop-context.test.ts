import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryGate } from "../memory/gate.js";
import { MemoryStore } from "../memory/store.js";
import { buildNodeSendContext } from "./build-node-send-context.js";

const evidence = {
  run_id: "run-loop-context-1",
  node_id: "wire-loop-context",
  tests: ["context/loop-context.test.ts"],
};

function writeFixture(root: string, rel: string, content: string): void {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
}

describe("buildNodeSendContext", () => {
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

  it("appends briefing text that includes a retrieved failure title", () => {
    codebaseRoot = mkdtempSync(path.join(tmpdir(), "loop-context-codebase-"));
    memoryRoot = mkdtempSync(path.join(tmpdir(), "loop-context-memory-"));

    writeFixture(
      codebaseRoot,
      "lib/token.ts",
      `export function rotateRefreshToken() {}
`,
    );

    const gate = new MemoryGate(new MemoryStore({ memory_root: memoryRoot }));
    const failure = gate.persist({
      type: "FAILURE",
      title: "Refresh token rotation missed",
      content: "Login did not rotate refresh token on reuse.",
      scope: {
        files: ["lib/token.ts"],
        modules: ["lib"],
        symbols: ["rotateRefreshToken"],
      },
      evidence,
      status: "verified",
    });

    const result = buildNodeSendContext({
      nodePrompt: "Fix refresh token rotation in lib/token.ts",
      filesHint: ["lib/token.ts"],
      codebase_root: codebaseRoot,
      memory_root: memoryRoot,
    });

    expect(result.context_briefing.length).toBeGreaterThan(0);
    expect(result.context_briefing.toLowerCase()).toContain(
      "refresh token rotation missed",
    );
    expect(result.memory_ids).toContain(failure.id);
    expect(result.context_files).toContain("lib/token.ts");
    expect(result.may_modify).toBe(true);
  });
});
