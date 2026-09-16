import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  appendHistory,
  archiveFinishedTask,
  loadState,
  persistAgentId,
  saveState,
} from "./archive.js";
import { buildRepoBriefing, protocolPreamble, redPhaseRules } from "./briefing.js";
import { ciWorkflowRel, syncCiWorkflow } from "./ci.js";
import { commitMessageValid } from "./commit.js";
import {
  gitHead,
  isControlledDirty,
  lastCommitSubject,
  orchestratorCommit,
  porcelainPath,
  revertTrackedChanges,
  runGit,
} from "./git-run.js";
import {
  aheadBehind,
  missingGitIdentityHint,
  pushHead,
  pushHint,
  requireGitIdentity,
} from "./init/git.js";
import { syncProductEnv } from "./init/env-sync.js";
import { composeReload } from "./init/up.js";
import {
  failuresLogPath,
  logsDir,
  metadataDagPath,
  repoRoot,
  resolveDagFile,
} from "./paths.js";
import { mergeOpenPullRequest, openOrReusePullRequest } from "./pr.js";
import { createAgentHandle } from "./providers/create.js";
import type { AgentHandle } from "./providers/types.js";
import { resolveProvider } from "./providers/select.js";
import { recordPhase } from "./knowledge/state/record-phase.js";
import type { LoopPhaseEvent } from "./knowledge/state/types.js";
import { initRunLog, log, nodeSeparator, phase } from "./run-log.js";
import type { ProviderName } from "./cli.js";
import type { Dag, Task, TestSpec } from "./types.js";

const maxFixRounds = 5;
const maxRedAttempts = 2;

let nodesOk = 0;
let publishFailed = false;
let activeDagPath = metadataDagPath;
let activeRunId = "";
const runStartedAt = Date.now();

function gitBranch(): string {
  return (runGit(["branch", "--show-current"]).stdout || "").trim();
}

function loopWorkspace(): { branch: string; commit: string } {
  return { branch: gitBranch(), commit: gitHead() };
}

function captureLoopPhase(
  dag: Dag,
  task: Task | undefined,
  event: LoopPhaseEvent,
  nextAction: string,
  extra?: Omit<Parameters<typeof recordPhase>[0], "run_id" | "dag_title" | "node_id" | "event" | "workspace" | "next_action" | "repo_root">
): void {
  if (!activeRunId) {
    return;
  }
  recordPhase({
    run_id: activeRunId,
    dag_title: dag.title,
    node_id: task?.id ?? "",
    event,
    workspace: loopWorkspace(),
    next_action: nextAction,
    repo_root: repoRoot,
    ...extra,
  });
}

function loadDag(dagPath: string): Dag {
  if (!existsSync(dagPath)) {
    log("DAG file not found: " + dagPath);
    process.exit(1);
  }
  return JSON.parse(readFileSync(dagPath, "utf8")) as Dag;
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

function syncEnv(): void {
  const added = syncProductEnv(repoRoot);
  if (added.length) {
    log("synced .env keys: " + added.join(","));
  }
}

function applyInfra(): { ok: boolean; output: string } {
  syncEnv();
  const diff = runGit(["diff", "HEAD", "--", "docker-compose.yml", ".env.example"]);
  if (!(diff.stdout || "").trim()) {
    return { ok: true, output: "infra unchanged" };
  }
  phase("UP", "docker compose up --build -d");
  return composeReload(repoRoot);
}

function applyCi(): { ok: boolean; output: string } {
  phase("CI", ciWorkflowRel);
  const synced = syncCiWorkflow(repoRoot);
  log(synced.reason);
  return { ok: true, output: synced.reason };
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
  const tested = runTests(tests);
  if (!tested.ok) {
    return tested;
  }
  return applyCi();
}

function recordFailure(taskId: string, output: string) {
  const stamp = new Date().toISOString();
  const body =
    stamp + " node=" + taskId + "\n" + output.slice(0, 8000) + "\n---\n";
  mkdirSync(logsDir, { recursive: true });
  appendFileSync(failuresLogPath, body, "utf8");
  log("wrote " + failuresLogPath);
}

async function runTddRed(agent: AgentHandle, task: Task, dag: Dag): Promise<void> {
  captureLoopPhase(dag, task, "red_started", "agent-red-send");
  phase("RED", task.id);
  await runAgentTask(
    agent,
    "DAG node " +
      task.id +
      " TDD RED only. " +
      redPhaseRules +
      " Do not commit.\n" +
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

function preflight() {
  try {
    requireGitIdentity(repoRoot);
  } catch {
    log(missingGitIdentityHint);
    process.exit(1);
  }
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
    for (const line of dirty.slice(0, 20)) {
      log(line);
    }
    process.exit(1);
  }
}

function warnIfOriginDiverged() {
  runGit(["fetch", "origin"]);
  const ab = aheadBehind(repoRoot);
  if (!ab || ab.behind === 0) {
    return;
  }
  log(
    "origin is ahead or diverged (ahead " +
      ab.ahead +
      " behind " +
      ab.behind +
      "). push will fetch, rebase local commits onto origin, then push. never --force."
  );
}

function publishNode(title: string): void {
  phase("PUSH", "origin HEAD");
  const pushed = pushHead(repoRoot);
  if (!pushed.ok) {
    publishFailed = true;
    log("push failed: " + pushed.reason);
    log(pushHint(pushed.reason));
    return;
  }
  phase("PR", title);
  const pr = openOrReusePullRequest(
    repoRoot,
    title,
    "Automated DAG run: " + title
  );
  if (!pr.ok) {
    publishFailed = true;
    log("pull request failed: " + pr.output);
  } else {
    log("pull request " + pr.output);
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
        " COMMIT NOW. Stage ticket files and .github/workflows/ci.yml if present. Do not stage .env, dag/metadata/state.json, dag/metadata/agent-id, or dag/logs/failures.log. Run git commit -m " +
        JSON.stringify(task.commit) +
        " with that subject only. Use the existing git user.name / user.email (do not invent an author).",
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
      commitGeneratedCi();
      return true;
    }
    log("agent commit subject mismatch, rewriting");
    runGit(["reset", "--soft", "HEAD~1"]);
  }
  const ok = orchestratorCommit(task.commit, task.allowEmptyCommit);
  if (ok) {
    commitGeneratedCi();
  }
  return ok;
}

function commitGeneratedCi(): void {
  runGit(["add", "--", ciWorkflowRel]);
  const staged = (runGit(["diff", "--cached", "--name-only"]).stdout || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\\/g, "/"))
    .filter(Boolean);
  if (!staged.includes(ciWorkflowRel)) {
    return;
  }
  phase("CI", "commit " + ciWorkflowRel);
  orchestratorCommit("chore(ci): sync workflow", false);
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
  push?: boolean;
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
  syncEnv();
  if (opts.push !== false) {
    warnIfOriginDiverged();
  }
  const dag = loadDag(activeDagPath);
  const state = loadState();
  mkdirSync(logsDir, { recursive: true });
  activeRunId = randomUUID();
  captureLoopPhase(dag, undefined, "run_started", "load-plan");
  captureLoopPhase(dag, undefined, "plan_created", "start-first-node");

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
    syncEnv();
    captureLoopPhase(dag, task, "node_started", tddEnabled(task) ? "tdd-red" : "agent-green");
    if (tddEnabled(task)) {
      await runTddRed(agent, task, dag);
      captureLoopPhase(dag, task, "green_started", "agent-green-send");
      phase("GREEN", task.id);
      await runAgentTask(
        agent,
        "DAG node " +
          task.id +
          " TDD GREEN. Implement minimal production code for this ticket. Put application code in src/. Match the node language (package.json+yarn / pyproject+uv pytest / go.mod+go test / Cargo.toml+cargo test). If you need a database, edit docker-compose.yml and .env.example only (never .env). Do not commit.\n" +
          task.prompt,
        task
      );
    } else {
      captureLoopPhase(dag, task, "green_started", "agent-green-send");
      phase("GREEN", task.id);
      await runAgentTask(agent, "DAG node " + task.id + ". " + task.prompt, task);
    }

    captureLoopPhase(dag, task, "verification_started", "run-guard-and-tests");
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
      captureLoopPhase(dag, task, "node_failed", "stop-run", {
        status: "failed",
        failure: { type: "validation", signature: "node-validation-failed" },
      });
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
    captureLoopPhase(dag, task, "verification_completed", "commit-or-fix", {
      tests: { passed: Math.max(task.tests.length, 1), failed: 0 },
    });
    if (!(await finishNodeCommit(agent, task))) {
      phase("FAIL", "commit " + task.id);
      captureLoopPhase(dag, task, "node_failed", "stop-run", {
        status: "failed",
        failure: { type: "commit", signature: "node-commit-failed" },
      });
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
    captureLoopPhase(dag, task, "commit_created", "archive");
    phase("ARCHIVE", task.id);
    captureLoopPhase(dag, task, "node_archived", "next-node");
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
    if (opts.push !== false) {
      publishNode(dag.title);
    }
  }
  captureLoopPhase(dag, undefined, "run_completed", "done");
  endSummary(dag);
  if (opts.push !== false && !publishFailed && nodesOk > 0) {
    phase("MERGE", "main");
    const merged = mergeOpenPullRequest(repoRoot);
    if (!merged.ok) {
      publishFailed = true;
      log("merge failed: " + merged.output);
    } else {
      log("merged " + merged.output);
    }
  }
  if (publishFailed) {
    log("nodes finished; origin publish incomplete");
    return 2;
  }
  return 0;
}
