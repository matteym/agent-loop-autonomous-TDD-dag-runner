# Agent-loop

Boucle DAG locale (Cursor SDK ou Claude Code). Pas un SaaS.

Moteur = `dag/` + `.cursor/`. Point d’entrée unique : `run-dag-loop.ts` (dispatch vers `src/`). Les artefacts produit (compose, `.env`, app) sont à la racine du repo cible.

## Commandes

Depuis `dag/` :

```bash
yarn
yarn run init
yarn task "Ajouter la route de login avec JWT sur l'API"
yarn test
```

Yarn v1 réserve `yarn init`. Utiliser **`yarn run init`**.

| Commande | Rôle |
|---|---|
| `yarn run init` | wizard greenfield (compose, code, `docker compose up --build -d`) |
| `yarn task "…"` | intention → plan LLM → boucle TDD |
| `yarn test` | tests unitaires du moteur (`vitest run`) |

`yarn tsc --noEmit` typecheck le moteur.

## Flags de `yarn task`

Uniquement :

| Flag | Rôle |
|---|---|
| `--dagfile=<path>` | saute le planner LLM et exécute le JSON indiqué |
| `--allow-pull-request` | si tous les nœuds EXIT 0 et branche ≠ `main`/`master` : `git push -u origin HEAD` puis `gh pr create` (jamais `--force`, jamais `--no-verify`) |
| `--provider=cursor\|claude` | force le runtime ; sinon détection automatique |

Exemples :

```bash
yarn task "Ajouter la route de login avec JWT sur l'API"
yarn task --dagfile=metadata/dag.json --provider=cursor
yarn task --dagfile=src/templates/brief.brownfield.example.json --allow-pull-request
```

`--dagfile` accepte aussi `--dagfile path`. Intent ignoré si `--dagfile` est présent.

## Provider

Sans `--provider` : si les deux clés sont présentes → `cursor`. Sinon la clé disponible. Aucune clé → EXIT 1.

Clés lues dans l’environnement puis `.env` (racine, `dag/`, `Server/`) :

- Cursor : `CURSOR_API_KEY` ou `CURSOR_SDK_API`
- Claude : `ANTHROPIC_API_KEY` ou `CLAUDE_API_KEY`

Pas de variables `DAG_*`.

## Init

```bash
yarn run init
yarn run init --yes
yarn run init --force --yes
```

`--yes` lit `metadata/init.defaults.json` (ou des défauts). Sans TTY, passer `--yes`. `--force` écrase un repo non vide / `Server/src`.

Yarn v1 réserve `yarn init` (wizard `package.json`). Toujours **`yarn run init`**.

Wizard : 5 questions, réponse **1 / 2 / 3** (Entrée = 1). Langage : TypeScript, Python, ou les deux. Architecture : monolithe, monorepo, microservices. Chaque `yarn task` utilise le test runner du package (`yarn test` ou `uv` / pytest).

Sans intent, sur un repo vide : `yarn task` lance le wizard puis affiche `next: yarn task "your intent"`.

## Prérequis

- Node et `yarn` dans `dag/`
- Docker pour l’étape UP de `yarn run init`
- Une clé Cursor et/ou Claude (jamais loggée)
- Branche ≠ `main` / `master` (sinon EXIT 1)
- Working tree propre, hors artefacts runtime (`metadata/state.json`, `task.json`, `*.done.json`, `agent-id`, `init.last.json`, `history/`, `logs/*.log`)

`--allow-pull-request` exige `gh`. Échec propre si `gh` est absent ou si le push rate. Interdit sur `main` / `master`.

## Structure

| Chemin | Rôle |
|---|---|
| `run-dag-loop.ts` | entrée CLI (`init` / `task`) |
| `src/` | moteur, providers, tests |
| `src/templates/` | exemples de DAG JSON |
| `metadata/dag.json` | queue expert / CI (versionnée) |
| `metadata/init.defaults.json` | réponses `--yes` (versionnée) |
| `metadata/task.json` | DAG généré par le planner (gitignoré) |
| `metadata/*.done.json` | nœuds archivés (gitignoré) |
| `metadata/state.json` | ids déjà faits (gitignoré) |
| `metadata/agent-id` | id agent du run (gitignoré) |
| `metadata/init.last.json` | dernières réponses wizard (gitignoré) |
| `history/nodes.jsonl` | une ligne JSON par nœud (gitignoré) |
| `logs/` | `run-YYYYMMDD-HHmmss.log` et `failures.log` (gitignoré) |

Un seul dossier de logs : `logs/` (pas `log/`).

## Drop-in

Copier `dag/` et `.cursor/` (skill, rule, hooks). `git init`. Puis `cd dag && yarn && yarn run init`.

Brownfield : `yarn task "…"`. Un package absent de l’inventaire (ex. `Client/`) peut avoir `optionalCwd` + `yarn test` ; après GREEN le dossier doit exister et les tests doivent passer.

Queue déjà écrite : `yarn task --dagfile=metadata/dag.json`.

## UI

ASK, COMPOSE, BOOTSTRAP, UP, puis PLAN, RED, GREEN, GUARD, TEST, COMMIT NOW, ARCHIVE, SKIP, FAIL.

## Interdits (agent)

`git push`, `--no-verify`, `terraform apply` / `destroy`, committer `.env` ou des clés. L’orchestrateur est le seul à pousser, et seulement avec `--allow-pull-request`.
