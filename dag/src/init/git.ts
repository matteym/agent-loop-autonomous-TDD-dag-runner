import { spawnSync } from "node:child_process";
import { gitAuthorEmail, gitAuthorName } from "../git-author.js";
import { log } from "./log.js";

export const railsCommitSubject = "chore(config): bootstrap stack from init wizard";

function git(repoRoot: string, args: string[]) {
  return spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
  });
}

export function commitRails(repoRoot: string) {
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
  const commit = git(repoRoot, [
    "-c",
    "user.name=" + gitAuthorName,
    "-c",
    "user.email=" + gitAuthorEmail,
    "commit",
    "-m",
    railsCommitSubject,
  ]);
  if (commit.status !== 0) {
    log((commit.stderr || commit.stdout || "git commit failed").trim());
    throw new Error("git commit failed");
  }
}
