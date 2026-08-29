# Intent — démo vidéo

Commande à coller (depuis `dag/`, pas de `--dagfile`) :

```bash
yarn task "Build a minimal full-stack notes app with an Express backend and a simple frontend to CRUD notes. Serve the UI from Express on process.env.APP_PORT so one process exposes both local URLs: frontend GET / and API /api/notes. Do not hardcode localhost in application source. Add a start note that prints both URLs from APP_PORT. yarn test on this package. No git push."
```

Hors caméra : `yarn run init --yes` (APP_PORT=3000, compose up).

## Pourquoi cette phrase (pas la version courte)

La phrase courte « Express + frontend » peut faire créer un `Client/` sur un second port. Le compose d’init n’expose **que** `APP_PORT`. CORS + second `yarn dev` = démo fragile.

Même origine = deux URLs locales, un seul process :

- Frontend : `http://127.0.0.1:3000/`
- Backend : `http://127.0.0.1:3000/api/notes`

Le runner **n’imprime pas** ces URLs tout seul (`run end:` seulement). C’est toi (ou le README que l’agent écrit) qui les annonces. Dans le source app : `APP_PORT`, jamais `http://localhost` en dur (le guard refuse).

## Juste après `run end`

1. `docker compose up --build -d` puis `docker compose ps`
2. Annonce à l’écran (remplace 3000 si `APP_PORT` a changé) :
   - **frontend** `http://127.0.0.1:3000/`
   - **backend** `http://127.0.0.1:3000/api/notes`
3. `curl -sS http://127.0.0.1:3000/health` puis `curl -sS http://127.0.0.1:3000/api/notes`
4. Ouvre le frontend, CRUD sans retoucher le code :
   - Create `demo-1` / `hello agent-loop`
   - Read
   - Update body → `updated`
   - Delete `demo-1`
   - Create `demo-2` et la laisser

Échec = tests verts + UI morte, ou URLs introuvables. Succès = les deux URLs dites + les clics.

Script : `ressources/script-video-presentation.md`.
