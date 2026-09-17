export const EXTRA_CONTEXT_MAX_CHARS = 8000;
export const CRASH_LIVE_MAX_CHARS = 4000;
export const CRASH_FAILURES_LOG_MAX_CHARS = 4000;
export const CRASH_RUN_LOG_MAX_CHARS = 1500;
export const SIMILAR_FAILURE_MAX_BULLETS = 5;
export const SIMILAR_FAILURE_BULLET_MAX_CHARS = 200;
export const PARENT_HISTORY_MAX_NODES = 3;
export const PARENT_HISTORY_MAX_LINES = 4;
export const FILES_HINT_MAX = 8;

export type CrashSource = "live" | "failures.log" | "run-log" | "none";

export type CrashSlice = {
  source: CrashSource;
  text: string;
};

export type ExtraContextInput = {
  crash?: string;
  similarFailures?: string[];
  parentHistory?: string;
  knowledgeBriefing?: string;
  filesHint?: string[];
  omitParentHistory?: boolean;
  maxChars?: number;
};

export function capText(text: string, max: number): string {
  if (max <= 0) {
    return "";
  }
  if (text.length <= max) {
    return text;
  }
  if (max === 1) {
    return "…";
  }
  return text.slice(0, max - 1) + "…";
}

export function capFilesHint(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of paths) {
    const path = raw.replace(/\\/g, "/").trim();
    if (!path || seen.has(path)) {
      continue;
    }
    seen.add(path);
    out.push(path);
    if (out.length >= FILES_HINT_MAX) {
      break;
    }
  }
  return out;
}

export function pickCrashSlice(input: {
  liveOutput?: string;
  failuresLogBlock?: string;
  runLogExtract?: string;
}): CrashSlice {
  const live = (input.liveOutput ?? "").trim();
  if (live) {
    return { source: "live", text: capText(live, CRASH_LIVE_MAX_CHARS) };
  }
  const fromLog = (input.failuresLogBlock ?? "").trim();
  if (fromLog) {
    return { source: "failures.log", text: capText(fromLog, CRASH_FAILURES_LOG_MAX_CHARS) };
  }
  const fromRun = (input.runLogExtract ?? "").trim();
  if (fromRun) {
    return { source: "run-log", text: capText(fromRun, CRASH_RUN_LOG_MAX_CHARS) };
  }
  return { source: "none", text: "" };
}

function formatSimilarFailures(bullets: string[]): string {
  const lines: string[] = [];
  for (const bullet of bullets) {
    const clipped = capText(bullet.replace(/\s+/g, " ").trim(), SIMILAR_FAILURE_BULLET_MAX_CHARS);
    if (!clipped) {
      continue;
    }
    lines.push("- " + clipped);
    if (lines.length >= SIMILAR_FAILURE_MAX_BULLETS) {
      break;
    }
  }
  if (!lines.length) {
    return "";
  }
  return "Similar failures / abandoned attempts:\n" + lines.join("\n");
}

function formatFilesHintLine(paths: string[]): string {
  const capped = capFilesHint(paths);
  if (!capped.length) {
    return "";
  }
  return "filesHint: " + capped.join(", ");
}

function joinSections(parts: string[]): string {
  return parts.filter((part) => part.trim().length > 0).join("\n\n");
}

/** Assemble extra Agent.send payload under a hard char cap. Drop lowest-priority sections first. */
export function assembleExtraContext(input: ExtraContextInput): string {
  const max = input.maxChars ?? EXTRA_CONTEXT_MAX_CHARS;
  const similar = formatSimilarFailures(input.similarFailures ?? []);
  const filesHint = formatFilesHintLine(input.filesHint ?? []);
  const parent =
    input.omitParentHistory ? "" : (input.parentHistory ?? "").trim();
  const crash = (input.crash ?? "").trim() ? "Crash:\n" + (input.crash ?? "").trim() : "";
  const knowledge = (input.knowledgeBriefing ?? "").trim();

  const ordered = [crash, similar, parent, knowledge, filesHint];
  let kept = ordered.filter((part) => part.length > 0);
  while (kept.length) {
    const joined = joinSections(kept);
    if (joined.length <= max) {
      return joined;
    }
    const prefix = joinSections(kept.slice(0, -1));
    const sep = prefix ? 2 : 0;
    const room = max - prefix.length - sep;
    if (room > 8) {
      const last = capText(kept[kept.length - 1], room);
      return joinSections([...kept.slice(0, -1), last]);
    }
    kept = kept.slice(0, -1);
  }
  return "";
}
