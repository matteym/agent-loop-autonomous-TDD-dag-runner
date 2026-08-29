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
  it("accepts numbered multi-select and names", () => {
    expect(parseDatastores("")).toEqual(["postgres", "redis"]);
    expect(parseDatastores("1")).toEqual(["postgres"]);
    expect(parseDatastores("1,2")).toEqual(["postgres", "redis"]);
    expect(parseDatastores("3,4")).toEqual(["mongodb", "neo4j"]);
    expect(parseDatastores("mongo neo4j")).toEqual(["mongodb", "neo4j"]);
    expect(parseDatastores("0")).toEqual([]);
    expect(parseDatastores("none")).toEqual([]);
    expect(parseDatastores("oracle")).toBeNull();
  });
});

describe("layout paths", () => {
  it("maps architecture to app dir and compose context", () => {
    const mono = validateAnswers({ architecture: "monolith" });
    const repo = validateAnswers({ architecture: "monorepo" });
    const micro = validateAnswers({ architecture: "microservices" });
    expect(mono && appDirRel(mono)).toBe("backend");
    expect(repo && appDirRel(repo)).toBe("backend");
    expect(micro && appDirRel(micro)).toBe("backend/app");
    expect(micro && composeBuildContext(micro)).toBe("./backend/app");
    const named = validateAnswers({ architecture: "microservices", appName: "zeub" });
    expect(named && appDirRel(named)).toBe("backend/zeub");
    const both = validateAnswers({ runtime: "both", architecture: "monolith" });
    expect(both && appDirRel(both)).toBe("backend");
    expect(both && composeBuildContext(both)).toBe("./backend");
    expect(both && secondLangDirRel(both)).toBe("python");
  });
});
