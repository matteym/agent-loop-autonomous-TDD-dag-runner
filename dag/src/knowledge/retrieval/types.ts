export type RetrievalMatchKind =
  | "exact"
  | "symbol"
  | "path"
  | "memory"
  | "dependency"
  | "git";

export type RetrievalHit = {
  kind: RetrievalMatchKind;
  score: number;
  file?: string;
  symbol?: string;
  memory_id?: string;
  title?: string;
  commit_hash?: string;
  commit_subject?: string;
};

export type RetrieveExactPathSymbolInput = {
  query: string;
  codebase_root: string;
  memory_root?: string;
};

export type RetrieveGitDepsInput = {
  query: string;
  codebase_root: string;
  /** Git repository root for `git log` on matched files (defaults to codebase_root). */
  repo_root?: string;
  memory_root?: string;
};
