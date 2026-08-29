import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = dirname(fileURLToPath(import.meta.url));

export const dagDir = resolve(srcDir, "..");
export const repoRoot = resolve(dagDir, "..");
export const metadataDir = join(dagDir, "metadata");
export const historyDir = join(dagDir, "history");
export const logsDir = join(dagDir, "logs");
export const metadataDagPath = join(metadataDir, "dag.json");
export const metadataTaskPath = join(metadataDir, "task.json");
export const metadataStatePath = join(metadataDir, "state.json");
export const metadataAgentIdPath = join(metadataDir, "agent-id");
export const metadataInitLastPath = join(metadataDir, "init.last.json");
export const metadataInitDefaultsPath = join(metadataDir, "init.defaults.json");
export const historyPath = join(historyDir, "nodes.jsonl");
export const failuresLogPath = join(logsDir, "failures.log");

export function resolveDagFile(raw: string): string {
  if (!raw.trim()) {
    return metadataDagPath;
  }
  return resolve(dagDir, raw);
}

export function donePathFor(dagPath: string): string {
  if (dagPath.endsWith(".json")) {
    return dagPath.slice(0, -5) + ".done.json";
  }
  return dagPath + ".done.json";
}
