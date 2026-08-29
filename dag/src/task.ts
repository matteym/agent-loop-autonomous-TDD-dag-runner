import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { hasCompose, isEmptyTarget } from "./init/detect.js";
import { runInit } from "./init/run.js";
import { runLoop } from "./loop.js";
import { isAllowedNewTestSpec, normalizeRelCwd } from "./new-cwd.js";
import { metadataDagPath, metadataDir, metadataTaskPath, repoRoot } from "./paths.js";
import { createAgentHandle } from "./providers/create.js";
import { resolveProvider } from "./providers/select.js";
import type { ProviderName } from "./cli.js";
import type { Dag, TestSpec } from "./types.js";

type Pkg = {
  rel: string;
  test: { cmd: string; args: string[] } | null;
};

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
const inventoryMarkers = [
  "package.json",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
];

function colorEnabled(): boolean {
  return Boolean(process.stderr.isTTY);
}

function paint(code: string, text: string): string {
  if (!colorEnabled()) {
    return text;
  }
  return "\u001b[" + code + "m" + text + "\u001b[0m";
}

function log(message: string) {
  process.stderr.write("[task] " + message + "\n");
}

function phase(name: string, detail: string) {
  const code = name === "FAIL" ? "31" : name === "PLAN" ? "36" : "32";
  log(paint(code, name) + " " + detail);
}

function commitMessageValid(message: string): boolean {
  return /^(feat|fix|refactor|perf|test|docs|style|chore|build|ci)(\([a-z0-9-]+\))?: [a-z][^\n.]*$/.test(
    message.trim()
  );
}

function inferTest(dir: string): { cmd: string; args: string[] } | null {
  const pkgPath = join(dir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        scripts?: Record<string, string>;
      };
      if (pkg.scripts?.test) {
        return { cmd: "yarn", args: ["test"] };
      }
    } catch {
      return null;
    }
  }
  if (existsSync(join(dir, "pyproject.toml"))) {
    return { cmd: "uv", args: ["run", "python", "-m", "pytest", "-q"] };
  }
  if (existsSync(join(dir, "go.mod"))) {
    return { cmd: "go", args: ["test", "./..."] };
  }
  if (existsSync(join(dir, "Cargo.toml"))) {
    return { cmd: "cargo", args: ["test"] };
  }
  return null;
}

function dirHasMarker(dir: string): boolean {
  for (const marker of inventoryMarkers) {
    if (existsSync(join(dir, marker))) {
      return true;
    }
  }
  return existsSync(join(dir, "tests"));
}

function walkPackages(dir: string, depth: number, out: Pkg[]) {
  if (dirHasMarker(dir)) {
    const rel = relative(repoRoot, dir).replace(/\\/g, "/") || ".";
    out.push({ rel, test: inferTest(dir) });
  }
  if (depth >= 3) {
    return;
  }
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || skipWalkNames.has(entry.name) || entry.name.startsWith(".")) {
        continue;
      }
      walkPackages(join(dir, entry.name), depth + 1, out);
    }
  } catch {
    return;
  }
}

function listPackages(): Pkg[] {
  const out: Pkg[] = [];
  walkPackages(repoRoot, 0, out);
  const seen = new Set<string>();
  return out.filter((pkg) => {
    if (seen.has(pkg.rel)) {
      return false;
    }
    seen.add(pkg.rel);
    return true;
  });
}

function gitLog(): string {
  const result = spawnSync("git", ["log", "-20", "--oneline"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return (result.stdout || "").trim() || "(no commits)";
}

function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("planner output has no JSON object");
  }
  return JSON.parse(raw.slice(start, end + 1));
}

function testsMatch(expected: { cmd: string; args: string[] }, got: TestSpec): boolean {
  if (expected.cmd !== got.cmd) {
    return false;
  }
  if (expected.args.length !== got.args.length) {
    return false;
  }
  return expected.args.every((arg, i) => arg === got.args[i]);
}

function validateDag(dag: Dag, packages: Pkg[]): string | null {
  if (!dag.title || !dag.model || dag.cwd !== ".." || !Array.isArray(dag.tasks)) {
    return "dag must have title, model, cwd '..', and tasks[]";
  }
  if (!dag.tasks.length) {
    return "tasks is empty";
  }
  if (dag.tasks.length > 5) {
    return "max 5 tasks";
  }
  const byRel = new Map(packages.map((pkg) => [pkg.rel, pkg]));
  const testable = packages.some((pkg) => pkg.test);
  for (const task of dag.tasks) {
    if (!task.id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(task.id)) {
      return "invalid id " + String(task.id);
    }
    if (!commitMessageValid(task.commit)) {
      return "invalid commit: " + task.commit;
    }
    if (!task.prompt || typeof task.prompt !== "string") {
      return "missing prompt on " + task.id;
    }
    if (!Array.isArray(task.tests)) {
      return "missing tests on " + task.id;
    }
    if (!task.tests.length) {
      if (!task.allowEmptyCommit) {
        return task.id + " has no tests; allowEmptyCommit required";
      }
      if (task.id !== "scaffold" && testable) {
        return task.id + " has no tests; only scaffold may skip tests when packages have tests";
      }
      continue;
    }
    for (const spec of task.tests) {
      const cwd = spec.cwd.replace(/\\/g, "/");
      const pkg = byRel.get(cwd);
      if (pkg) {
        if (!existsSync(join(repoRoot, cwd))) {
          return task.id + " cwd missing: " + spec.cwd;
        }
        if (!pkg.test) {
          return task.id + " package has no test script: " + spec.cwd;
        }
        if (!testsMatch(pkg.test, spec)) {
          return (
            task.id +
            " tests must be " +
            pkg.test.cmd +
            " " +
            pkg.test.args.join(" ") +
            " in " +
            spec.cwd
          );
        }
        continue;
      }
      if (!spec.optionalCwd) {
        return task.id + " cwd not in inventory: " + spec.cwd;
      }
      const safe = normalizeRelCwd(spec.cwd);
      if (!safe) {
        return task.id + " unsafe new cwd: " + spec.cwd;
      }
      if (existsSync(join(repoRoot, safe))) {
        return task.id + " cwd exists but is not an inventoried package: " + spec.cwd;
      }
      if (!isAllowedNewTestSpec(spec.cmd, spec.args)) {
        return task.id + " new cwd tests must be yarn test (or uv pytest / go test / cargo test)";
      }
    }
  }
  return null;
}

function defaultModel(): string {
  if (!existsSync(metadataDagPath)) {
    return "composer-2.5";
  }
  try {
    const parsed = JSON.parse(readFileSync(metadataDagPath, "utf8")) as { model?: string };
    return parsed.model || "composer-2.5";
  } catch {
    return "composer-2.5";
  }
}

function buildPlannerPrompt(intent: string, packages: Pkg[], model: string): string {
  const inv = packages
    .map((pkg) => {
      const test = pkg.test
        ? pkg.test.cmd + " " + pkg.test.args.join(" ")
        : "no-test-script";
      return "- " + pkg.rel + " :: " + test;
    })
    .join("\n");
  return [
    "PLAN ONLY. Do not edit files. Do not git commit or git push.",
    "Reply with ONE JSON object and nothing else (no markdown).",
    "Schema:",
    '{"title":"string","model":"' +
      model +
      '","cwd":"..","tasks":[{"id":"kebab-id","prompt":"string","commit":"feat(scope): subject","tests":[{"cwd":"rel/path","cmd":"yarn","args":["test"]}],"allowEmptyCommit":false}]}',
    "Human intent: " + intent,
    "Use model " + model + " and cwd '..'.",
    "Simple intent = 1 task. Large intent = max 5 tasks, one package per task, dependency order.",
    "id kebab from intent. commit must match feat|fix|refactor|perf|test|docs|style|chore|build|ci(scope)?: lowercase subject, no period. Copy style from git log.",
    "tests.cwd must be one inventory path. tests.cmd/args must equal that package's listed test command.",
    "If a package has no-test-script you may not point tests at it unless id is scaffold with tests [] and allowEmptyCommit true.",
    "If the intent creates a package missing from inventory (example Client/), emit a task with that relative cwd, optionalCwd true, and tests yarn test (python: uv run python -m pytest -q). The folder must not exist yet. Forbidden cwd: dag, .cursor, .git, node_modules, ., .., absolute paths. The node must create the package AND a test script; the runner fails if the folder is still missing after GREEN. Do not use empty tests for that. Inventoried packages must use their listed test command and must not set optionalCwd.",
    "Each prompt = the human intent scoped to that package only. Append: only this package. Use env for DB/API URLs, never hardcode, never commit .env.",
    "Forbidden: .env in git, git push, --no-verify, terraform apply, fallback-secret, hardcoded localhost in app source, Playwright, Detox.",
    "Inventory:",
    inv,
    "Recent git log:",
    gitLog(),
  ].join("\n");
}

async function plan(
  intent: string,
  packages: Pkg[],
  provider: ProviderName | undefined
): Promise<Dag> {
  const selected = resolveProvider(provider);
  if (!selected.provider) {
    throw new Error("set CURSOR_API_KEY or ANTHROPIC_API_KEY / CLAUDE_API_KEY");
  }
  const model = defaultModel();
  await using agent = await createAgentHandle({
    provider: selected.provider,
    model,
    cwd: repoRoot,
    cursorKey: selected.cursorKey,
    claudeKey: selected.claudeKey,
  });
  const run = await agent.send(buildPlannerPrompt(intent, packages, model));
  log("run.id=" + run.id);
  const result = await run.wait();
  log("run.status=" + result.status);
  if (result.status !== "finished") {
    throw new Error("planner " + result.status);
  }
  const blob = (result.text || "").trim() || result.result || "";
  const parsed = extractJson(blob) as Dag;
  const err = validateDag(parsed, packages);
  if (err) {
    throw new Error(err);
  }
  parsed.model = model;
  parsed.cwd = "..";
  return parsed;
}

export async function runTask(opts: {
  intent: string;
  dagfile?: string;
  allowPullRequest?: boolean;
  provider?: ProviderName;
}): Promise<number> {
  try {
    if (opts.dagfile) {
      if (opts.intent) {
        log("intent ignored; using --dagfile");
      }
      return await runLoop({
        dagPath: opts.dagfile,
        provider: opts.provider,
        allowPullRequest: opts.allowPullRequest,
      });
    }
    const needsWizard = isEmptyTarget(repoRoot) && !hasCompose(repoRoot);
    if (!opts.intent) {
      if (needsWizard) {
        const result = await runInit();
        if (result.status === "refused") {
          log(result.reason);
          return 1;
        }
        log('next: yarn task "your intent"');
        return 0;
      }
      log('usage: yarn task "your intent"');
      return 1;
    }
    if (needsWizard) {
      if (!process.stdin.isTTY) {
        log("run yarn run init on a TTY or yarn run init --yes");
        return 1;
      }
      const result = await runInit();
      if (result.status !== "ok") {
        if (result.status === "refused") {
          log(result.reason);
        }
        return 1;
      }
    }
    phase("PLAN", opts.intent);
    const packages = listPackages();
    const dag = await plan(opts.intent, packages, opts.provider);
    mkdirSync(metadataDir, { recursive: true });
    writeFileSync(metadataTaskPath, JSON.stringify(dag, null, 2) + "\n");
    log("wrote " + metadataTaskPath + " nodes=" + dag.tasks.length);
    return await runLoop({
      dagPath: metadataTaskPath,
      provider: opts.provider,
      allowPullRequest: opts.allowPullRequest,
    });
  } catch (err) {
    phase("FAIL", "plan");
    log(String(err));
    return 1;
  }
}
