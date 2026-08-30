import { describe, expect, it } from "vitest";
import { missingRemoteHint, runInit } from "./run.js";

describe("runInit", () => {
  it("refuses without --remote or --repo", async () => {
    const result = await runInit();
    expect(result).toEqual({ status: "refused", reason: missingRemoteHint });
  });
});
