import { spawnSync } from "node:child_process";
import { commitMessageValid } from "./commit.js";
import { pluginDirName, repoRoot } from "./paths.js";
import { log } from "./run-log.js";

export const blockedCommitPaths = [".env", "app-storage-service-account-key.json"];

export function runGit(args: string[]) {
  return spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

export function porcelainPath(line: string): string {
  const rest = line.slice(3).trim();
  const arrow = rest.indexOf(" -> ");
  const raw = arrow >= 0 ? rest.slice(arrow + 4) : rest;
  return raw.replace(/\\/g, "/").replace(/^"/, "").replace(/"$/, "");
}

export function isControlledDirty(file: string, pluginName: string | null = pluginDirName): boolean {
  const n = file.replace(/\\/g, "/").replace(/\/+$/, "");
  if (pluginName) {
    const prefix = pluginName.replace(/\\/g, "/") + "/";
    if (n === pluginName || n.startsWith(prefix)) {
      return true;
    }
  }
  if (n === "dag" || n.startsWith("dag/")) {
    return true;
  }
  if (n === ".cursor/mcp.json") {
    return true;
  }
  return false;
}

export function isBlockedCommitPath(file: string): boolean {
  if (
    blockedCommitPaths.some(
      (blocked) =>
        file === blocked ||
        file.endsWith("/" + blocked) ||
        file.endsWith("/.env") ||
        file.includes("/.env.")
    )
  ) {
    return true;
  }
  const n = file.replace(/\\/g, "/");
  return (
    n.endsWith("failures.log") ||
    n.endsWith("metadata/agent-id") ||
    n.endsWith("history/nodes.jsonl") ||
    /(?:^|\/)logs\/status$/.test(n) ||
    /(?:^|\/)logs\/.*\.log$/.test(n)
  );
}

export function stagedTouchesBlockedPath(): boolean {
  const diff = runGit(["diff", "--cached", "--name-only"]);
  const files = (diff.stdout || "").split(/\r?\n/).filter(Boolean);
  return files.some((file: string) => isBlockedCommitPath(file));
}

export function orchestratorCommit(message: string, allowEmpty: boolean | undefined): boolean {
  if (!commitMessageValid(message)) {
    log("commit message rejected: " + message);
    return false;
  }
  runGit(["add", "-A"]);
  const resetArgs = [
    "reset",
    "HEAD",
    "--",
    "dag/logs/failures.log",
    "dag/logs/status",
    "dag/metadata/agent-id",
    "dag/history/nodes.jsonl",
    ".cursor/mcp.json",
  ];
  if (pluginDirName) {
    resetArgs.push(pluginDirName);
  }
  runGit(resetArgs);
  if (stagedTouchesBlockedPath()) {
    runGit(["reset", "HEAD"]);
    log("commit aborted: staged blocked path");
    return false;
  }
  const commit = runGit(["commit", "-m", message]);
  if (commit.status === 0) {
    log("committed " + message);
    return true;
  }
  const text = (commit.stdout || "") + (commit.stderr || "");
  if (allowEmpty && /nothing to commit/i.test(text)) {
    log("no changes to commit for this node");
    return true;
  }
  log("commit failed: " + text);
  return false;
}

export function gitHead(): string {
  return (runGit(["rev-parse", "HEAD"]).stdout || "").trim();
}

export function lastCommitSubject(): string {
  return (runGit(["log", "-1", "--format=%s"]).stdout || "").trim();
}

export function recentGitLog(limit = 20): string {
  const result = runGit(["log", "-" + String(limit), "--oneline"]);
  return (result.stdout || "").trim() || "(no commits)";
}

export function revertTrackedChanges() {
  log("reverting tracked files with git reset --hard HEAD");
  runGit(["reset", "--hard", "HEAD"]);
}
