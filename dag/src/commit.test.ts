import { describe, expect, it } from "vitest";
import { commitMessageValid } from "./commit.js";

describe("commitMessageValid", () => {
  it("accepts conventional commits without a trailing period", () => {
    expect(commitMessageValid("feat(api): add login")).toBe(true);
    expect(commitMessageValid("chore(ci): sync workflow")).toBe(true);
    expect(commitMessageValid("chore(config): archive dag node notes")).toBe(true);
  });

  it("rejects trailing period, uppercase subject, and unknown types", () => {
    expect(commitMessageValid("feat(api): add login.")).toBe(false);
    expect(commitMessageValid("feat(api): Add login")).toBe(false);
    expect(commitMessageValid("wip: try something")).toBe(false);
  });
});
