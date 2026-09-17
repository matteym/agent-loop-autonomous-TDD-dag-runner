import { describe, expect, it } from "vitest";
import {
  addTokenUsage,
  formatTokenUsageLine,
  parseTokenUsage,
  unknownTokenUsage,
} from "./token-usage.js";

describe("parseTokenUsage", () => {
  it("reads input_tokens / output_tokens / total_tokens from usage", () => {
    expect(
      parseTokenUsage({
        usage: { input_tokens: 120, output_tokens: 40, total_tokens: 160 },
      })
    ).toEqual({ input: 120, output: 40, total: 160 });
  });

  it("returns unknown when metadata is missing and does not use char/4", () => {
    const text = "a".repeat(400);
    expect(parseTokenUsage({ text, result: text })).toEqual(unknownTokenUsage());
    expect(parseTokenUsage(null)).toEqual(unknownTokenUsage());
  });
});

describe("token usage format", () => {
  it("prints the console line and accumulates known counts", () => {
    expect(formatTokenUsageLine("auth-jwt", { input: 10, output: 5, total: 15 })).toBe(
      "[TOKEN USAGE] Node auth-jwt - Prompt: 10 | Completion: 5 | Total: 15"
    );
    expect(
      formatTokenUsageLine("auth-jwt", unknownTokenUsage())
    ).toContain("Prompt: unknown");
    expect(
      addTokenUsage({ input: 10, output: 2, total: 12 }, { input: 3, output: 1, total: 4 })
    ).toEqual({ input: 13, output: 3, total: 16 });
  });
});
