import { spawnSync } from "node:child_process";
import { log } from "./log.js";
import { pluginDirName } from "../paths.js";

export const bootstrapCommitSubject = "chore(config): bootstrap empty stack from init";

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

export function pushHead(repoRoot: string): { ok: true } | { ok: false; reason: string } {
  const result = git(repoRoot, ["push", "-u", "origin", "HEAD"]);
  if (result.status !== 0) {
    return {
      ok: false,
      reason: (result.stderr || result.stdout || "git push failed").trim(),
    };
  }
  return { ok: true };
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
