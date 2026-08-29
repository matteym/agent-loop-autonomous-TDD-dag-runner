import { Agent } from "@cursor/sdk";
import type { AgentHandle, AgentRun } from "./types.js";

export async function createCursorAgent(opts: {
  apiKey: string;
  model: string;
  cwd: string;
}): Promise<AgentHandle> {
  const agent = await Agent.create({
    apiKey: opts.apiKey,
    model: { id: opts.model },
    local: { cwd: opts.cwd, settingSources: ["project"] },
  });
  return {
    id: agent.agentId,
    async send(prompt: string): Promise<AgentRun> {
      const run = await agent.send(prompt);
      return {
        id: run.id,
        async wait() {
          let text = "";
          if (run.supports("stream")) {
            for await (const event of run.stream()) {
              if (event.type === "assistant") {
                for (const block of event.message.content) {
                  if (block.type === "text") {
                    text += block.text;
                    process.stderr.write(block.text);
                  }
                }
              } else if (event.type === "thinking") {
                process.stderr.write(event.text);
              }
            }
          }
          const result = await run.wait();
          return {
            status: result.status,
            result: result.result,
            text,
            error: result.error ? { message: result.error.message } : undefined,
          };
        },
      };
    },
    async [Symbol.asyncDispose]() {
      await agent[Symbol.asyncDispose]();
    },
  };
}
