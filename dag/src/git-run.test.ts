import { describe, expect, it } from "vitest";
import { isBlockedCommitPath, isControlledDirty } from "./git-run.js";

describe("isControlledDirty", () => {
  it("ignores orchestrator runtime files", () => {
    expect(isControlledDirty("dag/metadata/state.json")).toBe(true);
    expect(isControlledDirty("dag/metadata/task.json")).toBe(true);
    expect(isControlledDirty("dag/metadata/notes.done.json")).toBe(true);
    expect(isControlledDirty("dag/history/nodes.jsonl")).toBe(true);
    expect(isControlledDirty("dag/logs/run-20260101-000000.log")).toBe(true);
  });

  it("does not ignore product files", () => {
    expect(isControlledDirty("src/backend/package.json")).toBe(false);
    expect(isControlledDirty(".github/workflows/ci.yml")).toBe(false);
  });

  it("ignores a nested engine plugin folder on the product repo", () => {
    const plugin = "agent-loop-autonomous-TDD-dag-runner";
    expect(isControlledDirty(plugin, plugin)).toBe(true);
    expect(isControlledDirty(plugin + "/dag/metadata/task.json", plugin)).toBe(true);
    expect(isControlledDirty(plugin + "/.cursor/skills/agent-loop/SKILL.md", plugin)).toBe(
      true
    );
    expect(isControlledDirty("src/backend/package.json", plugin)).toBe(false);
  });
});

describe("isBlockedCommitPath", () => {
  it("blocks env and secret-named files", () => {
    expect(isBlockedCommitPath(".env")).toBe(true);
    expect(isBlockedCommitPath("src/backend/.env")).toBe(true);
    expect(isBlockedCommitPath("app-storage-service-account-key.json")).toBe(true);
    expect(isBlockedCommitPath("dag/logs/failures.log")).toBe(true);
  });

  it("allows product source and generated ci", () => {
    expect(isBlockedCommitPath("src/backend/app.ts")).toBe(false);
    expect(isBlockedCommitPath(".github/workflows/ci.yml")).toBe(false);
  });
});
