import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { nodeStatePath, runStatePath } from "./paths.js";
import type { NodeState, RunState } from "./types.js";

export class RunStateStore {
  readonly memoryRoot: string;

  constructor(memoryRoot: string) {
    this.memoryRoot = memoryRoot;
  }

  save(state: RunState): void {
    const file = runStatePath(this.memoryRoot, state.run_id);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(state), "utf8");
  }

  load(runId: string): RunState | undefined {
    const file = runStatePath(this.memoryRoot, runId);
    if (!existsSync(file)) {
      return undefined;
    }
    return JSON.parse(readFileSync(file, "utf8")) as RunState;
  }
}

export class NodeStateStore {
  readonly memoryRoot: string;

  constructor(memoryRoot: string) {
    this.memoryRoot = memoryRoot;
  }

  save(state: NodeState): void {
    const file = nodeStatePath(this.memoryRoot, state.run_id, state.node_id);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(state), "utf8");
  }

  load(runId: string, nodeId: string): NodeState | undefined {
    const file = nodeStatePath(this.memoryRoot, runId, nodeId);
    if (!existsSync(file)) {
      return undefined;
    }
    return JSON.parse(readFileSync(file, "utf8")) as NodeState;
  }
}
