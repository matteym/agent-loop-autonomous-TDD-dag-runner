import { describe, expect, it } from "vitest";
import {
  EXTRA_CONTEXT_MAX_CHARS,
  assembleExtraContext,
  capFilesHint,
  pickCrashSlice,
} from "./send-budget.js";

describe("pickCrashSlice", () => {
  it("uses live output only and never concatenates fallbacks", () => {
    const slice = pickCrashSlice({
      liveOutput: "AssertionError: expected 1\n" + "x".repeat(5000),
      failuresLogBlock: "old failures.log stack",
      runLogExtract: "run-log TEST FAIL",
    });
    expect(slice.source).toBe("live");
    expect(slice.text.length).toBeLessThanOrEqual(4000);
    expect(slice.text).toContain("AssertionError");
    expect(slice.text).not.toContain("failures.log");
    expect(slice.text).not.toContain("run-log");
  });

  it("falls back to failures.log then run-log", () => {
    expect(
      pickCrashSlice({
        liveOutput: "  ",
        failuresLogBlock: "node=auth\nError: boom",
        runLogExtract: "TEST FAIL exit 1",
      }).source
    ).toBe("failures.log");
    expect(
      pickCrashSlice({
        liveOutput: "",
        failuresLogBlock: "",
        runLogExtract: "TEST FAIL first assertion",
      })
    ).toEqual({ source: "run-log", text: "TEST FAIL first assertion" });
  });
});

describe("assembleExtraContext", () => {
  it("keeps the combined extra payload at or under 8000 chars", () => {
    const extra = assembleExtraContext({
      crash: "live crash " + "C".repeat(4000),
      similarFailures: ["sig-a did not rotate token", "sig-b abandoned patch"],
      parentHistory: "PARENT NODES\n- auth finished\n- db finished\n- more",
      knowledgeBriefing: "Retrieved context\n" + "K".repeat(7000),
      filesHint: ["src/a.ts", "src/b.ts", "src/c.ts"],
    });
    expect(extra.length).toBeLessThanOrEqual(EXTRA_CONTEXT_MAX_CHARS);
    expect(extra).toContain("live crash");
  });

  it("drops filesHint then knowledge before crash when over cap", () => {
    const extra = assembleExtraContext({
      crash: "priority-crash",
      similarFailures: [],
      parentHistory: "",
      knowledgeBriefing: "knowledge-body " + "K".repeat(9000),
      filesHint: ["src/too-big.ts"],
      maxChars: 40,
    });
    expect(extra.length).toBeLessThanOrEqual(40);
    expect(extra).toContain("priority-crash");
    expect(extra).not.toContain("src/too-big.ts");
  });

  it("omits parent history on COMMIT NOW", () => {
    const extra = assembleExtraContext({
      knowledgeBriefing: "core",
      parentHistory: "PARENT NODES\n- previous",
      omitParentHistory: true,
    });
    expect(extra).toBe("core");
  });

  it("caps filesHint at 8 paths", () => {
    const paths = Array.from({ length: 12 }, (_, i) => "src/f" + i + ".ts");
    expect(capFilesHint(paths)).toHaveLength(8);
  });
});
