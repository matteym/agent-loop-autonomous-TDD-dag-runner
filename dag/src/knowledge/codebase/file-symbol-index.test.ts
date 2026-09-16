import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildCodebaseIndex } from "./indexer.js";

function writeFixture(root: string, rel: string, content: string): void {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
}

describe("buildCodebaseIndex", () => {
  let fixtureRoot: string;

  afterEach(() => {
    if (fixtureRoot) {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("indexes ts and js files with imports and exports", () => {
    fixtureRoot = mkdtempSync(path.join(tmpdir(), "codebase-fixture-"));
    writeFixture(
      fixtureRoot,
      "lib/token.ts",
      `export function verifyToken(value: string): boolean {
  return value.length > 0;
}
export class TokenCache {}
`,
    );
    writeFixture(
      fixtureRoot,
      "app/handler.ts",
      `import { verifyToken } from "../lib/token.js";
export function handleAuth() {
  return verifyToken("x");
}
`,
    );
    writeFixture(
      fixtureRoot,
      "app/legacy.js",
      `export class AuthService {}
`,
    );

    const index = buildCodebaseIndex(fixtureRoot);
    const paths = index.snapshot.files.map((file) => file.path).sort();
    expect(paths).toEqual(["app/handler.ts", "app/legacy.js", "lib/token.ts"]);

    const tokenFile = index.snapshot.files.find((file) => file.path === "lib/token.ts");
    expect(tokenFile?.imports).toEqual([]);
    expect(tokenFile?.exports.sort()).toEqual(["TokenCache", "verifyToken"].sort());
    expect(tokenFile?.symbols.map((s) => `${s.kind}:${s.name}`).sort()).toEqual(
      ["class:TokenCache", "function:verifyToken"].sort(),
    );

    const handler = index.snapshot.files.find((file) => file.path === "app/handler.ts");
    expect(handler?.imports.some((spec) => spec.includes("lib/token"))).toBe(true);
  });

  it("finds where an exported symbol is defined", () => {
    fixtureRoot = mkdtempSync(path.join(tmpdir(), "codebase-fixture-"));
    writeFixture(
      fixtureRoot,
      "lib/token.ts",
      "export function verifyToken() {}\n",
    );
    writeFixture(fixtureRoot, "app/handler.ts", "export function handleAuth() {}\n");

    const index = buildCodebaseIndex(fixtureRoot);
    const def = index.findSymbolDefinition("verifyToken");
    expect(def).toEqual({
      name: "verifyToken",
      kind: "function",
      file: "lib/token.ts",
    });

    expect(index.findSymbolDefinition("handleAuth")).toEqual({
      name: "handleAuth",
      kind: "function",
      file: "app/handler.ts",
    });

    expect(index.findSymbolDefinition("MissingSymbol")).toBeUndefined();
  });

  it("finds which files import a given module path", () => {
    fixtureRoot = mkdtempSync(path.join(tmpdir(), "codebase-fixture-"));
    writeFixture(fixtureRoot, "lib/token.ts", "export function verifyToken() {}\n");
    writeFixture(
      fixtureRoot,
      "app/handler.ts",
      `import { verifyToken } from "../lib/token.js";
export function handleAuth() {}
`,
    );
    writeFixture(
      fixtureRoot,
      "app/admin.ts",
      `import { verifyToken } from "../lib/token";
export function adminOnly() {}
`,
    );
    writeFixture(fixtureRoot, "app/other.ts", "export function unrelated() {}\n");

    const index = buildCodebaseIndex(fixtureRoot);
    const importers = index.findImporters("lib/token").sort();
    expect(importers).toEqual(["app/admin.ts", "app/handler.ts"]);
  });
});
