import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { argvForWinShell, openOrReusePullRequest } from "./pr.js";

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
