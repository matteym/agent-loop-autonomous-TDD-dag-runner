# Script — vidéo de présentation (≈ 30 min)

**Promesse à l’écran :** une phrase → `yarn task` → une app notes full-stack → tu CRUD dans le navigateur  
**Commande unique (à l’écran, collée depuis `ressources/task.md`) :**

```bash
yarn task "Build a minimal full-stack notes app with an Express backend and a simple frontend to CRUD notes. Serve the UI from Express on process.env.APP_PORT so one process exposes both local URLs: frontend GET / and API /api/notes. Do not hardcode localhost in application source. Add a start note that prints both URLs from APP_PORT. yarn test on this package. No git push."
```

À la fin tu dois **dire et ouvrir** (port = `APP_PORT`, défaut 3000) :

- frontend : `http://127.0.0.1:3000/`
- backend : `http://127.0.0.1:3000/api/notes`

**Durée cible :** 28–32 minutes  
**Ordre :** moteur (`yarn test`) → lancer le task → **tester l’app notes tout de suite** → ensuite seulement le capot  
**Langue :** français, tutoiement, démo live

L’intention est aussi dans `ressources/task.md`. Ne **pas** utiliser `yarn task --dagfile=metadata/dag.json` : ce JSON est un autre ticket (uploads GCP), pas cette vidéo.

---

## Est-ce que ça va marcher ? (honnête)

**Possible, pas garanti.** C’est le chemin prévu (intent → PLAN → TDD → commit), et un CRUD notes tient dans 1–2 nœuds. Ce n’est pas un bouton magique.

| Ça aide | Ça casse souvent |
|---|---|
| Init a déjà health + `APP_PORT` + compose | Le squelette n’est **pas** Express (`node:http`) : GREEN doit l’ajouter |
| Un process, UI + `/api/notes` sur le même port | Phrase courte → planner crée `Client/` + Vite : compose n’expose pas ce port, CORS |
| Guard + tests du nœud | `fetch("http://localhost:3000")` dans le source → **GUARD rouge** |
| 5 rounds de fix | Nœud trop gros (Express + React + SQL + CORS) brûle les 5 rounds |
| | Le log de fin est `run end: … nodes_ok=` — **aucune URL n’est imprimée par le runner** |

Le runner ne « donne » pas les URLs. Toi tu les annonces après le run, depuis `APP_PORT`. `127.0.0.1` dans le navigateur / `curl`, c’est toi. Dans le code : `process.env.APP_PORT`.

**Avant le jour J :** un run à blanc sur un clone jetable. Si ça rate, tu tournes le plan B (résultat déjà commité) ou tu resserres encore le JSON à la main — pas pendant la prise.

---

## Ce que « succès » veut dire (avant même de tourner)

Le run est réussi seulement si **les deux** sont vrais :

1. L’orchestrateur a fini avec `nodes_ok` > 0, commits du ticket + `chore(config): archive dag node …`
2. Tu **annonces** les deux URLs locales (frontend `/`, backend `/api/notes`)
3. **Toi**, sans retoucher le code, tu ouvres l’UI et tu fais Create / Read / Update / Delete sur une note

Si (1) est vert et (2) ou (3) est cassé, tu le dis à l’écran. Ne pas « expliquer le code » pour masquer une UI morte.

---

## Avant de tourner (hors caméra, 20–30 min)

### Pourquoi un clone jetable

Ce repo-ci est le **moteur** (`dag/` + `.cursor/`). Il n’a pas encore d’app produit. C’est le bon point de départ : `yarn task "…"` sur un arbre vide lance le wizard init **puis** le planner **puis** la boucle.

Pour ne pas polluer le repo de travail : copie `dag/` + `.cursor/` dans un dossier vide, `git init`, branche `demo/notes-app`.

### Recette recommandée (prise propre)

Hors caméra, dans le clone jetable :

```bash
cd dag
yarn
yarn run init --yes
```

`--yes` lit `metadata/init.defaults.json` : TypeScript, monolith, port **3000**, Postgres + Redis, `docker compose up --build -d`. À la fin, `/health` doit répondre `{ ok: true }`.

Ensuite seulement tu appuies sur rec. À l’écran, **une** commande : le `yarn task` notes. L’init n’est pas le héros ; l’app notes l’est.

**Variante « une seule commande depuis zéro » :** skip `init --yes` hors caméra. Le même `yarn task "…"` (phrase longue de `task.md`) sur repo vide + TTY = ASK puis PLAN puis TDD. Plus wow, plus long, plus de risque. Si tu le fais, prépare les réponses (ts, monolith, port 3000, postgres).

### Repo prêt

- Branche **≠** `main` / `master`
- Working tree propre (hors `state.json`, `*.done.json`, `logs/`, `history/`)
- Clé Cursor ou Claude dans l’env / `.env` — **jamais à l’écran**
- Docker **up** (l’app notes devra tourner tout de suite après)
- Navigateur prêt, **aucun** onglet mail / cloud console
- Police terminal ≥ 16

### Découpage tournage

Un run notes (API Express + frontend + tests) peut durer **largement plus de 10 min**. Ne pas filmer l’agent au ralenti.

| Clip | Live ? |
|---|---|
| `yarn test` (moteur) | **Oui, entier** |
| Coller + lancer le `yarn task` notes | **Oui** |
| PLAN + premières lignes RED/GREEN | Oui, 60–90 s |
| Agent qui code | **Accéléré ×8–16** ou jump-cut quand `run end:` apparaît |
| `git log` + archive | Oui, 45 s |
| **Navigateur : CRUD notes** | **Oui, entier, pas accéléré** |
| Explication code | Après le CRUD seulement |

**Plan B :** tu lances le task **la veille**, tu gardes le clone + `dag/logs/run-*.log`. Jour J : 20 s d’accéléré + CRUD live. Dis-le : « run déjà terminé, on teste le résultat. »

### Phrase d’accroche

> « Une phrase. Une commande. À la fin : l’URL du front, l’URL de l’API, et je crée une note. »

---

## Plan chrono

| # | Segment | Durée | Cumul |
|---|---|---|---|
| 0 | Accroche + la phrase | 1 min | 01:00 |
| 1 | Contrat (quoi / comment on saura que ça marche) | 1 min 30 | 02:30 |
| 2 | **TEST moteur** `yarn test` | 2 min 30 | 05:00 |
| 3 | **Lancer** le `yarn task` notes | 6 min | 11:00 |
| 4 | **TEST app** CRUD navigateur | 5 min | 16:00 |
| 5 | Recap « ce que tu viens de voir » | 1 min | 17:00 |
| 6 | Architecture | 3 min 30 | 20:30 |
| 7 | Init + inventaire (pourquoi Express + UI) | 2 min 30 | 23:00 |
| 8 | Planner → TDD → COMMIT | 4 min | 27:00 |
| 9 | Murs + limites | 1 min 30 | 28:30 |
| 10 | Close | 1 min 30 | 30:00 |

Jusqu’à 16:00 : presque zéro théorie. Le clic CRUD **est** la démo.

---

## Segment 0 — Accroche (00:00 → 01:00)

**Écran :** terminal `dag/`, branche `demo/notes-app` visible.

**Tu dis :**

> Salut. Agent-loop : une boucle locale, pas un SaaS. Tu donnes une intention. Un agent Cursor ou Claude code nœud par nœud, en TDD. L’orchestrateur lance les tests, le guard, le commit, l’archive.
>
> Aujourd’hui je ne montre pas un ticket interne. Je lui demande une app notes : backend Express, frontend simple, CRUD. Quand c’est fini, on n’ouvre pas un PowerPoint — on ouvre le navigateur.

**Geste :** affiche `ressources/task.md` (la phrase seule), 3 secondes, puis retour terminal.

---

## Segment 1 — Contrat (01:00 → 02:30)

**Écran :** `dag/README.md` — uniquement le tableau `yarn test` / `yarn run init` / `yarn task`.

**Tu dis :**

> Trois commandes depuis `dag/`. `yarn test` vérifie le **moteur**. `yarn run init` pose les rails (compose, `.env`, health). `yarn task` + une phrase : le planner découpe, la boucle construit.
>
> La phrase d’aujourd’hui, collée depuis `ressources/task.md` (version **longue** : même port, UI + `/api/notes`).

**Écran : tu colles la commande, tu ne la tapes pas.**

> Critère de fin : je dis les deux URLs locales, puis Create / Read / Update / Delete dans l’UI, sans réécrire le code.
>
> Je commence par `yarn test`. Si le runner est rouge, l’app notes n’a aucun sens.

**Interdit à l’écran :** `--dagfile=metadata/dag.json`. Tu peux dire : « le chemin expert existe, ce n’est pas cette démo. »

---

## Segment 2 — TEST 1 : le moteur (02:30 → 05:00)

```bash
yarn test
```

**Tu dis pendant que ça tourne :**

> Vitest du runner. CLI, chemins, init, provider. Pas d’appel Cursor ici.

**Vert :**

> Vert. On a un orchestrateur qui parse vraiment `yarn task`, pas un script de slide.

**Rouge :** coupe, fixe, re-tourne. Pas de « ça marche quand même ».

**Option 15 s :** `yarn tsc --noEmit`.

Ne montre `cli.test.ts` que si tu as 20 s de rab : sinon saute, le CRUD notes est plus important.

---

## Segment 3 — Lancer le task notes (05:00 → 11:00)

### 3.1 Preflight (05:00 → 05:40)

```bash
git branch --show-current
git status
```

**Tu dis :**

> `main` / `master` : EXIT 1. Tree sale : EXIT 1. L’agent n’a pas le droit de committer par-dessus ton wip.

### 3.2 La commande (05:40 → 06:10)

**Écran plein terminal.** Tu colles la phrase **longue** de `task.md`, tu Enter. Tu n’es pas obligé de la lire en entier à voix haute — dis :

> Express, CRUD notes, UI servie par le même process, port `APP_PORT`. Pas de `--dagfile`.

**Tu dis :**

> On force **un** package, pas un `Client/` séparé. Le compose d’init n’ouvre qu’un port. Même origine = pas de CORS à la caméra. Si le planner sort quand même deux cwd, tu le commentes, tu ne relances pas en live.

### 3.3 Ce que tu nommes dans les 90 premières secondes (06:10 → 07:40)

Logs `[task]` puis `[dag]` :

1. `PLAN` + l’intent
2. `wrote …/task.json nodes=N`
3. `provider=cursor` (ou `claude`)
4. `agent.id=…`
5. `──────── <id> ────────`
6. `RED` / `GREEN`

**Ouvre 10 s** `dag/metadata/task.json` (généré, gitignoré). Lis **les ids** et les `cwd` des tests, pas les prompts en entier.

Exemple de ce que tu *espères* (le planner décide, adapte au JSON réel) :

- nœud API : `yarn test` dans `.` ou `apps/api` ou `Server`
- nœud UI : `yarn test` dans `Client/` (ou static servi par Express)

**Tu dis :**

> Un handle agent pour tout le run. `run.wait()` doit être `finished`. Chaque nœud a son commit imposé. Moi je ne touche à rien jusqu’à `run end`.

**Caméra :** pas de `.env`, pas de clé. Le logger redacte, tu ne zoomes pas.

### 3.4 Accéléré (07:40 → 10:00)

Carton : « run accéléré — TDD sur l’API notes puis le frontend »

**Voix off :**

> RED : tests qui échouent, pas de prod. GREEN : Express CRUD + UI minimale. GUARD : pas de `any`, pas de localhost en dur dans le source — les URLs passent par des variables d’environnement. Tests du nœud. Cinq fix max. Commit au sujet exact. Archive. Nœud suivant. Quand le frontend est un nouveau package, s’il n’existe pas après GREEN, c’est un rouge, pas un skip.

### 3.5 Preuve git (10:00 → 11:00)

Vitesse réelle :

```bash
git log -12 --oneline
```

**Tu dis :**

> `feat(…): …` puis `chore(config): archive dag node …` pour chaque nœud. Le sujet vient du JSON, pas d’un commit « wip notes ».

```bash
ls dag/metadata/
# puis, adapter le timestamp :
tail -n 20 dag/logs/run-*.log
```

Cherche `run end:` + `nodes_ok=`. Si `FAIL` : montre `failures.log`, **ne pretends pas** que l’UI marche. Fin alternative honnête : « le nœud a cassé, voilà le revert. »

---

## Segment 4 — TEST 2 : l’app notes, tout de suite (11:00 → 16:00)

C’est **le** moment de la vidéo. Ne le saute pas. Ne l’accélère pas.

### 4.0 Rebuild + **annoncer les deux URLs** (obligatoire, ~1 min)

Le runner ne les affiche pas. C’est toi.

```bash
docker compose up --build -d
docker compose ps
```

Ouvre `.env.example` (clés seulement) : `APP_PORT` = 3000 sauf si tu as changé.

**Carton / terminal, tu lis à voix haute :**

```
frontend  http://127.0.0.1:3000/
backend   http://127.0.0.1:3000/api/notes
```

Puis preuve API (pas de `cat .env`) :

```bash
curl -sS "http://127.0.0.1:3000/health"
curl -sS "http://127.0.0.1:3000/api/notes"
```

`127.0.0.1` ici c’est **toi** qui testes. Dans le source : `APP_PORT`.

Si le planner a quand même créé un `Client/` à part : second terminal, `yarn dev`, port depuis **son** env. Tu annonces alors deux hosts. C’est le plan B fragile — tu le dis.

**Tu dis :**

> Deux URLs locales, un process. Je n’ajoute pas de feature. Je clique.

### 4.1 Navigateur — script CRUD (obligatoire)

Ouvre l’UI (port app ou port front). Fenêtre assez grande. Zoom 125 % si besoin.

**À voix haute, une action = une phrase :**

| # | Action | Tu dis |
|---|---|---|
| C | Créer une note titre `demo-1`, body `hello agent-loop` | « Create. J’envoie. » |
| R | La note apparaît dans la liste / le détail | « Read. Elle est là sans F5 magique — ou avec un refresh, tu le dis. » |
| U | Change le body en `updated` | « Update. Le texte a changé. » |
| D | Supprime `demo-1` | « Delete. La liste est vide. » |

**Deuxième note (30 s) :** crée `demo-2`, laisse-la. Ça prouve que ce n’est pas un fake à une ligne.

**Si l’API est là mais l’UI est moche :** assume. Le contrat c’est CRUD, pas Figma.

**Si CORS / page blanche :** 20 s max de Network tab (POST `/notes` ou équivalent). Si 404, montre la route dans le code **une** fois, puis : « le planner a livré l’API, l’UI n’est pas branchée — c’est un trou, pas une feature cachée. »

### 4.2 Optionnel 20 s — POST API

```bash
curl -sS -X POST "http://127.0.0.1:3000/api/notes" -H "content-type: application/json" -d "{\"title\":\"curl\",\"body\":\"ok\"}"
curl -sS "http://127.0.0.1:3000/api/notes"
```

Si la route réelle n’est pas `/api/notes`, utilise **celle du code**. Ne l’invente pas.

---

## Segment 5 — Recap (16:00 → 17:00)

**Une** slide :

```
phrase  →  PLAN (task.json)
        →  RED / GREEN / GUARD / TEST
        →  COMMIT NOW + ARCHIVE
        →  URLs locales + navigateur : C R U D
```

**Tu dis :**

> Tu n’as pas vu un README qui promet une app. Tu as vu une note créée et effacée. L’agent a codé les nœuds. L’orchestrateur a tenu les tests et les commits. Moi j’ai seulement collé une phrase et cliqué.

**Transition :** « Maintenant, pourquoi cette phrase-là produit ça. »

---

## Segment 6 — Architecture (17:00 → 20:30)

**Écran :** arborescence du **clone après run** : `src/` (ou `apps/api`) + éventuellement `Client/`, plus `dag/`, `.cursor/`.

### 6.1 Drop-in (17:00 → 18:00)

> Tu copies `dag/` et `.cursor/` dans un dossier vide. `git init`. `yarn` dans `dag/`. Ensuite `yarn run init` ou directement `yarn task "…"`.
>
> Skill + rule + hooks. Le hook git bloque `--no-verify`. L’agent local charge le skill : un nœud, pas de push, pas de `terraform apply`.

Montre 15 s le tableau Owns / Never dans `.cursor/skills/agent-loop/SKILL.md`.

### 6.2 CLI + providers (18:00 → 19:15)

`run-dag-loop.ts` → `cli.ts` → `providers/cursor.ts` (`Agent.create` local).

> `init` ou `task`. Flags : `--dagfile`, `--allow-pull-request`, `--provider`. Deux clés → Cursor. `Agent.create` local, pas une VM cloud.

### 6.3 Artefacts de **ce** run (19:15 → 20:30)

| Fichier | Rôle aujourd’hui |
|---|---|
| `metadata/task.json` | DAG que le planner a sorti de la phrase notes |
| `metadata/task.done.json` | nœuds archivés |
| `logs/run-*.log` | phases |
| `history/nodes.jsonl` | id, sha, durée |

> Le `dag.json` versionné du repo moteur, ce n’est **pas** cette démo.

---

## Segment 7 — Init et inventaire (20:30 → 23:00)

**Écran :** `init/run.ts` (ASK → COMPOSE → BOOTSTRAP → UP) + `init.defaults.json`.

**Tu dis :**

> Hors caméra j’ai fait `yarn run init --yes` pour que la vidéo commence sur le task. Init écrit compose, `.env`, un health TypeScript, commit les rails, `docker compose up`. Port via `APP_PORT` / `PORT`, pas une URL localhost dans le source.
>
> Le planner inventorie les `package.json`. Intent « Express + frontend » : souvent 2 nœuds. Nouveau dossier (`Client/`) = `optionalCwd` + `yarn test`. Après GREEN, le dossier existe ou le nœud échoue.
>
> Postgres est dans les defaults. L’agent **peut** s’en servir pour les notes, ou rester in-memory si le ticket ne force pas. Tu montres ce qu’il a vraiment fait (fichier store vs SQL), sans inventer.

---

## Segment 8 — De la phrase au commit (23:00 → 27:00)

### 8.1 PLAN (23:00 → 24:15)

`task.ts` — `buildPlannerPrompt` / `validateDag`.

> Premier send : PLAN ONLY, zéro fichier produit. Un JSON : 1 à 10 features, id kebab, commit `feat(scope): subject` minuscule sans point. Tests = la commande de l’inventaire. Écrit `task.json`, enchaîne `runLoop`.
>
> Si le JSON est mauvais (cwd hors inventaire, mauvais `yarn test`), le planner est rejeté avant de coder. C’est pour ça que la phrase est précise : Express, frontend, CRUD notes — pas « une super app ».

### 8.2 RED → GREEN → GUARD (24:15 → 25:45)

> RED sur les routes notes et l’UI. GREEN minimal. Guard : pas de `fallback-secret`, pas de skip de tests, pas de localhost hardcodé dans l’app — le front doit lire une env pour l’API.

### 8.3 COMMIT + ARCHIVE (25:45 → 27:00)

> COMMIT NOW, sujet verbatim. Mismatch → l’orchestrateur recommite. Archive hors du JSON actif. Nœud suivant. À la fin : tu testes **toi**, comme au segment 4.

---

## Segment 9 — Murs (27:00 → 28:30)

Six interdits, pas une litanie :

1. `git push` (sauf `--allow-pull-request` + `gh`, pas cette vidéo)
2. `--no-verify`
3. committer `.env`
4. inventer un second test runner
5. `it.skip` / supprimer des tests pour passer
6. coder hors du nœud courant

> Limite honnête : une phrase trop large brûle les 5 fix rounds. « Minimal notes CRUD » est volontairement petit. Si l’UI est laide mais le CRUD marche, la démo est bonne. Si les tests unitaires sont verts et l’UI ne parle pas à l’API, la démo est ratée — tu le dis.

---

## Segment 10 — Close (28:30 → 30:00)

**Écran :** navigateur sur la liste de notes (idéalement `demo-2` encore là) + petit `git log` en split.

**Tu dis :**

> Recap. Un : le moteur est testé. Deux : une phrase a produit Express + une UI. Trois : frontend `http://127.0.0.1:3000/`, backend `http://127.0.0.1:3000/api/notes`. Quatre : CRUD sans réécrire le code. Cinq : l’agent implémente ; l’orchestrateur teste, commite, archive.
>
> Pour rejouer : copie `dag/` et `.cursor/`, `yarn run init --yes`, puis exactement la commande de `ressources/task.md`. Ensuite, ouvre le navigateur avant d’ouvrir le capot.
>
> Merci.

Coupe sur l’UI notes, 2 s, noir.

---

## Voix off de secours

> Le run a dépassé le temps. On reprend sur le résultat déjà commité — même phrase, on teste l’app.

→ saute au **segment 4**.

Si le CRUD est impossible (run failed) : segment 3.5 + failures.log, close honnête. Ne pas ouvrir un mock HTML.

---

## Checklist jour J

- [ ] Clone jetable **ou** repo moteur encore sans app (sinon le planner part sur l’existant)
- [ ] **Pas** `--dagfile=metadata/dag.json`
- [ ] Branche ≠ main/master, tree propre
- [ ] `yarn test` vert avant rec
- [ ] `yarn run init --yes` déjà fait (sauf variante wizard live)
- [ ] `docker compose ps` healthy
- [ ] Commande **longue** collée depuis `ressources/task.md` (pas la phrase courte seule)
- [ ] À la fin : annoncer frontend `/` + backend `/api/notes`
- [ ] Navigateur prêt pour le CRUD **juste après** `run end`
- [ ] Plan B : run de la veille + même checklist CRUD
- [ ] Aucun `.env` à l’écran
- [ ] Dire `yarn run init`, pas `yarn init`
- [ ] Pas de push

---

## Variante 20 min

Garde 0, 2, 3 (lancement + accéléré), **4 (CRUD)**, 5, 10.  
Coupe 6–9 en trois phrases dans le close.

## Variante 40 min

Laisse **un** nœud GREEN en vitesse réelle (souvent l’API). Garde le CRUD entier. N’ajoute pas de second intent.

---

## Phrases interdites

- « Je vais juste ajuster le front vite fait » (ça casse le contrat « je teste sans recoder »)
- « On lance le dag.json facilities »
- « L’IA push sur main »
- « Je te montre la clé »
- « localhost c’est plus simple, je le mets en dur dans le source »

---

## Glossaire

| Mot | Ici |
|---|---|
| **Intent** | La phrase notes, mot pour mot |
| **PLAN** | Premier send → `task.json` |
| **Nœud** | Un ticket du JSON (API ou UI) |
| **CRUD** | Create / Read / Update / Delete dans le navigateur |
| **COMMIT NOW** | Seul commit produit, sujet imposé |
