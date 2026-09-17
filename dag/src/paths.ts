import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveProductLayout } from "./layout.js";

const srcDir = dirname(fileURLToPath(import.meta.url));

export const dagDir = resolve(srcDir, "..");
export const engineRoot = resolve(dagDir, "..");
const layout = resolveProductLayout(engineRoot);
export const repoRoot = layout.repoRoot;
export const nestedPlugin = layout.nested;
export const pluginDirName = layout.pluginDirName;

export function isPluginWalkDir(name: string): boolean {
  return pluginDirName !== null && name === pluginDirName;
}

export const metadataDir = join(dagDir, "metadata");
export const historyDir = join(dagDir, "history");
export const logsDir = join(dagDir, "logs");
export const metadataDagPath = join(metadataDir, "dag.json");
export const metadataTaskPath = join(metadataDir, "task.json");
export const metadataStatePath = join(metadataDir, "state.json");
export const metadataAgentIdPath = join(metadataDir, "agent-id");
export const metadataInitDefaultsPath = join(metadataDir, "init.defaults.json");
export const historyPath = join(historyDir, "nodes.jsonl");
export const failuresLogPath = join(logsDir, "failures.log");
export const statusPath = join(logsDir, "status");

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
