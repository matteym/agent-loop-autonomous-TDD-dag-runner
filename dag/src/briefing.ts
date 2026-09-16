import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { blockedCommitPaths, recentGitLog } from "./git-run.js";
import { engineKnowledgeCwd, inventoryMarkers } from "./inventory.js";
import { engineRoot, repoRoot, isPluginWalkDir } from "./paths.js";
import { productContextBlock } from "./product-context.js";
import type { Task, TestSpec } from "./types.js";

export const protocolPreamble =
  "Follow .cursor/skills/agent-loop/SKILL.md and .cursor/rules/agent-loop.mdc. " +
  "This is one agent turn. Do not git push, --no-verify, terraform apply, or terraform destroy. " +
  "Run only the test commands listed for this node in the briefing. " +
  "Create and edit this ticket's package files only under this node's tests.cwd (repo-relative). " +
  "Do not create a top-level src/ directory at the repository root.";

export const redPhaseRules =
  "Write or extend failing tests for this ticket. Do not change production code except if tests cannot compile. " +
  "For architecture / scaffold tasks: structural files (package.json, tsconfig.json, folder structures, and index stubs) are allowed in the RED phase if required for test execution, provided they contain no business logic.";

const skipWalkNames = new Set([
  "node_modules",
  ".git",
  "dist",
  ".venv",
  "coverage",
  ".next",
  "logs",
  "dag",
]);

function dirHasMarker(dir: string): boolean {
  for (const marker of inventoryMarkers) {
    if (existsSync(join(dir, marker))) {
      return true;
    }
  }
  return existsSync(join(dir, "tests"));
}

function markerLabels(dir: string): string[] {
  const marks: string[] = [];
  for (const marker of inventoryMarkers) {
    if (existsSync(join(dir, marker))) {
      marks.push(marker);
    }
  }
  if (existsSync(join(dir, "tests"))) {
    marks.push("tests/");
  }
  return marks;
}

function walkInventory(dir: string, depth: number, out: string[]) {
  if (dirHasMarker(dir)) {
    const rel = relative(repoRoot, dir).replace(/\\/g, "/") || ".";
    const marks = markerLabels(dir);
    out.push(marks.length ? rel + " [" + marks.join(", ") + "]" : rel);
  }
  if (depth >= 3) {
    return;
  }
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (
        !entry.isDirectory() ||
        skipWalkNames.has(entry.name) ||
        entry.name.startsWith(".") ||
        isPluginWalkDir(entry.name)
      ) {
        continue;
      }
      walkInventory(join(dir, entry.name), depth + 1, out);
    }
  } catch {
    return;
  }
}

function listRepoPackages(): string[] {
  const lines: string[] = [];
  walkInventory(repoRoot, 0, lines);
  const knowledge = join(repoRoot, engineKnowledgeCwd);
  if (existsSync(knowledge)) {
    const marks = markerLabels(knowledge);
    lines.push(marks.length ? engineKnowledgeCwd + " [" + marks.join(", ") + "]" : engineKnowledgeCwd);
  }
  const unique = [...new Set(lines)].sort();
  return unique.length ? unique : ["(empty)"];
}

function formatNodeTests(tests: TestSpec[]): string[] {
  if (!tests.length) {
    return ["none"];
  }
  return tests.map((spec) => {
    const optional = spec.optionalCwd ? "new " : "";
    return optional + spec.cmd + " " + spec.args.join(" ") + " (cwd " + spec.cwd + ")";
  });
}

export function cwdLockLines(tests: TestSpec[]): string[] {
  const cwds = [
    ...new Set(tests.map((spec) => spec.cwd.replace(/\\/g, "/")).filter(Boolean)),
  ];
  if (!cwds.length) {
    return [];
  }
  return [
    "Mandatory working directory for this node (repo-relative): " + cwds.join(", "),
    "Create and edit this ticket's package files only under that path.",
    "Do not create a top-level src/ directory at the repository root.",
  ];
}

export function buildRepoBriefing(task: Task, commitNow: boolean): string {
  const forbidden = [
    ...blockedCommitPaths,
    "**/.env",
    "**/.env.*",
    "dag/metadata/state.json",
    "dag/metadata/agent-id",
    "dag/logs/failures.log",
    "dag/metadata/dag.json",
    "*.done.json",
    "dag/history/nodes.jsonl",
    "git push / --no-verify",
    "terraform apply / terraform destroy",
  ];
  if (!commitNow) {
    forbidden.push("git commit (wait for COMMIT NOW)");
  }
  return [
    "Repo briefing (deterministic, not extra scope). Ticket text above wins.",
    ...productContextBlock(repoRoot, engineRoot),
    "Exact git commit subject (COMMIT NOW only, copy verbatim):",
    task.commit,
    "Repo packages:",
    ...listRepoPackages().map((line) => "- " + line),
    "Recent git log (product repo):",
    recentGitLog(),
    "This node tests:",
    ...formatNodeTests(task.tests).map((line) => "- " + line),
    ...cwdLockLines(task.tests),
    "Forbidden paths / actions:",
    ...forbidden.map((line) => "- " + line),
  ].join("\n");
}
