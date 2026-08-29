import { randomBytes } from "node:crypto";
import type { InitAnswers } from "./answers.js";
import { envBlock } from "./stores.js";

export type EnvBundle = {
  password: string;
  dotenv: string;
  example: string;
  keys: string[];
};

export function randomPassword(): string {
  return randomBytes(12).toString("hex");
}

export function renderEnv(answers: InitAnswers, password: string): EnvBundle {
  const keys = ["APP_PORT"];
  const dotenv: string[] = ["APP_PORT=" + String(answers.appPort)];
  const example: string[] = ["APP_PORT=" + String(answers.appPort)];
  for (const id of answers.datastores) {
    const block = envBlock(id, password);
    keys.push(...block.keys);
    dotenv.push(...block.dotenv);
    example.push(...block.example);
  }
  return {
    password,
    dotenv: dotenv.join("\n") + "\n",
    example: example.join("\n") + "\n",
    keys,
  };
}
