import type { InitPort } from "./port.js";

export type EnvBundle = {
  dotenv: string;
  example: string;
  keys: string[];
};

export function renderEnv(port: InitPort): EnvBundle {
  const line = "APP_PORT=" + String(port.appPort);
  return {
    dotenv: line + "\n",
    example: line + "\n",
    keys: ["APP_PORT"],
  };
}
