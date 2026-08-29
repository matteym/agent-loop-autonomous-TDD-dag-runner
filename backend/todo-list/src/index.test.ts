import { describe, expect, it } from "vitest";
import { healthBody } from "./health.js";

describe("health", () => {
  it("returns ok json", () => {
    expect(JSON.parse(healthBody())).toEqual({ ok: true });
  });
});
