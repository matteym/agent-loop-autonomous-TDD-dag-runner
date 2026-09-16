import type { ProviderName } from "../cli.js";
import { loadProjectMcp } from "../mcp.js";
import { engineRoot } from "../paths.js";
import { log } from "../run-log.js";
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
  const mcp = loadProjectMcp(opts.cwd, engineRoot);
  log(mcp.names.length ? "mcp=" + mcp.names.join(",") : "mcp=none");
  if (opts.provider === "claude") {
    return createClaudeAgent({
      cwd: opts.cwd,
      model: opts.model,
      apiKey: opts.claudeKey,
      mcp,
    });
  }
  if (!opts.cursorKey) {
    throw new Error("cursor api key missing");
  }
  return createCursorAgent({
    apiKey: opts.cursorKey,
    model: opts.model,
    cwd: opts.cwd,
    mcp,
  });
}
