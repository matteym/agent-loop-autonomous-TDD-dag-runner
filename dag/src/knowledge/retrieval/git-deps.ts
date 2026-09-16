import path from "node:path";
import { findRecentCommitsForPath } from "../codebase/git-index.js";
import { buildCodebaseIndex } from "../codebase/indexer.js";
import { retrieveExactPathSymbol } from "./exact-path-symbol.js";
import type { RetrievalHit, RetrieveGitDepsInput } from "./types.js";

const SCORE_DEPENDENCY = 150;
const SCORE_GIT = 120;

function normalizeModulePath(modulePath: string): string {
  let normalized = modulePath.replace(/\\/g, "/");
  normalized = normalized.replace(/\/+$/, "");
  normalized = normalized.replace(/\.(js|ts)$/, "");
  return normalized;
}

function resolveImport(fromFile: string, spec: string): string {
  const fromDir = path.dirname(fromFile.replace(/\\/g, "/"));
  const joined = path.normalize(path.join(fromDir, spec)).replace(/\\/g, "/");
  return normalizeModulePath(joined);
}

function matchedFilesFromHits(hits: RetrievalHit[]): Set<string> {
  const files = new Set<string>();
  for (const hit of hits) {
    if (hit.file) {
      files.add(hit.file);
    }
  }
  return files;
}

function dependencyNeighbors(
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

export function retrieveGitDeps(input: RetrieveGitDepsInput): RetrievalHit[] {
  const hits = retrieveExactPathSymbol({
    query: input.query,
    codebase_root: input.codebase_root,
    memory_root: input.memory_root,
  });

  const codebase = buildCodebaseIndex(input.codebase_root);
  const matched = matchedFilesFromHits(hits);
  const repoRoot = input.repo_root ?? input.codebase_root;

  const seen = new Set<string>();
  for (const matchedFile of matched) {
    for (const neighbor of dependencyNeighbors(codebase, matchedFile)) {
      const key = `dependency:${neighbor}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      hits.push({
        kind: "dependency",
        score: SCORE_DEPENDENCY,
        file: neighbor,
      });
    }

    const commits = findRecentCommitsForPath({
      repo_root: repoRoot,
      file_path: matchedFile,
    });
    for (const commit of commits) {
      const key = `git:${matchedFile}:${commit.hash}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      hits.push({
        kind: "git",
        score: SCORE_GIT,
        file: matchedFile,
        commit_hash: commit.hash,
        commit_subject: commit.subject,
      });
    }
  }

  hits.sort((left, right) => right.score - left.score);
  return hits;
}
