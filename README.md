# agent-loop

**You write a sentence. A local agent ships it — tests first, then a pull request.**

Not a chatbot that pastes code into chat. A runner on your machine: it plans the work, TDD-implements each slice, commits, pushes `agent/*`, and opens the GitHub PR. CI is already on the branch from the first minute.

```bash
# inside your empty product git clone:
git clone https://github.com/matteym/agent-loop-autonomous-TDD-dag-runner.git
cd agent-loop-autonomous-TDD-dag-runner/dag
yarn
yarn run init --remote=https://github.com/YOU/YOUR-REPO.git
yarn task "add JWT login on the API"
```

That’s the whole product: **init** (empty stack + GitHub Actions + first push), then **task** (plan → red → green → commit → push → PR).

---

## Why try it

| You type | The runner does |
|---|---|
| One intent | Splits it into ≤ 10 feature nodes |
| Nothing else | RED tests, GREEN code, guard, node tests |
| — | Commit with the exact subject, then push |
| — | Open or reuse a PR (`gh`) |

Languages are discovered, not configured: **TypeScript** (`yarn test`), **Python** (`uv` + pytest), **Go**, **Rust**. A language that isn’t in the tree (or whose toolchain is missing) is skipped on CI. A real test failure still fails the job.

The agent never `git push`. The orchestrator does — unless you pass `--no-push`.

---

## Quick start

**Need:** Node + Yarn, `git config user.name` / `user.email` in the repo, a [Cursor](https://cursor.com) key (`CURSOR_API_KEY`) and/or a Claude key (`ANTHROPIC_API_KEY`), [`gh`](https://cli.github.com/) logged in, a GitHub repo URL.

```bash
# 1. empty GitHub product (already a git clone)
cd your-product-repo

# 2. drop the engine in as a removable plugin
git clone https://github.com/matteym/agent-loop-autonomous-TDD-dag-runner.git
cd agent-loop-autonomous-TDD-dag-runner/dag
yarn

# 3. writes compose, src/*, CI, .cursor one level up (the product root)
#    and gitignores this plugin folder in the parent
yarn run init --remote=https://github.com/YOU/YOUR-REPO.git

# 4. plan and build — each node is pushed; a PR is opened toward main
yarn task "Build a notes API with Express and yarn test"
```

Stay local: `yarn task --no-push "…"`.

Skip the planner: `yarn task --dagfile=path/to/your.json`.

**Never run `yarn init`.** Yarn v1 will overwrite `dag/package.json`. Always **`yarn run init`**.

Copy `dag/` + `.cursor/` into any empty repo if you want the engine **without** nesting this GitHub history. Nesting the whole clone is the default: init targets `../` (the parent git repo) and gitignores the plugin folder.

---

## What init puts on the branch

Init writes **on the product repo** (the git work tree that contains this engine, one level above the plugin folder when nested):

- `src/backend` / `src/frontend` (empty — architecture comes from the task)
- Compose stub + `APP_PORT`
- `.cursor/` copied from the plugin (skill, rule, hooks)
- `.github/workflows/ci.yml` — `yarn test`, pytest, `go test`, `cargo test`
- parent `.gitignore` includes the plugin directory so the engine stays untracked
- Commit on `agent/init`, product `origin` set, **pushed** (never `--force`)

`--repo=` is the same as `--remote=`. The URL is required.

---

## Check the engine

```bash
cd dag
yarn test
yarn tsc --noEmit
```

Operator detail: [`dag/README.md`](dag/README.md). Protocol: [`.cursor/skills/agent-loop/SKILL.md`](.cursor/skills/agent-loop/SKILL.md).

---

## License

[MIT](LICENSE) — 2026 agent-loop contributors.
