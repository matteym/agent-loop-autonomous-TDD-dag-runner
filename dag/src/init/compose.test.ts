import { describe, expect, it } from "vitest";
import { validateAnswers, type InitAnswers } from "./answers.js";
import { renderCompose } from "./compose.js";

function base(over: Partial<InitAnswers> = {}): InitAnswers {
  const parsed = validateAnswers({
    runtime: "ts",
    architecture: "monolith",
    appName: "app",
    appPort: 3000,
    postgres: true,
    redis: true,
    ...over,
  });
  if (!parsed) {
    throw new Error("fixture");
  }
  return parsed;
}

describe("renderCompose", () => {
  it("includes postgres redis and app with health depends", () => {
    const yaml = renderCompose(base());
    expect(yaml).toContain("image: postgres:16-alpine");
    expect(yaml).toContain("image: redis:7-alpine");
    expect(yaml).toContain("build: .");
    expect(yaml).toContain("condition: service_healthy");
    expect(yaml).toContain("pgdata:");
    expect(yaml).toContain("${APP_PORT}:${APP_PORT}");
  });

  it("omits databases when none selected", () => {
    const yaml = renderCompose(base({ postgres: false, redis: false }));
    expect(yaml).not.toContain("postgres:");
    expect(yaml).not.toContain("redis:");
    expect(yaml).not.toContain("depends_on:");
    expect(yaml).not.toContain("volumes:");
    expect(yaml).toContain("  app:");
  });

  it("uses apps/api build context for monorepo", () => {
    const yaml = renderCompose(base({ architecture: "monorepo" }));
    expect(yaml).toContain("build: ./apps/api");
  });

  it("uses services/api build context for microservices", () => {
    const yaml = renderCompose(base({ architecture: "microservices" }));
    expect(yaml).toContain("build: ./services/api");
  });

  it("uses apps/api when both languages on a monolith", () => {
    const yaml = renderCompose(base({ runtime: "both", architecture: "monolith" }));
    expect(yaml).toContain("build: ./apps/api");
  });

  it("includes only redis when postgres is off", () => {
    const yaml = renderCompose(base({ postgres: false, redis: true }));
    expect(yaml).not.toContain("postgres:");
    expect(yaml).toContain("redis:");
    expect(yaml).toContain("      redis:");
    expect(yaml).not.toContain("pgdata:");
  });
});
