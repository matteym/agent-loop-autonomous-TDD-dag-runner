# Product context — sports backend (`app`)

Versioned on the **product** git repo (`origin` = `https://github.com/matteym/app.git`), branch `agent/auth-p0`. The nested engine `agent-loop-autonomous-TDD-dag-runner/` is a plugin (gitignored). Agents must write product code in this repo, never inside the plugin folder.

## What this is

Brownfield TypeScript microservices under `Server/src/`. Express + Jest. JWT `{ userId: number }`. No cookies. Env for DB/API/GCS URLs. Never commit `.env` or `Server/app-storage-service-account-key.json`.

## Datastores (docker compose at product root)

- Postgres/PostGIS `:5432`
- Redis `:6379`
- Neo4j `:7687` / `:7474`

## Packages (inventoried tests = `yarn test`)

| Path | Port | Role |
|---|---|---|
| `Server/src/auth` | 3000 | register / login / refresh rotation / logout |
| `Server/src/facilities` | 3001 | sports terrains; authenticated GCS image upload |
| `Server/src/profile` | 3002 | profile + acquaintance block/unblock (Neo4j) |
| `Server/src/chat` | 3003 | Socket.IO + Redis + BullMQ; HTTP photo/video GCS upload; message likes; ephemeral Redis TTL |
| `Server/src/matchmaking` | 8000 | matchmaking |
| `Server/src/data_pipeline` | — | data pipeline |

Auth middleware to copy: `Server/src/profile/middlewares/auth.middleware.ts` (Bearer JWT, `userId: number`).

GCS: `process.env.GCP_BUCKET_NAME`, credentials `GOOGLE_APPLICATION_CREDENTIALS`. Mock `@google-cloud/storage` in Jest. Chat ephemeral TTL: `process.env.CHAT_EPHEMERAL_TTL_HOURS` (default 24).

## Already shipped (do not redo)

- `feat(auth): add refresh token rotation and logout`
- `feat(profile): add block and unblock acquaintance routes`
- `feat(facilities): add authenticated gcs sport field image upload`
- `feat(chat): add authenticated http media upload to gcs`
- `feat(chat): add message likes and ephemeral redis ttl`

## Rules for new work

- One package per DAG node unless the intent is sequential features in the same service.
- Copy existing APIs; do not invent a second auth stack, chat broker, or storage service.
- No Firebase, Playwright, Detox, Countly, hardcoded `localhost` in app source.
- No `git push` from the agent. Orchestrator may push only without `--no-push`.
