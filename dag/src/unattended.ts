export type UnattendedGate = "fatal-start" | "preflight-soft" | "skip-node" | "publish";

export type UnattendedAction = "exit-1" | "continue" | "skip-node";

export function isUnattendedMode(input: { stdinIsTty: boolean; flag?: boolean }): boolean {
  return Boolean(input.flag) || !input.stdinIsTty;
}

export function unattendedAction(gate: UnattendedGate): UnattendedAction {
  if (gate === "fatal-start") {
    return "exit-1";
  }
  if (gate === "skip-node") {
    return "skip-node";
  }
  return "continue";
}

export function shouldMergeToMain(input: { unattended: boolean; mergeFlag: boolean }): boolean {
  if (!input.unattended) {
    return true;
  }
  return input.mergeFlag;
}
