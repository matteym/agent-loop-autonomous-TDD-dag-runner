import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultAnswers, validateAnswers, type InitAnswers } from "./answers.js";
import { writeBootstrap } from "./bootstrap.js";
import { renderCompose } from "./compose.js";
import { hasCompose, isEmptyTarget, repoHasServerSrc } from "./detect.js";
import { renderEnv } from "./env.js";
import { commitRails, hasGitIdentity, missingGitIdentityHint } from "./git.js";
import { log, phase } from "./log.js";
import { metadataInitDefaultsPath, repoRoot } from "../paths.js";

export type InitOpts = {
  force?: boolean;
  nonInteractive?: boolean;
};

export type InitResult =
  | { status: "ok" }
  | { status: "aborted" }
  | { status: "refused"; reason: string };

function loadJsonAnswers(filePath: string): InitAnswers {
  if (!existsSync(filePath)) {
    throw new Error("answers file not found: " + filePath);
  }
  const parsed = validateAnswers(JSON.parse(readFileSync(filePath, "utf8")));
  if (!parsed) {
    throw new Error("invalid answers in " + filePath);
  }
  return parsed;
}

function loadNonInteractiveAnswers(): InitAnswers {
  if (existsSync(metadataInitDefaultsPath)) {
    return loadJsonAnswers(metadataInitDefaultsPath);
  }
  return defaultAnswers();
}

function refuseUnlessForce(force: boolean | undefined, reason: string): InitResult | null {
  if (force) {
    return null;
  }
  return { status: "refused", reason };
}

export async function runInit(opts: InitOpts = {}): Promise<InitResult> {
  if (!hasGitIdentity(repoRoot)) {
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
  if (!isEmptyTarget(repoRoot) || hasCompose(repoRoot)) {
    const refused = refuseUnlessForce(
      opts.force,
      "refusing: repo is not empty. use --force to overwrite"
    );
    if (refused) {
      return refused;
    }
  }

  const answers = opts.nonInteractive ? loadNonInteractiveAnswers() : defaultAnswers();

  phase("COMPOSE", "docker-compose.yml .env");
  const env = renderEnv(answers);
  writeFileSync(join(repoRoot, "docker-compose.yml"), renderCompose());
  writeFileSync(join(repoRoot, ".env"), env.dotenv);
  writeFileSync(join(repoRoot, ".env.example"), env.example);
  phase("BOOTSTRAP", "src/backend src/frontend");
  writeBootstrap(repoRoot);
  commitRails(repoRoot);

  log('next: yarn task "your first feature"');
  return { status: "ok" };
}
