import { describe, expect, it } from "vitest";
import { defaultAnswers, parsePort, summarize, validateAnswers } from "./answers.js";

describe("validateAnswers", () => {
  it("keeps only appPort and ignores old wizard fields", () => {
    const parsed = validateAnswers({
      appPort: 3000,
      runtime: "ts",
      architecture: "microservices",
      appName: "todo-list",
    });
    expect(parsed).toEqual({ appPort: 3000 });
    expect(defaultAnswers()).toEqual({ appPort: 3000 });
    expect(summarize({ appPort: 4000 })).toContain("4000");
  });
});

describe("parsePort", () => {
  it("accepts empty as fallback", () => {
    expect(parsePort("", 3000)).toBe(3000);
    expect(parsePort("8080", 3000)).toBe(8080);
    expect(parsePort("nope", 3000)).toBeNull();
  });
});
