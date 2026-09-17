import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultPort, validatePort, type InitPort } from "./port.js";
import { copyEngineCursor, writeBootstrap } from "./bootstrap.js";
import { vendorDagIntoProduct, writeProductPackage } from "./product-package.js";
import { syncCiWorkflow } from "../ci.js";
import { renderCompose } from "./compose.js";
import { hasCompose, isEmptyTarget, repoHasServerSrc } from "./detect.js";
import { renderEnv } from "./env.js";
import {
  commitBootstrap,
  hasGitIdentity,
  missingGitIdentityHint,
  pushHead,
  setOriginRemote,
} from "./git.js";
import { confirmContinue } from "../confirm-continue.js";
import { log, phase } from "./log.js";
import { pluginGitignoreLine } from "../layout.js";
import {
  dagDir,
  engineRoot,
  metadataInitDefaultsPath,
  nestedPlugin,
  pluginDirName,
  repoRoot,
} from "../paths.js";

export type InitOpts = {
  force?: boolean;
  nonInteractive?: boolean;
  remote?: string;
};

export type InitResult =
  | { status: "ok" }
  | { status: "aborted" }
  | { status: "refused"; reason: string };

function loadJsonPort(filePath: string): InitPort {
  if (!existsSync(filePath)) {
    throw new Error("answers file not found: " + filePath);
  }
  const parsed = validatePort(JSON.parse(readFileSync(filePath, "utf8")));
  if (!parsed) {
    throw new Error("invalid answers in " + filePath);
  }
  return parsed;
}

function loadNonInteractivePort(): InitPort {
  if (existsSync(metadataInitDefaultsPath)) {
    return loadJsonPort(metadataInitDefaultsPath);
  }
  return defaultPort();
}

function refuseUnlessForce(force: boolean | undefined, reason: string): InitResult | null {
  if (force) {
    return null;
  }
  return { status: "refused", reason };
}

export const missingRemoteHint =
  "yarn run init requires --remote=https://github.com/OWNER/REPO.git (or --repo=)";

export async function runInit(opts: InitOpts = {}): Promise<InitResult> {
  if (!opts.remote) {
    return { status: "refused", reason: missingRemoteHint };
  }
  if (!hasGitIdentity(repoRoot)) {
    const cont = await confirmContinue(missingGitIdentityHint, "refuse init");
    if (!cont) {
      return { status: "refused", reason: missingGitIdentityHint };
    }
    log("the run cannot start");
    await confirmContinue(missingGitIdentityHint + " (still cannot start)", "refuse init");
    return { status: "refused", reason: missingGitIdentityHint };
  }
  if (repoHasServerSrc(repoRoot)) {
    const refused = refuseUnlessForce(
      opts.force,
      "refusing: Server/src exists (brownfield). use --force to overwrite"
    );
    if (refused) {
      return refused;
    }
  }
  const pluginSkip = pluginDirName ? [pluginDirName] : [];
  if (!isEmptyTarget(repoRoot, pluginSkip) || hasCompose(repoRoot)) {
    const refused = refuseUnlessForce(
      opts.force,
      "refusing: repo is not empty. use --force to overwrite"
    );
    if (refused) {
      return refused;
    }
  }

  const port = opts.nonInteractive ? loadNonInteractivePort() : defaultPort();

  phase("COMPOSE", "docker-compose.yml .env");
  const env = renderEnv(port);
  writeFileSync(join(repoRoot, "docker-compose.yml"), renderCompose());
  writeFileSync(join(repoRoot, ".env"), env.dotenv);
  writeFileSync(join(repoRoot, ".env.example"), env.example);
  phase("BOOTSTRAP", "src");
  const extraIgnore = pluginDirName ? [pluginGitignoreLine(pluginDirName)] : [];
  writeBootstrap(repoRoot, extraIgnore);
  if (nestedPlugin) {
    phase("PLUGIN", pluginDirName + " leftover clone gitignored; dag/ is versioned on the product");
    copyEngineCursor(engineRoot, repoRoot);
  }
  phase("DAG", "vendor engine + yarn dag");
  vendorDagIntoProduct(dagDir, join(repoRoot, "dag"));
  writeProductPackage(repoRoot);
  phase("CI", ".github/workflows/ci.yml");
  syncCiWorkflow(repoRoot);
  commitBootstrap(repoRoot);

  phase("REMOTE", opts.remote);
  const linked = setOriginRemote(repoRoot, opts.remote, opts.force);
  if (!linked.ok) {
    return { status: "refused", reason: linked.reason };
  }
  phase("PUSH", "origin HEAD");
  const pushed = pushHead(repoRoot);
  if (!pushed.ok) {
    return { status: "refused", reason: pushed.reason };
  }
  log("origin=" + linked.url);
  log('next: yarn dag "your first feature"');
  return { status: "ok" };
}
