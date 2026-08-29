import { spawnSync } from "node:child_process";
import { log } from "./log.js";

export const railsCommitSubject = "chore(config): bootstrap stack from init wizard";

export const missingGitIdentityHint =
  "set git user.name and user.email in this repo (git config user.name / user.email). The runner does not invent an author.";

function git(repoRoot: string, args: string[]) {
  return spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
  });
}

export function hasGitIdentity(repoRoot: string): boolean {
  const name = (git(repoRoot, ["config", "user.name"]).stdout || "").trim();
  const email = (git(repoRoot, ["config", "user.email"]).stdout || "").trim();
  return Boolean(name && email);
}

export function requireGitIdentity(repoRoot: string): void {
  if (!hasGitIdentity(repoRoot)) {
    throw new Error(missingGitIdentityHint);
  }
}

export function commitRails(repoRoot: string) {
  requireGitIdentity(repoRoot);
  const inside = git(repoRoot, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.status !== 0) {
    const init = git(repoRoot, ["init"]);
    if (init.status !== 0) {
      throw new Error("git init failed");
    }
  }
  const branch = git(repoRoot, ["branch", "--show-current"]);
  const name = (branch.stdout || "").trim();
  if (!name || name === "main" || name === "master") {
    const co = git(repoRoot, ["checkout", "-B", "agent/init"]);
    if (co.status !== 0) {
      throw new Error("git checkout -B agent/init failed");
    }
  }
  const add = git(repoRoot, ["add", "-A"]);
  if (add.status !== 0) {
    throw new Error("git add failed");
  }
  git(repoRoot, ["rm", "-f", "--cached", "--", ".env"]);
  const staged = git(repoRoot, ["diff", "--cached", "--name-only"]);
  const files = (staged.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\\/g, "/"))
    .filter(Boolean);
  if (files.some((file) => file === ".env" || file.endsWith("/.env"))) {
    git(repoRoot, ["reset", "HEAD"]);
    throw new Error("commit aborted: .env staged");
  }
  if (!files.length) {
    throw new Error("commit aborted: nothing to commit");
  }
  const commit = git(repoRoot, ["commit", "-m", railsCommitSubject]);
  if (commit.status !== 0) {
    log((commit.stderr || commit.stdout || "git commit failed").trim());
    throw new Error("git commit failed");
  }
}
