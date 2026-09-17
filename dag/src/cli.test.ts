import { describe, expect, it } from "vitest";
import { parseArgv } from "./cli.js";

describe("parseArgv", () => {
  it("parses task intent and flags", () => {
    const parsed = parseArgv([
      "task",
      "--dagfile=metadata/dag.json",
      "--provider=claude",
      "add login",
    ]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.value.command).toBe("task");
    expect(parsed.value.dagfile).toBe("metadata/dag.json");
    expect(parsed.value.push).toBe(true);
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

  it("accepts --repo as an alias for --remote", () => {
    const parsed = parseArgv([
      "init",
      "--repo=https://github.com/acme/notes.git",
    ]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
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
    expect(parsed.value.push).toBe(true);
  });

  it("disables push with --no-push or --push=false", () => {
    const off = parseArgv(["task", "--no-push", "add login"]);
    expect(off.ok).toBe(true);
    if (off.ok) {
      expect(off.value.push).toBe(false);
    }
    const eq = parseArgv(["task", "--push=false", "add login"]);
    expect(eq.ok).toBe(true);
    if (eq.ok) {
      expect(eq.value.push).toBe(false);
    }
    const on = parseArgv(["task", "--push=true", "add login"]);
    expect(on.ok).toBe(true);
    if (on.ok) {
      expect(on.value.push).toBe(true);
    }
    expect(parseArgv(["task", "--push=maybe"]).ok).toBe(false);
  });

  it("parses --unattended and --merge", () => {
    const parsed = parseArgv(["task", "--unattended", "--merge", "--dagfile=x.json"]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.value.unattended).toBe(true);
    expect(parsed.value.merge).toBe(true);
    const plain = parseArgv(["task", "add login"]);
    expect(plain.ok).toBe(true);
    if (plain.ok) {
      expect(plain.value.unattended).toBe(false);
      expect(plain.value.merge).toBe(false);
    }
  });

  it("rejects unknown flags and providers", () => {
    expect(parseArgv(["task", "--allow-dirty"]).ok).toBe(false);
    expect(parseArgv(["task", "--provider=openai"]).ok).toBe(false);
    expect(parseArgv(["dag"]).ok).toBe(false);
  });
});
