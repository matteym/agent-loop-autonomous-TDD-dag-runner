import { describe, expect, it } from "vitest";
import {
  buildRepoBriefing,
  cwdLockLines,
  protocolPreamble,
  redPhaseRules,
} from "./briefing.js";
import type { Task } from "./types.js";

const task: Task = {
  id: "scaffold-knowledge-package",
  prompt: "scaffold dag/src/knowledge",
  commit: "feat(knowledge): scaffold local knowledge package",
  tests: [
    {
      cwd: "dag/src/knowledge",
      cmd: "yarn",
      args: ["test"],
      optionalCwd: true,
    },
  ],
};

describe("cwd lock", () => {
  it("names tests.cwd and forbids a top-level src/", () => {
    const lines = cwdLockLines(task.tests);
    expect(lines.join("\n")).toContain("dag/src/knowledge");
    expect(lines.join("\n")).toContain("Do not create a top-level src/");
  });

  it("puts the lock in the repo briefing and protocol preamble", () => {
    const briefing = buildRepoBriefing(task, false);
    expect(briefing).toContain("Mandatory working directory");
    expect(briefing).toContain("dag/src/knowledge");
    expect(protocolPreamble).toContain("tests.cwd");
    expect(protocolPreamble).toContain("Do not create a top-level src/");
    expect(protocolPreamble).toContain("project MCP servers");
    expect(briefing).toMatch(/Project MCP servers/);
  });

  it("allows scaffold structural files in RED rules", () => {
    expect(redPhaseRules).toContain("package.json");
    expect(redPhaseRules).toContain("no business logic");
  });
});
