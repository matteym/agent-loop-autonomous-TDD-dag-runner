import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadProductContext, productContextBlock } from "./product-context.js";

describe("loadProductContext", () => {
  it("reads .cursor/product-context.md from the product root", () => {
    const root = mkdtempSync(join(tmpdir(), "dag-product-ctx-"));
    try {
      mkdirSync(join(root, ".cursor"));
      writeFileSync(
        join(root, ".cursor", "product-context.md"),
        "Sports API. Auth is JWT.\n"
      );
      expect(loadProductContext(root)).toBe("Sports API. Auth is JWT.");
      expect(productContextBlock(root)[0]).toMatch(/Product context/);
      expect(productContextBlock(root)[1]).toBe("Sports API. Auth is JWT.");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("falls back to a later root when the product file is missing", () => {
    const product = mkdtempSync(join(tmpdir(), "dag-product-empty-"));
    const engine = mkdtempSync(join(tmpdir(), "dag-engine-ctx-"));
    try {
      mkdirSync(join(engine, ".cursor"));
      writeFileSync(join(engine, ".cursor", "product-context.md"), "engine copy");
      expect(loadProductContext(product, engine)).toBe("engine copy");
    } finally {
      rmSync(product, { recursive: true, force: true });
      rmSync(engine, { recursive: true, force: true });
    }
  });

  it("returns empty when no context file exists", () => {
    const root = mkdtempSync(join(tmpdir(), "dag-product-none-"));
    try {
      expect(loadProductContext(root)).toBe("");
      expect(productContextBlock(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
