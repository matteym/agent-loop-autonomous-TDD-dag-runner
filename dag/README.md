# Agent-loop (operator)

Local DAG runner (Cursor SDK or Claude Code). Not a SaaS.

Engine = this repo (`dag/` + `.cursor/`). `yarn` at the repo root installs the engine. Init copies `dag/` onto the product and adds `yarn dag`. The leftover nested clone can be gitignored; **`dag/` is versioned with the app**. Entry: `run-dag-loop.ts`.

## Commands

From the **product or engine root**:

```bash
yarn
yarn run init --remote=https://github.com/OWNER/REPO.git
yarn dag "Add JWT login on the API"
yarn test
```

Same commands after `git clone` of the app: `yarn` then `yarn dag` / `yarn dag:mobile` / `yarn dag:desktop`.

From `dag/` the old names still work: `yarn task`, `yarn mobile`, `yarn desktop`.

**Never `yarn init`.** Yarn v1 uses that for a package.json wizard. Always **`yarn run init`**.

| Command | Role |
|---|---|
| `yarn run init --remote=<github-url>` | required: bootstrap + `.github/workflows/ci.yml` + push `agent/*` |
| `yarn dag "…"` | intent → plan (max 20 features) → TDD loop |
| `yarn dag:mobile` / `dag/run/mobile/run.sh` | SSH/phone launcher (tmux, unattended, per-run flags) |
| `yarn dag:desktop` / `dag/run/desktop/run.sh` | desktop launcher (same flags, current terminal) |
| `yarn test` | engine unit tests (`vitest run`) |

`yarn tsc --noEmit` typechecks the engine.

## `yarn task` flags

| Flag | Role |
|---|---|
| `--dagfile=<path>` | skip the planner and run that JSON |
| `--push=false` / `--no-push` | stay local (default is push + PR after every node) |
| `--provider=cursor\|claude` | force the runtime; otherwise auto-detect |
| `--unattended` | force unattended gates even on a TTY (also auto when stdin is not a TTY) |
| `--merge` | allow merge into `main` in unattended mode (off by default when unattended) |

`--repo=` is an alias for `--remote=`. Init without a GitHub URL is refused.

```bash
yarn task "Add JWT login on the API"
yarn task --dagfile=path/to/your-dag.json --provider=cursor
```

`--dagfile` also accepts `--dagfile path`. Intent is ignored when `--dagfile` is set.

## SSH / mobile / non-TTY

Disconnecting SSH kills the process unless it runs inside a multiplexer. There is no daemon, systemd unit, or external bot.

From `dag/`:

```bash
# telephone / SSH (tmux + unattended + questions push/PR/merge/provider)
./run/mobile/run.sh
./run/mobile/run.sh "Add JWT login on the API"
./run/mobile/run.sh status          # tail logs/status (ecran telephone)
./run/mobile/run.sh attach          # reprendre tmux

# ordinateur (meme questions, yarn task dans ce terminal)
./run/desktop/run.sh
./run/desktop/run.sh "Add JWT login on the API"
# Windows PowerShell :
powershell -File ./run/desktop/run.ps1
```

`yarn mobile` / `yarn desktop` are aliases. Each run asks: **push + PR**, **merge into main**, **provider**, optional **--dagfile**. Mobile always adds `--unattended` (never auto-merge unless you answered merge `o`). The prompt is passed to `yarn task "…"`, which runs the planner — do not hand-write a temp DAG JSON.

Unattended mode is on automatically when stdin is not a TTY (`yarn task < /dev/null`, CI, many mobile SSH clients) or when you pass `--unattended`. In that mode the loop does **not** treat PAUSE as `o`:

- missing keys / missing DAG file: log and exit 1 immediately
- validation still red after 5 fixes: skip the node (no archive, no `git reset`), continue
- agent `error` / `cancelled`: retry once, then skip the node
- commit or archive failure: skip the node; exit 0 if at least one node succeeded
- push + PR still run (unless `--no-push`); **no** `git merge` into `main` unless `--merge`

Watch a one-page status file (overwritten each phase, gitignored), not the verbose `run-*.log`:

```bash
./run/mobile/run.sh status
# equivalent: tail -f dag/logs/status
```

Keep a TTY if you want interactive `still continue ? o/n`.

## Provider

Without `--provider`: both keys present → `cursor`. Else the key that exists. No key → **PAUSE** (`still continue ? o/n`). Answering `n`, or answering `o` twice when the run still cannot start, exits 1.

Keys from the environment, then `.env` (product root, engine root, `dag/`, `Server/`):

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

`--remote` / `--repo` is **required** (GitHub https or ssh). When this engine is nested inside another git repo, init writes on **that parent** (compose, `src/`, `.cursor`, `.github/workflows/ci.yml`), adds this folder to the parent `.gitignore`, commits on `agent/init`, sets the **parent** `origin`, and `git push -u origin HEAD` (never `--force`). `--yes` confirms without a TTY. `--force` overwrites a non-empty product / `Server/src`, and replaces origin if it already exists.

Init is silent: creates `src/`, empty Compose, `.env` (`APP_PORT`), copies `.cursor` to the product, and the CI workflow. Architecture and datastores come from `yarn task`. If a task edits `docker-compose.yml` / `.env.example`, the orchestrator syncs `.env` and runs `docker compose up --build -d`.

The Action always lists TypeScript (`yarn test`), Python (`uv` + pytest), Go (`go test ./...`), and Rust (`cargo test`). If a language has no package in the tree, or the tool is missing, that step is skipped and the job stays green. Failed tests on a language that **is** present fail the job.

On an empty repo, `yarn task` does not replace init. Run `yarn run init --remote=…` first.

## Requirements

- Node and `yarn` in `dag/`
- Docker if a task adds a Compose service
- A Cursor and/or Claude key (never logged)
- `gh` authenticated (default push + PR; skip with `--no-push`)
- Branch ≠ `main` / `master` (otherwise **PAUSE**; `o` continues this run but treats it as `--no-push` so origin `main` is never pushed)
- Clean working tree except runtime artefacts (`metadata/state.json`, `task.json`, `*.done.json`, `agent-id`, `history/`, `logs/*.log`, `logs/status`). A dirty tree **PAUSE**s; `o` continues anyway.
- `git config user.name` and `user.email` **on the product repo**. Without them, `yarn run init` and `yarn task` **PAUSE** then still cannot start.

Default `yarn task` needs `gh` (logged in) and `origin`. After each node commit: fetch origin, rebase local commits onto `origin/<branch>` if the remote moved (keep remote commits, replay ours on top, conflict policy `agent-replay`), then `git push -u origin HEAD` and `gh pr create` (or reuse an **open** PR; a closed PR is ignored and a new one is opened). When the DAG finishes on an interactive TTY, merge that PR into `main` (`gh pr merge --merge`, or `--auto` if checks are still running). Unattended runs skip merge unless `--merge`. Never `--force`, never `--no-verify`. Forbidden on `main` / `master`. `--push=false` / `--no-push` skips push, PR, and merge.

At loop start and before every node, the orchestrator re-reads `.env` / `.env.example`: copies vendor/typo aliases (`XAI_API_KEY` → `GROK_API_KEY`, `X_ACCES_TOKEN` → `X_ACCESS_TOKEN`) onto canonical names without overwriting a non-empty canonical value, and derives `*_HOST` URLs from docker hostnames for CLI use on the machine.

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
| `logs/` | `run-YYYYMMDD-HHmmss.log`, `failures.log`, and `status` (gitignored) |

One logs directory: `logs/` (not `log/`).

## Copy into another repo

Clone this repo **inside** the product git clone. From the engine root: `yarn && yarn run init --remote=https://github.com/OWNER/REPO.git`. Init vendors `dag/` onto the parent (versioned) and gitignores the leftover nested clone. The first `yarn run init` / `yarn dag` **parks** the nested engine `.git` as `.git.engine` so `git status` from the leftover clone uses the **product** repo. The orchestrator already runs git with `cwd` = product root. To work on the engine itself, use a standalone clone, or `git --git-dir=.git.engine --work-tree=.` from the plugin root.

Alternatively copy only `dag/` and `.cursor/` to the product root (engine = product). Same init command.

Brownfield: `yarn task "…"`. A package missing from inventory (example `Client/`) may use `optionalCwd` plus that language's test command; after GREEN the folder must exist and tests must pass.

Already-written queue: `yarn task --dagfile=path/to/your-dag.json`.

## MCP

The loop does not install MCP servers. Put them in the product `.cursor/mcp.json`. Cursor and Claude agents receive every valid server from that file. Example Playwright:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    }
  }
}
```

Do not put secrets in the JSON; use `${ENV_NAME}` and the process environment. Init never overwrites an existing `.cursor/mcp.json`.

`tests[].cwd` is the working directory (repo-relative). `optionalCwd` is a **boolean** on that tests entry, never a path string, never on the task object.

Codebase intelligence (20 nodes, skip planner). Every node runs `yarn test` in `dag/src/knowledge` — **not** a top-level `src/`:

```bash
yarn task --dagfile=dags/codebase-intelligence.json
```

## Live log

Stderr (TTY colors) and `dag/logs/run-YYYYMMDD-HHmmss.log` share one format. Secrets are redacted. Phases are never mixed:

| Tag | Meaning |
|---|---|
| `RUN` | header: provider, branch, model, DAG title, MCP server names (or `none`) |
| `PLAN` `PREFLIGHT` `CONTEXT` `MCP` `RED` `GREEN` `GUARD` `TEST` `REPAIR` `COMMIT` `ARCHIVE` `PUSH` `PR` `MERGE` `PAUSE` | one block per orchestrator phase |
| `STEP` | one short present-tense line per action (`running yarn test in dag/src/knowledge`) |
| `TEST` | one line per command with `cwd` |
| `TEST PASS` / `TEST FAIL` | outcome plus exit code or first failing assertion — never mixed in one blob |
| `MCP CALL server/tool` | stream tool/MCP event (no payloads, no secrets). Skipped when the turn used no MCP |
| `GREEN SUMMARY` | 3–8 bullets after every GREEN send (before GUARD): what the agent did, files from git porcelain or `unknown`, tests not yet re-run, MCP used or not, next phase. Never invented |
| `PAUSE` | why the loop would have stopped, what would have happened, then `still continue ? o/n` |
| `[TOKEN USAGE]` | after every `Agent.send`: Prompt / Completion / Total from the provider, or `unknown` (never estimated from character counts). Also stored on the history line |

Extra context on each send (knowledge briefing + similar failures + parent history + one REPAIR crash slice) is capped at **8000 characters**. REPAIR uses a single crash source: live `tests.output`, else the last `failures.log` block for that node, else a `run-*.log` extract. Parent history is omitted on COMMIT NOW.

Answers: `o` / `O` / `oui` / `y` / `yes` continue; `n` / `N` / `non` / `no` stop (write `failures.log`, revert tracked files only when validation failed, history `status=failed`, non-zero exit). On a TTY this is interactive. Unattended (`!stdin.isTTY` or `--unattended`) does **not** auto-accept `o` on dangerous gates: skip the node instead (no revert), except missing keys / missing DAG file which exit 1 immediately. Phone-friendly progress is overwritten at `dag/logs/status` (see SSH above).

`o` on `main`/`master` continues without pushing that branch. `o` on a dirty tree continues. After 5 red fix rounds, unattended skips archive without reverting. Agent send `error`/`cancelled`: retry once, then skip the node. Missing keys or missing DAG file cannot run: attended PAUSE then exit 1; unattended log and exit 1.

## UI

Init: COMPOSE, BOOTSTRAP, PLUGIN (if nested), CI, REMOTE, PUSH. Task: PLAN, PREFLIGHT, CONTEXT, MCP, RED, GREEN, GREEN SUMMARY, UP (if the task changed Compose), GUARD, TEST PASS/FAIL, REPAIR, COMMIT, ARCHIVE, PUSH, PR, MERGE, PAUSE, SKIP, FAIL.

## Forbidden (agent)

`git push`, `--no-verify`, `terraform apply` / `destroy`, committing `.env` or keys. Only the orchestrator pushes and merges (after each node, unless `--no-push`).
