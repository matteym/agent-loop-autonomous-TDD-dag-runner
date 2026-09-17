import type { TokenUsage } from "../token-usage.js";

export type WaitStatus = "finished" | "error" | "cancelled";

export type McpCallNote = {
  server: string;
  tool: string;
};

export type AgentRunResult = {
  status: WaitStatus;
  result?: string;
  text?: string;
  error?: { message: string };
  mcpCalls?: McpCallNote[];
  tokenUsage?: TokenUsage;
};

export type AgentRun = {
  id: string;
  wait(): Promise<AgentRunResult>;
};

export type AgentHandle = {
  id: string;
  send(prompt: string): Promise<AgentRun>;
  [Symbol.asyncDispose](): Promise<void>;
};
