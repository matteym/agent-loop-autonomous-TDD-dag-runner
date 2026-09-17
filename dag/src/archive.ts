import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  donePathFor,
  historyDir,
  historyPath,
  metadataAgentIdPath,
  metadataDir,
  metadataStatePath,
} from "./paths.js";
import type { Dag, Task } from "./types.js";
import type { TokenUsage } from "./token-usage.js";

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

export function archiveFinishedTask(dag: Dag, dagPath: string, task: Task) {
  const done = loadDoneFile(dagPath);
  if (!done.tasks.some((entry) => entry.id === task.id)) {
    done.tasks.push(task);
  }
  writeJson(donePathFor(dagPath), done);
  dag.tasks = dag.tasks.filter((entry) => entry.id !== task.id);
  writeJson(dagPath, dag);
}

export function appendHistory(entry: {
  ts: string;
  dagFile: string;
  nodeId: string;
  commit: string;
  sha: string;
  durationMs: number;
  status: "finished" | "failed";
  tokens?: TokenUsage;
}) {
  mkdirSync(historyDir, { recursive: true });
  appendFileSync(historyPath, JSON.stringify(entry) + "\n");
}

export function loadState(): { done: string[] } {
  if (!existsSync(metadataStatePath)) {
    return { done: [] };
  }
  return JSON.parse(readFileSync(metadataStatePath, "utf8")) as { done: string[] };
}

export function saveState(done: string[]) {
  mkdirSync(metadataDir, { recursive: true });
  writeFileSync(metadataStatePath, JSON.stringify({ done }, null, 2));
}

export function persistAgentId(agentId: string) {
  mkdirSync(metadataDir, { recursive: true });
  writeFileSync(metadataAgentIdPath, agentId + "\n", "utf8");
}
