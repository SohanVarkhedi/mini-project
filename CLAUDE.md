# PhishVerse — project guide for Claude Code

PhishVerse is a security-awareness training platform. Managers assign training to
employees; employees play a top-down pixel-art office RPG (GBA "Pokémon-style",
but **no Pokémon IP**) where each scenario is a phishing / social-engineering
situation they must **inspect, then decide** on. Solo student project, budget ₹0.

## Product flow (the whole point; every stage serves this)

1. **Manager assigns** a training program to employees (manager portal, usually a laptop).
2. **Employee opens their portal** (usually a phone) and sees the assigned program.
3. **Plays the game**: the assigned levels act as the baseline assessment.
4. **Gets results**: score per level.
5. **Skills report**: strong areas and weak spots, per skill.
6. **Targeted training**: short, simple simulations for each weak skill.
7. **Final test**: unseen scenarios, no hints; pass mark set by the manager.
8. **Certificate** on passing (verifiable by QR / code).
9. **Manager monitors** every step live on the manager portal.

**Multi-device is a requirement**: the demo shows the manager portal on one device and the
employee portal on another at the same time, with the manager's view updating live. The server
must be reachable on the local network (`python server.py --lan`) and the UI must work on phones,
tablets and laptops. UI rules: `docs/UI_GUIDE.md` (follow it for every portal screen).

## Run

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt     # runtime + pytest/Playwright
python -m playwright install chromium   # once, for the e2e test
python server.py --seed-demo            # http://localhost:5000
python server.py --lan                  # binds 0.0.0.0, prints the LAN URL for phones
```
Other flags: `--host`, `--port`, `--set-manager-password PW`. `PHISHVERSE_DB` env var overrides the DB path.
- Manager login: `manager@novacorp.local` / `manager123`; seeded employees use `demo1234`.
- `web/index.html` opened directly (file://) runs **demo mode** with sample data. Keep this working.
- Style guide: http://localhost:5000/styleguide.html (or open web/styleguide.html directly).
- Delete `phishverse.db` to reset. `.secret_key` holds the Flask session key (never commit either).

## Layout

```
server.py            Thin CLI (argparse, --lan LAN-IP detection) around phishverse.create_app().
phishverse/__init__  create_app(config=None): config (DB_PATH, SECRET_KEY, TESTING overrides), blueprints,
                     static files from web/, runs migrations + default manager/config on startup.
phishverse/db.py     get_db() (sqlite3 connection per request, closed on teardown), connect(), migrate().
phishverse/auth.py   Blueprint: /api/me, login, register, logout, profile. Helpers err/current_user/require_user.
phishverse/api.py    Blueprint: health, state, assignments, config, progress. JSON-only guard + no-store
                     header for /api/*. LEVEL_IDS, OUTCOMES, clean_progress().
phishverse/content.py  Loads + validates content/*.json at startup (validate(), Content.score(), scored_tasks()),
                     renders web/js/content-data.js. The server never trusts client outcomes or scores.
phishverse/sessions.py Blueprint: play sessions + decisions, server-side scoring, refresh_progress() (progress row
                     = summary derived from finished sessions; pre-Stage-2 levels without sessions are kept).
phishverse/seed.py   ensure_defaults() (first manager + config), seed_demo() (records real sessions + decisions via
                     record_play()), set_manager_password().
content/levels.json  Levels, tasks, scenarios (enc) and the outcome scale. Edit content here, never in JS.
content/skills.json  The 9 skills (id, name, description, icon). Scenarios tag 1-2 of them.
content/world_refs.json  GENERATED: object/NPC ids in the JS world (+ which levels they appear in).
scripts/             build_content.py (-> web/js/content-data.js), validate_content.py, gen_world_refs.py (Chromium).
migrations/          NNNN_name.sql, applied in order at startup, tracked in schema_version.
tests/               pytest. conftest.py: app/client/manager/employee fixtures, make_user, sign_in, play (whole level via API).
tests/e2e/           Playwright smoke test (marked e2e): desktop manager + phone employee, file:// demo mode.
web/index.html       Shell: #portal (rendered by portal.js), #game markup (locked), #ui-layer (toasts/drawers/modals).
web/styleguide.html  Every component in light and dark (served at /styleguide.html).
web/css/tokens.css   Design tokens from docs/UI_GUIDE.md: colours (light + dark + derived -text/-soft), type scale,
                     spacing, radii, --hit (38px desktop, 44px phone/touch), motion easings and durations.
web/css/base.css     Reset + portal typography, scoped to .ds (element resets use :where(.ds), zero specificity).
web/css/components.css  Buttons, status pill, chips, avatar, .addr, field, select, checkbox, segmented, tabs, panel,
                     table, progress/ring/skill, banner, empty state, skeleton, drawer, modal, toast, stagger.
web/css/portal.css   Sign-in, manager shell (rail -> icons < 1280 -> top menu < 768), employee shell (bottom nav
                     < 768, 720px column + top nav above), page layouts.
web/css/game.css     Game styles, all scoped to #game, which carries its own old dark tokens + Inter. Locked.
web/js/core.js       Map grid + rooms, helpers (H/S sprite painters, outline, hash), characters
                     (charFrame/sheet, 16x24 chibi, 4 dirs x 4 frames + sit), hi-res props (PROPS),
                     static world drawing (drawWorld) at R=2 (32 px per tile).
web/js/content-data.js  GENERATED from content/*.json: window.PV_CONTENT = {outcomes, levels, skills}. Commit it.
web/js/content.js    World objects (placeObjects/addObj/desk), NPC palettes (P) + NPCDEF. OUT and LEVELS come from
                     PV_CONTENT. After editing objects/NPCs here: python scripts/gen_world_refs.py.
web/js/engine.js     Actors, level state G, rendering + quest highlights, minimap, input/pathfinding,
                     dialog (say), interaction, encounters (openEncounter/showVerdict/openHub),
                     debrief/results, audio, startLevel/stopGame. Hooks the portal sets: onLevelStart(levelId, opts),
                     onDecision(levelId, task, {act, o, inspected:[clue idx in order], ms}), onLevelComplete(levelId, summary)
                     (may return {saved, score, stars}; the results card then shows the server's score).
web/js/ui.js         UI.* helpers (standalone): UI.toast(), openDrawer(), confirmModal(), renderAddr(text,{flag}),
                     UI.icon(name), UI.avatarHTML(), UI.themeSwitch()/setTheme(). (Plain toast() is the game's.)
web/js/portal.js     Store + data modes, hash routing, shells, pages, sign-in, boot.
                     Manager: #overview #people #programs #reports #settings #training. Employee: #journey #skills
                     #certificates #profile. Shell renders once per role; only #view re-renders on data refresh.
```
Scripts are **classic scripts sharing globals**, loaded in order core → content-data → content → engine → ui → portal.
Do not introduce a bundler, framework or npm build unless a task explicitly asks for it.

## Data modes (portal.js `Store.mode`)
- `local` — talks to Flask under `/api/*` (the main product from now on).
- `demo` — in-memory sample data; used when opened as a file or the API is unreachable.
- `live` — runs as a claude.ai artifact using `window.claude.use('db')`. Keep it from breaking,
  but new features only need to work in `local` (and degrade gracefully in demo).

## Server API (current)
`GET /api/health` · `GET /api/me` · `POST /api/login` · `POST /api/register` · `POST /api/logout` ·
`PUT /api/profile` · `GET /api/state` · `PUT|DELETE /api/assignments/<uid>` (manager) ·
`PUT /api/config` (manager) · `POST /api/sessions {level_id, purpose}` · `GET /api/sessions/<id>` ·
`POST /api/sessions/<id>/decisions {task_id, action_index, inspected, response_ms}` → `{outcome}` (from content) ·
`POST /api/sessions/<id>/finish` → `{score, stars, outcomes, progress}` (needs every scored task; idempotent).
Sessions are owner-only: anyone else gets 404. Duplicate decision → 409; decision after finish → 409.
Tables (see `migrations/`): `schema_version(version,name,applied_at)`, `users(id,name,email,pw_hash,role manager|employee,dept,joined_at)`, `assignments(user_id,data JSON)`,
`progress(user_id,data JSON)` (summary cache rebuilt on finish), `config(id=1,data JSON)`,
`play_sessions(id,user_id,level_id,purpose baseline|practice|test,started_at,finished_at,client_version,score,stars)`,
`decisions(id,session_id,task_id,action_index,outcome,severity,inspected_json,n_inspections,response_ms,created_at)`.
Progress per level = finished baseline + practice sessions: best score, last, attempts, outcomes of the best attempt.
Local mode scores on the server; demo and live modes still score on the device (live writes `progress/<uid>`).
Mutating `/api/*` requests must be JSON (cheap CSRF guard). Session cookie: HttpOnly, SameSite=Lax.

## Content model (content/levels.json → PV_CONTENT.levels)
Level: `{id, n, title, topic, minutes, blurb, start:{x,y,dir}, intro:[...], tasks:[...]}`.
Task: `{id, label, at:{obj|npc}, after?, talk?:[pages], enc?}`. Encounter `enc`:
`{ch: email|sms|call|chat|mfa|object|person, title, legit?, art:{...per channel}, inspect:[{l,c,f,hl}],
acts:[{l,o,fb,sev?}], lesson, skills:[1-2 ids, primary first], cues:[...], difficulty:1-3}`.
Outcomes `o`: `safe` 1 · `acceptable` .6 · `false_alarm` .4 · `compromise` 0 pts (scale in levels.json `outcomes`).
`sev` on every compromise action: 1 clicked/opened · 2 gave credentials or a code · 3 money moved / physical access /
malware run. `cues` ⊆ urgency, authority, reward, fear, curiosity, familiarity, secrecy, helpfulness.
Legit scenarios: ≥ 1 false_alarm action, no compromise, no red-flag clues. Every skill needs ≥ 2 scenarios.
Content workflow: edit content/*.json → `python scripts/build_content.py` → `python scripts/validate_content.py`.
The server refuses to start with invalid content; tests fail if content-data.js or world_refs.json is stale.
Score = mean points × 100; stars ≥90 → 3, ≥70 → 2, else 1. Legit scenarios exist on purpose
(over-reporting is penalised). `hl` keys tie a clue to highlighted parts of the artifact
(`addr`, `link`, `body`, `attach`, `loc`).

## Conventions
- Game visuals are locked: the **dialog box design** (round portrait, green caps name, page dots,
  green "Next ▶" / "Got it! ✓" pill, typewriter text) and the gold quest language (glow, beam,
  marker, edge arrow, tracker, minimap dot). Portals follow `docs/UI_GUIDE.md` (tokens, fonts,
  components, motion, layouts). If a UI/design/animation skill is available in the session, use it
  as well; UI_GUIDE.md wins on conflicts.
- Portal CSS: never reuse a class name the game uses (see game.css: .btn, .chip, .toast, .modal, .pill, .ico,
  .me, .live-dot ...). Portal names: .button--primary, .status-pill, .score-chip, .icon, etc. `.addr` is shared
  by name, so the portal one is scoped `:where(.ds) .addr`. State goes in ARIA/data attributes (aria-pressed,
  aria-current, data-state, data-tone), not bare modifier classes.
  Gold (--gold, .next-marker, primary buttons) means "next step": at most one .next-marker per screen.
  Semantic colour always comes with an icon or text; use the -text tokens for coloured text.
- game.css and the #game markup are the locked game: don't change them unless a task says so.
- All art and audio are drawn/synthesised in code. Only CC0 assets if any are ever added; log them in ASSETS.md.
- Copy: plain English, active voice, short sentences, Indian workplace context (₹, Bengaluru office),
  NovaCorp as the fictional company. Never real company brands in phishing examples.
- Escape any user/content string that goes into innerHTML (`esc()`); prefer textContent.
- Security product → practise it: hashed passwords, role checks on every endpoint, parameterised SQL,
  input validation, no secrets or PII in git.
- After each task: run the tests, update README/CLAUDE.md if behaviour or commands changed, and
  make one focused git commit.

## Database migrations
Schema changes go in a **new** file `migrations/NNNN_short_name.sql` (next number, lowercase name).
Never edit a committed migration. Each file runs once, in its own transaction, at app startup.
0001 uses `CREATE TABLE IF NOT EXISTS` so pre-migration `phishverse.db` files adopt it cleanly.
SQLite `ALTER TABLE` is limited: to change a column, create a new table, copy, drop, rename.

## Testing
```bash
pytest                 # everything (API tests + Playwright browser smoke test)
pytest -m "not e2e"    # fast API tests only
pytest tests/e2e --headed   # watch the browser test
```
`tests/e2e/test_visual.py` screenshots sign-in, manager overview, employee journey, demo mode and the style
guide at 390×844 and 1440×900 in light and dark into `test-results/screens/` (gitignored) and asserts:
no horizontal scroll, visible focus on every button/link, touch targets ≥ 44px on phones, no console errors.
Look at the screenshots after any UI change.
Tests use a temp DB and a throwaway secret key; they never touch `phishverse.db` or `.secret_key`.
The e2e test runs the app in a background thread on a free port, stubs Google Fonts, and fails on any
page error or console error. Test hooks on `window`: `G` (read-only getter for the level state),
`startLevel`, `summary`, `showResults`. Complete a level in tests by filling `G.res` then
`showResults(summary())`. Add a test with every new endpoint or rule (auth, role check, validation).

## Roadmap
See `docs/ROADMAP_PROMPTS.md` (stages 0–12, run in order). Stages 0 (foundation), 1 (design system) and 2 (content data, decisions, skills) are done. Multi-company (B2B) features from
PRODUCT_SPEC_v1 are deliberately out of scope until after the demo.
