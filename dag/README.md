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
| `yarn run init` | silent rails: `src/backend`, `src/frontend`, empty Compose, `.env` |
| `yarn task "…"` | intent → plan (max 10 features) → TDD loop |
| `yarn test` | tests unitaires du moteur (`vitest run`) |

`yarn tsc --noEmit` typecheck le moteur.

## Flags de `yarn task`

Uniquement :

| Flag | Rôle |
|---|---|
| `--dagfile=<path>` | saute le planner LLM et exécute le JSON indiqué |
| `--allow-pull-request` | si tous les nœuds EXIT 0 et branche ≠ `main`/`master` : `git push -u origin HEAD` puis `gh pr create` (jamais `--force`, jamais `--no-verify`) |
| `--provider=cursor\|claude` | force le runtime ; sinon détection automatique |

`yarn run init` accepte aussi `--remote=<github-url>` (voir Init).

Exemples :

```bash
yarn task "Ajouter la route de login avec JWT sur l'API"
yarn task --dagfile=path/to/your-dag.json --provider=cursor
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
yarn run init --remote=https://github.com/OWNER/REPO.git
yarn run init --yes
yarn run init --force --yes
```

`--yes` confirme sans TTY. `--force` écrase un repo non vide / `Server/src`, et remplace `origin` s’il existe déjà. `--remote` pose `origin` (GitHub https ou ssh) ; **aucun `git push`**. Sans `--remote`, le repo reste local.

Yarn v1 réserve `yarn init` (wizard `package.json`). Toujours **`yarn run init`**.

Init is silent: creates `src/backend`, `src/frontend`, empty Compose, `.env` (`APP_PORT`). Architecture and datastores come from `yarn task`. If a task edits `docker-compose.yml` / `.env.example`, the orchestrator syncs `.env` and runs `docker compose up --build -d`.

Languages (planner + tests): TypeScript/JS (`yarn test`), Python (`uv` + pytest), Go (`go test ./...`), Rust (`cargo test`). The planner must pick the runner from the intent (FastAPI → Python, not `yarn test`).

Sans intent, sur un repo vide : `yarn task` lance l’init puis affiche `next: yarn task "your intent"`.

## Prérequis

- Node et `yarn` dans `dag/`
- Docker pour le relance Compose après une `yarn task` qui ajoute un service
- Une clé Cursor et/ou Claude (jamais loggée)
- Branche ≠ `main` / `master` (sinon EXIT 1)
- Working tree propre, hors artefacts runtime (`metadata/state.json`, `task.json`, `*.done.json`, `agent-id`, `history/`, `logs/*.log`)
- `git config user.name` et `user.email` **dans ce repo** (les commits n’inventent pas d’auteur). Sans ça, `yarn run init` et `yarn task` s’arrêtent avant le commit.

`--allow-pull-request` exige `gh`. Échec propre si `gh` est absent ou si le push rate. Interdit sur `main` / `master`.

## Structure

| Chemin | Rôle |
|---|---|
| `run-dag-loop.ts` | entrée CLI (`init` / `task`) |
| `src/` | moteur, providers, tests |
| `metadata/init.defaults.json` | `APP_PORT` pour `--yes` (versionné) |
| `metadata/task.json` | DAG généré par le planner (gitignoré) |
| `metadata/*.done.json` | nœuds archivés (gitignoré) |
| `metadata/state.json` | ids déjà faits (gitignoré) |
| `metadata/agent-id` | id agent du run (gitignoré) |
| `history/nodes.jsonl` | une ligne JSON par nœud (gitignoré) |
| `logs/` | `run-YYYYMMDD-HHmmss.log` et `failures.log` (gitignoré) |

Un seul dossier de logs : `logs/` (pas `log/`).

## Drop-in

Copier `dag/` et `.cursor/` (skill, rule, hooks). `git init`. Puis `cd dag && yarn && yarn run init`.

Brownfield : `yarn task "…"`. Un package absent de l’inventaire (ex. `Client/`) peut avoir `optionalCwd` + `yarn test` ; après GREEN le dossier doit exister et les tests doivent passer.

Queue déjà écrite : `yarn task --dagfile=path/to/your-dag.json`.

## UI

COMPOSE, BOOTSTRAP, then PLAN, RED, GREEN, UP (if the task changed Compose), GUARD, TEST, COMMIT NOW, ARCHIVE, SKIP, FAIL.

## Interdits (agent)

`git push`, `--no-verify`, `terraform apply` / `destroy`, committer `.env` ou des clés. L’orchestrateur est le seul à pousser, et seulement avec `--allow-pull-request`.
