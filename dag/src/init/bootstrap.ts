import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { InitAnswers } from "./answers.js";
import { appDirRel, hasLang, secondLangDirRel } from "./answers.js";
import { log } from "./log.js";

const ignoreLines = [
  ".env",
  "node_modules/",
  "dist/",
  ".venv/",
  "dag/node_modules/",
  "dag/metadata/state.json",
  "dag/metadata/task.json",
  "dag/metadata/*.done.json",
  "dag/metadata/agent-id",
  "dag/metadata/init.last.json",
  "dag/history/*",
  "!dag/history/.gitkeep",
  "dag/logs/*.log",
];

function winShell(): boolean {
  return process.platform === "win32";
}

function writeFile(path: string, contents: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function mergeGitignore(repoRoot: string) {
  const path = join(repoRoot, ".gitignore");
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const have = new Set(
    existing
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  );
  const extra = ignoreLines.filter((line) => !have.has(line));
  if (!extra.length && existing) {
    return;
  }
  const body = existing.trimEnd();
  const next = (body ? body + "\n" : "") + extra.join("\n") + "\n";
  writeFileSync(path, next);
}

function tsPackageJson(name: string): string {
  return JSON.stringify(
    {
      name,
      private: true,
      type: "module",
      scripts: {
        dev: "tsx src/index.ts",
        test: "vitest run",
      },
      devDependencies: {
        "@types/node": "^24.13.3",
        tsx: "^4.20.5",
        typescript: "^5.9.2",
        vitest: "^3.2.4",
      },
    },
    null,
    2
  ) + "\n";
}

function tsconfigJson(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        types: ["node"],
        skipLibCheck: true,
        noEmit: true,
      },
      include: ["src/**/*.ts"],
    },
    null,
    2
  ) + "\n";
}

function vitestConfig(): string {
  return [
    'import { defineConfig } from "vitest/config";',
    "",
    "export default defineConfig({",
    "  test: {",
    '    include: ["src/**/*.test.ts"],',
    "  },",
    "});",
    "",
  ].join("\n");
}

function dockerfileTs(): string {
  return [
    "FROM node:22-alpine",
    "WORKDIR /app",
    "COPY package.json yarn.lock* ./",
    "RUN yarn install --frozen-lockfile || yarn install",
    "COPY . .",
    'CMD ["yarn", "dev"]',
    "",
  ].join("\n");
}

function dockerignore(): string {
  return ["node_modules", ".git", "dag", ".cursor", "dist", ".env"].join("\n") + "\n";
}

function healthTs(): string {
  return [
    "export function healthBody(): string {",
    '  return JSON.stringify({ ok: true });',
    "}",
    "",
  ].join("\n");
}

function indexTs(): string {
  return [
    'import { createServer } from "node:http";',
    'import { healthBody } from "./health.js";',
    "",
    "const port = Number(process.env.APP_PORT || process.env.PORT);",
    "if (!Number.isInteger(port) || port < 1) {",
    '  process.stderr.write("APP_PORT or PORT required\\n");',
    "  process.exit(1);",
    "}",
    "",
    "const server = createServer((req, res) => {",
    '  if (req.method === "GET" && (req.url === "/health" || req.url === "/health/")) {',
    '    const body = healthBody();',
    "    res.writeHead(200, {",
    '      "content-type": "application/json",',
    '      "content-length": Buffer.byteLength(body),',
    "    });",
    "    res.end(body);",
    "    return;",
    "  }",
    "  res.writeHead(404);",
    "  res.end();",
    "});",
    "",
    "server.listen(port);",
    "",
  ].join("\n");
}

function indexTestTs(): string {
  return [
    'import { describe, expect, it } from "vitest";',
    'import { healthBody } from "./health.js";',
    "",
    'describe("health", () => {',
    '  it("returns ok json", () => {',
    "    expect(JSON.parse(healthBody())).toEqual({ ok: true });",
    "  });",
    "});",
    "",
  ].join("\n");
}

function pyproject(name: string): string {
  return [
    "[project]",
    'name = "' + name + '"',
    'version = "0.1.0"',
    'requires-python = ">=3.12"',
    "dependencies = []",
    "",
    "[dependency-groups]",
    'dev = ["pytest>=8"]',
    "",
    "[tool.pytest.ini_options]",
    'pythonpath = ["."]',
    'testpaths = ["tests"]',
    "",
  ].join("\n");
}

function dockerfilePy(): string {
  return [
    "FROM python:3.12-slim",
    "COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv",
    "WORKDIR /app",
    "COPY pyproject.toml uv.lock* ./",
    "RUN uv sync --frozen || uv sync",
    "COPY . .",
    'CMD ["uv", "run", "python", "-m", "src.server"]',
    "",
  ].join("\n");
}

function healthPy(): string {
  return ['def health_body() -> str:', '    return \'{"ok": true}\'', ""].join("\n");
}

function serverPy(): string {
  return [
    "import os",
    "from http.server import BaseHTTPRequestHandler, HTTPServer",
    "",
    "from src.health import health_body",
    "",
    "",
    "class Handler(BaseHTTPRequestHandler):",
    "    def do_GET(self) -> None:",
    '        if self.path in ("/health", "/health/"):',
    "            body = health_body().encode()",
    "            self.send_response(200)",
    '            self.send_header("Content-Type", "application/json")',
    '            self.send_header("Content-Length", str(len(body)))',
    "            self.end_headers()",
    "            self.wfile.write(body)",
    "            return",
    "        self.send_response(404)",
    "        self.end_headers()",
    "",
    "    def log_message(self, format: str, *args: object) -> None:",
    "        return",
    "",
    "",
    "def main() -> None:",
    '    raw = os.environ.get("APP_PORT") or os.environ.get("PORT") or ""',
    "    try:",
    "        port = int(raw)",
    "    except ValueError:",
    "        port = 0",
    "    if port < 1:",
    '        raise SystemExit("APP_PORT or PORT required")',
    '    HTTPServer(("0.0.0.0", port), Handler).serve_forever()',
    "",
    "",
    'if __name__ == "__main__":',
    "    main()",
    "",
  ].join("\n");
}

function testHealthPy(): string {
  return [
    "from src.health import health_body",
    "",
    "",
    "def test_health_body() -> None:",
    '    assert health_body() == \'{"ok": true}\'',
    "",
  ].join("\n");
}

function srcInitPy(): string {
  return "";
}

function resolveAppRoot(repoRoot: string, rel: string): string {
  return rel === "." ? repoRoot : join(repoRoot, rel);
}

function writeTsTree(appRoot: string, name: string) {
  writeFile(join(appRoot, ".dockerignore"), dockerignore());
  writeFile(join(appRoot, "package.json"), tsPackageJson(name));
  writeFile(join(appRoot, "tsconfig.json"), tsconfigJson());
  writeFile(join(appRoot, "vitest.config.ts"), vitestConfig());
  writeFile(join(appRoot, "Dockerfile"), dockerfileTs());
  writeFile(join(appRoot, "src", "health.ts"), healthTs());
  writeFile(join(appRoot, "src", "index.ts"), indexTs());
  writeFile(join(appRoot, "src", "index.test.ts"), indexTestTs());
  const install = spawnSync("yarn", ["install"], {
    cwd: appRoot,
    encoding: "utf8",
    shell: winShell(),
  });
  if (install.status !== 0) {
    log((install.stderr || install.stdout || "yarn install failed").trim());
    throw new Error("yarn install failed");
  }
}

function writePyTree(appRoot: string, name: string) {
  writeFile(join(appRoot, ".dockerignore"), dockerignore());
  writeFile(join(appRoot, "pyproject.toml"), pyproject(name));
  writeFile(join(appRoot, "Dockerfile"), dockerfilePy());
  writeFile(join(appRoot, "src", "__init__.py"), srcInitPy());
  writeFile(join(appRoot, "src", "health.py"), healthPy());
  writeFile(join(appRoot, "src", "server.py"), serverPy());
  writeFile(join(appRoot, "tests", "test_health.py"), testHealthPy());
  const sync = spawnSync("uv", ["sync"], {
    cwd: appRoot,
    encoding: "utf8",
    shell: winShell(),
  });
  if (sync.status !== 0) {
    log((sync.stderr || sync.stdout || "uv sync failed").trim());
    throw new Error("uv sync failed");
  }
}

export function writeBootstrap(repoRoot: string, answers: InitAnswers): string {
  mergeGitignore(repoRoot);
  const rel = appDirRel(answers);
  const appRoot = resolveAppRoot(repoRoot, rel);
  mkdirSync(appRoot, { recursive: true });
  if (hasLang(answers, "ts")) {
    writeTsTree(appRoot, answers.appName);
  } else {
    writePyTree(appRoot, answers.appName);
  }
  const extra = secondLangDirRel(answers);
  if (extra && hasLang(answers, "py")) {
    const pyRoot = resolveAppRoot(repoRoot, extra);
    mkdirSync(pyRoot, { recursive: true });
    writePyTree(pyRoot, answers.appName + "-py");
  }
  return rel;
}
