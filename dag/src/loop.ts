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
  historyPath,
  logsDir,
  metadataDagPath,
  repoRoot,
  resolveDagFile,
  statusPath,
} from "./paths.js";
import { loadProjectMcp } from "./mcp.js";
import { mergeOpenPullRequest, openOrReusePullRequest } from "./pr.js";
import { createAgentHandle } from "./providers/create.js";
import type { AgentHandle } from "./providers/types.js";
import { resolveProvider } from "./providers/select.js";
import { recordPhase } from "./knowledge/state/record-phase.js";
import { resolveAgentMemoryRoot } from "./knowledge/state/paths.js";
import type { LoopPhaseEvent } from "./knowledge/state/types.js";
import { buildNodeSendContext } from "./knowledge/context/build-node-send-context.js";
import type { NodeSendContextResult } from "./knowledge/context/loop-context.js";
import {
  deriveValidationFailurePair,
  evaluateRepeatFailureFixRound,
} from "./knowledge/diagnostics/repeat-failure-strategy.js";
import { cannotStart, resolveOperatorGate } from "./confirm-continue.js";
import { extractRunLogCrash, lastFailuresLogBlock } from "./crash-log.js";
import { formatParentHistory } from "./history-brief.js";
import {
  initRunLog,
  log,
  logRunHeader,
  logTokenUsage,
  currentRunLogPath,
  nodeSeparator,
  phase,
  step,
} from "./run-log.js";
import {
  firstFailReason,
  formatGreenSummary,
  formatTestCommand,
  formatTestResult,
  greenSummaryBullets,
  summarizeAgentText,
} from "./runtime-ui.js";
import { assembleExtraContext, capFilesHint, pickCrashSlice } from "./send-budget.js";
import { writeStatusFile, type StatusSnapshot } from "./status.js";
import type { McpCall } from "./stream-events.js";
import {
  addTokenUsage,
  formatTokenUsageLine,
  unknownTokenUsage,
  type TokenUsage,
} from "./token-usage.js";
import { isUnattendedMode, shouldMergeToMain } from "./unattended.js";
import type { ProviderName } from "./cli.js";
import type { Dag, Task, TestSpec } from "./types.js";

const maxFixRounds = 5;
const maxRedAttempts = 2;

let nodesOk = 0;
let publishFailed = false;
let activeDagPath = metadataDagPath;
let activeRunId = "";
let activeUnattended = false;
let allowMergeMain = false;
const runStartedAt = Date.now();
let statusSnap: StatusSnapshot = {
  ts: "",
  runId: "",
  dagFile: "",
  nodeId: "-",
  progress: "0/0",
  phase: "START",
  lastTest: "-",
  tokenUsage: "unknown",
  state: "RUNNING",
};

function bumpStatus(partial: Partial<StatusSnapshot>): void {
  statusSnap = {
    ...statusSnap,
    ts: new Date().toISOString(),
    runId: activeRunId || statusSnap.runId,
    dagFile: activeDagPath,
    ...partial,
  };
  writeStatusFile(statusPath, statusSnap);
}

async function fatalStart(reason: string): Promise<number> {
  bumpStatus({ phase: "PAUSE", state: "PAUSED", lastTest: reason.slice(0, 160) });
  if (activeUnattended) {
    log("UNATTENDED fatal-start: " + reason);
    return 1;
  }
  return cannotStart(reason);
}

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

type SendOutcome = {
  ok: boolean;
  stop: boolean;
  text: string;
  mcpCalls: McpCall[];
  usage: TokenUsage;
};

const sendStop: SendOutcome = {
  ok: false,
  stop: true,
  text: "",
  mcpCalls: [],
  usage: unknownTokenUsage(),
};
const sendSkip: SendOutcome = {
  ok: false,
  stop: false,
  text: "",
  mcpCalls: [],
  usage: unknownTokenUsage(),
};

function loadDag(dagPath: string): Dag | null {
  if (!existsSync(dagPath)) {
    log("DAG file not found: " + dagPath);
    return null;
  }
  return JSON.parse(readFileSync(dagPath, "utf8")) as Dag;
}

function tddEnabled(task: Task): boolean {
  return task.tests.length > 0;
}

function inferFilesHintFromPrompt(prompt: string): string[] {
  const pattern = /(?:[\w.-]+\/)+[\w.-]+\.(?:ts|tsx|js|jsx|py|go|rs)/gi;
  const found = prompt.match(pattern) ?? [];
  return [...new Set(found.map((part) => part.replace(/\\/g, "/")))];
}

function dirtyFiles(): string[] {
  return (runGit(["status", "--porcelain"]).stdout || "")
    .split(/\r?\n/)
    .filter(Boolean)
    .map(porcelainPath)
    .filter((file) => !isControlledDirty(file))
    .slice(0, 8);
}

function collectFilesHint(task: Task): string[] {
  return capFilesHint([
    ...inferFilesHintFromPrompt(task.prompt),
    ...task.tests.map((spec) => spec.cwd.replace(/\\/g, "/")),
    ...dirtyFiles(),
  ]);
}

function parentHistoryBlock(): string {
  if (!existsSync(historyPath)) {
    return "";
  }
  return formatParentHistory({
    jsonl: readFileSync(historyPath, "utf8"),
    dagFile: activeDagPath,
  });
}

function repairCrashText(nodeId: string, liveOutput: string): string {
  const failures = existsSync(failuresLogPath)
    ? lastFailuresLogBlock(readFileSync(failuresLogPath, "utf8"), nodeId)
    : "";
  const runPath = currentRunLogPath();
  const runExtract =
    runPath && existsSync(runPath)
      ? extractRunLogCrash(readFileSync(runPath, "utf8"), nodeId)
      : "";
  return pickCrashSlice({
    liveOutput,
    failuresLogBlock: failures,
    runLogExtract: runExtract,
  }).text;
}

function tokenUsageOf(result: { tokenUsage?: TokenUsage }): TokenUsage {
  return result.tokenUsage ?? unknownTokenUsage();
}

function runTests(tests: TestSpec[]): { ok: boolean; output: string } {
  if (!tests.length) {
    return { ok: true, output: "no tests for this node" };
  }
  let output = "";
  for (const spec of tests) {
    const cwd = join(repoRoot, spec.cwd);
    log(formatTestCommand(spec.cmd, spec.args, spec.cwd));
    step("running " + spec.cmd + " " + spec.args.join(" ") + " in " + spec.cwd);
    if (!existsSync(cwd)) {
      log(formatTestResult(false, "missing cwd " + spec.cwd));
      return { ok: false, output: "missing cwd " + spec.cwd };
    }
    phase("TEST", spec.cmd + " " + spec.args.join(" ") + " in " + spec.cwd);
    const result = spawnSync(spec.cmd, spec.args, {
      cwd,
      encoding: "utf8",
      shell: process.platform === "win32",
      env: process.env,
    });
    const chunk = (result.stdout || "") + (result.stderr || "");
    output += chunk;
    if (result.status !== 0) {
      log(formatTestResult(false, firstFailReason(chunk, result.status)));
      bumpStatus({
        lastTest: "FAIL " + firstFailReason(chunk, result.status),
        state: "RUNNING",
      });
      return { ok: false, output };
    }
    log(formatTestResult(true, "exit 0"));
    bumpStatus({ lastTest: "PASS exit 0", state: "RUNNING" });
  }
  return { ok: true, output };
}

async function runAgentTask(
  agent: AgentHandle,
  prompt: string,
  task: Task,
  commitNow = false,
  sendContext?: NodeSendContextResult
): Promise<SendOutcome> {
  const turn = commitNow
    ? "COMMIT NOW. git commit with the exact subject from the briefing. No extra subject words, no --no-verify, no git push, no amend, no further code edits.\n\n"
    : "Do not git commit on this turn.\n\n";
  const prefix = sendContext?.inspect_prefix ?? "";
  const contextBlock =
    sendContext && sendContext.context_briefing.trim().length > 0
      ? sendContext.context_briefing + "\n\n"
      : "";
  const body =
    protocolPreamble +
    "\n\n" +
    turn +
    prefix +
    prompt +
    "\n\n" +
    contextBlock +
    buildRepoBriefing(task, commitNow);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    step(attempt === 0 ? "waiting for agent send" : "retrying agent send once");
    try {
      const run = await agent.send(body);
      log("run.id=" + run.id);
      const result = await run.wait();
      log("run.status=" + result.status);
      const mcpCalls = result.mcpCalls ?? [];
      const usage = tokenUsageOf(result);
      if (result.status === "finished") {
        return {
          ok: true,
          stop: false,
          text: result.text || result.result || "",
          mcpCalls,
          usage,
        };
      }
      const detail = result.error?.message || result.status;
      const gate = await resolveOperatorGate(
        activeUnattended,
        attempt === 0 ? "preflight-soft" : "skip-node",
        "agent run " + result.status + " id=" + run.id + " " + detail,
        attempt === 0 ? "retry the send once" : "skip this agent turn"
      );
      if (gate === "stop") {
        return { ...sendStop, usage };
      }
      if (gate === "skip-node" || attempt === 1) {
        return { ok: false, stop: false, text: result.text || "", mcpCalls, usage };
      }
    } catch (err) {
      const gate = await resolveOperatorGate(
        activeUnattended,
        attempt === 0 ? "preflight-soft" : "skip-node",
        String(err),
        attempt === 0 ? "retry the send once" : "skip this agent turn"
      );
      if (gate === "stop") {
        return sendStop;
      }
      if (gate === "skip-node") {
        return sendSkip;
      }
    }
  }
  return sendSkip;
}

async function runAgentTaskWithContext(
  agent: AgentHandle,
  dag: Dag,
  task: Task,
  prompt: string,
  commitNow: boolean,
  nextAction: string,
  extra?: { crash?: string; usageAcc?: { usage: TokenUsage } }
): Promise<SendOutcome> {
  phase("CONTEXT", "build node context");
  const filesHint = collectFilesHint(task);
  const sendContext = buildNodeSendContext({
    nodePrompt: task.prompt,
    filesHint,
    codebase_root: repoRoot,
    memory_root: resolveAgentMemoryRoot(repoRoot),
    repo_root: repoRoot,
  });
  const extraBlock = assembleExtraContext({
    crash: extra?.crash,
    similarFailures: sendContext.similar_failures,
    parentHistory: parentHistoryBlock(),
    knowledgeBriefing: sendContext.knowledge_core,
    filesHint,
    omitParentHistory: commitNow,
  });
  captureLoopPhase(dag, task, "context_built", nextAction, {
    context: {
      memory_ids: sendContext.memory_ids,
      files: sendContext.context_files,
    },
  });
  const outcome = await runAgentTask(
    agent,
    prompt,
    task,
    commitNow,
    { ...sendContext, context_briefing: extraBlock }
  );
  logTokenUsage(formatTokenUsageLine(task.id, outcome.usage));
  bumpStatus({ tokenUsage: formatTokenUsageLine(task.id, outcome.usage) });
  if (extra?.usageAcc) {
    extra.usageAcc.usage = addTokenUsage(extra.usageAcc.usage, outcome.usage);
  }
  return outcome;
}

function printGreenSummary(outcome: SendOutcome): void {
  const bullets = greenSummaryBullets({
    did: summarizeAgentText(outcome.text),
    files: dirtyFiles(),
    mcpUsed: outcome.mcpCalls.length > 0,
    nextPhase: "GUARD",
  });
  for (const line of formatGreenSummary(bullets)) {
    log(line);
  }
}

function runGuard(): { ok: boolean; output: string } {
  phase("GUARD", ".cursor/hooks/guard-anti-patterns.mjs");
  bumpStatus({ phase: "GUARD", state: "RUNNING" });
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

function markNodeFailed(
  task: Task,
  nodeStarted: number,
  output: string,
  tokens: TokenUsage
): void {
  recordFailure(task.id, output);
  appendHistory({
    ts: new Date().toISOString(),
    dagFile: activeDagPath,
    nodeId: task.id,
    commit: task.commit,
    sha: gitHead(),
    durationMs: Date.now() - nodeStarted,
    status: "failed",
    tokens,
  });
}

function skipOrStopSend(
  dag: Dag,
  task: Task,
  nodeStarted: number,
  outcome: SendOutcome,
  detail: string,
  tokens: TokenUsage
): "skip" | "stop" {
  markNodeFailed(task, nodeStarted, detail, tokens);
  if (outcome.stop) {
    bumpStatus({
      phase: "PAUSE",
      state: "PAUSED",
      lastTest: detail.slice(0, 160),
    });
    endSummary(dag);
    return "stop";
  }
  bumpStatus({
    phase: "SKIP",
    state: "SKIPPED",
    lastTest: detail.slice(0, 160),
  });
  log("operator continued; skipping archive for " + task.id + " and moving to next node");
  return "skip";
}

async function runTddRed(
  agent: AgentHandle,
  task: Task,
  dag: Dag,
  usageAcc: { usage: TokenUsage }
): Promise<SendOutcome> {
  captureLoopPhase(dag, task, "red_started", "agent-red-send");
  phase("RED", task.id);
  bumpStatus({ nodeId: task.id, phase: "RED", state: "RUNNING" });
  step("waiting for agent RED send");
  const first = await runAgentTaskWithContext(
    agent,
    dag,
    task,
    "DAG node " +
      task.id +
      " TDD RED only. " +
      redPhaseRules +
      " Do not commit.\n" +
      task.prompt,
    false,
    "agent-red-send",
    { usageAcc }
  );
  if (!first.ok) {
    return first;
  }
  let red = runTests(task.tests);
  for (let attempt = 0; red.ok && attempt < maxRedAttempts; attempt += 1) {
    log("tests still green, red attempt " + (attempt + 1) + " for " + task.id);
    const again = await runAgentTaskWithContext(
      agent,
      dag,
      task,
      "Tests are green before production change for node " +
        task.id +
        ". Add a test that fails on current HEAD for this ticket then stop. Do not implement production code. Do not commit.",
      false,
      "agent-red-resend",
      { usageAcc }
    );
    if (!again.ok) {
      return again;
    }
    red = runTests(task.tests);
  }
  if (red.ok) {
    log("tdd red skipped, tests stayed green after " + maxRedAttempts + " attempts");
  } else {
    log("tdd red confirmed for " + task.id);
  }
  return first;
}

async function preflight(): Promise<{ proceed: boolean; disablePush: boolean }> {
  phase("PREFLIGHT", "git identity, branch, working tree");
  bumpStatus({ phase: "PREFLIGHT", state: "RUNNING" });
  try {
    requireGitIdentity(repoRoot);
  } catch {
    await fatalStart(missingGitIdentityHint);
    return { proceed: false, disablePush: false };
  }
  const branch = runGit(["branch", "--show-current"]);
  const name = (branch.stdout || "").trim();
  log("git branch=" + name);
  let disablePush = false;
  if (name === "main" || name === "master") {
    const gate = await resolveOperatorGate(
      activeUnattended,
      "preflight-soft",
      "branch is " + name + "; dedicated branch recommended",
      "exit 1; if you continue, this run will not git push to " + name
    );
    if (gate === "stop") {
      return { proceed: false, disablePush: false };
    }
    disablePush = true;
  }
  const status = runGit(["status", "--porcelain"]);
  const dirty = (status.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .filter((line) => !isControlledDirty(porcelainPath(line)));
  if (dirty.length) {
    log("working tree is dirty");
    for (const line of dirty.slice(0, 20)) {
      log(line);
    }
    const gate = await resolveOperatorGate(
      activeUnattended,
      "preflight-soft",
      "working tree is dirty; commit first",
      "exit 1; if you continue, the loop proceeds on a dirty tree"
    );
    if (gate === "stop") {
      return { proceed: false, disablePush: disablePush };
    }
  }
  return { proceed: true, disablePush };
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

async function finishNodeCommit(
  agent: AgentHandle,
  task: Task,
  dag: Dag,
  usageAcc: { usage: TokenUsage }
): Promise<"ok" | "fail" | "stop"> {
  if (!commitMessageValid(task.commit)) {
    log("commit message rejected: " + task.commit);
    return "fail";
  }
  phase("COMMIT", task.commit);
  const before = gitHead();
  const send = await runAgentTaskWithContext(
    agent,
    dag,
    task,
    "DAG node " +
      task.id +
      " COMMIT NOW. Stage ticket files and .github/workflows/ci.yml if present. Do not stage .env, dag/metadata/state.json, dag/metadata/agent-id, or dag/logs/failures.log. Run git commit -m " +
      JSON.stringify(task.commit) +
      " with that subject only. Use the existing git user.name / user.email (do not invent an author).",
    true,
    "agent-commit-send",
    { usageAcc }
  );
  if (send.stop) {
    return "stop";
  }
  const after = gitHead();
  if (after !== before) {
    if (lastCommitSubject() === task.commit) {
      log("committed " + task.commit);
      commitGeneratedCi();
      return "ok";
    }
    log("agent commit subject mismatch, rewriting");
    runGit(["reset", "--soft", "HEAD~1"]);
  }
  const ok = orchestratorCommit(task.commit, task.allowEmptyCommit);
  if (ok) {
    commitGeneratedCi();
    return "ok";
  }
  return "fail";
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
  unattended?: boolean;
  merge?: boolean;
};

export async function runLoop(opts: LoopOpts = {}): Promise<number> {
  initRunLog();
  activeUnattended = isUnattendedMode({
    stdinIsTty: Boolean(process.stdin.isTTY),
    flag: opts.unattended,
  });
  allowMergeMain = Boolean(opts.merge);
  if (activeUnattended) {
    log(
      "UNATTENDED mode (stdin TTY=" +
        String(Boolean(process.stdin.isTTY)) +
        " flag=" +
        String(Boolean(opts.unattended)) +
        ")"
    );
    if (!allowMergeMain) {
      log("UNATTENDED merge-to-main disabled unless --merge");
    }
  }
  activeDagPath = opts.dagPath ? resolveDagFile(opts.dagPath) : metadataDagPath;
  const selected = resolveProvider(opts.provider);
  if (!selected.provider) {
    return fatalStart("set CURSOR_API_KEY or ANTHROPIC_API_KEY / CLAUDE_API_KEY");
  }
  const ready = await preflight();
  if (!ready.proceed) {
    return 1;
  }
  let allowPush = opts.push !== false && !ready.disablePush;
  syncEnv();
  if (allowPush) {
    warnIfOriginDiverged();
  }
  const dag = loadDag(activeDagPath);
  if (!dag) {
    return fatalStart("DAG file not found: " + activeDagPath);
  }
  const mcp = loadProjectMcp(repoRoot);
  logRunHeader({
    provider: selected.provider,
    branch: gitBranch(),
    model: dag.model,
    title: dag.title,
    mcpNames: mcp.names,
  });
  const state = loadState();
  mkdirSync(logsDir, { recursive: true });
  activeRunId = randomUUID();
  bumpStatus({
    runId: activeRunId,
    dagFile: activeDagPath,
    nodeId: "-",
    progress: "0/" + String(dag.tasks.length),
    phase: "START",
    lastTest: "-",
    tokenUsage: "unknown",
    state: "RUNNING",
  });
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

  nodes: for (const task of dag.tasks) {
    if (state.done.includes(task.id)) {
      phase("SKIP", task.id);
      bumpStatus({
        nodeId: task.id,
        progress: String(state.done.length) + "/" + String(dag.tasks.length),
        phase: "SKIP",
        state: "SKIPPED",
      });
      continue;
    }
    nodeSeparator(task.id, task.commit);
    const nodeStarted = Date.now();
    const usageAcc = { usage: unknownTokenUsage() };
    bumpStatus({
      nodeId: task.id,
      progress: String(state.done.length + 1) + "/" + String(dag.tasks.length),
      phase: tddEnabled(task) ? "RED" : "GREEN",
      state: "RUNNING",
      tokenUsage: formatTokenUsageLine(task.id, usageAcc.usage),
    });
    step("starting node " + task.id);
    syncEnv();
    captureLoopPhase(dag, task, "node_started", tddEnabled(task) ? "tdd-red" : "agent-green");
    if (tddEnabled(task)) {
      const red = await runTddRed(agent, task, dag, usageAcc);
      if (!red.ok) {
        phase("FAIL", task.id);
        if (skipOrStopSend(dag, task, nodeStarted, red, "agent RED send failed", usageAcc.usage) === "stop") {
          return 2;
        }
        continue;
      }
      captureLoopPhase(dag, task, "green_started", "agent-green-send");
      phase("GREEN", task.id);
      bumpStatus({ nodeId: task.id, phase: "GREEN", state: "RUNNING" });
      step("waiting for agent GREEN send");
      const green = await runAgentTaskWithContext(
        agent,
        dag,
        task,
        "DAG node " +
          task.id +
          " TDD GREEN. Implement minimal production code for this ticket. Put application code in src/. Match the node language (package.json+yarn / pyproject+uv pytest / go.mod+go test / Cargo.toml+cargo test). If you need a database, edit docker-compose.yml and .env.example only (never .env). Do not commit.\n" +
          task.prompt,
        false,
        "agent-green-send",
        { usageAcc }
      );
      printGreenSummary(green);
      if (!green.ok) {
        phase("FAIL", task.id);
        if (skipOrStopSend(dag, task, nodeStarted, green, "agent GREEN send failed", usageAcc.usage) === "stop") {
          return 2;
        }
        continue;
      }
    } else {
      captureLoopPhase(dag, task, "green_started", "agent-green-send");
      phase("GREEN", task.id);
      bumpStatus({ nodeId: task.id, phase: "GREEN", state: "RUNNING" });
      step("waiting for agent GREEN send");
      const green = await runAgentTaskWithContext(
        agent,
        dag,
        task,
        "DAG node " + task.id + ". " + task.prompt,
        false,
        "agent-green-send",
        { usageAcc }
      );
      printGreenSummary(green);
      if (!green.ok) {
        phase("FAIL", task.id);
        if (skipOrStopSend(dag, task, nodeStarted, green, "agent GREEN send failed", usageAcc.usage) === "stop") {
          return 2;
        }
        continue;
      }
    }

    captureLoopPhase(dag, task, "verification_started", "run-guard-and-tests");
    let tests = validateNode(task.tests);
    for (let round = 0; !tests.ok && round < maxFixRounds; round += 1) {
      phase("REPAIR", "fix round " + (round + 1) + " for " + task.id);
      bumpStatus({
        phase: "REPAIR round " + (round + 1) + "/" + String(maxFixRounds),
        state: "RUNNING",
      });
      const memoryRoot = resolveAgentMemoryRoot(repoRoot);
      const strategyRoot = join(memoryRoot, "diagnostics");
      const failurePair = deriveValidationFailurePair(tests.output);
      const repeatAdvice = evaluateRepeatFailureFixRound({
        storage_root: strategyRoot,
        signature: failurePair.signature,
        attempted_solution: failurePair.attempted_solution,
        passed: false,
      });
      captureLoopPhase(dag, task, "repair_started", repeatAdvice.next_action, {
        failure: {
          type: "validation",
          signature: failurePair.signature.slice(0, 120),
        },
      });
      const strategyPrefix =
        repeatAdvice.next_action === "strategy-change"
          ? "STRATEGY CHANGE: The same failure signature and repair approach failed " +
            repeatAdvice.stats.fail_count +
            " times. Do not repeat the same fix. Inspect more, change approach, then fix. Do not git push.\n\n"
          : "";
      const crash = repairCrashText(task.id, tests.output);
      const fix = await runAgentTaskWithContext(
        agent,
        dag,
        task,
        strategyPrefix +
          "Validation failed for node " +
          task.id +
          ". Fix the root cause. Do not commit. Do not skip tests. See Crash block in extra context.",
        false,
        "agent-fix-send",
        { crash, usageAcc }
      );
      if (!fix.ok) {
        phase("FAIL", task.id);
        if (skipOrStopSend(dag, task, nodeStarted, fix, "agent REPAIR send failed", usageAcc.usage) === "stop") {
          return 2;
        }
        continue nodes;
      }
      tests = validateNode(task.tests);
    }
    if (!tests.ok) {
      phase("FAIL", task.id);
      captureLoopPhase(dag, task, "node_failed", "operator-pause", {
        status: "failed",
        failure: { type: "validation", signature: "node-validation-failed" },
      });
      markNodeFailed(task, nodeStarted, tests.output, usageAcc.usage);
      const failSnippet = "FAIL " + firstFailReason(tests.output, 1);
      const gate = await resolveOperatorGate(
        activeUnattended,
        "skip-node",
        "validation still red on " + task.id + " after " + String(maxFixRounds) + " fixes",
        "revert tracked files and stop the DAG"
      );
      if (gate === "stop") {
        revertTrackedChanges();
        bumpStatus({ phase: "PAUSE", state: "PAUSED", lastTest: failSnippet });
        endSummary(dag);
        return 2;
      }
      bumpStatus({ phase: "SKIP", state: "SKIPPED", lastTest: failSnippet });
      log("skipping archive for " + task.id + " without reverting; moving to next node");
      continue;
    }
    captureLoopPhase(dag, task, "verification_completed", "commit-or-fix", {
      tests: { passed: Math.max(task.tests.length, 1), failed: 0 },
    });
    const committed = await finishNodeCommit(agent, task, dag, usageAcc);
    if (committed === "stop") {
      phase("FAIL", "commit " + task.id);
      markNodeFailed(task, nodeStarted, "agent COMMIT send stopped", usageAcc.usage);
      if (activeUnattended) {
        bumpStatus({ phase: "SKIP", state: "SKIPPED", lastTest: "FAIL commit stopped" });
        log("UNATTENDED skip-node: commit send stopped for " + task.id);
        continue;
      }
      bumpStatus({ phase: "PAUSE", state: "PAUSED", lastTest: "FAIL commit stopped" });
      endSummary(dag);
      return 2;
    }
    if (committed === "fail") {
      phase("FAIL", "commit " + task.id);
      captureLoopPhase(dag, task, "node_failed", "operator-pause", {
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
        tokens: usageAcc.usage,
      });
      const gate = await resolveOperatorGate(
        activeUnattended,
        "skip-node",
        "commit failed for " + task.id,
        "stop the DAG"
      );
      if (gate === "stop") {
        bumpStatus({ phase: "PAUSE", state: "PAUSED", lastTest: "FAIL commit" });
        endSummary(dag);
        return 2;
      }
      bumpStatus({ phase: "SKIP", state: "SKIPPED", lastTest: "FAIL commit" });
      log("skipping archive for " + task.id);
      continue;
    }
    captureLoopPhase(dag, task, "commit_created", "archive");
    phase("ARCHIVE", task.id);
    captureLoopPhase(dag, task, "node_archived", "next-node");
    archiveFinishedTask(dag, activeDagPath, task);
    if (!orchestratorCommit("chore(config): archive dag node " + task.id, true)) {
      const gate = await resolveOperatorGate(
        activeUnattended,
        "skip-node",
        "archive written but chore commit failed for " + task.id,
        "stop the DAG"
      );
      if (gate === "stop") {
        bumpStatus({ phase: "PAUSE", state: "PAUSED", lastTest: "FAIL archive commit" });
        endSummary(dag);
        return 2;
      }
      bumpStatus({ phase: "SKIP", state: "SKIPPED", lastTest: "FAIL archive commit" });
      log("archive written; chore commit failed for " + task.id);
      state.done.push(task.id);
      saveState(state.done);
      appendHistory({
        ts: new Date().toISOString(),
        dagFile: activeDagPath,
        nodeId: task.id,
        commit: task.commit,
        sha: gitHead(),
        durationMs: Date.now() - nodeStarted,
        status: "failed",
        tokens: usageAcc.usage,
      });
      continue;
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
      tokens: usageAcc.usage,
    });
    nodesOk += 1;
    log("finished " + task.id);
    if (allowPush) {
      publishNode(dag.title);
    }
  }
  captureLoopPhase(dag, undefined, "run_completed", "done");
  endSummary(dag);
  const mayMerge = shouldMergeToMain({
    unattended: activeUnattended,
    mergeFlag: allowMergeMain,
  });
  if (allowPush && !publishFailed && nodesOk > 0 && mayMerge) {
    phase("MERGE", "main");
    const merged = mergeOpenPullRequest(repoRoot);
    if (!merged.ok) {
      publishFailed = true;
      log("merge failed: " + merged.output);
    } else {
      log("merged " + merged.output);
    }
  } else if (allowPush && nodesOk > 0 && !mayMerge) {
    log("UNATTENDED skipped git merge to main (pass --merge to enable)");
  }
  if (publishFailed) {
    const gate = await resolveOperatorGate(
      activeUnattended,
      "publish",
      "nodes finished; origin publish incomplete",
      "exit 2"
    );
    if (gate === "stop") {
      bumpStatus({ phase: "PAUSE", state: "PAUSED", lastTest: "FAIL publish" });
      return 2;
    }
    bumpStatus({ phase: "COMPLETE", state: "COMPLETED" });
    return activeUnattended && nodesOk === 0 ? 2 : 0;
  }
  bumpStatus({ phase: "COMPLETE", state: "COMPLETED" });
  return 0;
}
