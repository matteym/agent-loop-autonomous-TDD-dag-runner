import { spawnSync } from "node:child_process";

function winShell(): boolean {
  return process.platform === "win32";
}

export function createPullRequest(
  cwd: string,
  title: string,
  body: string
): { ok: boolean; output: string } {
  const branch = spawnSync("git", ["branch", "--show-current"], {
    cwd,
    encoding: "utf8",
    shell: winShell(),
  });
  const name = (branch.stdout || "").trim();
  if (name === "main" || name === "master") {
    return { ok: false, output: "refusing pull request on " + name };
  }
  const push = spawnSync("git", ["push", "-u", "origin", "HEAD"], {
    cwd,
    encoding: "utf8",
    shell: winShell(),
  });
  if (push.status !== 0) {
    return {
      ok: false,
      output: ((push.stdout || "") + (push.stderr || "")).trim() || "git push failed",
    };
  }
  const pr = spawnSync("gh", ["pr", "create", "--title", title, "--body", body], {
    cwd,
    encoding: "utf8",
    shell: winShell(),
  });
  if (pr.status !== 0) {
    return {
      ok: false,
      output: ((pr.stdout || "") + (pr.stderr || "")).trim() || "gh pr create failed",
    };
  }
  return { ok: true, output: (pr.stdout || "").trim() };
}
