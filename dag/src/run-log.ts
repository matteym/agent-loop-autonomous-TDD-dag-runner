import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { historyDir, logsDir } from "./paths.js";
import {
  formatNodeBanner,
  formatRunHeader,
  formatStep,
  redactSecrets,
  type UiPhase,
} from "./runtime-ui.js";

export type Phase = UiPhase | "COMMIT NOW";

let runLogPath = "";

export function colorEnabled(): boolean {
  return Boolean(process.stderr.isTTY);
}

export function paint(code: string, text: string): string {
  if (!colorEnabled()) {
    return text;
  }
  return "\u001b[" + code + "m" + text + "\u001b[0m";
}

function phaseColor(phase: Phase): string {
  if (phase === "FAIL" || phase === "RED" || phase === "PAUSE") {
    return paint("31", phase);
  }
  if (phase === "SKIP" || phase === "REPAIR") {
    return paint("33", phase);
  }
  if (phase === "GREEN" || phase === "ARCHIVE") {
    return paint("32", phase);
  }
  const label = phase === "COMMIT NOW" ? "COMMIT" : phase;
  return paint("36", label);
}

function runStamp(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    String(d.getFullYear()) +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    "-" +
    p(d.getHours()) +
    p(d.getMinutes()) +
    p(d.getSeconds())
  );
}

export function initRunLog() {
  if (runLogPath) {
    return;
  }
  mkdirSync(logsDir, { recursive: true });
  mkdirSync(historyDir, { recursive: true });
  runLogPath = join(logsDir, "run-" + runStamp(new Date()) + ".log");
}

export function log(message: string) {
  const safe = redactSecrets(message);
  const stamped = new Date().toISOString() + " " + safe;
  process.stderr.write("[dag] " + safe + "\n");
  if (runLogPath) {
    appendFileSync(runLogPath, stamped + "\n");
  }
}

export function phase(name: Phase, detail: string) {
  log(phaseColor(name) + " " + detail);
}

export function step(text: string) {
  log(formatStep(text));
}

export function logRunHeader(input: {
  provider: string;
  branch: string;
  model: string;
  title: string;
  mcpNames: string[];
}) {
  for (const line of formatRunHeader(input)) {
    log(line);
  }
}

export function logMcpCall(server: string, tool: string) {
  phase("MCP", "CALL " + server + "/" + tool);
}

export function nodeSeparator(id: string, commit?: string) {
  log(paint("90", formatNodeBanner(id, commit || "")));
}

export function currentRunLogPath(): string {
  return runLogPath;
}

export function logTokenUsage(line: string) {
  log(line);
}
