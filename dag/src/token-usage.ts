export type TokenCount = number | "unknown";

export type TokenUsage = {
  input: TokenCount;
  output: TokenCount;
  total: TokenCount;
};

export function unknownTokenUsage(): TokenUsage {
  return { input: "unknown", output: "unknown", total: "unknown" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asCount(value: unknown): TokenCount {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  return "unknown";
}

function pickCount(record: Record<string, unknown>, keys: string[]): TokenCount {
  for (const key of keys) {
    const count = asCount(record[key]);
    if (count !== "unknown") {
      return count;
    }
  }
  return "unknown";
}

function fromRecord(record: Record<string, unknown>): TokenUsage {
  const input = pickCount(record, [
    "input_tokens",
    "prompt_tokens",
    "inputTokens",
    "promptTokens",
    "input",
  ]);
  const output = pickCount(record, [
    "output_tokens",
    "completion_tokens",
    "outputTokens",
    "completionTokens",
    "output",
  ]);
  let total = pickCount(record, ["total_tokens", "totalTokens", "total"]);
  if (total === "unknown" && input !== "unknown" && output !== "unknown") {
    total = input + output;
  }
  return { input, output, total };
}

/** Parse provider usage metadata. Never estimate billed tokens from character counts. */
export function parseTokenUsage(source: unknown): TokenUsage {
  if (!isRecord(source)) {
    return unknownTokenUsage();
  }
  if (isRecord(source.usage)) {
    return fromRecord(source.usage);
  }
  if (isRecord(source.token_usage)) {
    return fromRecord(source.token_usage);
  }
  if (isRecord(source.tokenUsage)) {
    return fromRecord(source.tokenUsage);
  }
  const direct = fromRecord(source);
  if (direct.input !== "unknown" || direct.output !== "unknown" || direct.total !== "unknown") {
    return direct;
  }
  return unknownTokenUsage();
}

function addCount(left: TokenCount, right: TokenCount): TokenCount {
  if (left === "unknown" || right === "unknown") {
    return "unknown";
  }
  return left + right;
}

export function addTokenUsage(left: TokenUsage, right: TokenUsage): TokenUsage {
  return {
    input: addCount(left.input, right.input),
    output: addCount(left.output, right.output),
    total: addCount(left.total, right.total),
  };
}

export function formatTokenUsageLine(nodeId: string, usage: TokenUsage): string {
  return (
    "[TOKEN USAGE] Node " +
    nodeId +
    " - Prompt: " +
    String(usage.input) +
    " | Completion: " +
    String(usage.output) +
    " | Total: " +
    String(usage.total)
  );
}
