import type { ProviderName } from "../cli.js";
import { resolveClaudeKey, resolveCursorKey } from "../keys.js";

export function resolveProvider(flag: ProviderName | undefined): {
  provider: ProviderName | null;
  cursorKey?: string;
  claudeKey?: string;
} {
  const cursorKey = resolveCursorKey();
  const claudeKey = resolveClaudeKey();
  if (flag === "cursor") {
    return { provider: cursorKey ? "cursor" : null, cursorKey, claudeKey };
  }
  if (flag === "claude") {
    return { provider: claudeKey ? "claude" : null, cursorKey, claudeKey };
  }
  if (cursorKey && claudeKey) {
    return { provider: "cursor", cursorKey, claudeKey };
  }
  if (cursorKey) {
    return { provider: "cursor", cursorKey, claudeKey };
  }
  if (claudeKey) {
    return { provider: "claude", cursorKey, claudeKey };
  }
  return { provider: null, cursorKey, claudeKey };
}
