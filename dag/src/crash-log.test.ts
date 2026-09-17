import { describe, expect, it } from "vitest";
import { extractRunLogCrash, lastFailuresLogBlock } from "./crash-log.js";

describe("lastFailuresLogBlock", () => {
  it("returns the last block for this node only", () => {
    const log = [
      "2026-01-01T00:00:00.000Z node=other",
      "other boom",
      "---",
      "2026-01-01T00:01:00.000Z node=auth",
      "first auth fail",
      "---",
      "2026-01-01T00:02:00.000Z node=auth",
      "second auth fail",
      "---",
      "",
    ].join("\n");
    expect(lastFailuresLogBlock(log, "auth")).toBe("second auth fail");
    expect(lastFailuresLogBlock(log, "missing")).toBe("");
  });
});

describe("extractRunLogCrash", () => {
  it("reads TEST FAIL lines for the current node banner", () => {
    const log = [
      "[dag] ──────── other · feat(other): x ────────",
      "[dag] TEST FAIL other",
      "[dag] ──────── auth · feat(auth): jwt ────────",
      "[dag] TEST yarn test (cwd src)",
      "[dag] TEST FAIL AssertionError: expected 1",
      "[dag] GREEN SUMMARY",
    ].join("\n");
    expect(extractRunLogCrash(log, "auth")).toContain("AssertionError");
    expect(extractRunLogCrash(log, "auth")).not.toContain("TEST FAIL other");
  });
});
