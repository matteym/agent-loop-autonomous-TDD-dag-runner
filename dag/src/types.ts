export type TestSpec = {
  cwd: string;
  cmd: string;
  args: string[];
  optionalCwd?: boolean;
};

export type Task = {
  id: string;
  prompt: string;
  commit: string;
  tests: TestSpec[];
  allowEmptyCommit?: boolean;
};

export type Dag = {
  title: string;
  model: string;
  cwd: string;
  tasks: Task[];
};
