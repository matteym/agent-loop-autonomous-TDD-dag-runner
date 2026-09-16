import path from "node:path";

export function resolveProjectMemoryRoot(cwd: string = process.cwd()): string {
  const fromEnv = process.env.AGENT_MEMORY_ROOT?.trim();
  const memoryRoot = fromEnv
    ? path.isAbsolute(fromEnv)
      ? fromEnv
      : path.resolve(cwd, fromEnv)
    : path.resolve(cwd, ".agent-memory");
  return path.join(memoryRoot, "project");
}

export function projectMemoryLogPath(projectRoot: string): string {
  return path.join(projectRoot, "memories.jsonl");
}
