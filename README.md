# agent-loop

Local autonomous software-engineering runtime. You give an intent; a runner on your machine plans a DAG, implements each node with TDD, commits, and (unless you opt out) pushes a PR.

It is not a chat bot, not a SaaS, not a desktop app, and not a cloud agent VM. Agents run locally with the Cursor SDK or the Claude Code SDK. The **orchestrator** owns tests, git push, PRs, and merge. The **agent** never `git push`.

```bash
# inside an empty product git clone:
git clone https://github.com/matteym/agent-loop-autonomous-TDD-dag-runner.git
cd agent-loop-autonomous-TDD-dag-runner/dag
yarn
yarn run init --remote=https://github.com/YOU/YOUR-REPO.git
yarn task "add JWT login on the API"
```

That is the product: **init** (empty `src/`, Compose stub, GitHub Actions, first push), then **task** (plan → RED → GREEN → guard → tests → commit → push → PR).

**Never run `yarn init`.** Yarn v1 overwrites `dag/package.json`. Always **`yarn run init`**.

---

## What it does now

| You type | The runner does |
|---|---|
| One intent | Splits it into ≤ 20 sequential feature nodes |
| Nothing else | RED tests, GREEN code, anti-pattern guard, node tests |
| — | Commit with the exact DAG subject (orchestrator verifies) |
| — | `git push` + open or reuse a PR (`gh`); merge into `main` when the DAG finishes |

Languages are discovered from the tree, not configured: **TypeScript** (`yarn test`), **Python** (`uv` + pytest), **Go** (`go test ./...`), **Rust** (`cargo test`). CI skips a language that is missing or whose toolchain is absent. A real test failure still fails the job.

A new package not yet in inventory may use `tests[].optionalCwd: true` plus that language’s test command. After GREEN the folder must exist and tests must EXIT 0.

The agent never `git push`. Pass `--no-push` / `--push=false` to stay fully local.

---

## Quick start (nested plugin)

**Need:** Node + Yarn in `dag/`, `git config user.name` / `user.email` **on the product repo**, a [Cursor](https://cursor.com) key (`CURSOR_API_KEY` or `CURSOR_SDK_API`) and/or a Claude key (`ANTHROPIC_API_KEY` or `CLAUDE_API_KEY`), [`gh`](https://cli.github.com/) logged in (unless `--no-push`), a GitHub repo URL.

```bash
cd your-product-repo

git clone https://github.com/matteym/agent-loop-autonomous-TDD-dag-runner.git
cd agent-loop-autonomous-TDD-dag-runner/dag
yarn

# writes compose, empty src/, CI, .cursor on the parent (product root)
# and gitignores this plugin folder
yarn run init --remote=https://github.com/YOU/YOUR-REPO.git

# dedicated branch required (not main / master)
yarn task "Build a notes API with Express and yarn test"
```

`yarn task` refuses `main` / `master` and a dirty working tree, except runtime artefacts (`dag/metadata/*`, `dag/history/`, `dag/logs/*.log`) and operator-owned `.cursor/mcp.json`.

Stay local: `yarn task --no-push "…"`.

Skip the planner: `yarn task --dagfile=path/to/your.json`.

Copy only `dag/` + `.cursor/` into a product root if you want the engine **without** nesting this GitHub history. Default is to clone the whole engine inside the product repo: init targets `../` and gitignores the plugin folder. Nested engine `.git` is parked as `.git.engine` so git from `dag/` is the **product** repo.

---

## Init

`yarn run init --remote=<github-url>` is required (`--repo=` is the same). It writes on the **product** git work tree:

- `src/` (empty — fill it with `yarn task`, not a backend/frontend split unless the intent says so)
- Compose stub + `.env` / `.env.example` (`APP_PORT`)
- `.cursor/` (skill, rule, hooks) — never overwrites an existing `.cursor/mcp.json`
- `.github/workflows/ci.yml` — TypeScript, Python, Go, Rust
- parent `.gitignore` includes the plugin directory
- commit on `agent/init`, product `origin` set, **pushed** (never `--force`)

`--yes` skips a TTY confirm. `--force` overwrites a non-empty product. On an empty repo, `yarn task` does not replace init.

If a later node edits `docker-compose.yml` / `.env.example`, the orchestrator syncs `.env` (never commits it) and runs `docker compose up --build -d`.

---

## Task loop

From `dag/`:

| Flag | Role |
|---|---|
| `--dagfile=<path>` | skip the planner; run that JSON (`intent` is ignored) |
| `--push=false` / `--no-push` | no push, PR, or merge |
| `--provider=cursor\|claude` | force the runtime; otherwise Cursor if both keys exist |

No `DAG_*` environment variables. Keys are read from the environment, then `.env` at the product root, engine root, `dag/`, or `Server/`.

Default model for planned DAGs is `composer-2.5`. Each node:

1. **RED** — failing tests (scaffold may add `package.json` / folders / stubs, no business logic)
2. **GREEN** — minimal production code
3. **GUARD + TEST** — `.cursor/hooks/guard-anti-patterns.mjs` then DAG `tests[]`
4. **COMMIT NOW** — exact `commit` string, no `--no-verify`
5. Archive the node to a sibling `*.done.json`, then push + PR unless `--no-push`

Up to 5 fix rounds, then revert tracked files (`git reset --hard HEAD`, no `git clean -fd`) and exit non-zero. The node is not archived.

After each node: fetch origin, rebase local commits onto `origin/<branch>` if the remote moved (policy `agent-replay`, never `--force`), then `git push -u origin HEAD` and `gh pr create` (reuse an **open** PR). When the DAG finishes, merge into `main`.

---

## Local knowledge (not a cloud memory)

The runtime keeps a **local** knowledge layer under `dag/src/knowledge/`:

- durable run / node state and append-only checkpoints (resume without redoing finished work)
- codebase index (files, symbols, imports, tests, git history)
- evidence-based memory (facts, decisions, failures, solutions) behind a memory gate
- hybrid retrieval and a context builder injected into each agent send
- failure signatures and a stop on repeated failed repairs

On-disk data lives in `.agent-memory/` (gitignored). SQLite/JSONL/filesystem/Git only — no cloud vector DB, no Atlas clone, no UI.

Dogfood DAG (already executed on this engine; re-run only if you restore nodes):

```bash
yarn task --dagfile=dags/codebase-intelligence.json
```

Tests for that package: `cwd` `dag/src/knowledge`, not a top-level `src/`.

---

## MCP

The loop does not install MCP servers. Put them in the product `.cursor/mcp.json`. Cursor and Claude agents receive every valid server. Example:

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

Use `${ENV_NAME}` for secrets. Do not use MCP for `git push`, `terraform apply`, or production cloud mutation. Init never overwrites this file.

---

## Check the engine

```bash
cd dag
yarn test
yarn tsc --noEmit
```

Operator manual: [`dag/README.md`](dag/README.md). Protocol: [`.cursor/skills/agent-loop/SKILL.md`](.cursor/skills/agent-loop/SKILL.md).

---

## Windows: Smart App Control

If Windows **Smart App Control** blocks `yarn task` or unsigned local toolchains (Node, Yarn, uv):

1. **Windows Settings** → **Privacy & security** → **Windows Security** → **App & browser control**
2. **Smart App Control settings**
3. If **On**, switch to **Off** (Windows typically cannot turn it back on without a reset)

---

## License

[MIT](LICENSE) — 2026 agent-loop contributors.
