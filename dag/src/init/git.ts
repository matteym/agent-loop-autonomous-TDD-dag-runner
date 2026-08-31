import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { log } from "./log.js";
import { pluginDirName } from "../paths.js";

export const bootstrapCommitSubject = "chore(config): bootstrap empty stack from init";

export const missingGitIdentityHint =
  "set git user.name and user.email in this repo (git config user.name / user.email). The runner does not invent an author.";

function git(repoRoot: string, args: string[]) {
  const isPush = args.includes("push");
  if (
    isPush &&
    args.some((arg) => arg === "--force" || arg === "-f" || arg.startsWith("--force"))
  ) {
    throw new Error("force push is forbidden");
  }
  return spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
    timeout: 20000,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_EDITOR: "true",
      GIT_PAGER: "",
      PAGER: "",
    },
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

export function parseGithubRemote(raw: string): string | null {
  const t = raw.trim();
  const https = t.match(
    /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/
  );
  if (https) {
    return "https://github.com/" + https[1] + "/" + https[2] + ".git";
  }
  const ssh = t.match(
    /^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/
  );
  if (ssh) {
    return "git@github.com:" + ssh[1] + "/" + ssh[2] + ".git";
  }
  return null;
}

export function setOriginRemote(
  repoRoot: string,
  url: string,
  force: boolean | undefined
): { ok: true; url: string } | { ok: false; reason: string } {
  const parsed = parseGithubRemote(url);
  if (!parsed) {
    return {
      ok: false,
      reason: "remote must be https://github.com/OWNER/REPO or git@github.com:OWNER/REPO.git",
    };
  }
  const existing = (git(repoRoot, ["remote", "get-url", "origin"]).stdout || "").trim();
  if (existing && existing !== parsed && !force) {
    return {
      ok: false,
      reason: "origin already points to " + existing + "; use --force to replace",
    };
  }
  const args = existing
    ? ["remote", "set-url", "origin", parsed]
    : ["remote", "add", "origin", parsed];
  const result = git(repoRoot, args);
  if (result.status !== 0) {
    return {
      ok: false,
      reason: (result.stderr || result.stdout || "git remote failed").trim(),
    };
  }
  return { ok: true, url: parsed };
}

export const maxPushAttempts = 20;

export const rebaseConflictPolicy = "agent-replay";

export function isRejectedNonFastForward(reason: string): boolean {
  return (
    /non-fast-forward/i.test(reason) ||
    /\[rejected\]/i.test(reason) ||
    /failed to push some refs/i.test(reason) ||
    /tip of your current branch is behind/i.test(reason) ||
    /fetch first/i.test(reason) ||
    /remote contains work/i.test(reason)
  );
}

export function isPushRace(reason: string): boolean {
  return (
    isRejectedNonFastForward(reason) ||
    /cannot lock ref/i.test(reason) ||
    /failed to lock/i.test(reason) ||
    /remote ref updated/i.test(reason)
  );
}

export function aheadBehind(repoRoot: string): { ahead: number; behind: number } | null {
  const result = git(repoRoot, [
    "rev-list",
    "--left-right",
    "--count",
    "HEAD...@{upstream}",
  ]);
  if (result.status !== 0) {
    return null;
  }
  const parts = (result.stdout || "").trim().split(/\s+/);
  const ahead = Number(parts[0]);
  const behind = Number(parts[1]);
  if (!Number.isFinite(ahead) || !Number.isFinite(behind)) {
    return null;
  }
  return { ahead, behind };
}

export function pushHint(reason: string): string {
  if (isRejectedNonFastForward(reason) || isPushRace(reason)) {
    return (
      "origin diverged; fetch, rebase local commits onto origin/<branch> " +
      "(conflict policy " +
      rebaseConflictPolicy +
      "), push again. Never force-push; never drop remote commits."
    );
  }
  return reason;
}

function currentBranchName(repoRoot: string): string {
  return (git(repoRoot, ["branch", "--show-current"]).stdout || "").trim();
}

function remoteBranchRef(repoRoot: string): string | null {
  const branch = currentBranchName(repoRoot);
  if (!branch) {
    return null;
  }
  const ref = "refs/remotes/origin/" + branch;
  const ok = git(repoRoot, ["rev-parse", "--verify", ref]);
  return ok.status === 0 ? "origin/" + branch : null;
}

function rebaseInProgress(repoRoot: string): boolean {
  return (
    existsSync(join(repoRoot, ".git", "rebase-merge")) ||
    existsSync(join(repoRoot, ".git", "rebase-apply"))
  );
}

function gitText(result: { stdout?: string | null; stderr?: string | null }): string {
  return ((result.stderr || "") + (result.stdout || "")).trim();
}

function unmergedPaths(repoRoot: string): string[] {
  const diff = git(repoRoot, ["diff", "--name-only", "--diff-filter=U"]);
  return (diff.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function resolveRebaseConflicts(repoRoot: string): boolean {
  for (let i = 0; i < 50 && rebaseInProgress(repoRoot); i += 1) {
    const files = unmergedPaths(repoRoot);
    if (files.length) {
      git(repoRoot, ["checkout", "--theirs", "--", ...files]);
      git(repoRoot, ["add", "--", ...files]);
    }
    git(repoRoot, ["rm", "-f", "--cached", "--", ".env"]);
    if (pluginDirName) {
      git(repoRoot, ["reset", "HEAD", "--", pluginDirName]);
    }
    const cont = git(repoRoot, ["-c", "core.editor=true", "rebase", "--continue"]);
    if (cont.status === 0) {
      continue;
    }
    const text = gitText(cont);
    if (/nothing to commit|need to skip|previously applied/i.test(text)) {
      git(repoRoot, ["rebase", "--skip"]);
      continue;
    }
    return false;
  }
  return !rebaseInProgress(repoRoot);
}

function rebaseOntoOrigin(
  repoRoot: string,
  remoteRef: string
): { ok: true } | { ok: false; reason: string } {
  log("rebase onto " + remoteRef + " policy=" + rebaseConflictPolicy);
  const result = git(repoRoot, [
    "-c",
    "core.editor=true",
    "-c",
    "sequence.editor=true",
    "rebase",
    "--strategy=ort",
    "-X",
    "theirs",
    remoteRef,
  ]);
  if (result.status === 0 && !rebaseInProgress(repoRoot)) {
    return { ok: true };
  }
  if (rebaseInProgress(repoRoot) && resolveRebaseConflicts(repoRoot)) {
    return { ok: true };
  }
  if (rebaseInProgress(repoRoot)) {
    git(repoRoot, ["rebase", "--abort"]);
  }
  return {
    ok: false,
    reason: gitText(result) || "rebase failed",
  };
}

export function pushHead(repoRoot: string): { ok: true } | { ok: false; reason: string } {
  let lastReason = "git push failed";
  for (let attempt = 1; attempt <= maxPushAttempts; attempt += 1) {
    const fetched = git(repoRoot, ["fetch", "origin"]);
    if (fetched.status !== 0) {
      lastReason = gitText(fetched) || "git fetch failed";
      if (
        /does not appear to be a git repository|no such remote|repository not found/i.test(
          lastReason
        )
      ) {
        return { ok: false, reason: lastReason };
      }
      log("fetch failed (attempt " + attempt + "): " + lastReason);
      continue;
    }
    const branch = currentBranchName(repoRoot);
    if (branch) {
      git(repoRoot, [
        "fetch",
        "origin",
        "refs/heads/" + branch + ":refs/remotes/origin/" + branch,
      ]);
    }
    const remoteRef = remoteBranchRef(repoRoot);
    if (remoteRef) {
      const ancestor = git(repoRoot, ["merge-base", "--is-ancestor", remoteRef, "HEAD"]);
      if (ancestor.status !== 0) {
        const rebased = rebaseOntoOrigin(repoRoot, remoteRef);
        if (!rebased.ok) {
          return rebased;
        }
      }
    }
    const pushed = git(repoRoot, ["push", "-u", "origin", "HEAD"]);
    if (pushed.status === 0) {
      return { ok: true };
    }
    lastReason = gitText(pushed) || "git push failed";
    if (isPushRace(lastReason) && attempt < maxPushAttempts) {
      log("push rejected (attempt " + attempt + "), fetch+rebase again");
      continue;
    }
    return { ok: false, reason: lastReason };
  }
  return { ok: false, reason: lastReason };
}

export function commitBootstrap(repoRoot: string) {
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
  if (pluginDirName) {
    git(repoRoot, ["rm", "-r", "-f", "--cached", "--", pluginDirName]);
  }
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
  const commit = git(repoRoot, ["commit", "-m", bootstrapCommitSubject]);
  if (commit.status !== 0) {
    log((commit.stderr || commit.stdout || "git commit failed").trim());
    throw new Error("git commit failed");
  }
}
