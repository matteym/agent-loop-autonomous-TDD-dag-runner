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

describe("codebase tests and package deps index", () => {
  let fixtureRoot: string;

  afterEach(() => {
    if (fixtureRoot) {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("discovers test files alongside modules in the snapshot", () => {
    fixtureRoot = mkdtempSync(path.join(tmpdir(), "codebase-deps-fixture-"));
    writeFixture(fixtureRoot, "pkg/package.json", JSON.stringify({ name: "pkg" }));
    writeFixture(fixtureRoot, "pkg/src/auth.ts", "export function auth() {}\n");
    writeFixture(
      fixtureRoot,
      "pkg/src/auth.test.ts",
      "import { auth } from './auth.js';\n",
    );
    writeFixture(fixtureRoot, "pkg/src/util.ts", "export function util() {}\n");
    writeFixture(fixtureRoot, "pkg/src/util.spec.ts", "export {};\n");

    const index = buildCodebaseIndex(fixtureRoot);
    expect(index.snapshot.test_files.sort()).toEqual([
      "pkg/src/auth.test.ts",
      "pkg/src/util.spec.ts",
    ]);
  });

  it("finds colocated and importing tests that cover a module path", () => {
    fixtureRoot = mkdtempSync(path.join(tmpdir(), "codebase-deps-fixture-"));
    writeFixture(fixtureRoot, "pkg/package.json", JSON.stringify({ name: "pkg" }));
    writeFixture(fixtureRoot, "pkg/lib/token.ts", "export function verifyToken() {}\n");
    writeFixture(
      fixtureRoot,
      "pkg/lib/token.test.ts",
      "import { verifyToken } from './token.js';\n",
    );
    writeFixture(fixtureRoot, "pkg/app/handler.ts", "export function handle() {}\n");
    writeFixture(
      fixtureRoot,
      "pkg/app/handler.integration.test.ts",
      `import { verifyToken } from "../lib/token.js";
export {};
`,
    );

    const index = buildCodebaseIndex(fixtureRoot);
    expect(index.findTestsCovering("pkg/lib/token.ts").sort()).toEqual([
      "pkg/app/handler.integration.test.ts",
      "pkg/lib/token.test.ts",
    ]);
    expect(index.findTestsCovering("pkg/lib/missing.ts")).toEqual([]);
  });

  it("returns nearest package.json dependencies for a source file directory", () => {
    fixtureRoot = mkdtempSync(path.join(tmpdir(), "codebase-deps-fixture-"));
    writeFixture(
      fixtureRoot,
      "pkg/package.json",
      JSON.stringify({
        name: "pkg",
        dependencies: { express: "4.18.0", zod: "3.23.0" },
        devDependencies: { vitest: "3.2.0" },
      }),
    );
    writeFixture(fixtureRoot, "pkg/src/auth.ts", "export function auth() {}\n");
    writeFixture(
      fixtureRoot,
      "pkg/src/auth.test.ts",
      "import { auth } from './auth.js';\n",
    );

    const index = buildCodebaseIndex(fixtureRoot);
    expect(index.findPackageDependenciesForFile("pkg/src/auth.ts")).toEqual({
      express: "4.18.0",
      zod: "3.23.0",
    });
    expect(index.findPackageDependenciesForFile("pkg/src/auth.test.ts")).toEqual({
      express: "4.18.0",
      vitest: "3.2.0",
      zod: "3.23.0",
    });
  });
});
