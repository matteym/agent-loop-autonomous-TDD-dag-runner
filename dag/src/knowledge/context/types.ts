export type AgentContext = {
  objective: string;
  files: string[];
  symbols: string[];
  deps: string[];
  tests: string[];
  conventions: string[];
  architecture: string[];
  historical_decisions: string[];
  similar_failures: string[];
  solutions: string[];
  recent_git: string[];
  invariants: string[];
};

export type ContextBuilderInput = {
  nodePrompt: string;
  filesHint?: string[];
  codebase_root: string;
  memory_root?: string;
  repo_root?: string;
};

export type ContextSufficiency = {
  files_understood: boolean;
  dependencies_understood: boolean;
  tests_found: boolean;
  architecture_found: boolean;
  history_checked: boolean;
  failures_checked: boolean;
  invariants_checked: boolean;
};
