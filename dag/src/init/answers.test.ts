import { describe, expect, it } from "vitest";
import {
  appDirRel,
  composeBuildContext,
  secondLangDirRel,
  parseArchitecture,
  parseDatastores,
  parseRuntime,
  parseSlug,
  validateAnswers,
} from "./answers.js";

describe("parseRuntime", () => {
  it("accepts ts and python aliases", () => {
    expect(parseRuntime("")).toBe("ts");
    expect(parseRuntime("ts")).toBe("ts");
    expect(parseRuntime("TypeScript")).toBe("ts");
    expect(parseRuntime("node")).toBe("ts");
    expect(parseRuntime("py")).toBe("py");
    expect(parseRuntime("python")).toBe("py");
    expect(parseRuntime("2")).toBe("py");
    expect(parseRuntime("3")).toBe("both");
    expect(parseRuntime("both")).toBe("both");
    expect(parseRuntime("go")).toBeNull();
  });
});

describe("parseArchitecture", () => {
  it("accepts monolith monorepo and microservices", () => {
    expect(parseArchitecture("")).toBe("monolith");
    expect(parseArchitecture("monolith")).toBe("monolith");
    expect(parseArchitecture("monorepo")).toBe("monorepo");
    expect(parseArchitecture("microservices")).toBe("microservices");
    expect(parseArchitecture("micro")).toBe("microservices");
    expect(parseArchitecture("3")).toBe("microservices");
    expect(parseArchitecture("micro service")).toBe("microservices");
    expect(parseArchitecture("lambda")).toBeNull();
  });
});

describe("parseSlug", () => {
  it("normalizes underscores and spaces", () => {
    expect(parseSlug("todo_list", "app")).toBe("todo-list");
    expect(parseSlug("todo list", "app")).toBe("todo-list");
    expect(parseSlug("todolist", "app")).toBe("todolist");
    expect(parseSlug("TodoList!", "app")).toBeNull();
  });
});

describe("parseDatastores", () => {
  it("accepts both and none", () => {
    expect(parseDatastores("")).toEqual({ postgres: true, redis: true });
    expect(parseDatastores("1")).toEqual({ postgres: true, redis: true });
    expect(parseDatastores("2")).toEqual({ postgres: true, redis: false });
    expect(parseDatastores("3")).toEqual({ postgres: false, redis: false });
    expect(parseDatastores("postgres")).toEqual({ postgres: true, redis: false });
    expect(parseDatastores("none")).toEqual({ postgres: false, redis: false });
  });
});

describe("layout paths", () => {
  it("maps architecture to app dir and compose context", () => {
    const mono = validateAnswers({ architecture: "monolith" });
    const repo = validateAnswers({ architecture: "monorepo" });
    const micro = validateAnswers({ architecture: "microservices" });
    expect(mono && appDirRel(mono)).toBe(".");
    expect(repo && appDirRel(repo)).toBe("apps/api");
    expect(micro && appDirRel(micro)).toBe("services/api");
    expect(micro && composeBuildContext(micro)).toBe("./services/api");
    const both = validateAnswers({ runtime: "both", architecture: "monolith" });
    expect(both && appDirRel(both)).toBe("apps/api");
    expect(both && composeBuildContext(both)).toBe("./apps/api");
    expect(both && secondLangDirRel(both)).toBe("apps/py");
  });
});
