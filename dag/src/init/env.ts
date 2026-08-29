import type { InitAnswers } from "./answers.js";

export type EnvBundle = {
  dotenv: string;
  example: string;
  keys: string[];
};

export function renderEnv(answers: InitAnswers): EnvBundle {
  const line = "APP_PORT=" + String(answers.appPort);
  return {
    dotenv: line + "\n",
    example: line + "\n",
    keys: ["APP_PORT"],
  };
}
