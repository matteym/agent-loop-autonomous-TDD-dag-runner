import { spawnSync } from "node:child_process";

function winShell(): boolean {
  return process.platform === "win32";
}

export function argvForWinShell(args: string[]): string[] {
  return args.map((arg) => {
    if (!/[\s"]/.test(arg)) {
      return arg;
    }
    return '"' + arg.replace(/"/g, '""') + '"';
  });
}

function gh(args: string[], cwd: string) {
  const argv = winShell() ? argvForWinShell(args) : args;
  return spawnSync("gh", argv, {
    cwd,
    encoding: "utf8",
    shell: winShell(),
  });
}

function currentBranch(cwd: string): string {
  const branch = spawnSync("git", ["branch", "--show-current"], {
    cwd,
    encoding: "utf8",
    shell: winShell(),
  });
  return (branch.stdout || "").trim();
}

export function isOpenPrState(state: string | undefined): boolean {
  return (state || "").toUpperCase() === "OPEN";
}

export function parsePrView(raw: string): { url?: string; state?: string } | null {
  try {
    return JSON.parse(raw.trim()) as { url?: string; state?: string };
  } catch {
    return null;
  }
}

function viewOpenPrUrl(cwd: string): string | undefined {
  const view = gh(["pr", "view", "--json", "url,state"], cwd);
  if (view.status !== 0) {
    return undefined;
  }
  const parsed = parsePrView(view.stdout || "");
  if (!parsed || !isOpenPrState(parsed.state)) {
    return undefined;
  }
  const url = (parsed.url || "").trim();
  return url || undefined;
}

export function openOrReusePullRequest(
  cwd: string,
  title: string,
  body: string
): { ok: boolean; output: string } {
  const name = currentBranch(cwd);
  if (name === "main" || name === "master") {
    return { ok: false, output: "refusing pull request on " + name };
  }
  const existing = viewOpenPrUrl(cwd);
  if (existing) {
    return { ok: true, output: existing };
  }
  const created = gh(["pr", "create", "--title", title, "--body", body], cwd);
  if (created.status === 0) {
    return { ok: true, output: (created.stdout || "").trim() };
  }
  const reused = viewOpenPrUrl(cwd);
  if (reused) {
    return { ok: true, output: reused };
  }
  return {
    ok: false,
    output:
      ((created.stdout || "") + (created.stderr || "")).trim() ||
      "gh pr create failed",
  };
}

export function mergeOpenPullRequest(cwd: string): { ok: boolean; output: string } {
  const name = currentBranch(cwd);
  if (name === "main" || name === "master") {
    return { ok: false, output: "refusing merge from " + name };
  }
  const open = viewOpenPrUrl(cwd);
  if (!open) {
    return { ok: false, output: "no open pull request to merge" };
  }
  const merged = gh(["pr", "merge", "--merge"], cwd);
  if (merged.status === 0) {
    return { ok: true, output: (merged.stdout || "").trim() || open };
  }
  const waiting = gh(["pr", "merge", "--auto", "--merge"], cwd);
  if (waiting.status === 0) {
    return {
      ok: true,
      output: ((waiting.stdout || "") + " auto-merge enabled").trim(),
    };
  }
  return {
    ok: false,
    output:
      ((merged.stdout || "") + (merged.stderr || "")).trim() ||
      "gh pr merge failed",
  };
}
