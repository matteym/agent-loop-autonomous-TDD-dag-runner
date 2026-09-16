export type RetrievalMatchKind = "exact" | "symbol" | "path" | "memory";

export type RetrievalHit = {
  kind: RetrievalMatchKind;
  score: number;
  file?: string;
  symbol?: string;
  memory_id?: string;
  title?: string;
};

export type RetrieveExactPathSymbolInput = {
  query: string;
  codebase_root: string;
  memory_root?: string;
};
