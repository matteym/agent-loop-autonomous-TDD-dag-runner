import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatStatusPage, writeStatusFile, type StatusSnapshot } from "./status.js";

const sample: StatusSnapshot = {
  ts: "2026-09-17T12:00:00.000Z",
  runId: "run-1",
  dagFile: "dag/metadata/task.json",
  nodeId: "auth-jwt",
  progress: "2/5",
  phase: "REPAIR round 2/5",
  lastTest: "FAIL AssertionError: expected 1",
  tokenUsage: "[TOKEN USAGE] Prompt: 10 | Completion: 4 | Total: 14",
  state: "RUNNING",
};

describe("formatStatusPage", () => {
  it("fits a phone screen: required fields, at most 20 lines", () => {
    const page = formatStatusPage(sample);
    const lines = page.trimEnd().split(/\n/);
    expect(lines.length).toBeGreaterThanOrEqual(8);
    expect(lines.length).toBeLessThanOrEqual(20);
    expect(page).toContain("run-1");
    expect(page).toContain("auth-jwt");
    expect(page).toContain("2/5");
    expect(page).toContain("REPAIR round 2/5");
    expect(page).toContain("FAIL");
    expect(page).toContain("RUNNING");
    expect(page).toContain("Prompt: 10");
  });

  it("is a full overwrite document, not an append log", () => {
    const first = formatStatusPage(sample);
    const second = formatStatusPage({ ...sample, phase: "GREEN", state: "COMPLETED" });
    expect(second).not.toContain("REPAIR round 2/5");
    expect(second).toContain("GREEN");
    expect(first.split("\n").length).toBeGreaterThan(1);
  });

  it("overwrites the status file on disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "dag-status-"));
    const file = join(dir, "status");
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, "stale\n", "utf8");
      writeStatusFile(file, sample);
      writeStatusFile(file, { ...sample, phase: "COMPLETE", state: "COMPLETED" });
      const body = readFileSync(file, "utf8");
      expect(body).toContain("COMPLETE");
      expect(body).not.toContain("stale");
      expect(body).not.toContain("REPAIR round 2/5");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
