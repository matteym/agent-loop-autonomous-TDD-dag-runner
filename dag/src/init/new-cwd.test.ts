import { describe, expect, it } from "vitest";
import { isAllowedNewTestSpec, isSafeNewCwd, normalizeRelCwd } from "../new-cwd.js";

describe("new cwd", () => {
  it("accepts Client and apps/mobile", () => {
    expect(normalizeRelCwd("Client")).toBe("Client");
    expect(normalizeRelCwd("apps/mobile")).toBe("apps/mobile");
    expect(isSafeNewCwd("Client")).toBe(true);
  });

  it("rejects engine secrets and traversal", () => {
    expect(isSafeNewCwd("dag")).toBe(false);
    expect(isSafeNewCwd("dag/logs")).toBe(false);
    expect(isSafeNewCwd(".cursor")).toBe(false);
    expect(isSafeNewCwd("..")).toBe(false);
    expect(isSafeNewCwd("../Client")).toBe(false);
    expect(isSafeNewCwd(".")).toBe(false);
    expect(isSafeNewCwd("/Client")).toBe(false);
    expect(isSafeNewCwd("C:/Client")).toBe(false);
    expect(isSafeNewCwd("afaire")).toBe(false);
    expect(isSafeNewCwd(".env")).toBe(false);
    expect(isSafeNewCwd("Server/../.git")).toBe(false);
  });

  it("allows only known test runners for new packages", () => {
    expect(isAllowedNewTestSpec("yarn", ["test"])).toBe(true);
    expect(isAllowedNewTestSpec("uv", ["run", "python", "-m", "pytest", "-q"])).toBe(
      true
    );
    expect(isAllowedNewTestSpec("yarn", ["test", "--watch"])).toBe(false);
    expect(isAllowedNewTestSpec("curl", ["https://evil.example"])).toBe(false);
    expect(isAllowedNewTestSpec("git", ["push"])).toBe(false);
  });
});
