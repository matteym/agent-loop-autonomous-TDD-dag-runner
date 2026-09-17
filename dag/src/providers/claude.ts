import { query, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { mcpToolAllowlist, toClaudeMcpServers, type ProjectMcp } from "../mcp.js";
import { logMcpCall } from "../run-log.js";
import { mcpCallsFromStreamEvent, uniqueMcpCalls, type McpCall } from "../stream-events.js";
import { parseTokenUsage, unknownTokenUsage, type TokenUsage } from "../token-usage.js";
import type { AgentHandle, AgentRun, WaitStatus } from "./types.js";

function assistantText(msg: SDKMessage): string {
  if (msg.type !== "assistant") {
    return "";
  }
  const content = msg.message.content;
  if (!Array.isArray(content)) {
    return "";
  }
  let out = "";
  for (const block of content) {
    if (
      block &&
      typeof block === "object" &&
      "type" in block &&
      block.type === "text" &&
      "text" in block &&
      typeof block.text === "string"
    ) {
      out += block.text;
    }
  }
  return out;
}

export async function createClaudeAgent(opts: {
  cwd: string;
  model?: string;
  apiKey?: string;
  mcp?: ProjectMcp;
}): Promise<AgentHandle> {
  return {
    id: "claude",
    async send(prompt: string): Promise<AgentRun> {
      const id = "claude-" + String(Date.now());
      const abort = new AbortController();
      const mcpTools = opts.mcp ? mcpToolAllowlist(opts.mcp.names) : [];
      const options: Options = {
        cwd: opts.cwd,
        abortController: abort,
        permissionMode: "acceptEdits",
        allowedTools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep", ...mcpTools],
      };
      if (opts.mcp && opts.mcp.names.length) {
        options.mcpServers = toClaudeMcpServers(opts.mcp.servers);
      }
      if (opts.model) {
        options.model = opts.model;
      }
      if (opts.apiKey) {
        options.env = { ...process.env, ANTHROPIC_API_KEY: opts.apiKey };
      }
      const gen = query({
        prompt,
        options,
      });
      return {
        id,
        async wait() {
          let text = "";
          let status: WaitStatus = "finished";
          let resultText = "";
          let errMsg = "";
          const mcpAcc: McpCall[] = [];
          let tokenUsage: TokenUsage = unknownTokenUsage();
          try {
            for await (const msg of gen) {
              for (const call of mcpCallsFromStreamEvent(msg)) {
                mcpAcc.push(call);
                logMcpCall(call.server, call.tool);
              }
              const chunk = assistantText(msg);
              if (chunk) {
                text += chunk;
                process.stderr.write(chunk);
              }
              if (msg.type !== "result") {
                continue;
              }
              tokenUsage = parseTokenUsage(msg);
              if (msg.subtype === "success" && !msg.is_error) {
                status = "finished";
                resultText = msg.result;
              } else if (msg.subtype === "success") {
                status = "error";
                errMsg = msg.result || "error";
              } else {
                status = "error";
                errMsg = msg.errors.join("; ") || msg.subtype;
              }
            }
          } catch (err) {
            if (abort.signal.aborted) {
              return {
                status: "cancelled",
                text,
                mcpCalls: uniqueMcpCalls(mcpAcc),
                tokenUsage,
              };
            }
            return {
              status: "error",
              text,
              error: { message: String(err) },
              mcpCalls: uniqueMcpCalls(mcpAcc),
              tokenUsage,
            };
          }
          return {
            status,
            result: resultText,
            text,
            error: errMsg ? { message: errMsg } : undefined,
            mcpCalls: uniqueMcpCalls(mcpAcc),
            tokenUsage,
          };
        },
      };
    },
    async [Symbol.asyncDispose]() {
      return;
    },
  };
}
