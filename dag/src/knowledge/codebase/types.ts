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
  /** Discovered `*.test.ts` and `*.spec.ts` paths relative to root. */
  test_files: string[];
};

export type PackageDependencies = Record<string, string>;

export type CodebaseIndex = {
  snapshot: CodebaseIndexSnapshot;
  findSymbolDefinition(symbolName: string): SymbolDefinition | undefined;
  findImporters(importPath: string): string[];
  /** Test files colocated with or importing the module (covers path X). */
  findTestsCovering(modulePath: string): string[];
  /** Nearest package.json `dependencies` / `devDependencies` for a file path. */
  findPackageDependenciesForFile(filePath: string): PackageDependencies;
};
