import { randomBytes } from "node:crypto";
import type { InitAnswers } from "./answers.js";

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
  if (answers.postgres) {
    keys.push("POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB", "DATABASE_URL", "DATABASE_URL_HOST");
    dotenv.push(
      "POSTGRES_USER=app",
      "POSTGRES_PASSWORD=" + password,
      "POSTGRES_DB=app",
      "DATABASE_URL=postgres://app:" + password + "@postgres:5432/app",
      "DATABASE_URL_HOST=postgres://app:" + password + "@127.0.0.1:5432/app"
    );
    example.push(
      "POSTGRES_USER=app",
      "POSTGRES_PASSWORD=changeme",
      "POSTGRES_DB=app",
      "DATABASE_URL=postgres://app:changeme@postgres:5432/app",
      "DATABASE_URL_HOST=postgres://app:changeme@127.0.0.1:5432/app"
    );
  }
  if (answers.redis) {
    keys.push("REDIS_URL", "REDIS_URL_HOST");
    dotenv.push("REDIS_URL=redis://redis:6379", "REDIS_URL_HOST=redis://127.0.0.1:6379");
    example.push("REDIS_URL=redis://redis:6379", "REDIS_URL_HOST=redis://127.0.0.1:6379");
  }
  return {
    password,
    dotenv: dotenv.join("\n") + "\n",
    example: example.join("\n") + "\n",
    keys,
  };
}
