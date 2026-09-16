import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { retrieveGitDeps } from "./git-deps.js";

function runGit(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${(result.stderr || result.stdout || "").trim()}`,
    );
  }
}

function writeFixture(root: string, rel: string, content: string): void {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
}

function initGitRepo(repoRoot: string): void {
  runGit(repoRoot, ["init"]);
  runGit(repoRoot, ["config", "user.email", "agent@test.local"]);
  runGit(repoRoot, ["config", "user.name", "Agent Test"]);
}

describe("retrieveGitDeps", () => {
  let codebaseRoot: string;

  afterEach(() => {
    if (codebaseRoot) {
      rmSync(codebaseRoot, { recursive: true, force: true });
    }
  });

  it("includes import neighbors when the query matches the importer file", () => {
    codebaseRoot = mkdtempSync(path.join(tmpdir(), "retrieval-git-deps-"));
    initGitRepo(codebaseRoot);

    writeFixture(
      codebaseRoot,
      "lib/token.ts",
      `export function rotateRefreshToken() {}
`,
    );
    writeFixture(
      codebaseRoot,
      "lib/handler.ts",
      `import { rotateRefreshToken } from "./token.js";

export function handleAuthRequest() {
  return rotateRefreshToken();
}
`,
    );

    runGit(codebaseRoot, ["add", "lib/token.ts", "lib/handler.ts"]);
    runGit(codebaseRoot, ["commit", "-m", "feat(auth): wire handler to token"]);

    const hits = retrieveGitDeps({
      query: "handleAuthRequest",
      codebase_root: codebaseRoot,
      repo_root: codebaseRoot,
    });

    expect(hits.some((hit) => hit.file === "lib/handler.ts")).toBe(true);
    expect(
      hits.some(
        (hit) => hit.file === "lib/token.ts" && hit.kind === "dependency",
      ),
    ).toBe(true);
  });

  it("includes recent git commit subjects for matched files", () => {
    codebaseRoot = mkdtempSync(path.join(tmpdir(), "retrieval-git-deps-"));
    initGitRepo(codebaseRoot);

    const gitSubject = "feat(auth): add session handler module";
    writeFixture(
      codebaseRoot,
      "lib/handler.ts",
      `export function handleAuthRequest() {}
`,
    );

    runGit(codebaseRoot, ["add", "lib/handler.ts"]);
    runGit(codebaseRoot, ["commit", "-m", gitSubject]);

    const hits = retrieveGitDeps({
      query: "handleAuthRequest",
      codebase_root: codebaseRoot,
      repo_root: codebaseRoot,
    });

    expect(
      hits.some(
        (hit) =>
          hit.kind === "git" &&
          hit.file === "lib/handler.ts" &&
          hit.commit_subject === gitSubject,
      ),
    ).toBe(true);
  });
});
