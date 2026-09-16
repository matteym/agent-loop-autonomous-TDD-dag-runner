import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { MemoryGate } from "../memory/gate.js";
import { MemoryStore } from "../memory/store.js";
import { projectMemoryLogPath } from "../memory/paths.js";
import type {
  PromoteVerifiedMemoryInput,
  PromoteVerifiedMemoryResult,
  RunOnlyNoteInput,
} from "./benchmark-trace-types.js";

const RUN_NOTES_LOG = "run-notes.jsonl";

export function resolveRunMemoryRoot(memoryRoot: string, runId: string): string {
  return path.join(memoryRoot, "run", runId);
}

export function resolveProjectMemoryRootFromBase(memoryRoot: string): string {
  return path.join(memoryRoot, "project");
}

export function writeRunOnlyNote(input: RunOnlyNoteInput): void {
  mkdirSync(input.run_memory_root, { recursive: true });
  appendFileSync(
    path.join(input.run_memory_root, RUN_NOTES_LOG),
    JSON.stringify({ title: input.title, content: input.content }) + "\n",
    "utf8",
  );
}

function listProjectMemoryIds(projectMemoryRoot: string): string[] {
  const logPath = projectMemoryLogPath(projectMemoryRoot);
  if (!existsSync(logPath)) {
    return [];
  }
  const ids: string[] = [];
  for (const line of readFileSync(logPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    const entry = JSON.parse(line) as { id?: string };
    if (entry.id) {
      ids.push(entry.id);
    }
  }
  return ids;
}

export function promoteVerifiedRunMemoryToProject(
  input: PromoteVerifiedMemoryInput,
): PromoteVerifiedMemoryResult {
  const gate = new MemoryGate(new MemoryStore({ memory_root: input.project_memory_root }));
  const promoted_ids: string[] = [];
  for (const entry of input.verified) {
    const saved = gate.persist({
      type: entry.type,
      title: entry.title,
      content: entry.content,
      scope: entry.scope,
      evidence: entry.evidence,
      status: "verified",
    });
    promoted_ids.push(saved.id);
  }
  return {
    promoted_ids,
    project_memory_ids: listProjectMemoryIds(input.project_memory_root),
  };
}
