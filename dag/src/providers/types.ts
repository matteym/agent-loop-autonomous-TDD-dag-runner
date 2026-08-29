export type WaitStatus = "finished" | "error" | "cancelled";

export type AgentRunResult = {
  status: WaitStatus;
  result?: string;
  text?: string;
  error?: { message: string };
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
