import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { defaultAnswers, type InitAnswers } from "./answers.js";

async function askLine(
  rl: ReturnType<typeof createInterface>,
  prompt: string
): Promise<string> {
  return (await rl.question(prompt)).trim();
}

function say(lines: string[]) {
  for (const line of lines) {
    output.write(line + "\n");
  }
}

export async function askAnswers(): Promise<InitAnswers | null> {
  const rl = createInterface({ input, output });
  try {
    say([
      "",
      "Init ne pose pas de langage, d'archi, ni de base.",
      "Il crée seulement :",
      "  backend/",
      "  frontend/",
      "  docker-compose.yml  (vide — les yarn task ajoutent les services)",
      "  .env                (APP_PORT seulement)",
      "",
      "Monorepo, microservices, Express, Mongo… ça se décide dans yarn task.",
      "Si une task a besoin d'une base, l'orchestrateur met à jour Compose et relance.",
      "",
    ]);
    const proceed = (await askLine(rl, "On crée ça ? [O/n] : ")).toLowerCase();
    if (proceed === "n" || proceed === "no" || proceed === "non") {
      return null;
    }
    return defaultAnswers();
  } finally {
    rl.close();
  }
}
