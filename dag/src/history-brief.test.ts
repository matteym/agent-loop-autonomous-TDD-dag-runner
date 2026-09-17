import { describe, expect, it } from "vitest";
import { formatParentHistory } from "./history-brief.js";

describe("formatParentHistory", () => {
  it("keeps the last 3 finished parents and 4 lines each", () => {
    const rows = ["a", "b", "c", "d"].map((id, i) =>
      JSON.stringify({
        dagFile: "task.json",
        nodeId: id,
        commit: "feat(" + id + "): work",
        sha: "sha" + i,
        status: "finished",
        tokens: { input: 1, output: 1, total: 2 },
      })
    );
    const text = formatParentHistory({
      jsonl: rows.join("\n"),
      dagFile: "task.json",
    });
    expect(text).toContain("PARENT NODES");
    expect(text).not.toContain("feat(a):");
    expect(text).toContain("feat(d):");
    expect(text).toContain("tokens: 2");
    const parentBlocks = text.split("\n").filter((line) => line.startsWith("feat") || /^(b|c|d) /.test(line));
    expect(parentBlocks.length).toBeLessThanOrEqual(12);
  });
});
