import { describe, expect, it } from "vitest";
import {
  isUnattendedMode,
  shouldMergeToMain,
  unattendedAction,
} from "./unattended.js";

describe("isUnattendedMode", () => {
  it("is true when stdin is not a TTY", () => {
    expect(isUnattendedMode({ stdinIsTty: false, flag: false })).toBe(true);
  });

  it("is true when --unattended is set even on a TTY", () => {
    expect(isUnattendedMode({ stdinIsTty: true, flag: true })).toBe(true);
  });

  it("is false on an interactive TTY without the flag", () => {
    expect(isUnattendedMode({ stdinIsTty: true, flag: false })).toBe(false);
  });
});

describe("unattendedAction", () => {
  it("exits immediately on fatal start gates", () => {
    expect(unattendedAction("fatal-start")).toBe("exit-1");
  });

  it("skips the node on validation / commit / agent-exhausted without revert", () => {
    expect(unattendedAction("skip-node")).toBe("skip-node");
  });

  it("continues preflight warnings without treating them as o on merge", () => {
    expect(unattendedAction("preflight-soft")).toBe("continue");
    expect(unattendedAction("publish")).toBe("continue");
  });
});

describe("shouldMergeToMain", () => {
  it("never merges in unattended mode unless --merge is set", () => {
    expect(shouldMergeToMain({ unattended: true, mergeFlag: false })).toBe(false);
    expect(shouldMergeToMain({ unattended: true, mergeFlag: true })).toBe(true);
  });

  it("keeps attended default merge when push is on", () => {
    expect(shouldMergeToMain({ unattended: false, mergeFlag: false })).toBe(true);
  });
});
