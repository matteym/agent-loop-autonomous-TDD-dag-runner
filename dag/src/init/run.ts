import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { askAnswers } from "./ask.js";
import { defaultAnswers, summarize, validateAnswers, type InitAnswers } from "./answers.js";
import { writeBootstrap } from "./bootstrap.js";
import { renderCompose } from "./compose.js";
import { hasCompose, isEmptyTarget, repoHasServerSrc } from "./detect.js";
import { randomPassword, renderEnv } from "./env.js";
import { commitRails } from "./git.js";
import { log, phase } from "./log.js";
import { composeUp } from "./up.js";
import {
  metadataDir,
  metadataInitDefaultsPath,
  metadataInitLastPath,
  repoRoot,
} from "../paths.js";

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

  phase("ASK", "language layout name port databases");
  let answers: InitAnswers | null;
  if (opts.nonInteractive) {
    answers = loadNonInteractiveAnswers();
    log(summarize(answers));
  } else if (!process.stdin.isTTY) {
    return {
      status: "refused",
      reason: "run yarn run init on a TTY or pass --yes",
    };
  } else {
    answers = await askAnswers();
    if (!answers) {
      phase("ASK", "aborted");
      return { status: "aborted" };
    }
  }

  mkdirSync(metadataDir, { recursive: true });
  writeFileSync(metadataInitLastPath, JSON.stringify(answers, null, 2) + "\n");

  phase("COMPOSE", "docker-compose.yml .env");
  const env = renderEnv(answers, randomPassword());
  writeFileSync(join(repoRoot, "docker-compose.yml"), renderCompose(answers));
  writeFileSync(join(repoRoot, ".env"), env.dotenv);
  writeFileSync(join(repoRoot, ".env.example"), env.example);
  log("wrote .env (keys only) " + env.keys.join(","));

  phase("BOOTSTRAP", answers.runtime + " " + answers.architecture);
  writeBootstrap(repoRoot, answers);
  commitRails(repoRoot);

  phase("UP", "docker compose up --build -d");
  await composeUp(repoRoot, answers.appPort);
  phase("UP", "healthy");
  log('next: cd dag && yarn task "your first feature"');
  return { status: "ok" };
}
