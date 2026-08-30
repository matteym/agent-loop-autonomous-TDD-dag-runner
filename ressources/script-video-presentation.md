# Guideline — quoi tester

Phrase + commande : `ressources/task.md`.  
Pour rester local (la phrase dit « No git push ») : `yarn task --no-push "…"`.

## Succès

1. `cd dag && yarn test` vert, `yarn tsc --noEmit` vert
2. `yarn run init --remote=https://github.com/OWNER/REPO.git` → `agent/init` poussé, `.github/workflows/ci.yml` présent
3. `yarn task --no-push "…"` (coller `task.md`) → `run end:` + `nodes_ok` > 0
4. Annoncer puis ouvrir `http://127.0.0.1:$APP_PORT/` et `/api/notes`
5. CRUD dans le navigateur, sans retoucher le code

Rouge moteur ou UI morte : le dire, ne pas masquer.

## Ordre

| # | Quoi | Check |
|---|---|---|
| 1 | Moteur | `yarn test` |
| 2 | Rails | init + `--remote` (clone jetable) |
| 3 | Intent | coller `task.md`, pas `--dagfile` |
| 4 | App | CRUD Create / Read / Update / Delete |
| 5 | Capot | seulement après le CRUD |

Hors caméra : `yarn` dans `dag/`, git `user.name` / `user.email`, clé Cursor ou Claude, branche ≠ `main`.  
Live : un process, même port. Accélérer l’agent. CRUD en vitesse réelle.

---

# `dag/` — une ligne par fichier

Les `*.test.ts` testent le fichier du même nom. Ignorer `node_modules/`.

| Fichier | Fait |
|---|---|
| `run-dag-loop.ts` | entrée CLI (`init` / `task`) |
| `package.json` | scripts `init`, `task`, `test` |
| `README.md` | manuel opérateur |
| `metadata/init.defaults.json` | `APP_PORT` pour `--yes` |
| `metadata/task.json` | DAG du planner (gitignoré) |
| `metadata/*.done.json` | nœuds archivés (gitignoré) |
| `metadata/state.json` | ids finis (gitignoré) |
| `metadata/agent-id` | id agent du run (gitignoré) |
| `history/nodes.jsonl` | une ligne par nœud (gitignoré) |
| `logs/` | run + failures (gitignoré) |

### `src/`

| Fichier | Fait |
|---|---|
| `cli.ts` | parse argv (`--remote`, `--push`, `--dagfile`…) |
| `task.ts` | PLAN → écrit `task.json` → lance la boucle |
| `loop.ts` | RED / GREEN / guard / tests / commit / archive / push+PR |
| `types.ts` | formes DAG / nœud / tests |
| `briefing.ts` | contexte repo collé à chaque send |
| `archive.ts` | déplace le nœud vers `*.done.json` |
| `ci.ts` | écrit `.github/workflows/ci.yml` (skip langages absents) |
| `pr.ts` | `gh pr create` ou réutilise la PR |
| `commit.ts` | valide le sujet de commit |
| `git-run.ts` | git de l’orchestrateur (commit, revert, dirty) |
| `inventory.ts` | détecte TS / Python / Go / Rust + commande de test |
| `new-cwd.ts` | autorise un nouveau dossier produit |
| `paths.ts` | chemins repo / metadata / logs |
| `keys.ts` | lit les clés API |
| `run-log.ts` | phases + fichier de log |

### `src/init/`

| Fichier | Fait |
|---|---|
| `run.ts` | `yarn run init` (remote obligatoire, CI, push) |
| `bootstrap.ts` | `src/backend` + `src/frontend` vides |
| `compose.ts` | stub compose + catalogue datastores |
| `env.ts` | `.env` / `.env.example` |
| `env-sync.ts` | recopie les clés d’example vers `.env` |
| `up.ts` | `docker compose up --build -d` |
| `git.ts` | identité, `origin`, commit bootstrap, push |
| `port.ts` | `APP_PORT` |
| `detect.ts` | repo vide / brownfield |
| `log.ts` | logs `[init]` |

### `src/providers/`

| Fichier | Fait |
|---|---|
| `select.ts` | Cursor vs Claude |
| `create.ts` | ouvre le handle agent |
| `cursor.ts` | runtime Cursor SDK |
| `claude.ts` | runtime Claude |
| `types.ts` | type du handle |
