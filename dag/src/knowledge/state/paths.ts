import path from "node:path";

/** Root for `.agent-memory` (override in tests via options). */
export function resolveAgentMemoryRoot(cwd: string = process.cwd()): string {
  const fromEnv = process.env.AGENT_MEMORY_ROOT?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.resolve(cwd, fromEnv);
  }
  return path.resolve(cwd, ".agent-memory");
}

export function checkpointsLogPath(memoryRoot: string): string {
  return path.join(memoryRoot, "checkpoints", "events.jsonl");
}

export function runStatePath(memoryRoot: string, runId: string): string {
  return path.join(memoryRoot, "runs", `${runId}.json`);
}

export function nodeStatePath(memoryRoot: string, runId: string, nodeId: string): string {
  return path.join(memoryRoot, "runs", runId, "nodes", `${nodeId}.json`);
}
