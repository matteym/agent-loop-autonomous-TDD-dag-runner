import { buildCodebaseIndex } from "../codebase/indexer.js";
import { MemoryGate } from "../memory/gate.js";
import { MemoryStore } from "../memory/store.js";
import type { RetrievalHit, RetrieveExactPathSymbolInput } from "./types.js";

const SCORE_EXACT = 300;
const SCORE_SYMBOL = 200;
const SCORE_PATH = 100;
const SCORE_MEMORY = 250;

function queryTerms(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function queryCompact(query: string): string {
  return queryTerms(query).join("");
}

function symbolMatchesExact(symbolName: string, compact: string): boolean {
  if (!compact) {
    return false;
  }
  return symbolName.toLowerCase().includes(compact);
}

function symbolMatchesTerms(symbolName: string, terms: string[]): boolean {
  if (terms.length === 0) {
    return false;
  }
  const symLower = symbolName.toLowerCase();
  return terms.every((term) => symLower.includes(term));
}

function pathMatchesTerms(filePath: string, modules: string[] | undefined, terms: string[]): boolean {
  if (terms.length === 0) {
    return false;
  }
  const pathLower = filePath.toLowerCase();
  const moduleHaystack = (modules ?? []).join(" ").toLowerCase();
  return terms.some((term) => pathLower.includes(term) || moduleHaystack.includes(term));
}

export function retrieveExactPathSymbol(input: RetrieveExactPathSymbolInput): RetrievalHit[] {
  const terms = queryTerms(input.query);
  const compact = queryCompact(input.query);
  const hits: RetrievalHit[] = [];

  const codebase = buildCodebaseIndex(input.codebase_root);
  for (const file of codebase.snapshot.files) {
    const indexed = file;
    for (const symbol of indexed.symbols) {
      if (symbolMatchesExact(symbol.name, compact)) {
        hits.push({
          kind: "exact",
          score: SCORE_EXACT,
          file: indexed.path,
          symbol: symbol.name,
        });
      } else if (symbolMatchesTerms(symbol.name, terms)) {
        hits.push({
          kind: "symbol",
          score: SCORE_SYMBOL,
          file: indexed.path,
          symbol: symbol.name,
        });
      }
    }

    if (pathMatchesTerms(indexed.path, undefined, terms)) {
      hits.push({
        kind: "path",
        score: SCORE_PATH,
        file: indexed.path,
      });
    }
  }

  const memoryRoot = input.memory_root;
  if (memoryRoot) {
    const gate = new MemoryGate(new MemoryStore({ memory_root: memoryRoot }));
    const needle = input.query.trim().toLowerCase();
    for (const entry of gate.search(input.query)) {
      const scopedFile = entry.scope?.files[0];
      const titleLower = entry.title.toLowerCase();
      const contentLower = entry.content.toLowerCase();
      const exactMemory =
        titleLower.includes(needle) || contentLower.includes(needle);
      hits.push({
        kind: "memory",
        score: exactMemory ? SCORE_EXACT : SCORE_MEMORY,
        memory_id: entry.id,
        title: entry.title,
        ...(scopedFile !== undefined ? { file: scopedFile } : {}),
      });
    }
  }

  hits.sort((left, right) => right.score - left.score);
  return hits;
}
