import { query, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
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
}): Promise<AgentHandle> {
  return {
    id: "claude",
    async send(prompt: string): Promise<AgentRun> {
      const id = "claude-" + String(Date.now());
      const abort = new AbortController();
      const options: Options = {
        cwd: opts.cwd,
        abortController: abort,
        permissionMode: "acceptEdits",
        allowedTools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep"],
      };
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
          try {
            for await (const msg of gen) {
              const chunk = assistantText(msg);
              if (chunk) {
                text += chunk;
                process.stderr.write(chunk);
              }
              if (msg.type !== "result") {
                continue;
              }
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
              return { status: "cancelled", text };
            }
            return {
              status: "error",
              text,
              error: { message: String(err) },
            };
          }
          return {
            status,
            result: resultText,
            text,
            error: errMsg ? { message: errMsg } : undefined,
          };
        },
      };
    },
    async [Symbol.asyncDispose]() {
      return;
    },
  };
}
