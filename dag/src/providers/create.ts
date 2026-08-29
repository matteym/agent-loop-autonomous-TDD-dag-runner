import type { ProviderName } from "../cli.js";
import { createClaudeAgent } from "./claude.js";
import { createCursorAgent } from "./cursor.js";
import type { AgentHandle } from "./types.js";

export async function createAgentHandle(opts: {
  provider: ProviderName;
  model: string;
  cwd: string;
  cursorKey?: string;
  claudeKey?: string;
}): Promise<AgentHandle> {
  if (opts.provider === "claude") {
    return createClaudeAgent({
      cwd: opts.cwd,
      model: opts.model,
      apiKey: opts.claudeKey,
    });
  }
  if (!opts.cursorKey) {
    throw new Error("cursor api key missing");
  }
  return createCursorAgent({
    apiKey: opts.cursorKey,
    model: opts.model,
    cwd: opts.cwd,
  });
}
