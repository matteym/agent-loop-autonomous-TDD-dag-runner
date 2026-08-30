# agent-loop

**You write a sentence. A local agent ships it — tests first, then a pull request.**

Not a chatbot that pastes code into chat. A runner on your machine: it plans the work, TDD-implements each slice, commits, pushes `agent/*`, and opens the GitHub PR. CI is already on the branch from the first minute.

```bash
cd dag
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
git clone https://github.com/matteym/agent-loop-autonomous-TDD-dag-runner.git
cd agent-loop-autonomous-TDD-dag-runner/dag
yarn

# empty app tree + CI workflow + push agent/init
yarn run init --remote=https://github.com/YOU/YOUR-REPO.git

# plan and build — each node is pushed; a PR is opened toward main
yarn task "Build a notes API with Express and yarn test"
```

Stay local: `yarn task --no-push "…"`.

Skip the planner: `yarn task --dagfile=path/to/your.json`.

**Never run `yarn init`.** Yarn v1 will overwrite `dag/package.json`. Always **`yarn run init`**.

Copy `dag/` + `.cursor/` into any empty repo if you want the engine without this GitHub history.

---

## What init puts on the branch

- `src/backend` / `src/frontend` (empty — architecture comes from the task)
- Compose stub + `APP_PORT`
- `.github/workflows/ci.yml` — `yarn test`, pytest, `go test`, `cargo test`
- Commit on `agent/init`, `origin` set, **pushed** (never `--force`)

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
