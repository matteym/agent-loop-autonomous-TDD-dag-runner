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

function viewPrUrl(cwd: string): string | undefined {
  const view = gh(["pr", "view", "--json", "url"], cwd);
  if (view.status !== 0) {
    return undefined;
  }
  try {
    const parsed = JSON.parse((view.stdout || "").trim()) as { url?: string };
    const url = (parsed.url || "").trim();
    return url || undefined;
  } catch {
    return undefined;
  }
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
  const existing = viewPrUrl(cwd);
  if (existing) {
    return { ok: true, output: existing };
  }
  const created = gh(["pr", "create", "--title", title, "--body", body], cwd);
  if (created.status === 0) {
    return { ok: true, output: (created.stdout || "").trim() };
  }
  const reused = viewPrUrl(cwd);
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
