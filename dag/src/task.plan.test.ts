import { describe, expect, it } from "vitest";
import { maxPlanTasks } from "./task.js";

describe("planner limits", () => {
  it("allows up to 10 features per yarn task", () => {
    expect(maxPlanTasks).toBe(10);
  });
});
