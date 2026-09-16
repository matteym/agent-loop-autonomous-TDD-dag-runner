import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type StdioMcpServer = {
  transport: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
};

export type HttpMcpServer = {
  transport: "http" | "sse";
  url: string;
  headers?: Record<string, string>;
};

export type ProjectMcpServer = StdioMcpServer | HttpMcpServer;

export type ProjectMcp = {
  names: string[];
  servers: Record<string, ProjectMcpServer>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function mcpJsonPath(root: string): string {
  return join(root, ".cursor", "mcp.json");
}

export function expandEnvRefs(raw: string, env: NodeJS.ProcessEnv = process.env): string {
  return raw.replace(/\$\{(?:env:)?([A-Za-z_][A-Za-z0-9_]*)\}/g, (_whole, key: string) => {
    const value = env[key];
    return value === undefined ? "" : value;
  });
}

function stringMap(value: unknown, env: NodeJS.ProcessEnv): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") {
      out[key] = expandEnvRefs(item, env);
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function parseServer(raw: unknown, env: NodeJS.ProcessEnv): ProjectMcpServer | null {
  if (!isRecord(raw) || raw.disabled === true) {
    return null;
  }
  const typeRaw = typeof raw.type === "string" ? raw.type.toLowerCase() : "";
  const url = typeof raw.url === "string" ? expandEnvRefs(raw.url, env).trim() : "";
  const command = typeof raw.command === "string" ? expandEnvRefs(raw.command, env).trim() : "";
  if (typeRaw === "http" || typeRaw === "sse" || (url && !command)) {
    if (!url) {
      return null;
    }
    const headers = stringMap(raw.headers, env);
    return headers
      ? { transport: typeRaw === "sse" ? "sse" : "http", url, headers }
      : { transport: typeRaw === "sse" ? "sse" : "http", url };
  }
  if (!command) {
    return null;
  }
  const args = Array.isArray(raw.args)
    ? raw.args.filter((item): item is string => typeof item === "string").map((item) => expandEnvRefs(item, env))
    : undefined;
  const serverEnv = stringMap(raw.env, env);
  const cwd = typeof raw.cwd === "string" ? expandEnvRefs(raw.cwd, env) : undefined;
  const stdio: StdioMcpServer = { transport: "stdio", command };
  if (args?.length) {
    stdio.args = args;
  }
  if (serverEnv) {
    stdio.env = serverEnv;
  }
  if (cwd) {
    stdio.cwd = cwd;
  }
  return stdio;
}

function readMcpFile(filePath: string, env: NodeJS.ProcessEnv): Record<string, ProjectMcpServer> {
  if (!existsSync(filePath)) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
  const root = isRecord(parsed) ? parsed : {};
  const serversRaw = isRecord(root.mcpServers) ? root.mcpServers : root;
  const out: Record<string, ProjectMcpServer> = {};
  for (const [name, spec] of Object.entries(serversRaw)) {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) {
      continue;
    }
    const server = parseServer(spec, env);
    if (server) {
      out[name] = server;
    }
  }
  return out;
}

export function loadProjectMcp(
  productRoot: string,
  engineRoot: string = productRoot,
  env: NodeJS.ProcessEnv = process.env
): ProjectMcp {
  const merged: Record<string, ProjectMcpServer> = {
    ...readMcpFile(mcpJsonPath(engineRoot), env),
    ...readMcpFile(mcpJsonPath(productRoot), env),
  };
  return { names: Object.keys(merged).sort(), servers: merged };
}

export function mcpToolAllowlist(names: string[]): string[] {
  const tools: string[] = [];
  for (const name of names) {
    const wire = name.replace(/[^A-Za-z0-9_-]/g, "_");
    tools.push("mcp__" + wire);
    tools.push("mcp__" + wire + "__*");
  }
  if (names.length) {
    tools.push("mcp__*");
  }
  return tools;
}

export function toCursorMcpServers(
  servers: Record<string, ProjectMcpServer>
): Record<
  string,
  | { type: "stdio"; command: string; args?: string[]; env?: Record<string, string>; cwd?: string }
  | { type: "http" | "sse"; url: string; headers?: Record<string, string> }
> {
  const out: ReturnType<typeof toCursorMcpServers> = {};
  for (const [name, server] of Object.entries(servers)) {
    if (server.transport === "stdio") {
      const row: {
        type: "stdio";
        command: string;
        args?: string[];
        env?: Record<string, string>;
        cwd?: string;
      } = { type: "stdio", command: server.command };
      if (server.args) {
        row.args = server.args;
      }
      if (server.env) {
        row.env = server.env;
      }
      if (server.cwd) {
        row.cwd = server.cwd;
      }
      out[name] = row;
      continue;
    }
    const row: { type: "http" | "sse"; url: string; headers?: Record<string, string> } = {
      type: server.transport,
      url: server.url,
    };
    if (server.headers) {
      row.headers = server.headers;
    }
    out[name] = row;
  }
  return out;
}

export function toClaudeMcpServers(
  servers: Record<string, ProjectMcpServer>
): Record<
  string,
  | { type?: "stdio"; command: string; args?: string[]; env?: Record<string, string> }
  | { type: "http" | "sse"; url: string; headers?: Record<string, string> }
> {
  const out: ReturnType<typeof toClaudeMcpServers> = {};
  for (const [name, server] of Object.entries(servers)) {
    if (server.transport === "stdio") {
      const row: {
        type?: "stdio";
        command: string;
        args?: string[];
        env?: Record<string, string>;
      } = { command: server.command };
      if (server.args) {
        row.args = server.args;
      }
      if (server.env) {
        row.env = server.env;
      }
      out[name] = row;
      continue;
    }
    const row: { type: "http" | "sse"; url: string; headers?: Record<string, string> } = {
      type: server.transport,
      url: server.url,
    };
    if (server.headers) {
      row.headers = server.headers;
    }
    out[name] = row;
  }
  return out;
}

export function mcpBriefingLines(mcp: ProjectMcp): string[] {
  if (!mcp.names.length) {
    return [
      "Project MCP servers: none. Add servers in .cursor/mcp.json (operator-owned; the loop does not install MCP).",
    ];
  }
  return [
    "Project MCP servers from .cursor/mcp.json (use these tools when the ticket needs them):",
    ...mcp.names.map((name) => "- " + name),
    "Example: a playwright server may browse a site and inspect clicks. Do not use MCP for git push, terraform apply, or production cloud mutation.",
  ];
}
