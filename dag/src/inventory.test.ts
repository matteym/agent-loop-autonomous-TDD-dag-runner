import { describe, expect, it } from "vitest";
import {
  inferLangFromText,
  mismatchLangTests,
  testByLang,
  testsMatch,
} from "./inventory.js";

describe("inferLangFromText", () => {
  it("maps stacks to ts py go rust", () => {
    expect(inferLangFromText("FastAPI notes API")).toBe("py");
    expect(inferLangFromText("Django auth")).toBe("py");
    expect(inferLangFromText("Express JWT login")).toBe("ts");
    expect(inferLangFromText("NestJS users")).toBe("ts");
    expect(inferLangFromText("gin HTTP gateway")).toBe("go");
    expect(inferLangFromText("go test the handler")).toBe("go");
    expect(inferLangFromText("axum rust service")).toBe("rust");
    expect(inferLangFromText("add a button")).toBeNull();
  });
});

describe("testsMatch", () => {
  it("rejects yarn test for a FastAPI node", () => {
    expect(testsMatch(testByLang.py, { cmd: "yarn", args: ["test"] })).toBe(false);
    expect(
      testsMatch(testByLang.py, {
        cmd: "uv",
        args: ["run", "python", "-m", "pytest", "-q"],
      })
    ).toBe(true);
  });
});

describe("mismatchLangTests", () => {
  it("rejects FastAPI planned as yarn test", () => {
    expect(mismatchLangTests("FastAPI notes API", { cmd: "yarn", args: ["test"] })).toBe(
      "inferred py; tests must be uv run python -m pytest -q"
    );
  });

  it("rejects gin planned as yarn test", () => {
    expect(mismatchLangTests("gin HTTP gateway", { cmd: "yarn", args: ["test"] })).toBe(
      "inferred go; tests must be go test ./..."
    );
  });

  it("accepts matching rust cargo test", () => {
    expect(mismatchLangTests("axum rust service", { cmd: "cargo", args: ["test"] })).toBeNull();
  });

  it("does not force a language on a vague intent", () => {
    expect(mismatchLangTests("add a button", { cmd: "yarn", args: ["test"] })).toBeNull();
  });
});
