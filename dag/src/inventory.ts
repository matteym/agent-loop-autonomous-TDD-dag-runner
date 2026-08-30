import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export const inventoryMarkers = [
  "package.json",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
] as const;

export type LangKind = "ts" | "py" | "go" | "rust";

export type TestCommand = {
  cmd: string;
  args: string[];
};

export const testByLang: Record<LangKind, TestCommand> = {
  ts: { cmd: "yarn", args: ["test"] },
  py: { cmd: "uv", args: ["run", "python", "-m", "pytest", "-q"] },
  go: { cmd: "go", args: ["test", "./..."] },
  rust: { cmd: "cargo", args: ["test"] },
};

export function dirHasPackageMarker(dir: string): boolean {
  return inventoryMarkers.some((marker) => existsSync(join(dir, marker)));
}

export function inferTestCommand(dir: string): TestCommand | null {
  const pkgPath = join(dir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        scripts?: Record<string, string>;
      };
      if (pkg.scripts?.test) {
        return testByLang.ts;
      }
    } catch {
      return null;
    }
  }
  if (existsSync(join(dir, "pyproject.toml"))) {
    return testByLang.py;
  }
  if (existsSync(join(dir, "go.mod"))) {
    return testByLang.go;
  }
  if (existsSync(join(dir, "Cargo.toml"))) {
    return testByLang.rust;
  }
  return null;
}

export function inferLangFromText(text: string): LangKind | null {
  const t = text.toLowerCase();
  if (
    /\b(fastapi|django|flask|pytest|pyproject|uvicorn|python)\b/.test(t) ||
    /\buv\b/.test(t)
  ) {
    return "py";
  }
  if (
    /\b(golang|go\.mod|gofmt|gin|fiber|go-chi|go test|go api)\b/.test(t) ||
    /\bin go\b/.test(t)
  ) {
    return "go";
  }
  if (/\b(rust|cargo|actix|axum|tokio)\b/.test(t)) {
    return "rust";
  }
  if (
    /\b(typescript|javascript|express|fastify|nestjs|vitest|tsx|node\.js|nodejs)\b/.test(t) ||
    /\byarn test\b/.test(t)
  ) {
    return "ts";
  }
  return null;
}

export function testsMatch(expected: TestCommand, got: { cmd: string; args: string[] }): boolean {
  if (expected.cmd !== got.cmd) {
    return false;
  }
  if (expected.args.length !== got.args.length) {
    return false;
  }
  return expected.args.every((arg, i) => arg === got.args[i]);
}

export function formatTestCommand(spec: TestCommand): string {
  return spec.cmd + " " + spec.args.join(" ");
}

const skipInventoryWalk = new Set([
  "node_modules",
  ".git",
  "dist",
  ".venv",
  "coverage",
  ".next",
  "logs",
  "dag",
  ".cursor",
  ".github",
]);

export type TestablePkg = {
  rel: string;
  lang: LangKind;
  test: TestCommand;
};

export function langOfTestCommand(test: TestCommand): LangKind | null {
  if (test.cmd === "yarn") {
    return "ts";
  }
  if (test.cmd === "uv") {
    return "py";
  }
  if (test.cmd === "go") {
    return "go";
  }
  if (test.cmd === "cargo") {
    return "rust";
  }
  return null;
}

export function listTestablePackages(repoRoot: string): TestablePkg[] {
  const out: TestablePkg[] = [];
  walkTestable(repoRoot, repoRoot, 0, out);
  const seen = new Set<string>();
  return out.filter((pkg) => {
    if (seen.has(pkg.rel)) {
      return false;
    }
    seen.add(pkg.rel);
    return true;
  });
}

function walkTestable(root: string, dir: string, depth: number, out: TestablePkg[]) {
  const test = inferTestCommand(dir);
  const lang = test ? langOfTestCommand(test) : null;
  if (test && lang) {
    const rel = relative(root, dir).replace(/\\/g, "/") || ".";
    out.push({ rel, lang, test });
  }
  if (depth >= 3) {
    return;
  }
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || skipInventoryWalk.has(entry.name) || entry.name.startsWith(".")) {
      continue;
    }
    walkTestable(root, join(dir, entry.name), depth + 1, out);
  }
}

export function mismatchLangTests(
  text: string,
  spec: { cmd: string; args: string[] }
): string | null {
  const lang = inferLangFromText(text);
  if (!lang) {
    return null;
  }
  if (testsMatch(testByLang[lang], spec)) {
    return null;
  }
  return "inferred " + lang + "; tests must be " + formatTestCommand(testByLang[lang]);
}
