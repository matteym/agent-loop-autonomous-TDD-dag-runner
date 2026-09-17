import path from "node:path";
import { buildCodebaseIndex } from "../codebase/indexer.js";
import { MemoryGate } from "../memory/gate.js";
import { MemoryStore } from "../memory/store.js";
import type { MemoryEntry, MemoryEntryType } from "../memory/types.js";
import { retrieveHybridRank } from "../retrieval/hybrid-rank.js";
import type { RetrievalHit } from "../retrieval/types.js";
import type { AgentContext, ContextBuilderInput } from "./types.js";

const DEFAULT_MAX_FILES = 8;
const DEFAULT_MAX_SECTION_ITEMS = 5;
const DEFAULT_MAX_TEXT_CHARS = 240;
const DEFAULT_MAX_QUERIES = 8;

function resolveLimit(envKey: string, fallback: number): number {
  const raw = process.env[envKey]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function truncateText(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxChars - 1)}…`;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function buildRetrievalQueries(input: ContextBuilderInput): string[] {
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
    const normalized = normalizePath(hint);
    queries.add(normalized);
    queries.add(path.basename(normalized, path.extname(normalized)));
  }
  const maxQueries = resolveLimit("CONTEXT_MAX_QUERIES", DEFAULT_MAX_QUERIES);
  const selected: string[] = [];
  const seen = new Set<string>();
  const push = (value: string) => {
    if (!value || seen.has(value) || selected.length >= maxQueries) {
      return;
    }
    seen.add(value);
    selected.push(value);
  };
  for (const hint of input.filesHint ?? []) {
    const normalized = normalizePath(hint);
    push(normalized);
    push(path.basename(normalized, path.extname(normalized)));
  }
  const ngrams = [...queries];
  const threeWord = ngrams.filter((query) => query.split(" ").length === 3);
  const rest = ngrams
    .filter((query) => query.split(" ").length !== 3)
    .sort((left, right) => right.length - left.length);
  for (const query of [...threeWord, ...rest]) {
    push(query);
  }
  return selected;
}

function mergeHits(queryList: string[], input: ContextBuilderInput): RetrievalHit[] {
  const byKey = new Map<string, RetrievalHit>();
  for (const query of queryList) {
    const { hits } = retrieveHybridRank({
      query,
      codebase_root: input.codebase_root,
      repo_root: input.repo_root,
      memory_root: input.memory_root,
    });
    for (const hit of hits) {
      const key = [
        hit.kind,
        hit.file ?? "",
        hit.symbol ?? "",
        hit.memory_id ?? "",
        hit.commit_hash ?? "",
      ].join("|");
      const existing = byKey.get(key);
      if (!existing || hit.score > existing.score) {
        byKey.set(key, hit);
      }
    }
  }
  return [...byKey.values()].sort((left, right) => right.score - left.score);
}

function memoryLine(entry: MemoryEntry, maxChars: number): string {
  return truncateText(`${entry.title}: ${entry.content}`, maxChars);
}

function collectMemoryEntries(
  hits: RetrievalHit[],
  input: ContextBuilderInput,
): MemoryEntry[] {
  if (!input.memory_root) {
    return [];
  }
  const gate = new MemoryGate(new MemoryStore({ memory_root: input.memory_root }));
  const entries = new Map<string, MemoryEntry>();
  for (const hit of hits) {
    if (!hit.memory_id) {
      continue;
    }
    const entry = gate.get(hit.memory_id);
    if (entry) {
      entries.set(entry.id, entry);
    }
  }
  const hints = new Set((input.filesHint ?? []).map(normalizePath));
  for (const entry of gate.search(input.nodePrompt)) {
    entries.set(entry.id, entry);
  }
  for (const hint of hints) {
    for (const entry of gate.search(hint)) {
      const scoped = entry.scope?.files.map(normalizePath) ?? [];
      if (scoped.includes(hint)) {
        entries.set(entry.id, entry);
      }
    }
  }
  return [...entries.values()];
}

function resolveImport(fromFile: string, spec: string): string {
  const fromDir = path.dirname(fromFile.replace(/\\/g, "/"));
  const joined = path.normalize(path.join(fromDir, spec)).replace(/\\/g, "/");
  return normalizeModulePath(joined);
}

function importNeighborsForFile(
  codebase: ReturnType<typeof buildCodebaseIndex>,
  matchedFile: string,
): string[] {
  const indexed = codebase.snapshot.files.find((file) => file.path === matchedFile);
  if (!indexed) {
    return [];
  }
  const fileByNorm = new Map(
    codebase.snapshot.files.map((file) => [normalizeModulePath(file.path), file.path]),
  );
  const neighbors: string[] = [];
  for (const spec of indexed.imports) {
    const resolved = resolveImport(matchedFile, spec);
    const neighbor = fileByNorm.get(resolved);
    if (neighbor && neighbor !== matchedFile) {
      neighbors.push(neighbor);
    }
  }
  return neighbors;
}

function normalizeModulePath(modulePath: string): string {
  let normalized = modulePath.replace(/\\/g, "/");
  normalized = normalized.replace(/\/+$/, "");
  normalized = normalized.replace(/\.(js|ts)$/, "");
  return normalized;
}

function appendRelevantFiles(
  files: string[],
  hits: RetrievalHit[],
  hintSet: Set<string>,
  codebase: ReturnType<typeof buildCodebaseIndex>,
  maxFiles: number,
): void {
  for (const hint of hintSet) {
    pushUnique(files, hint, maxFiles);
  }
  for (const hit of hits) {
    if (!hit.file) {
      continue;
    }
    const file = normalizePath(hit.file);
    if (hintSet.has(file)) {
      pushUnique(files, file, maxFiles);
      continue;
    }
    if (hit.kind !== "dependency") {
      continue;
    }
    for (const hint of hintSet) {
      if (importNeighborsForFile(codebase, hint).includes(file)) {
        pushUnique(files, file, maxFiles);
        break;
      }
    }
  }
}

function pushUnique(target: string[], value: string, maxItems: number): void {
  if (target.length >= maxItems || !value.trim()) {
    return;
  }
  if (!target.includes(value)) {
    target.push(value);
  }
}

function sectionForType(
  entries: MemoryEntry[],
  type: MemoryEntryType,
  maxItems: number,
  maxChars: number,
): string[] {
  const lines: string[] = [];
  for (const entry of entries) {
    if (entry.type !== type) {
      continue;
    }
    pushUnique(lines, memoryLine(entry, maxChars), maxItems);
  }
  return lines;
}

export class ContextBuilder {
  static build(input: ContextBuilderInput): AgentContext {
    const maxFiles = resolveLimit("CONTEXT_MAX_FILES", DEFAULT_MAX_FILES);
    const maxSectionItems = resolveLimit(
      "CONTEXT_MAX_SECTION_ITEMS",
      DEFAULT_MAX_SECTION_ITEMS,
    );
    const maxTextChars = resolveLimit("CONTEXT_MAX_TEXT_CHARS", DEFAULT_MAX_TEXT_CHARS);

    const queries = buildRetrievalQueries(input);
    const hits = mergeHits(queries, input);
    const memories = collectMemoryEntries(hits, input);
    const codebase = buildCodebaseIndex(input.codebase_root);

    const files: string[] = [];
    const hintSet = new Set((input.filesHint ?? []).map(normalizePath));
    appendRelevantFiles(files, hits, hintSet, codebase, maxFiles);

    const symbols: string[] = [];
    const deps: string[] = [];
    const tests: string[] = [];
    const recentGit: string[] = [];

    for (const hit of hits) {
      if (hit.symbol) {
        pushUnique(symbols, hit.symbol, maxSectionItems);
      }
      if (hit.kind === "dependency" && hit.file) {
        pushUnique(deps, normalizePath(hit.file), maxSectionItems);
      }
      if (hit.kind === "git" && hit.commit_subject) {
        const line = hit.file
          ? `${normalizePath(hit.file)} — ${hit.commit_subject}`
          : hit.commit_subject;
        pushUnique(recentGit, truncateText(line, maxTextChars), maxSectionItems);
      }
    }

    for (const file of files) {
      for (const testPath of codebase.findTestsCovering(file)) {
        pushUnique(tests, normalizePath(testPath), maxSectionItems);
      }
      const pkgDeps = codebase.findPackageDependenciesForFile(file);
      for (const name of Object.keys(pkgDeps).sort()) {
        pushUnique(deps, `${name}@${pkgDeps[name]}`, maxSectionItems);
      }
    }

    return {
      objective: truncateText(input.nodePrompt, maxTextChars),
      files,
      symbols,
      deps,
      tests,
      conventions: sectionForType(memories, "CONVENTION", maxSectionItems, maxTextChars),
      architecture: sectionForType(memories, "ARCHITECTURE", maxSectionItems, maxTextChars),
      historical_decisions: sectionForType(memories, "DECISION", maxSectionItems, maxTextChars),
      similar_failures: sectionForType(memories, "FAILURE", maxSectionItems, maxTextChars),
      solutions: sectionForType(memories, "SOLUTION", maxSectionItems, maxTextChars),
      recent_git: recentGit,
      invariants: sectionForType(memories, "INVARIANT", maxSectionItems, maxTextChars),
    };
  }
}
