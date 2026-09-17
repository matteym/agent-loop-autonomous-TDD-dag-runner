import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import {
  dagDir,
  donePathFor,
  engineRoot,
  historyDir,
  historyPath,
  logsDir,
  metadataAgentIdPath,
  metadataDagPath,
  metadataDir,
  metadataStatePath,
  metadataTaskPath,
  repoRoot,
  resolveDagFile,
  statusPath,
} from "./paths.js";

describe("paths", () => {
  it("resolves metadata history and logs under dagDir", () => {
    expect(basename(metadataDir)).toBe("metadata");
    expect(basename(historyDir)).toBe("history");
    expect(basename(logsDir)).toBe("logs");
    expect(metadataDagPath.replace(/\\/g, "/")).toMatch(/metadata\/dag\.json$/);
    expect(metadataTaskPath.replace(/\\/g, "/")).toMatch(/metadata\/task\.json$/);
    expect(metadataStatePath.replace(/\\/g, "/")).toMatch(/metadata\/state\.json$/);
    expect(metadataAgentIdPath.replace(/\\/g, "/")).toMatch(/metadata\/agent-id$/);
    expect(historyPath.replace(/\\/g, "/")).toMatch(/history\/nodes\.jsonl$/);
    expect(statusPath.replace(/\\/g, "/")).toMatch(/logs\/status$/);
  });

  it("resolves dagfile relative to dagDir", () => {
    expect(resolveDagFile("metadata/dag.json")).toBe(metadataDagPath);
    expect(donePathFor(metadataDagPath).replace(/\\/g, "/")).toMatch(
      /metadata\/dag\.done\.json$/
    );
  });

  it("keeps dagDir named dag and engineRoot as its parent", () => {
    expect(basename(dagDir)).toBe("dag");
    expect(engineRoot).toBeTruthy();
    expect(repoRoot).toBeTruthy();
  });
});
