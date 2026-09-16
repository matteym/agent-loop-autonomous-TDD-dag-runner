export type NodeSendContextInput = {
  nodePrompt: string;
  filesHint?: string[];
  codebase_root: string;
  memory_root?: string;
  repo_root?: string;
};

export type NodeSendContextResult = {
  /** Short briefing appended before repo briefing (not whole codebase). */
  context_briefing: string;
  memory_ids: string[];
  context_files: string[];
  may_modify: boolean;
  /** Prepended to agent prompt when may_modify is false. */
  inspect_prefix: string;
};
