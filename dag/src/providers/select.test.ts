import { describe, expect, it } from "vitest";
import { resolveProvider } from "./select.js";

describe("resolveProvider", () => {
  it("prefers flag then cursor when both keys exist", () => {
    const prevC = process.env.CURSOR_API_KEY;
    const prevA = process.env.ANTHROPIC_API_KEY;
    process.env.CURSOR_API_KEY = "cursor-key";
    process.env.ANTHROPIC_API_KEY = "anthropic-key";
    try {
      expect(resolveProvider(undefined).provider).toBe("cursor");
      expect(resolveProvider("claude").provider).toBe("claude");
      expect(resolveProvider("cursor").provider).toBe("cursor");
    } finally {
      if (prevC === undefined) {
        delete process.env.CURSOR_API_KEY;
      } else {
        process.env.CURSOR_API_KEY = prevC;
      }
      if (prevA === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = prevA;
      }
    }
  });
});
