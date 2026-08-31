import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  argvForWinShell,
  isOpenPrState,
  mergeOpenPullRequest,
  openOrReusePullRequest,
  parsePrView,
} from "./pr.js";

describe("argvForWinShell", () => {
  it("quotes values that contain spaces so cmd does not split them", () => {
    expect(
      argvForWinShell([
        "pr",
        "create",
        "--title",
        "Simple hello world in src",
        "--body",
        "Automated DAG run: Simple hello world in src",
      ])
    ).toEqual([
      "pr",
      "create",
      "--title",
      '"Simple hello world in src"',
      "--body",
      '"Automated DAG run: Simple hello world in src"',
    ]);
  });
});

describe("open PR reuse", () => {
  it("treats only OPEN as reusable and ignores a closed PR payload", () => {
    expect(isOpenPrState("OPEN")).toBe(true);
    expect(isOpenPrState("open")).toBe(true);
    expect(isOpenPrState("CLOSED")).toBe(false);
    expect(isOpenPrState("MERGED")).toBe(false);
    expect(isOpenPrState(undefined)).toBe(false);
    const closed = parsePrView(
      '{"url":"https://github.com/acme/app/pull/3","state":"CLOSED"}'
    );
    expect(closed?.state).toBe("CLOSED");
    expect(isOpenPrState(closed?.state)).toBe(false);
    const open = parsePrView(
      '{"url":"https://github.com/acme/app/pull/4","state":"OPEN"}'
    );
    expect(isOpenPrState(open?.state)).toBe(true);
    expect(open?.url).toContain("/pull/4");
  });
});

describe("openOrReusePullRequest", () => {
  it("refuses main and master", () => {
    const dir = mkdtempSync(join(tmpdir(), "dag-pr-"));
    try {
      expect(spawnSync("git", ["init"], { cwd: dir }).status).toBe(0);
      expect(spawnSync("git", ["checkout", "-B", "main"], { cwd: dir }).status).toBe(
        0
      );
      const onMain = openOrReusePullRequest(dir, "t", "b");
      expect(onMain.ok).toBe(false);
      if (!onMain.ok) {
        expect(onMain.output).toBe("refusing pull request on main");
      }
      expect(spawnSync("git", ["checkout", "-B", "master"], { cwd: dir }).status).toBe(
        0
      );
      const onMaster = openOrReusePullRequest(dir, "t", "b");
      expect(onMaster.ok).toBe(false);
      if (!onMaster.ok) {
        expect(onMaster.output).toBe("refusing pull request on master");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("mergeOpenPullRequest", () => {
  it("refuses main and master", () => {
    const dir = mkdtempSync(join(tmpdir(), "dag-merge-"));
    try {
      expect(spawnSync("git", ["init"], { cwd: dir }).status).toBe(0);
      expect(spawnSync("git", ["checkout", "-B", "main"], { cwd: dir }).status).toBe(
        0
      );
      const onMain = mergeOpenPullRequest(dir);
      expect(onMain.ok).toBe(false);
      if (!onMain.ok) {
        expect(onMain.output).toBe("refusing merge from main");
      }
      expect(spawnSync("git", ["checkout", "-B", "master"], { cwd: dir }).status).toBe(
        0
      );
      const onMaster = mergeOpenPullRequest(dir);
      expect(onMaster.ok).toBe(false);
      if (!onMaster.ok) {
        expect(onMaster.output).toBe("refusing merge from master");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
