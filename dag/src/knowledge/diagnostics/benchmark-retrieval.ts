import path from "node:path";
import { buildCodebaseIndex } from "../codebase/indexer.js";
import { MemoryGate } from "../memory/gate.js";
import { MemoryStore } from "../memory/store.js";
import { retrieveHybridRank } from "../retrieval/hybrid-rank.js";
import type {
  BenchmarkComparison,
  BenchmarkQuestion,
  BenchmarkScore,
  RunBenchmarkInput,
} from "./benchmark-trace-types.js";
import { LOCAL_BENCHMARK_FIXTURES } from "./benchmark-fixtures.js";
import { resolveProjectMemoryRootFromBase } from "./run-memory-split.js";

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function questionTotal(question: BenchmarkQuestion): number {
  return (
    question.expected_files.length + (question.expected_memory_substrings?.length ?? 0)
  );
}

function scoreFromHits(hits: number, total: number): BenchmarkScore {
  if (total === 0) {
    return { hit_rate: 0, hits: 0, total: 0 };
  }
  return { hit_rate: hits / total, hits, total };
}

function baselineQuestionHits(
  question: BenchmarkQuestion,
  codebaseFiles: string[],
): number {
  const tokens = question.question
    .toLowerCase()
    .split(/\W+/)
    .filter((token) => token.length > 4);
  let hits = 0;
  for (const expected of question.expected_files) {
    const expectedBase = path.basename(normalizePath(expected)).toLowerCase();
    const matched = codebaseFiles.some((file) => {
      const base = path.basename(normalizePath(file)).toLowerCase();
      if (base !== expectedBase) {
        return false;
      }
      return tokens.some((token) => base.includes(token));
    });
    if (matched) {
      hits += 1;
    }
  }
  return hits;
}

function retrievalQuestionHits(
  question: BenchmarkQuestion,
  codebaseRoot: string,
  projectMemoryRoot: string,
): number {
  let hits = 0;
  const codebase = buildCodebaseIndex(codebaseRoot);
  const { hits: ranked } = retrieveHybridRank({
    query: question.question,
    codebase_root: codebaseRoot,
    memory_root: projectMemoryRoot,
  });
  const retrievedFiles = new Set(
    ranked.filter((hit) => hit.file).map((hit) => normalizePath(hit.file as string)),
  );
  for (const file of [...retrievedFiles]) {
    const modulePath = file.replace(/\.(test|spec)\.(ts|js)$/, "").replace(/\.(ts|js)$/, "");
    for (const testPath of codebase.findTestsCovering(modulePath)) {
      retrievedFiles.add(normalizePath(testPath));
    }
  }

  for (const expected of question.expected_files) {
    const needle = normalizePath(expected);
    if (
      [...retrievedFiles].some(
        (file) => file === needle || file.endsWith(`/${needle}`) || file.includes(needle),
      )
    ) {
      hits += 1;
    }
  }

  if (question.expected_memory_substrings && question.expected_memory_substrings.length > 0) {
    const gate = new MemoryGate(new MemoryStore({ memory_root: projectMemoryRoot }));
    for (const substring of question.expected_memory_substrings) {
      const needle = substring.toLowerCase();
      const found = gate.search(substring).some((entry) => {
        const haystack = `${entry.title}\n${entry.content}`.toLowerCase();
        return haystack.includes(needle);
      });
      if (found) {
        hits += 1;
      }
    }
  }

  return hits;
}

function aggregateScore(
  questions: BenchmarkQuestion[],
  scorer: (question: BenchmarkQuestion) => number,
): BenchmarkScore {
  let hits = 0;
  let total = 0;
  for (const question of questions) {
    hits += scorer(question);
    total += questionTotal(question);
  }
  return scoreFromHits(hits, total);
}

export function runRetrievalBenchmark(input: RunBenchmarkInput): BenchmarkComparison {
  const questions = input.questions ?? LOCAL_BENCHMARK_FIXTURES;
  const codebase = buildCodebaseIndex(input.codebase_root);
  const codebaseFiles = codebase.snapshot.files.map((file) => file.path);
  const projectMemoryRoot = resolveProjectMemoryRootFromBase(input.memory_root);

  const baseline = aggregateScore(questions, (question) =>
    baselineQuestionHits(question, codebaseFiles),
  );
  const retrieval = aggregateScore(questions, (question) =>
    retrievalQuestionHits(question, input.codebase_root, projectMemoryRoot),
  );

  return { baseline, retrieval };
}

export function defaultBenchmarkQuestions(): typeof LOCAL_BENCHMARK_FIXTURES {
  return LOCAL_BENCHMARK_FIXTURES;
}
