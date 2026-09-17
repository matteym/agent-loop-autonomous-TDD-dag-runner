import { MemoryGate } from "../memory/gate.js";
import { MemoryStore } from "../memory/store.js";
import { retrieveHybridRank } from "../retrieval/hybrid-rank.js";
import { ContextBuilder } from "./builder.js";
import { ContextSufficiencyGate } from "./sufficiency-gate.js";
import type { AgentContext, ContextBuilderInput } from "./types.js";
import type { NodeSendContextInput, NodeSendContextResult } from "./loop-context.js";

const DEFAULT_BRIEFING_MAX_CHARS = 8000;
const INSPECT_PREFIX =
  "INSPECT MORE: context sufficiency gate blocked code changes. Read listed files, tests, and memories before editing.\n\n";

function resolveBriefingMaxChars(): number {
  const raw = process.env.CONTEXT_BRIEFING_MAX_CHARS?.trim();
  if (!raw) {
    return DEFAULT_BRIEFING_MAX_CHARS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_BRIEFING_MAX_CHARS;
  }
  return parsed;
}

function truncateBriefing(text: string): string {
  const max = resolveBriefingMaxChars();
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1)}…`;
}

function retrievalQueries(input: NodeSendContextInput): string[] {
  const queries = new Set<string>();
  const prompt = input.nodePrompt.trim();
  if (prompt) {
    const words = prompt
      .replace(/[^\w\s/]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean);
    for (let size = Math.min(5, words.length); size >= 2; size -= 1) {
      for (let start = 0; start <= words.length - size; start += 1) {
        const phrase = words.slice(start, start + size).join(" ");
        if (phrase.length >= 12) {
          queries.add(phrase);
        }
      }
    }
  }
  for (const hint of input.filesHint ?? []) {
    queries.add(hint.replace(/\\/g, "/"));
  }
  return [...queries];
}

function collectMemoryIds(input: NodeSendContextInput): string[] {
  const ids = new Set<string>();
  for (const query of retrievalQueries(input)) {
    const { hits } = retrieveHybridRank({
      query,
      codebase_root: input.codebase_root,
      repo_root: input.repo_root,
      memory_root: input.memory_root,
    });
    for (const hit of hits) {
      if (hit.memory_id) {
        ids.add(hit.memory_id);
      }
    }
  }
  if (input.memory_root) {
    const gate = new MemoryGate(new MemoryStore({ memory_root: input.memory_root }));
    for (const query of retrievalQueries(input)) {
      for (const entry of gate.search(query)) {
        ids.add(entry.id);
      }
    }
  }
  return [...ids];
}

function formatKnowledgeCore(context: AgentContext): string {
  const lines: string[] = [
    "Retrieved context (truncated, not full repo):",
    `Objective: ${context.objective}`,
  ];
  if (context.files.length > 0) {
    lines.push(`Files: ${context.files.join(", ")}`);
  }
  if (context.symbols.length > 0) {
    lines.push(`Symbols: ${context.symbols.join(", ")}`);
  }
  if (context.tests.length > 0) {
    lines.push(`Tests: ${context.tests.join(", ")}`);
  }
  if (context.recent_git.length > 0) {
    lines.push("Recent git:");
    for (const line of context.recent_git) {
      lines.push(`- ${line}`);
    }
  }
  return truncateBriefing(lines.join("\n"));
}

function formatContextBriefing(context: AgentContext): string {
  const core = formatKnowledgeCore(context);
  const extra: string[] = [];
  if (context.similar_failures.length > 0) {
    extra.push("Similar failures:");
    for (const line of context.similar_failures) {
      extra.push(`- ${line}`);
    }
  }
  if (context.solutions.length > 0) {
    extra.push("Solutions:");
    for (const line of context.solutions) {
      extra.push(`- ${line}`);
    }
  }
  if (!extra.length) {
    return core;
  }
  return truncateBriefing(core + "\n" + extra.join("\n"));
}

export function buildNodeSendContext(input: NodeSendContextInput): NodeSendContextResult {
  const builderInput: ContextBuilderInput = {
    nodePrompt: input.nodePrompt,
    filesHint: input.filesHint,
    codebase_root: input.codebase_root,
    memory_root: input.memory_root,
    repo_root: input.repo_root,
  };
  const agentContext = ContextBuilder.build(builderInput);
  const may_modify = new ContextSufficiencyGate(agentContext).mayModify();
  const memory_ids = collectMemoryIds(input);

  return {
    context_briefing: formatContextBriefing(agentContext),
    knowledge_core: formatKnowledgeCore(agentContext),
    similar_failures: [...agentContext.similar_failures, ...agentContext.solutions],
    memory_ids,
    context_files: agentContext.files,
    may_modify,
    inspect_prefix: may_modify ? "" : INSPECT_PREFIX,
  };
}
