export type SymbolKind = "function" | "class";

export type SymbolDefinition = {
  name: string;
  kind: SymbolKind;
  /** Repo-relative path from index root. */
  file: string;
};

export type IndexedFile = {
  path: string;
  imports: string[];
  exports: string[];
  symbols: SymbolDefinition[];
};

export type CodebaseIndexSnapshot = {
  root: string;
  files: IndexedFile[];
};

export type CodebaseIndex = {
  snapshot: CodebaseIndexSnapshot;
  findSymbolDefinition(symbolName: string): SymbolDefinition | undefined;
  findImporters(importPath: string): string[];
};
