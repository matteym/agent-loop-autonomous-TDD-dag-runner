import { describe, expect, it } from "vitest";
import { confirmContinue, parseContinueAnswer, resolveOperatorGate } from "./confirm-continue.js";

describe("parseContinueAnswer", () => {
  it("accepts o/oui/y/yes as continue", () => {
    expect(parseContinueAnswer("o")).toBe(true);
    expect(parseContinueAnswer("OUI")).toBe(true);
    expect(parseContinueAnswer(" y ")).toBe(true);
    expect(parseContinueAnswer("yes")).toBe(true);
  });

  it("accepts n/non/no as stop", () => {
    expect(parseContinueAnswer("n")).toBe(false);
    expect(parseContinueAnswer("NON")).toBe(false);
    expect(parseContinueAnswer("no")).toBe(false);
  });

  it("rejects unknown answers", () => {
    expect(parseContinueAnswer("maybe")).toBeNull();
    expect(parseContinueAnswer("")).toBeNull();
  });
});

describe("confirmContinue", () => {
  it("treats non-TTY stdin as o without asking", async () => {
    const asked: string[] = [];
    const ok = await confirmContinue("dirty tree", "exit 1", {
      stdinIsTty: false,
      question: async (prompt) => {
        asked.push(prompt);
        return "n";
      },
    });
    expect(ok).toBe(true);
    expect(asked).toEqual([]);
  });

  it("returns true on o and false on n when TTY", async () => {
    const yes = await confirmContinue("branch is main", "refuse push", {
      stdinIsTty: true,
      question: async () => "o",
    });
    const no = await confirmContinue("tests still red", "revert and stop", {
      stdinIsTty: true,
      question: async () => "n",
    });
    expect(yes).toBe(true);
    expect(no).toBe(false);
  });
});

describe("cannotStart", () => {
  it("exits 1 after a non-TTY double continue", async () => {
    const { cannotStart } = await import("./confirm-continue.js");
    const code = await cannotStart("missing dagfile");
    expect(code).toBe(1);
  });
});

describe("resolveOperatorGate", () => {
  it("does not auto-accept dangerous skip as halt in unattended", async () => {
    const skipped = await resolveOperatorGate(
      true,
      "skip-node",
      "validation still red",
      "revert and stop"
    );
    expect(skipped).toBe("skip-node");
    const fatal = await resolveOperatorGate(true, "fatal-start", "missing keys", "exit 1");
    expect(fatal).toBe("stop");
    const soft = await resolveOperatorGate(true, "preflight-soft", "dirty tree", "exit 1");
    expect(soft).toBe("continue");
  });
});
