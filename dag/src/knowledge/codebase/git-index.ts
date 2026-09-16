import { spawnSync } from "node:child_process";
import path from "node:path";
import type { GitPathCommit, RecentGitHistoryInput } from "./types.js";

function resolveLimit(limit: number | undefined): number {
  if (limit !== undefined && limit > 0) {
    return limit;
  }
  const fromEnv = process.env.CODEBASE_GIT_LOG_LIMIT?.trim();
  if (fromEnv) {
    const parsed = Number.parseInt(fromEnv, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 10;
}

/** Recent commits touching a path via local `git log`. */
export function findRecentCommitsForPath(input: RecentGitHistoryInput): GitPathCommit[] {
  const repoRoot = path.resolve(input.repo_root);
  const filePath = input.file_path.replace(/\\/g, "/");
  const limit = resolveLimit(input.limit);

  const result = spawnSync(
    "git",
    ["log", `-n${limit}`, "--format=%H%x09%s", "--", filePath],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  if (result.status !== 0) {
    return [];
  }

  const commits: GitPathCommit[] = [];
  for (const line of (result.stdout || "").split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    const tab = line.indexOf("\t");
    if (tab <= 0) {
      continue;
    }
    commits.push({
      hash: line.slice(0, tab),
      subject: line.slice(tab + 1),
    });
  }
  return commits;
}
