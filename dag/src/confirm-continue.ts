import { createInterface } from "node:readline";
import { formatPause } from "./runtime-ui.js";
import { log } from "./run-log.js";
import { unattendedAction, type UnattendedGate } from "./unattended.js";

export type ConfirmIo = {
  stdinIsTty: boolean;
  question: (prompt: string) => Promise<string>;
};

export function parseContinueAnswer(raw: string): boolean | null {
  const t = raw.trim().toLowerCase();
  if (t === "o" || t === "oui" || t === "y" || t === "yes") {
    return true;
  }
  if (t === "n" || t === "non" || t === "no") {
    return false;
  }
  return null;
}

async function defaultQuestion(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return await new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        resolve(answer);
      });
    });
  } finally {
    rl.close();
  }
}

export function defaultConfirmIo(): ConfirmIo {
  return {
    stdinIsTty: Boolean(process.stdin.isTTY),
    question: defaultQuestion,
  };
}

let confirmIo: ConfirmIo = defaultConfirmIo();

export function setConfirmIo(io: ConfirmIo | null): void {
  confirmIo = io ?? defaultConfirmIo();
}

export async function resolveOperatorGate(
  unattended: boolean,
  gate: UnattendedGate,
  reason: string,
  wouldHave: string
): Promise<"continue" | "stop" | "skip-node"> {
  if (unattended) {
    const action = unattendedAction(gate);
    log("UNATTENDED " + gate + ": " + reason);
    if (action === "exit-1") {
      return "stop";
    }
    if (action === "skip-node") {
      return "skip-node";
    }
    return "continue";
  }
  const ok = await confirmContinue(reason, wouldHave);
  if (!ok) {
    return "stop";
  }
  return gate === "skip-node" ? "skip-node" : "continue";
}

export async function cannotStart(reason: string): Promise<number> {
  const first = await confirmContinue(reason, "exit without starting the DAG");
  if (!first) {
    return 1;
  }
  log("the run cannot start");
  await confirmContinue(reason + " (still cannot start)", "exit 1");
  return 1;
}

export async function confirmContinue(
  reason: string,
  wouldHave: string,
  io: ConfirmIo = confirmIo
): Promise<boolean> {
  for (const line of formatPause(reason, wouldHave)) {
    log(line);
  }
  if (!io.stdinIsTty) {
    log("PAUSE stdin is not a TTY; treating as o (continue)");
    return true;
  }
  for (;;) {
    const raw = await io.question("still continue ? o/n ");
    const parsed = parseContinueAnswer(raw);
    if (parsed !== null) {
      return parsed;
    }
    log("PAUSE answer must be o or n");
  }
}
