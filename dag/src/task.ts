import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { hasCompose, isEmptyTarget } from "./init/detect.js";
import { missingRemoteHint } from "./init/run.js";
import { runLoop } from "./loop.js";
import {
  inferTestCommand,
  inventoryMarkers,
  mismatchLangTests,
  testsMatch,
} from "./inventory.js";
import { commitMessageValid } from "./commit.js";
import { isAllowedNewTestSpec, isFillableCwd, normalizeRelCwd } from "./new-cwd.js";
import { metadataDagPath, metadataDir, metadataTaskPath, pluginDirName, repoRoot } from "./paths.js";
import { createAgentHandle } from "./providers/create.js";
import { resolveProvider } from "./providers/select.js";
import type { ProviderName } from "./cli.js";
import type { Dag, TestSpec } from "./types.js";

export const maxPlanTasks = 10;

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

function inferTest(dir: string): { cmd: string; args: string[] } | null {
  return inferTestCommand(dir);
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
      if (
        !entry.isDirectory() ||
        skipWalkNames.has(entry.name) ||
        entry.name.startsWith(".") ||
        (pluginDirName !== null && entry.name === pluginDirName)
      ) {
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

function validateDag(dag: Dag, packages: Pkg[]): string | null {
  if (!dag.title || !dag.model || dag.cwd !== ".." || !Array.isArray(dag.tasks)) {
    return "dag must have title, model, cwd '..', and tasks[]";
  }
  if (!dag.tasks.length) {
    return "tasks is empty";
  }
  if (dag.tasks.length > maxPlanTasks) {
    return "max " + maxPlanTasks + " tasks";
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
      if (existsSync(join(repoRoot, safe)) && !isFillableCwd(repoRoot, safe)) {
        return task.id + " cwd exists but is not an inventoried package: " + spec.cwd;
      }
      if (!isAllowedNewTestSpec(spec.cmd, spec.args)) {
        return task.id + " new cwd tests must be yarn test (or uv pytest / go test / cargo test)";
      }
      const langErr = mismatchLangTests(task.prompt + " " + task.id + " " + spec.cwd, spec);
      if (langErr) {
        return task.id + " " + langErr;
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
    "Use model " +
      model +
      ". Write product files in the product repo root. If this engine is nested inside another git repo, that parent is the product; do not put app code in the engine/plugin folder.",
    "Split the intent into features. 1 feature = 1 task. Tiny intent = 1 task. A full app or a complete module (example: auth = register, login, jwt, refresh, logout) = several tasks, max " +
      maxPlanTasks +
      ", dependency order. Several tasks MAY share the same package when they are sequential features. Do not cram a whole module into one node.",
    "id kebab from intent. commit must match feat|fix|refactor|perf|test|docs|style|chore|build|ci(scope)?: lowercase subject, no period. Copy style from git log.",
    "tests.cwd must be one inventory path. tests.cmd/args must equal that package's listed test command.",
    "Language → tests (never mix):",
    "- TypeScript/JavaScript (Express, Nest, Fastify): package.json + yarn test. Node must create package.json with a test script.",
    "- Python (FastAPI, Django, Flask): pyproject.toml + tests cmd uv args [run, python, -m, pytest, -q]. Never yarn test on a Python node.",
    "- Go (gin, fiber, chi): go.mod + tests cmd go args [test, ./...]. Never yarn test on a Go node.",
    "- Rust (axum, actix): Cargo.toml + tests cmd cargo args [test]. Never yarn test on a Rust node.",
    "Infer language from the human intent. FastAPI = Python. gin = Go. Express = TypeScript. Polyglot intent = one language per task, correct runner each time.",
    "If a package has no-test-script you may not point tests at it unless id is scaffold with tests [] and allowEmptyCommit true.",
    "Init only created an empty src folder. Put application code under src/ (or src/<service> if the intent is multiple services). Do not create src/backend or src/frontend unless the intent asks for that split. Architecture is decided by THIS intent, not init.",
    "If a package is missing from inventory (src, src/api), emit a task with that relative cwd, optionalCwd true, and the test command for THAT language. Empty layout folders (only .gitkeep) may be filled. Forbidden cwd: dag, .cursor, .git, node_modules, ., .., absolute paths" +
      (pluginDirName ? ", " + pluginDirName : "") +
      ". The node must create the package marker AND tests. Inventoried packages must use their listed test command and must not set optionalCwd.",
    "If the intent needs a datastore, the node must add the image to docker-compose.yml and keys to .env.example (never edit or commit .env). Copy composeBlock/envBlock from dag/src/init/compose.ts. The orchestrator syncs .env and runs docker compose up --build -d.",
    "Each prompt = the human intent scoped to that package only. Append: only this package. Use env for DB/API URLs, never hardcode, never commit .env.",
    "Do not write .github/workflows. Init already committed .github/workflows/ci.yml. The orchestrator keeps that file current. Missing languages are skipped on CI; failing tests fail the job.",
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
  push?: boolean;
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
        push: opts.push,
      });
    }
    const needsWizard = isEmptyTarget(repoRoot, pluginDirName ? [pluginDirName] : []) && !hasCompose(repoRoot);
    if (needsWizard) {
      log(missingRemoteHint);
      return 1;
    }
    if (!opts.intent) {
      log('usage: yarn task "your intent"');
      return 1;
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
      push: opts.push,
    });
  } catch (err) {
    phase("FAIL", "plan");
    log(String(err));
    return 1;
  }
}
