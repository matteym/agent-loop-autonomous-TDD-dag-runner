import { describe, expect, it } from "vitest";
import { parseArgv } from "./cli.js";

describe("parseArgv", () => {
  it("parses task intent and flags", () => {
    const parsed = parseArgv([
      "task",
      "--dagfile=metadata/dag.json",
      "--allow-pull-request",
      "--provider=claude",
      "add login",
    ]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.value.command).toBe("task");
    expect(parsed.value.dagfile).toBe("metadata/dag.json");
    expect(parsed.value.allowPullRequest).toBe(true);
    expect(parsed.value.provider).toBe("claude");
    expect(parsed.value.intent).toBe("add login");
  });

  it("parses init flags", () => {
    const parsed = parseArgv([
      "init",
      "--force",
      "--yes",
      "--remote=https://github.com/acme/notes.git",
    ]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.value.command).toBe("init");
    expect(parsed.value.force).toBe(true);
    expect(parsed.value.yes).toBe(true);
    expect(parsed.value.remote).toBe("https://github.com/acme/notes.git");
  });

  it("parses space-separated --dagfile and --provider", () => {
    const parsed = parseArgv([
      "task",
      "--dagfile",
      "metadata/dag.json",
      "--provider",
      "cursor",
    ]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.value.dagfile).toBe("metadata/dag.json");
    expect(parsed.value.provider).toBe("cursor");
    expect(parsed.value.allowPullRequest).toBe(false);
  });

  it("rejects unknown flags and providers", () => {
    expect(parseArgv(["task", "--allow-dirty"]).ok).toBe(false);
    expect(parseArgv(["task", "--provider=openai"]).ok).toBe(false);
    expect(parseArgv(["dag"]).ok).toBe(false);
  });
});
