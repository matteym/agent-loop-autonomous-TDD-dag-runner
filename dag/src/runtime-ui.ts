export const uiPhases = [
  "PLAN",
  "PREFLIGHT",
  "CONTEXT",
  "MCP",
  "RED",
  "GREEN",
  "GUARD",
  "TEST",
  "REPAIR",
  "COMMIT",
  "ARCHIVE",
  "PUSH",
  "PR",
  "MERGE",
  "PAUSE",
  "UP",
  "CI",
  "SKIP",
  "FAIL",
] as const;

export type UiPhase = (typeof uiPhases)[number];

export function redactSecrets(text: string): string {
  return text
    .replace(/CURSOR_API_KEY[=:\s]+\S+/gi, "CURSOR_API_KEY=***")
    .replace(/CURSOR_SDK_API[=:\s]+\S+/gi, "CURSOR_SDK_API=***")
    .replace(/ANTHROPIC_API_KEY[=:\s]+\S+/gi, "ANTHROPIC_API_KEY=***")
    .replace(/CLAUDE_API_KEY[=:\s]+\S+/gi, "CLAUDE_API_KEY=***")
    .replace(/JWT_SECRET[=:\s]+\S+/gi, "JWT_SECRET=***")
    .replace(/Bearer\s+\S+/gi, "Bearer ***")
    .replace(/refresh_token[=:\s]+\S+/gi, "refresh_token=***");
}

export function formatRunHeader(input: {
  provider: string;
  branch: string;
  model: string;
  title: string;
  mcpNames: string[];
}): string[] {
  const mcp = input.mcpNames.length ? input.mcpNames.join(",") : "none";
  return [
    "RUN provider=" + input.provider,
    "RUN branch=" + input.branch,
    "RUN model=" + input.model,
    "RUN title=" + input.title,
    "RUN mcp=" + mcp,
  ];
}

export function formatNodeBanner(id: string, commit: string): string {
  return "──────── " + id + " · " + commit + " ────────";
}

export function formatPhaseBlock(phase: UiPhase, detail: string): string {
  return phase + " " + detail;
}

export function formatStep(text: string): string {
  return "STEP " + text;
}

export function formatTestCommand(cmd: string, args: string[], cwd: string): string {
  return "TEST " + cmd + " " + args.join(" ") + " (cwd " + cwd + ")";
}

export function formatTestResult(ok: boolean, reason: string): string {
  return (ok ? "TEST PASS" : "TEST FAIL") + " " + reason;
}

export function firstFailReason(output: string, status: number | null): string {
  const line = output
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.length > 0 && /fail|error|assert|rejected/i.test(item));
  if (line) {
    return line.slice(0, 160);
  }
  return "exit " + String(status ?? "unknown");
}

export function formatMcpCall(server: string, tool: string): string {
  return "MCP CALL " + server + "/" + tool;
}

export function formatGreenSummary(bullets: string[]): string[] {
  const clipped = bullets.slice(0, 8);
  return ["GREEN SUMMARY", ...clipped.map((item) => "- " + item)];
}

export function greenSummaryBullets(input: {
  did: string;
  files: string[];
  mcpUsed: boolean;
  nextPhase: string;
}): string[] {
  const did = input.did.trim() ? input.did.trim() : "unknown";
  const files = input.files.length ? input.files.join(", ") : "unknown";
  return [
    "agent: " + did,
    "files touched: " + files,
    "tests not yet re-run",
    input.mcpUsed ? "MCP used this turn" : "MCP not used this turn",
    "next: " + input.nextPhase,
  ];
}

export function summarizeAgentText(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) {
    return "unknown";
  }
  return flat.slice(0, 200);
}

export function formatPause(reason: string, wouldHave: string): string[] {
  return [
    "PAUSE " + redactSecrets(reason),
    "PAUSE would have: " + wouldHave,
    "still continue ? o/n",
  ];
}
