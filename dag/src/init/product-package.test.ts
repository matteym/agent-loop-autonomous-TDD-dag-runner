import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  dagAgentPackageName,
  mergeProductPackage,
  vendorDagIntoProduct,
  writeProductPackage,
} from "./product-package.js";

describe("mergeProductPackage", () => {
  it("links file:dag and adds yarn dag without wiping existing scripts", () => {
    const merged = mergeProductPackage({
      name: "notes-api",
      scripts: { test: "vitest run", start: "node src/index.js" },
      dependencies: { express: "^4.0.0" },
    });
    expect(merged.private).toBe(true);
    expect(merged.name).toBe("notes-api");
    expect(merged.scripts.test).toBe("vitest run");
    expect(merged.scripts.start).toBe("node src/index.js");
    expect(merged.scripts.dag).toBe("dag");
    expect(merged.scripts["dag:mobile"]).toContain("dag");
    expect(merged.scripts["dag:desktop"]).toContain("dag");
    expect(merged.scripts.postinstall).toContain("product-postinstall");
    expect(merged.dependencies.express).toBe("^4.0.0");
    expect(merged.dependencies[dagAgentPackageName]).toBe("file:dag");
  });

  it("does not duplicate the postinstall hook", () => {
    const first = mergeProductPackage({});
    const second = mergeProductPackage(first);
    const hits = second.scripts.postinstall.split("product-postinstall").length - 1;
    expect(hits).toBe(1);
  });

  it("does not file: depend on itself when this repo is the agent package", () => {
    const merged = mergeProductPackage({ name: dagAgentPackageName });
    expect(merged.dependencies[dagAgentPackageName]).toBeUndefined();
    expect(merged.scripts.postinstall).toBeUndefined();
  });

  it("keeps an existing git URL for the agent so yarn upgrade still works", () => {
    const gitUrl = "git+https://github.com/acme/agent-loop-autonomous-TDD-dag-runner.git";
    const merged = mergeProductPackage({
      dependencies: { [dagAgentPackageName]: gitUrl },
    });
    expect(merged.dependencies[dagAgentPackageName]).toBe(gitUrl);
  });
});

describe("vendorDagIntoProduct", () => {
  it("copies dag sources into the product and skips node_modules", () => {
    const dir = mkdtempSync(join(tmpdir(), "dag-vendor-"));
    try {
      const engineDag = join(dir, "plugin", "dag");
      const productDag = join(dir, "product", "dag");
      mkdirSync(join(engineDag, "src"), { recursive: true });
      mkdirSync(join(engineDag, "node_modules", "tsx"), { recursive: true });
      writeFileSync(join(engineDag, "package.json"), '{"name":"@local/dag-agent"}\n');
      writeFileSync(join(engineDag, "src", "loop.ts"), "export {}\n");
      writeFileSync(join(engineDag, "node_modules", "tsx", "index.js"), "nope\n");
      expect(vendorDagIntoProduct(engineDag, productDag)).toBe(true);
      expect(readFileSync(join(productDag, "package.json"), "utf8")).toContain("@local/dag-agent");
      expect(existsSync(join(productDag, "src", "loop.ts"))).toBe(true);
      expect(existsSync(join(productDag, "node_modules"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not overwrite an already vendored dag", () => {
    const dir = mkdtempSync(join(tmpdir(), "dag-vendor-skip-"));
    try {
      const engineDag = join(dir, "engine-dag");
      const productDag = join(dir, "product-dag");
      mkdirSync(engineDag, { recursive: true });
      mkdirSync(productDag, { recursive: true });
      writeFileSync(join(engineDag, "package.json"), '{"name":"new"}\n');
      writeFileSync(join(productDag, "package.json"), '{"name":"existing"}\n');
      expect(vendorDagIntoProduct(engineDag, productDag)).toBe(false);
      expect(readFileSync(join(productDag, "package.json"), "utf8")).toContain("existing");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("writeProductPackage", () => {
  it("writes package.json on disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "dag-pkg-"));
    try {
      writeProductPackage(dir);
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
        scripts: { dag: string };
        dependencies: { [name: string]: string };
      };
      expect(pkg.scripts.dag).toBe("dag");
      expect(pkg.dependencies[dagAgentPackageName]).toBe("file:dag");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
