# Agent-loop (operator)

Local DAG runner (Cursor SDK or Claude Code). Not a SaaS.

Engine = `dag/` + `.cursor/`. Entry: `run-dag-loop.ts`. Product artefacts (compose, `.env`, app) sit at the target repo root.

## Commands

From `dag/`:

```bash
yarn
yarn run init --remote=https://github.com/OWNER/REPO.git
yarn task "Add JWT login on the API"
yarn test
```

**Never `yarn init`.** Yarn v1 uses that for a package.json wizard and will overwrite `dag/package.json`. Always **`yarn run init`**.

| Command | Role |
|---|---|
| `yarn run init --remote=<github-url>` | required: bootstrap + `.github/workflows/ci.yml` + push `agent/*` |
| `yarn task "…"` | intent → plan (max 10 features) → TDD loop |
| `yarn test` | engine unit tests (`vitest run`) |

`yarn tsc --noEmit` typechecks the engine.

## `yarn task` flags

| Flag | Role |
|---|---|
| `--dagfile=<path>` | skip the planner and run that JSON |
| `--push=false` / `--no-push` | stay local (default is push + PR after every node) |
| `--provider=cursor\|claude` | force the runtime; otherwise auto-detect |

`--repo=` is an alias for `--remote=`. Init without a GitHub URL is refused.

```bash
yarn task "Add JWT login on the API"
yarn task --dagfile=path/to/your-dag.json --provider=cursor
```

`--dagfile` also accepts `--dagfile path`. Intent is ignored when `--dagfile` is set.

## Provider

Without `--provider`: both keys present → `cursor`. Else the key that exists. No key → EXIT 1.

Keys from the environment, then `.env` (repo root, `dag/`, `Server/`):

- Cursor: `CURSOR_API_KEY` or `CURSOR_SDK_API`
- Claude: `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY`

No `DAG_*` variables.

## Init

```bash
yarn run init --remote=https://github.com/OWNER/REPO.git
yarn run init --repo=https://github.com/OWNER/REPO.git
yarn run init --remote=https://github.com/OWNER/REPO.git --yes
yarn run init --force --yes --remote=https://github.com/OWNER/REPO.git
```

`--remote` / `--repo` is **required** (GitHub https or ssh). Init writes `.github/workflows/ci.yml`, commits on `agent/init` (or the current `agent/*` branch), sets `origin`, and `git push -u origin HEAD` (never `--force`). `--yes` confirms without a TTY. `--force` overwrites a non-empty repo / `Server/src`, and replaces `origin` if it already exists.

Init is silent: creates `src/backend`, `src/frontend`, empty Compose, `.env` (`APP_PORT`), and the CI workflow. Architecture and datastores come from `yarn task`. If a task edits `docker-compose.yml` / `.env.example`, the orchestrator syncs `.env` and runs `docker compose up --build -d`.

The Action always lists TypeScript (`yarn test`), Python (`uv` + pytest), Go (`go test ./...`), and Rust (`cargo test`). If a language has no package in the tree, or the tool is missing, that step is skipped and the job stays green. Failed tests on a language that **is** present fail the job.

On an empty repo, `yarn task` does not replace init. Run `yarn run init --remote=…` first.

## Requirements

- Node and `yarn` in `dag/`
- Docker if a task adds a Compose service
- A Cursor and/or Claude key (never logged)
- `gh` authenticated (default push + PR; skip with `--no-push`)
- Branch ≠ `main` / `master` (otherwise EXIT 1)
- Clean working tree except runtime artefacts (`metadata/state.json`, `task.json`, `*.done.json`, `agent-id`, `history/`, `logs/*.log`)
- `git config user.name` and `user.email` **in this repo**. Without them, `yarn run init` and `yarn task` stop before commit.

Default `yarn task` needs `gh` (logged in) and `origin`. After each node commit: `git push -u origin HEAD` then `gh pr create` (or reuse the existing PR). Never `--force`, never `--no-verify`. Forbidden on `main` / `master`. `--push=false` / `--no-push` skips both.

## Layout

| Path | Role |
|---|---|
| `run-dag-loop.ts` | CLI entry (`init` / `task`) |
| `src/` | engine, providers, tests |
| `metadata/init.defaults.json` | `APP_PORT` for `--yes` (versioned) |
| `metadata/task.json` | DAG from the planner (gitignored) |
| `metadata/*.done.json` | archived nodes (gitignored) |
| `metadata/state.json` | finished ids (gitignored) |
| `metadata/agent-id` | agent id for the run (gitignored) |
| `history/nodes.jsonl` | one JSON line per node (gitignored) |
| `logs/` | `run-YYYYMMDD-HHmmss.log` and `failures.log` (gitignored) |

One logs directory: `logs/` (not `log/`).

## Copy into another repo

Copy `dag/` and `.cursor/` (skill, rule, hooks). `git init` and set `user.name` / `user.email`. Then `cd dag && yarn && yarn run init --remote=https://github.com/OWNER/REPO.git`.

Brownfield: `yarn task "…"`. A package missing from inventory (example `Client/`) may use `optionalCwd` plus that language's test command; after GREEN the folder must exist and tests must pass.

Already-written queue: `yarn task --dagfile=path/to/your-dag.json`.

## UI

Init: COMPOSE, BOOTSTRAP, CI, REMOTE, PUSH. Task: PLAN, RED, GREEN, UP (if the task changed Compose), GUARD, TEST, CI (keeps the same workflow file), COMMIT NOW, ARCHIVE, PUSH, PR, SKIP, FAIL.

## Forbidden (agent)

`git push`, `--no-verify`, `terraform apply` / `destroy`, committing `.env` or keys. Only the orchestrator pushes (after each node, unless `--no-push`).
