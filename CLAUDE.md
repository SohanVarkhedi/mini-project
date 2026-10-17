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
phishverse/seed.py   ensure_defaults() (first manager + config), seed_demo(), set_manager_password().
migrations/          NNNN_name.sql, applied in order at startup, tracked in schema_version.
tests/               pytest. conftest.py: app/client/manager/employee fixtures, make_user, sign_in.
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
web/js/content.js    World objects (placeObjects/addObj/desk), NPC palettes (P) + NPCDEF,
                     outcome scale (OUT), and LEVELS (5 levels, 25 scenarios).
web/js/engine.js     Actors, level state G, rendering + quest highlights, minimap, input/pathfinding,
                     dialog (say), interaction, encounters (openEncounter/showVerdict/openHub),
                     debrief/results, audio, startLevel/stopGame. Hook: onLevelComplete(levelId, summary).
web/js/ui.js         UI.* helpers (standalone): UI.toast(), openDrawer(), confirmModal(), renderAddr(text,{flag}),
                     UI.icon(name), UI.avatarHTML(), UI.themeSwitch()/setTheme(). (Plain toast() is the game's.)
web/js/portal.js     Store + data modes, hash routing, shells, pages, sign-in, boot.
                     Manager: #overview #people #programs #reports #settings #training. Employee: #journey #skills
                     #certificates #profile. Shell renders once per role; only #view re-renders on data refresh.
```
Scripts are **classic scripts sharing globals**, loaded in order core → content → engine → ui → portal.
Do not introduce a bundler, framework or npm build unless a task explicitly asks for it.

## Data modes (portal.js `Store.mode`)
- `local` — talks to Flask under `/api/*` (the main product from now on).
- `demo` — in-memory sample data; used when opened as a file or the API is unreachable.
- `live` — runs as a claude.ai artifact using `window.claude.use('db')`. Keep it from breaking,
  but new features only need to work in `local` (and degrade gracefully in demo).

## Server API (current)
`GET /api/health` · `GET /api/me` · `POST /api/login` · `POST /api/register` · `POST /api/logout` ·
`PUT /api/profile` · `GET /api/state` · `PUT|DELETE /api/assignments/<uid>` (manager) ·
`PUT /api/config` (manager) · `PUT /api/progress` (self).
Tables (see `migrations/`): `schema_version(version,name,applied_at)`, `users(id,name,email,pw_hash,role manager|employee,dept,joined_at)`, `assignments(user_id,data JSON)`,
`progress(user_id,data JSON)`, `config(id=1,data JSON)`.
Mutating `/api/*` requests must be JSON (cheap CSRF guard). Session cookie: HttpOnly, SameSite=Lax.

## Content model (content.js → LEVELS)
Level: `{id, n, title, topic, minutes, blurb, start:{x,y,dir}, intro:[...], tasks:[...]}`.
Task: `{id, label, at:{obj|npc}, after?, talk?:[pages], enc?}`. Encounter `enc`:
`{ch: email|sms|call|chat|mfa|object|person, title, legit?, art:{...per channel}, inspect:[{l,c,f,hl}],
acts:[{l,o,fb}], lesson}`. Outcomes `o`: `safe` 1 · `acceptable` .6 · `false_alarm` .4 · `compromise` 0 pts.
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
See `docs/ROADMAP_PROMPTS.md` (stages 0–12, run in order). Stages 0 (foundation) and 1 (design system) are done. Multi-company (B2B) features from
PRODUCT_SPEC_v1 are deliberately out of scope until after the demo.
