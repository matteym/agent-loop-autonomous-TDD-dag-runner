import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findRecentCommitsForPath } from "./git-index.js";

function runGit(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${(result.stderr || result.stdout || "").trim()}`,
    );
  }
}

function initRepoWithCommit(repoRoot: string, relFile: string, subject: string): string {
  runGit(repoRoot, ["init"]);
  runGit(repoRoot, ["config", "user.email", "agent@test.local"]);
  runGit(repoRoot, ["config", "user.name", "Agent Test"]);
  const full = path.join(repoRoot, relFile);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, "export const value = 1;\n", "utf8");
  runGit(repoRoot, ["add", relFile]);
  runGit(repoRoot, ["commit", "-m", subject]);
  const head = runGitOutput(repoRoot, ["rev-parse", "HEAD"]).trim();
  return head;
}

function runGitOutput(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed`);
  }
  return result.stdout || "";
}

describe("findRecentCommitsForPath", () => {
  let repoRoot: string;

  afterEach(() => {
    if (repoRoot) {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("returns recent commit subject and hash for a tracked file", () => {
    repoRoot = mkdtempSync(path.join(tmpdir(), "codebase-git-fixture-"));
    const rel = "src/token.ts";
    const subject = "feat(auth): add token helper";
    const head = initRepoWithCommit(repoRoot, rel, subject);

    const commits = findRecentCommitsForPath({
      repo_root: repoRoot,
      file_path: rel,
      limit: 5,
    });

    expect(commits.length).toBeGreaterThanOrEqual(1);
    expect(commits[0]?.subject).toBe(subject);
    expect(commits[0]?.hash).toBe(head);
  });

  it("returns empty history for a path with no commits", () => {
    repoRoot = mkdtempSync(path.join(tmpdir(), "codebase-git-fixture-"));
    runGit(repoRoot, ["init"]);
    runGit(repoRoot, ["config", "user.email", "agent@test.local"]);
    runGit(repoRoot, ["config", "user.name", "Agent Test"]);
    writeFileSync(path.join(repoRoot, "orphan.ts"), "export {};\n", "utf8");

    const commits = findRecentCommitsForPath({
      repo_root: repoRoot,
      file_path: "orphan.ts",
      limit: 3,
    });

    expect(commits).toEqual([]);
  });

  it("respects limit and orders newest first", () => {
    repoRoot = mkdtempSync(path.join(tmpdir(), "codebase-git-fixture-"));
    runGit(repoRoot, ["init"]);
    runGit(repoRoot, ["config", "user.email", "agent@test.local"]);
    runGit(repoRoot, ["config", "user.name", "Agent Test"]);
    const rel = "lib/module.ts";
    mkdirSync(path.join(repoRoot, "lib"), { recursive: true });
    writeFileSync(path.join(repoRoot, rel), "export const v = 1;\n", "utf8");
    runGit(repoRoot, ["add", rel]);
    runGit(repoRoot, ["commit", "-m", "chore: init module"]);
    writeFileSync(path.join(repoRoot, rel), "export const v = 2;\n", "utf8");
    runGit(repoRoot, ["add", rel]);
    runGit(repoRoot, ["commit", "-m", "feat: bump module"]);
    const latest = runGitOutput(repoRoot, ["rev-parse", "HEAD"]).trim();

    const commits = findRecentCommitsForPath({
      repo_root: repoRoot,
      file_path: rel,
      limit: 1,
    });

    expect(commits).toHaveLength(1);
    expect(commits[0]?.subject).toBe("feat: bump module");
    expect(commits[0]?.hash).toBe(latest);
  });
});
