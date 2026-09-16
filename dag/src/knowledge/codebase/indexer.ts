import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type {
  CodebaseIndex,
  CodebaseIndexSnapshot,
  IndexedFile,
  SymbolDefinition,
} from "./types.js";

const SOURCE_EXT = /\.(ts|js)$/;

const IMPORT_FROM_RE =
  /import\s+(?:type\s+)?(?:[\w*{}\s,$]+\s+from\s+|)(["'])([^"']+)\1/g;
const EXPORT_FUNCTION_RE = /export\s+function\s+(\w+)/g;
const EXPORT_CLASS_RE = /export\s+class\s+(\w+)/g;

function listSourceFiles(rootPath: string): string[] {
  const root = path.resolve(rootPath);
  const files: string[] = [];

  function walk(dir: string): void {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name.startsWith(".")) {
        continue;
      }
      const full = path.join(dir, name);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      if (!SOURCE_EXT.test(name)) {
        continue;
      }
      files.push(path.relative(root, full).replace(/\\/g, "/"));
    }
  }

  walk(root);
  return files.sort();
}

function parseSourceFile(relPath: string, content: string): IndexedFile {
  const imports: string[] = [];
  for (const match of content.matchAll(IMPORT_FROM_RE)) {
    const spec = match[2];
    if (spec) {
      imports.push(spec);
    }
  }

  const exports: string[] = [];
  const symbols: SymbolDefinition[] = [];

  for (const match of content.matchAll(EXPORT_FUNCTION_RE)) {
    const name = match[1];
    exports.push(name);
    symbols.push({ name, kind: "function", file: relPath });
  }
  for (const match of content.matchAll(EXPORT_CLASS_RE)) {
    const name = match[1];
    exports.push(name);
    symbols.push({ name, kind: "class", file: relPath });
  }

  return { path: relPath, imports, exports, symbols };
}

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

function buildSnapshot(rootPath: string): CodebaseIndexSnapshot {
  const root = path.resolve(rootPath);
  const relPaths = listSourceFiles(root);
  const files = relPaths.map((rel) =>
    parseSourceFile(rel, readFileSync(path.join(root, rel), "utf8")),
  );
  return { root, files };
}

/** Scan a local tree and build a file/import/symbol index. */
export function buildCodebaseIndex(rootPath: string): CodebaseIndex {
  const snapshot = buildSnapshot(rootPath);

  const symbolByName = new Map<string, SymbolDefinition>();
  for (const file of snapshot.files) {
    for (const symbol of file.symbols) {
      if (!symbolByName.has(symbol.name)) {
        symbolByName.set(symbol.name, symbol);
      }
    }
  }

  return {
    snapshot,
    findSymbolDefinition(symbolName: string): SymbolDefinition | undefined {
      return symbolByName.get(symbolName);
    },
    findImporters(importPath: string): string[] {
      const needle = normalizeModulePath(importPath);
      const importers: string[] = [];
      for (const file of snapshot.files) {
        for (const spec of file.imports) {
          if (resolveImport(file.path, spec) === needle) {
            importers.push(file.path);
            break;
          }
        }
      }
      return importers;
    },
  };
}
