import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { gitAuthorEmail, gitAuthorName } from "./git-author.js";
import { composeReload } from "./init/up.js";
import { createPullRequest } from "./pr.js";
import type { ProviderName } from "./cli.js";
import {
  donePathFor,
  failuresLogPath,
  historyPath,
  historyDir,
  logsDir,
  metadataAgentIdPath,
  metadataDagPath,
  metadataDir,
  metadataStatePath,
  repoRoot,
  resolveDagFile,
} from "./paths.js";
import { createAgentHandle } from "./providers/create.js";
import type { AgentHandle } from "./providers/types.js";
import { resolveProvider } from "./providers/select.js";
import type { Dag, Task, TestSpec } from "./types.js";

type Phase =
  | "RED"
  | "GREEN"
  | "UP"
  | "GUARD"
  | "TEST"
  | "COMMIT NOW"
  | "ARCHIVE"
  | "SKIP"
  | "FAIL";

const protocolPreamble =
  "Follow .cursor/skills/agent-loop/SKILL.md and .cursor/rules/agent-loop.mdc. " +
  "This is one agent turn. Do not git push, --no-verify, terraform apply, or terraform destroy. " +
  "Run only the test commands listed for this node in the briefing.";
const blockedCommitPaths = [
  ".env",
  "afaire",
  "app-storage-service-account-key.json",
];
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
const maxFixRounds = 5;
const maxRedAttempts = 2;

let runLogPath = "";
let nodesOk = 0;
let activeDagPath = metadataDagPath;
const runStartedAt = Date.now();

function colorEnabled(): boolean {
  return Boolean(process.stderr.isTTY);
}

function paint(code: string, text: string): string {
  if (!colorEnabled()) {
    return text;
  }
  return "\u001b[" + code + "m" + text + "\u001b[0m";
}

function phaseColor(phase: Phase): string {
  if (phase === "FAIL" || phase === "RED") {
    return paint("31", phase);
  }
  if (phase === "SKIP") {
    return paint("33", phase);
  }
  if (phase === "GREEN" || phase === "ARCHIVE") {
    return paint("32", phase);
  }
  return paint("36", phase);
}

function redact(text: string): string {
  return text
    .replace(/CURSOR_API_KEY[=:\s]+\S+/gi, "CURSOR_API_KEY=***")
    .replace(/CURSOR_SDK_API[=:\s]+\S+/gi, "CURSOR_SDK_API=***")
    .replace(/ANTHROPIC_API_KEY[=:\s]+\S+/gi, "ANTHROPIC_API_KEY=***")
    .replace(/CLAUDE_API_KEY[=:\s]+\S+/gi, "CLAUDE_API_KEY=***")
    .replace(/JWT_SECRET[=:\s]+\S+/gi, "JWT_SECRET=***")
    .replace(/Bearer\s+\S+/gi, "Bearer ***")
    .replace(/refresh_token[=:\s]+\S+/gi, "refresh_token=***");
}

function runStamp(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    String(d.getFullYear()) +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    "-" +
    p(d.getHours()) +
    p(d.getMinutes()) +
    p(d.getSeconds())
  );
}

function initRunLog() {
  mkdirSync(logsDir, { recursive: true });
  mkdirSync(historyDir, { recursive: true });
  runLogPath = join(logsDir, "run-" + runStamp(new Date()) + ".log");
}

function log(message: string) {
  const safe = redact(message);
  const stamped = new Date().toISOString() + " " + safe;
  process.stderr.write("[dag] " + safe + "\n");
  if (runLogPath) {
    appendFileSync(runLogPath, stamped + "\n");
  }
}

function phase(name: Phase, detail: string) {
  log(phaseColor(name) + " " + detail);
}

function nodeSeparator(id: string) {
  log(paint("90", "──────── " + id + " ────────"));
}

function loadDag(dagPath: string): Dag {
  if (!existsSync(dagPath)) {
    log("DAG file not found: " + dagPath);
    process.exit(1);
  }
  return JSON.parse(readFileSync(dagPath, "utf8")) as Dag;
}

function writeJson(filePath: string, value: unknown) {
  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function loadDoneFile(dagPath: string): { tasks: Task[] } {
  const donePath = donePathFor(dagPath);
  if (!existsSync(donePath)) {
    return { tasks: [] };
  }
  const parsed = JSON.parse(readFileSync(donePath, "utf8")) as { tasks?: Task[] };
  return { tasks: parsed.tasks || [] };
}

function archiveFinishedTask(dag: Dag, dagPath: string, task: Task) {
  const done = loadDoneFile(dagPath);
  if (!done.tasks.some((entry) => entry.id === task.id)) {
    done.tasks.push(task);
  }
  writeJson(donePathFor(dagPath), done);
  dag.tasks = dag.tasks.filter((entry) => entry.id !== task.id);
  writeJson(dagPath, dag);
}

function appendHistory(entry: {
  ts: string;
  dagFile: string;
  nodeId: string;
  commit: string;
  sha: string;
  durationMs: number;
  status: "finished" | "failed";
}) {
  mkdirSync(historyDir, { recursive: true });
  appendFileSync(historyPath, JSON.stringify(entry) + "\n");
}

function loadState(): { done: string[] } {
  if (!existsSync(metadataStatePath)) {
    return { done: [] };
  }
  return JSON.parse(readFileSync(metadataStatePath, "utf8")) as { done: string[] };
}

function saveState(done: string[]) {
  mkdirSync(metadataDir, { recursive: true });
  writeFileSync(metadataStatePath, JSON.stringify({ done }, null, 2));
}

function persistAgentId(agentId: string) {
  mkdirSync(metadataDir, { recursive: true });
  writeFileSync(metadataAgentIdPath, agentId + "\n", "utf8");
}

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
      if (!entry.isDirectory() || skipWalkNames.has(entry.name) || entry.name.startsWith(".")) {
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

function buildRepoBriefing(task: Task, commitNow: boolean): string {
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
    "Exact git commit subject (COMMIT NOW only, copy verbatim):",
    task.commit,
    "Repo packages:",
    ...listRepoPackages().map((line) => "- " + line),
    "This node tests:",
    ...formatNodeTests(task.tests).map((line) => "- " + line),
    "Forbidden paths / actions:",
    ...forbidden.map((line) => "- " + line),
  ].join("\n");
}

function tddEnabled(task: Task): boolean {
  return task.tests.length > 0;
}

function runTests(tests: TestSpec[]): { ok: boolean; output: string } {
  if (!tests.length) {
    return { ok: true, output: "no tests for this node" };
  }
  let output = "";
  for (const spec of tests) {
    const cwd = join(repoRoot, spec.cwd);
    if (!existsSync(cwd)) {
      return { ok: false, output: "missing cwd " + spec.cwd };
    }
    phase("TEST", spec.cmd + " " + spec.args.join(" ") + " in " + spec.cwd);
    const result = spawnSync(spec.cmd, spec.args, {
      cwd,
      encoding: "utf8",
      shell: process.platform === "win32",
      env: process.env,
    });
    output += (result.stdout || "") + (result.stderr || "");
    if (result.status !== 0) {
      return { ok: false, output };
    }
  }
  return { ok: true, output };
}

function commitMessageValid(message: string): boolean {
  return /^(feat|fix|refactor|perf|test|docs|style|chore|build|ci)(\([a-z0-9-]+\))?: [a-z][^\n.]*$/.test(
    message.trim()
  );
}

function runGit(args: string[]) {
  return spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function isBlockedCommitPath(file: string): boolean {
  if (
    blockedCommitPaths.some(
      (blocked) =>
        file === blocked ||
        file.endsWith("/" + blocked) ||
        file.endsWith("/.env") ||
        file.includes("/.env.")
    )
  ) {
    return true;
  }
  const n = file.replace(/\\/g, "/");
  return (
    n.endsWith("failures.log") ||
    n.endsWith("metadata/agent-id") ||
    n.endsWith("history/nodes.jsonl") ||
    /(?:^|\/)logs\/.*\.log$/.test(n)
  );
}

function stagedTouchesBlockedPath(): boolean {
  const diff = runGit(["diff", "--cached", "--name-only"]);
  const files = (diff.stdout || "").split(/\r?\n/).filter(Boolean);
  return files.some((file: string) => isBlockedCommitPath(file));
}

function orchestratorCommit(message: string, allowEmpty: boolean | undefined): boolean {
  if (!commitMessageValid(message)) {
    log("commit message rejected: " + message);
    return false;
  }
  runGit(["add", "-A"]);
  runGit([
    "reset",
    "HEAD",
    "--",
    "dag/logs/failures.log",
    "dag/metadata/agent-id",
    "dag/history/nodes.jsonl",
  ]);
  if (stagedTouchesBlockedPath()) {
    runGit(["reset", "HEAD"]);
    log("commit aborted: staged blocked path");
    return false;
  }
  const commit = runGit([
    "-c",
    "user.name=" + gitAuthorName,
    "-c",
    "user.email=" + gitAuthorEmail,
    "commit",
    "-m",
    message,
  ]);
  if (commit.status === 0) {
    log("committed " + message);
    return true;
  }
  const text = (commit.stdout || "") + (commit.stderr || "");
  if (allowEmpty && /nothing to commit/i.test(text)) {
    log("no changes to commit for this node");
    return true;
  }
  log("commit failed: " + text);
  return false;
}

function gitHead(): string {
  return (runGit(["rev-parse", "HEAD"]).stdout || "").trim();
}

function lastCommitSubject(): string {
  return (runGit(["log", "-1", "--format=%s"]).stdout || "").trim();
}

async function runAgentTask(
  agent: AgentHandle,
  prompt: string,
  task: Task,
  commitNow = false
): Promise<void> {
  const turn = commitNow
    ? "COMMIT NOW. git commit with the exact subject from the briefing. No extra subject words, no --no-verify, no git push, no amend, no further code edits.\n\n"
    : "Do not git commit on this turn.\n\n";
  const run = await agent.send(
    protocolPreamble + "\n\n" + turn + prompt + "\n\n" + buildRepoBriefing(task, commitNow)
  );
  log("run.id=" + run.id);
  const result = await run.wait();
  log("run.status=" + result.status);
  if (result.status !== "finished") {
    const detail = result.error?.message || result.status;
    throw new Error("agent run " + result.status + " id=" + run.id + " " + detail);
  }
}

function runGuard(): { ok: boolean; output: string } {
  phase("GUARD", ".cursor/hooks/guard-anti-patterns.mjs");
  const result = spawnSync(
    "node",
    [join(repoRoot, ".cursor", "hooks", "guard-anti-patterns.mjs")],
    {
      cwd: repoRoot,
      encoding: "utf8",
    }
  );
  const output = (result.stdout || "") + (result.stderr || "");
  if (result.status !== 0) {
    return { ok: false, output: output || "guard-anti-patterns failed" };
  }
  return { ok: true, output };
}

function applyInfra(): { ok: boolean; output: string } {
  const diff = runGit(["diff", "HEAD", "--", "docker-compose.yml", ".env.example"]);
  if (!(diff.stdout || "").trim()) {
    return { ok: true, output: "infra unchanged" };
  }
  phase("UP", "docker compose up --build -d");
  return composeReload(repoRoot);
}

function validateNode(tests: TestSpec[]): { ok: boolean; output: string } {
  const infra = applyInfra();
  if (!infra.ok) {
    return infra;
  }
  const guard = runGuard();
  if (!guard.ok) {
    return guard;
  }
  return runTests(tests);
}

function revertTrackedChanges() {
  log("reverting tracked files with git reset --hard HEAD");
  runGit(["reset", "--hard", "HEAD"]);
}

function recordFailure(taskId: string, output: string) {
  const stamp = new Date().toISOString();
  const body =
    stamp +
    " node=" +
    taskId +
    "\n" +
    output.slice(0, 8000) +
    "\n---\n";
  mkdirSync(logsDir, { recursive: true });
  appendFileSync(failuresLogPath, body, "utf8");
  log("wrote " + failuresLogPath);
}

async function runTddRed(agent: AgentHandle, task: Task): Promise<void> {
  phase("RED", task.id);
  await runAgentTask(
    agent,
    "DAG node " +
      task.id +
      " TDD RED only. Write or extend failing tests for this ticket. Do not change production code except if tests cannot compile. Do not commit.\n" +
      task.prompt,
    task
  );
  let red = runTests(task.tests);
  for (let attempt = 0; red.ok && attempt < maxRedAttempts; attempt += 1) {
    log("tests still green, red attempt " + (attempt + 1) + " for " + task.id);
    await runAgentTask(
      agent,
      "Tests are green before production change for node " +
        task.id +
        ". Add a test that fails on current HEAD for this ticket then stop. Do not implement production code. Do not commit.",
      task
    );
    red = runTests(task.tests);
  }
  if (red.ok) {
    log("tdd red skipped, tests stayed green after " + maxRedAttempts + " attempts");
  } else {
    log("tdd red confirmed for " + task.id);
  }
}

function porcelainPath(line: string): string {
  const rest = line.slice(3).trim();
  const arrow = rest.indexOf(" -> ");
  const raw = arrow >= 0 ? rest.slice(arrow + 4) : rest;
  return raw.replace(/\\/g, "/").replace(/^"/, "").replace(/"$/, "");
}

function isControlledDirty(file: string): boolean {
  const n = file.replace(/\\/g, "/");
  if (
    n === "dag/metadata/state.json" ||
    n === "dag/metadata/task.json" ||
    n === "dag/metadata/agent-id" ||
    n === "dag/metadata/init.last.json"
  ) {
    return true;
  }
  if (n.startsWith("dag/metadata/") && n.endsWith(".done.json")) {
    return true;
  }
  if (n.startsWith("dag/history/")) {
    return true;
  }
  return n.startsWith("dag/logs/") && n.endsWith(".log");
}

function preflight() {
  const branch = runGit(["branch", "--show-current"]);
  const name = (branch.stdout || "").trim();
  log("git branch=" + name);
  if (name === "main" || name === "master") {
    log("create a dedicated branch before the loop");
    process.exit(1);
  }
  const status = runGit(["status", "--porcelain"]);
  const dirty = (status.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .filter((line) => !isControlledDirty(porcelainPath(line)));
  if (dirty.length) {
    log("working tree is dirty; commit first");
    process.exit(1);
  }
}

async function finishNodeCommit(agent: AgentHandle, task: Task): Promise<boolean> {
  if (!commitMessageValid(task.commit)) {
    log("commit message rejected: " + task.commit);
    return false;
  }
  phase("COMMIT NOW", task.commit);
  const before = gitHead();
  try {
    await runAgentTask(
      agent,
      "DAG node " +
        task.id +
        " COMMIT NOW. Stage ticket files. Do not stage .env, dag/metadata/state.json, dag/metadata/agent-id, or dag/logs/failures.log. Run git -c user.name=" +
        gitAuthorName +
        " -c user.email=" +
        gitAuthorEmail +
        " commit -m " +
        JSON.stringify(task.commit) +
        " with that subject only.",
      task,
      true
    );
  } catch (err) {
    log("agent commit turn failed: " + String(err));
  }
  const after = gitHead();
  if (after !== before) {
    if (lastCommitSubject() === task.commit) {
      log("committed " + task.commit);
      return true;
    }
    log("agent commit subject mismatch, rewriting");
    runGit(["reset", "--soft", "HEAD~1"]);
  }
  return orchestratorCommit(task.commit, task.allowEmptyCommit);
}

function endSummary(dag: Dag) {
  const elapsed = Date.now() - runStartedAt;
  log(
    "run end: " +
      dag.title +
      " nodes_ok=" +
      nodesOk +
      " remaining=" +
      dag.tasks.length +
      " duration_ms=" +
      elapsed
  );
}

export type LoopOpts = {
  dagPath?: string;
  provider?: ProviderName;
  allowPullRequest?: boolean;
};

export async function runLoop(opts: LoopOpts = {}): Promise<number> {
  initRunLog();
  activeDagPath = opts.dagPath ? resolveDagFile(opts.dagPath) : metadataDagPath;
  const selected = resolveProvider(opts.provider);
  if (!selected.provider) {
    log("set CURSOR_API_KEY or ANTHROPIC_API_KEY / CLAUDE_API_KEY");
    return 1;
  }
  log("provider=" + selected.provider);
  preflight();
  const dag = loadDag(activeDagPath);
  const state = loadState();
  mkdirSync(logsDir, { recursive: true });

  await using agent = await createAgentHandle({
    provider: selected.provider,
    model: dag.model,
    cwd: repoRoot,
    cursorKey: selected.cursorKey,
    claudeKey: selected.claudeKey,
  });
  log("agent.id=" + agent.id);
  persistAgentId(agent.id);

  for (const task of dag.tasks) {
    if (state.done.includes(task.id)) {
      phase("SKIP", task.id);
      continue;
    }
    nodeSeparator(task.id);
    const nodeStarted = Date.now();
    log("start " + task.id);
    if (tddEnabled(task)) {
      await runTddRed(agent, task);
      phase("GREEN", task.id);
      await runAgentTask(
        agent,
        "DAG node " +
          task.id +
          " TDD GREEN. Implement minimal production code for this ticket. Put backend code in src/backend and UI in src/frontend. If you need a database, edit docker-compose.yml and .env.example only (never .env). Do not commit.\n" +
          task.prompt,
        task
      );
    } else {
      phase("GREEN", task.id);
      await runAgentTask(agent, "DAG node " + task.id + ". " + task.prompt, task);
    }

    let tests = validateNode(task.tests);
    for (let round = 0; !tests.ok && round < maxFixRounds; round += 1) {
      log("validation red, fix round " + (round + 1) + " for " + task.id);
      await runAgentTask(
        agent,
        "Validation failed for node " +
          task.id +
          ". Fix the root cause. Do not commit. Do not skip tests. Output:\n" +
          tests.output.slice(0, 8000),
        task
      );
      tests = validateNode(task.tests);
    }
    if (!tests.ok) {
      phase("FAIL", task.id);
      recordFailure(task.id, tests.output);
      appendHistory({
        ts: new Date().toISOString(),
        dagFile: activeDagPath,
        nodeId: task.id,
        commit: task.commit,
        sha: gitHead(),
        durationMs: Date.now() - nodeStarted,
        status: "failed",
      });
      revertTrackedChanges();
      log("stopping, validation still red on " + task.id);
      endSummary(dag);
      return 2;
    }
    if (!(await finishNodeCommit(agent, task))) {
      phase("FAIL", "commit " + task.id);
      appendHistory({
        ts: new Date().toISOString(),
        dagFile: activeDagPath,
        nodeId: task.id,
        commit: task.commit,
        sha: gitHead(),
        durationMs: Date.now() - nodeStarted,
        status: "failed",
      });
      endSummary(dag);
      return 2;
    }
    phase("ARCHIVE", task.id);
    archiveFinishedTask(dag, activeDagPath, task);
    if (!orchestratorCommit("chore(config): archive dag node " + task.id, true)) {
      log("archive written but chore commit failed for " + task.id);
      endSummary(dag);
      return 2;
    }
    state.done.push(task.id);
    saveState(state.done);
    appendHistory({
      ts: new Date().toISOString(),
      dagFile: activeDagPath,
      nodeId: task.id,
      commit: task.commit,
      sha: gitHead(),
      durationMs: Date.now() - nodeStarted,
      status: "finished",
    });
    nodesOk += 1;
    log("finished " + task.id);
  }
  endSummary(dag);
  if (opts.allowPullRequest) {
    const pr = createPullRequest(repoRoot, dag.title, "Automated DAG run: " + dag.title);
    if (!pr.ok) {
      log("pull request failed: " + pr.output);
      return 1;
    }
    log("pull request " + pr.output);
  }
  return 0;
}
