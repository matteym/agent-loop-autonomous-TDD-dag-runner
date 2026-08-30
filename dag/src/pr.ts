import { spawnSync } from "node:child_process";

function winShell(): boolean {
  return process.platform === "win32";
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
  const view = spawnSync("gh", ["pr", "view", "--json", "url"], {
    cwd,
    encoding: "utf8",
    shell: winShell(),
  });
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
  const created = spawnSync(
    "gh",
    ["pr", "create", "--title", title, "--body", body],
    {
      cwd,
      encoding: "utf8",
      shell: winShell(),
    }
  );
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
