import { describe, expect, it } from "vitest";
import { defaultPort, parsePort, validatePort } from "./port.js";

describe("validatePort", () => {
  it("keeps only appPort and ignores extra fields", () => {
    const parsed = validatePort({
      appPort: 3000,
      runtime: "ts",
      architecture: "microservices",
      appName: "todo-list",
    });
    expect(parsed).toEqual({ appPort: 3000 });
    expect(defaultPort()).toEqual({ appPort: 3000 });
  });
});

describe("parsePort", () => {
  it("accepts empty as fallback", () => {
    expect(parsePort("", 3000)).toBe(3000);
    expect(parsePort("8080", 3000)).toBe(8080);
    expect(parsePort("nope", 3000)).toBeNull();
  });
});
