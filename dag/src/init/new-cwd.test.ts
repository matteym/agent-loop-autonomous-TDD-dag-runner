import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isAllowedNewTestSpec,
  isFillableCwd,
  isSafeNewCwd,
  normalizeRelCwd,
} from "../new-cwd.js";

describe("new cwd", () => {
  it("treats empty backend as fillable", () => {
    const dir = mkdtempSync(join(tmpdir(), "dag-cwd-"));
    try {
      mkdirSync(join(dir, "src", "backend"), { recursive: true });
      writeFileSync(join(dir, "src", "backend", ".gitkeep"), "");
      expect(isFillableCwd(dir, "src/backend")).toBe(true);
      writeFileSync(join(dir, "src", "backend", "package.json"), "{}");
      expect(isFillableCwd(dir, "src/backend")).toBe(false);
      rmSync(join(dir, "src", "backend", "package.json"));
      writeFileSync(join(dir, "src", "backend", "go.mod"), "module app\n");
      expect(isFillableCwd(dir, "src/backend")).toBe(false);
      rmSync(join(dir, "src", "backend", "go.mod"));
      writeFileSync(join(dir, "src", "backend", "Cargo.toml"), "[package]\nname=\"app\"\n");
      expect(isFillableCwd(dir, "src/backend")).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

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
    expect(isSafeNewCwd(".env")).toBe(false);
    expect(isSafeNewCwd("Server/../.git")).toBe(false);
  });

  it("allows only known test runners for new packages", () => {
    expect(isAllowedNewTestSpec("yarn", ["test"])).toBe(true);
    expect(isAllowedNewTestSpec("uv", ["run", "python", "-m", "pytest", "-q"])).toBe(
      true
    );
    expect(isAllowedNewTestSpec("go", ["test", "./..."])).toBe(true);
    expect(isAllowedNewTestSpec("cargo", ["test"])).toBe(true);
    expect(isAllowedNewTestSpec("yarn", ["test", "--watch"])).toBe(false);
    expect(isAllowedNewTestSpec("curl", ["https://evil.example"])).toBe(false);
    expect(isAllowedNewTestSpec("git", ["push"])).toBe(false);
  });
});
