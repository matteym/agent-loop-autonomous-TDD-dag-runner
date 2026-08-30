import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { historyDir, logsDir } from "./paths.js";

export type Phase =
  | "RED"
  | "GREEN"
  | "UP"
  | "CI"
  | "GUARD"
  | "TEST"
  | "COMMIT NOW"
  | "ARCHIVE"
  | "PUSH"
  | "PR"
  | "SKIP"
  | "FAIL";

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
  if (phase === "FAIL" || phase === "RED") {
    return paint("31", phase);
  }
  if (phase === "SKIP") {
    return paint("33", phase);
  }
  if (phase === "GREEN" || phase === "ARCHIVE") {
    return paint("32", phase);
  }
  return paint("36", phase);
}

function redact(text: string): string {
  return text
    .replace(/CURSOR_API_KEY[=:\s]+\S+/gi, "CURSOR_API_KEY=***")
    .replace(/CURSOR_SDK_API[=:\s]+\S+/gi, "CURSOR_SDK_API=***")
    .replace(/ANTHROPIC_API_KEY[=:\s]+\S+/gi, "ANTHROPIC_API_KEY=***")
    .replace(/CLAUDE_API_KEY[=:\s]+\S+/gi, "CLAUDE_API_KEY=***")
    .replace(/JWT_SECRET[=:\s]+\S+/gi, "JWT_SECRET=***")
    .replace(/Bearer\s+\S+/gi, "Bearer ***")
    .replace(/refresh_token[=:\s]+\S+/gi, "refresh_token=***");
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
  mkdirSync(logsDir, { recursive: true });
  mkdirSync(historyDir, { recursive: true });
  runLogPath = join(logsDir, "run-" + runStamp(new Date()) + ".log");
}

export function log(message: string) {
  const safe = redact(message);
  const stamped = new Date().toISOString() + " " + safe;
  process.stderr.write("[dag] " + safe + "\n");
  if (runLogPath) {
    appendFileSync(runLogPath, stamped + "\n");
  }
}

export function phase(name: Phase, detail: string) {
  log(phaseColor(name) + " " + detail);
}

export function nodeSeparator(id: string) {
  log(paint("90", "──────── " + id + " ────────"));
}
