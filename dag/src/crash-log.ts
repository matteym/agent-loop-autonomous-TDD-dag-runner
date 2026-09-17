import { PARENT_HISTORY_MAX_LINES } from "./send-budget.js";

export function lastFailuresLogBlock(logText: string, nodeId: string): string {
  const marker = " node=" + nodeId + "\n";
  const chunks = logText.split(/\n---\n/);
  let last = "";
  for (const chunk of chunks) {
    const idx = chunk.indexOf(marker);
    if (idx < 0) {
      continue;
    }
    last = chunk.slice(idx + marker.length).trim();
  }
  return last;
}

export function extractRunLogCrash(logText: string, nodeId: string): string {
  const lines = logText.split(/\r?\n/);
  let inNode = false;
  const hit: string[] = [];
  for (const line of lines) {
    if (line.includes("──────── " + nodeId + " ") || line.includes(" " + nodeId + " · ")) {
      inNode = true;
      hit.length = 0;
      continue;
    }
    if (inNode && /──────── .+ · /.test(line) && !line.includes(" " + nodeId + " ")) {
      inNode = false;
      continue;
    }
    if (!inNode) {
      continue;
    }
    if (/TEST FAIL|AssertionError|Error:|FAIL /.test(line)) {
      hit.push(line.replace(/^\[dag\]\s*/, "").trim());
    }
  }
  return hit.slice(0, PARENT_HISTORY_MAX_LINES + 4).join("\n");
}
