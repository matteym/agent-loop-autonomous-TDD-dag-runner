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
import { storeMenu } from "./stores.js";

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
      "Agent-loop — 5 questions. Tape le numéro (Entrée = défaut entre crochets).",
      "TypeScript et Python : chaque yarn task utilise le runner du package.",
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
      "Question 2/5 — Nom de l'application ?",
      "  Exemple : todo-list   (minuscules et tirets ; todo_list devient todo-list)",
      "",
    ]);
    let appName = parseSlug(await askLine(rl, "Ta réponse [app] : "), fallback.appName);
    while (!appName) {
      say(["Nom invalide. Exemple : todo-list"]);
      appName = parseSlug(await askLine(rl, "Ta réponse [app] : "), fallback.appName);
    }

    say([
      "",
      "Question 3/5 — Quelle architecture ? (ça décide les dossiers)",
      "  1) Monolithe       backend/                 une seule API",
      "  2) Monorepo        backend/ + frontend/",
      "  3) Microservices   backend/" + appName + "/   premier service",
      "                     ensuite tu ajoutes backend/autre via yarn task",
      "",
    ]);
    let architecture = parseArchitecture(await askLine(rl, "Ta réponse [1] : "));
    while (!architecture) {
      say(["Tape 1, 2 ou 3."]);
      architecture = parseArchitecture(await askLine(rl, "Ta réponse [1] : "));
    }

    say(["", "Question 4/5 — Port HTTP de l'app (APP_PORT) ?", ""]);
    let appPort = parsePort(await askLine(rl, "Ta réponse [3000] : "), fallback.appPort);
    while (appPort === null) {
      say(["Tape un nombre entre 1 et 65535, ou Entrée pour 3000."]);
      appPort = parsePort(await askLine(rl, "Ta réponse [3000] : "), fallback.appPort);
    }

    say([
      "",
      "Question 5/5 — Quelles bases Docker ?",
      "  Ce sont des images. Le bot les utilise via les variables d'env (pas d'URL en dur).",
      "  Plusieurs OK, exemple : 1,3,4",
      ...storeMenu.map((choice, i) => "  " + (i + 1) + ") " + choice.label),
      "  0) Aucune",
      "",
    ]);
    let dbs = parseDatastores(await askLine(rl, "Ta réponse [1,2] : "));
    while (!dbs) {
      say(["Tape des numéros, ex: 1,3  ou  0 pour aucune."]);
      dbs = parseDatastores(await askLine(rl, "Ta réponse [1,2] : "));
    }

    const answers: InitAnswers = {
      runtime,
      architecture,
      appName,
      appPort,
      datastores: dbs,
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
