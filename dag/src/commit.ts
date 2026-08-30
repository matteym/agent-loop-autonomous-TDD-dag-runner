export function commitMessageValid(message: string): boolean {
  return /^(feat|fix|refactor|perf|test|docs|style|chore|build|ci)(\([a-z0-9-]+\))?: [a-z][^\n.]*$/.test(
    message.trim()
  );
}
