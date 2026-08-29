import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  defaultAnswers,
  layoutHint,
  parseArchitecture,
  parseDatastores,
  parsePort,
  parseRuntime,
  parseSlug,
  summarize,
  type InitAnswers,
} from "./answers.js";

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
  const fallback = defaultAnswers();
  try {
    say([
      "",
      "Agent-loop — 5 questions. Tape 1, 2 ou 3 (Entrée = 1), sauf le nom et le port.",
      "TypeScript et Python sont les deux OK. Chaque yarn task utilise le runner du package.",
      "",
    ]);

    say([
      "Question 1/5 — Quel langage pour le squelette ?",
      "  1) TypeScript   (yarn + vitest)",
      "  2) Python       (uv + pytest)",
      "  3) Les deux     (package TS + package Python ; chaque nœud DAG s'adapte)",
      "",
    ]);
    let runtime = parseRuntime(await askLine(rl, "Ta réponse [1] : "));
    while (!runtime) {
      say(["Tape 1, 2 ou 3."]);
      runtime = parseRuntime(await askLine(rl, "Ta réponse [1] : "));
    }

    say([
      "",
      "Question 2/5 — Quelle architecture ?",
      "  1) Monolithe       une app (racine, ou apps/ si les deux langages)",
      "  2) Monorepo        apps/api",
      "  3) Microservices   services/api",
      "",
    ]);
    let architecture = parseArchitecture(await askLine(rl, "Ta réponse [1] : "));
    while (!architecture) {
      say(["Tape 1, 2 ou 3."]);
      architecture = parseArchitecture(await askLine(rl, "Ta réponse [1] : "));
    }

    say([
      "",
      "Question 3/5 — Nom de l'application ?",
      "  Exemple : todo-list   (minuscules et tirets ; todo_list devient todo-list)",
      "",
    ]);
    let appName = parseSlug(await askLine(rl, "Ta réponse [app] : "), fallback.appName);
    while (!appName) {
      say(["Nom invalide. Exemple : todo-list"]);
      appName = parseSlug(await askLine(rl, "Ta réponse [app] : "), fallback.appName);
    }

    say(["", "Question 4/5 — Port HTTP de l'app (APP_PORT) ?", ""]);
    let appPort = parsePort(await askLine(rl, "Ta réponse [3000] : "), fallback.appPort);
    while (appPort === null) {
      say(["Tape un nombre entre 1 et 65535, ou Entrée pour 3000."]);
      appPort = parsePort(await askLine(rl, "Ta réponse [3000] : "), fallback.appPort);
    }

    say([
      "",
      "Question 5/5 — Quelles bases dans Docker ?",
      "  1) Postgres + Redis",
      "  2) Postgres seulement",
      "  3) Aucune",
      "",
    ]);
    let dbs = parseDatastores(await askLine(rl, "Ta réponse [1] : "));
    while (!dbs) {
      say(["Tape 1, 2 ou 3."]);
      dbs = parseDatastores(await askLine(rl, "Ta réponse [1] : "));
    }

    const answers: InitAnswers = {
      runtime,
      architecture,
      appName,
      appPort,
      postgres: dbs.postgres,
      redis: dbs.redis,
    };
    say([
      "",
      "Récap : " + summarize(answers),
      "  dossiers : " + layoutHint(answers),
      "",
    ]);
    const proceed = (await askLine(rl, "On crée ça ? [O/n] : ")).toLowerCase();
    if (proceed === "n" || proceed === "no" || proceed === "non") {
      return null;
    }
    return answers;
  } finally {
    rl.close();
  }
}
