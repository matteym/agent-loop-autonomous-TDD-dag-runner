import { spawnSync } from "node:child_process";
import { basename, resolve } from "node:path";

export type ProductLayout = {
  repoRoot: string;
  nested: boolean;
  pluginDirName: string | null;
};

function isGitWorkTree(dir: string): boolean {
  const result = spawnSync("git", ["-C", dir, "rev-parse", "--is-inside-work-tree"], {
    encoding: "utf8",
    windowsHide: true,
  });
  return result.status === 0 && (result.stdout || "").trim() === "true";
}

export function resolveProductLayout(engineRoot: string): ProductLayout {
  const engine = resolve(engineRoot);
  const parent = resolve(engine, "..");
  if (parent === engine) {
    return { repoRoot: engine, nested: false, pluginDirName: null };
  }
  if (!isGitWorkTree(parent)) {
    return { repoRoot: engine, nested: false, pluginDirName: null };
  }
  return {
    repoRoot: parent,
    nested: true,
    pluginDirName: basename(engine),
  };
}

export function pluginGitignoreLine(pluginDirName: string): string {
  return pluginDirName.replace(/\\/g, "/").replace(/\/+$/, "") + "/";
}
