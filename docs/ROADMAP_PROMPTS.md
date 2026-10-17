# PhishVerse — Claude Code prompts, stage by stage (v2)

Built around the product flow in `CLAUDE.md`:
**assign → employee portal → play the game → results → skills report (strong / weak) →
targeted training simulations → final test → certificate → manager monitors it all live**,
demonstrated on **two devices at once** (manager laptop + employee phone).

Run the stages in order, one per Claude Code session (or `/clear` between stages). Each prompt is
self-contained and relies on `CLAUDE.md` and `docs/UI_GUIDE.md` being in the repo.

**For every stage**
1. Paste the prompt. Ask Claude Code to show its plan first, and approve it before it edits.
2. When it's done, run the app yourself and go through the "Done when" list.
3. Something wrong? Use the **Fix prompt** at the bottom. When it's right, commit.

| # | Stage | Flow step it delivers |
|---|---|---|
| 0 | Foundation: tests, app factory, migrations, LAN | Safety net |
| 1 | Design system + portal redesign | Every screen, both devices |
| 2 | Content as data, decision logging, skills taxonomy | Results you can analyse |
| 3 | Multi-device live sync | Manager sees progress live |
| 4 | Journey + skills report | Results → strong / weak areas |
| 5 | Targeted training simulations | Training for weak areas |
| 6 | Final test | The test |
| 7 | Certificate | Certificate |
| 8 | Manager monitoring console | Monitoring |
| 9 | ML classifier (offline) | AI Analyst model |
| 10 | ML in the product | AI Analyst in reports, "Check a message" |
| 11 | Demo day: hardening, seed, deploy, rehearsal | The presentation |
| 12 | *(After the demo)* Multi-company, email simulation | B2B extras |

---

## Stage 0 — Foundation: tests, app factory, migrations, LAN

```text
Read CLAUDE.md, server.py and everything in web/ first. Do not change any user-visible behaviour in this stage.

Goal: put a safety net under the project before we add features, and make it reachable from other devices.

1. Git: initialise a repo if there isn't one. Make sure .gitignore covers .venv/, __pycache__/, *.db, .secret_key, ml/data/, ml/artifacts/, .pytest_cache/, test-results/.

2. App factory: refactor server.py into a small package without changing behaviour:
   - phishverse/__init__.py with create_app(config=None) that takes DB_PATH, SECRET_KEY and TESTING overrides.
   - phishverse/db.py (connection per request, init), phishverse/auth.py, phishverse/api.py (blueprints), phishverse/seed.py.
   - Keep `python server.py [--seed-demo] [--host] [--port] [--set-manager-password]` working exactly as now (server.py becomes a thin CLI).
   - Add `--lan`: binds 0.0.0.0, runs threaded, and prints both the local URL and the computer's LAN URL (detect the LAN IP with a UDP socket trick; no external calls).

3. Migrations: replace the inline CREATE TABLE with a tiny migration runner: migrations/0001_initial.sql (current schema), a schema_version table, apply unapplied files in order at startup. Existing phishverse.db files must upgrade cleanly. Future stages add 0002_..., 0003_..., never edit old files.

4. Tests (pytest):
   - requirements-dev.txt: pytest, pytest-playwright (or playwright), and anything else you need. Document `python -m playwright install chromium`.
   - tests/conftest.py: app + client fixtures using a temp DB; helper to create manager/employee and log in.
   - tests/test_auth.py: register validation, duplicate email, login wrong password, logout, /api/me 401 when signed out.
   - tests/test_permissions.py: employee cannot PUT/DELETE assignments or PUT config (403); signed-out gets 401; non-JSON mutation gets 415; employee's /api/state never contains other users' data.
   - tests/test_progress.py: progress sanitisation (unknown level ids dropped, scores clamped 0–100, bad outcomes dropped).
   - tests/e2e/test_smoke.py: start the server on a free port with a temp DB; with Playwright use TWO browser contexts to mimic two devices: a desktop manager (1440×900) and a phone employee (390×844, touch, mobile user agent). Manager signs in → employee registers → manager assigns two modules → employee starts Level 1 and completes it through the test hooks (window.G / window.summary / showResults) → manager dashboard shows a score chip. Also open web/index.html as file:// and assert demo mode loads and a level starts without console errors.
   - `pytest` runs everything from the repo root; `pytest -m "not e2e"` runs only the fast tests.

5. Docs: update README (dev setup, `--lan`, how to run tests) and CLAUDE.md (new layout, test commands).

Done when: `pytest` passes; `python server.py --seed-demo` behaves exactly as before; `python server.py --lan` prints a LAN URL that opens on your phone on the same Wi-Fi; an old phishverse.db still works; one commit "Stage 0: foundation".
```

---

## Stage 1 — Design system and portal redesign

```text
Read CLAUDE.md and docs/UI_GUIDE.md carefully first. If a frontend-design, design-engineering or animation skill is available in this session, load it and use it alongside UI_GUIDE.md; where they disagree, UI_GUIDE.md wins.

Goal: implement the PhishVerse design system and re-skin the existing portal (sign-in, manager pages, employee pages) for laptop and phone. Behaviour stays the same. The game (canvas, HUD, dialog box, encounter modals) keeps its current look; only portal screens change.

1. CSS architecture: split web/styles.css into web/css/tokens.css (colours light + dark, type scale, spacing, radii, motion tokens exactly as in UI_GUIDE.md), base.css, components.css, portal.css (manager + employee layouts) and game.css (everything the game uses, unchanged). Update index.html.
2. Fonts: Atkinson Hyperlegible Next, Atkinson Hyperlegible Mono, Pixelify Sans with the fallback stacks from the guide. Remove Inter.
3. Components from UI_GUIDE §6, each with all states (hover, active, focus-visible, disabled, loading, error): buttons, status pill, chip, field, select, checkbox, segmented control, tabs, table, drawer, modal, toast (Sonner principles), skeleton, empty state, avatar, progress bar/ring, skill bar, `.addr` inspected text, gold next-step marker, live dot. Small JS helpers in web/js/ui.js (toast(), openDrawer(), confirmModal(), renderAddr()).
4. Layouts:
   - Manager shell: left rail (Overview, People, Programs, Reports, Settings), top bar with page title, theme toggle (System / Light / Dark, saved per device) and the signed-in person. Rail collapses to icons < 1280 px and to a top menu < 768 px.
   - Employee shell: phone-first single column with a bottom nav (Journey, Skills, Certificates, Profile) < 768 px; a centred 720 px column with a top nav on larger screens.
   - Sign-in / create account: one focused panel, with the PhishVerse mark and a one-line description of what the product does.
5. Move today's content into the new shells: manager overview (KPIs, people list, assign form, most-missed list), modules page, employee "My training" (the trail becomes the journey list, with the gold marker on the single next step), badges. Keep every existing feature working in local, demo and live modes.
6. A /styleguide.html page showing every component in light and dark.
7. Motion per UI_GUIDE §7 (custom easing tokens, press scale, no `transition: all`, reduced motion respected).
8. Tests: Playwright screenshots of sign-in, manager overview, employee journey and the style guide at 390×844 and 1440×900, light and dark, saved to test-results/screens/. Assert: no horizontal scroll at any of those sizes, every button and link has a visible focus style, touch targets ≥ 44 px on the phone layout, no console errors. Existing tests still pass.

Before you finish, look at the screenshots yourself and fix anything misaligned, clipped or low-contrast.

Done when: the portal looks like one designed product on a phone and on a laptop in both themes; the game is unchanged; tests pass; commit "Stage 1: design system and portal redesign".
```

---

## Stage 2 — Content as data, decision logging, skills taxonomy

```text
Read CLAUDE.md first. Three goals: (A) scenario content becomes data; (B) every decision is recorded and scored on the server; (C) every scenario is tagged with the skills it tests, so we can produce a skills report later.

A. Content as data
1. Move LEVELS (and the OUT outcome scale) from web/js/content.js into content/levels.json. World layout (placeObjects, NPC palettes, NPCDEF) stays in JS.
2. content/world_refs.json lists valid object ids and NPC ids, generated by a script; a test asserts it matches the JS.
3. Demo mode runs from file:// and can't fetch JSON, so scripts/build_content.py generates web/js/content-data.js (`window.PV_CONTENT = {...}`) from content/*.json; index.html loads it before content.js. A test fails if it's out of date.
4. scripts/validate_content.py + tests/test_content.py: unique ids; `after` refers to a task in the same level; `at.obj` / `at.npc` exist in world_refs; 2–4 actions per encounter with at least one `safe`; only valid outcomes; legit scenarios (`legit: true`) have at least one `false_alarm` action and no `compromise` action; inspect `hl` keys valid for the channel; lesson present; sane text lengths.
5. Add per scenario: `cues` (subset of urgency, authority, reward, fear, curiosity, familiarity, secrecy, helpfulness), `difficulty` 1–3, and `sev` 1–3 on every compromise action (1 clicked/opened, 2 gave credentials or a code, 3 money moved / physical access / malware run). Fill these in thoughtfully for all 25 scenarios; the validator requires them.
6. The server reads level, task and outcome definitions from content/levels.json (no hard-coded lists).

B. Decision logging and server-side scoring
1. Migration 0002: play_sessions(id, user_id, level_id, purpose TEXT CHECK(purpose IN ('baseline','practice','test')) DEFAULT 'baseline', started_at, finished_at, client_version) and decisions(id, session_id, task_id, action_index, outcome, severity, inspected_json, n_inspections, response_ms, created_at, UNIQUE(session_id, task_id)).
2. API (login required; users only touch their own sessions, others get 404):
   POST /api/sessions {level_id, purpose} → {id};
   POST /api/sessions/<id>/decisions {task_id, action_index, inspected:[clue indexes], response_ms} → the server looks up outcome and severity from content (never trust the client) → {outcome};
   POST /api/sessions/<id>/finish → requires a decision for every scored task, computes score/stars (same formula as today), updates the progress summary, returns it; GET /api/sessions/<id>.
3. Engine: record which inspect clues were used (indexes, in order). In local mode create a session at level start, post each decision when chosen, call finish on the results screen and show the server's score. If the server can't be reached, show the local result and say it wasn't saved. Demo and live modes keep client-side scoring.
4. In local mode, progress is derived from finished sessions (best per level, attempts, latest outcomes); stop accepting client-computed scores.

C. Skills taxonomy
1. content/skills.json with these skills, each with id, name, one-line description and icon name:
   sender_domains (Sender and domain checks), links_qr (Links and QR codes), attachments (Attachments and macros), voice (Phone and voice scams), messaging (Text and chat scams), mfa_codes (MFA prompts and one-time codes), physical (Devices, desks and printouts), access (Visitors, doors and tailgating), payments (Payment and invoice fraud).
2. Tag every scenario with 1–2 skills (primary first). The validator checks every skill is covered by at least 2 scenarios.

Tests: decision outcome comes from content even if the client lies; no access to someone else's session; duplicate decisions rejected; finish with missing decisions rejected; score formula; content and skills validation; e2e updated.

Done when: content lives in JSON and validates; a level played in local mode writes one session and one decision per scenario; dashboard numbers match; demo mode still works from file://; tests pass; commit "Stage 2: content data, decisions, skills".
```

---

## Stage 3 — Multi-device live sync

```text
Read CLAUDE.md and docs/UI_GUIDE.md first. Goal: the manager portal on one device updates live while an employee plays on another device, over the local network, with no reloads.

1. Activity log: migration for activity(id, user_id, kind, data_json, created_at). Write events from the server for: joined, assigned, unassigned, level_started, level_finished, report_ready, training_started, training_completed, test_started, test_passed, test_failed, certificate_issued, nudge_sent. (Later stages add their own events through the same helper.)
2. Real-time delivery with Server-Sent Events: GET /api/events (login required). Managers receive all team events; employees receive only events about themselves (e.g. a new assignment or a nudge). Heartbeat every 15 s, Last-Event-ID resume, and a client fallback to polling every 10 s if EventSource fails. The server must stay responsive with several open streams (threaded server; verify with 3 connected clients).
3. Client: web/js/live.js wraps EventSource with reconnect and exposes on(kind, fn). Manager overview: KPIs, people list and a new "Live activity" feed update instantly (feed items animate in per UI_GUIDE §7, aria-live polite). Employee portal: a toast "New training assigned" and the journey refreshes when the manager assigns or nudges. A small live dot in the top bar shows connected / reconnecting.
4. "Connect a device" panel for the manager (top bar button): shows the LAN URL (from Stage 0) as text with a copy button and as a QR code. Generate the QR server-side as SVG with a small pure-Python library (e.g. segno), served at /api/connect/qr.svg.
5. Same account on several devices works (sessions are independent); signing out on one doesn't break the others.
6. docs/MULTI_DEVICE.md: run with `python server.py --lan`; allow Python through the firewall (Windows/macOS steps); open the URL or scan the QR on the phone; what to do when campus/office Wi-Fi blocks devices from seeing each other (use a phone hotspot with the laptop connected to it, or a free tunnel such as Cloudflare Quick Tunnel; explain the trade-offs); how to test with two browsers on one machine.
7. Tests: an action by user A produces an event for the manager stream and not for employee B; heartbeat; reconnect; e2e with two browser contexts (desktop manager + phone employee) asserting the manager's feed and score update without a reload after the employee finishes a level.

Done when: with the laptop running `--lan` and a phone on the same Wi-Fi, finishing a level on the phone shows up on the laptop within 2 seconds without refreshing; tests pass; commit "Stage 3: live multi-device sync".
```

---

## Stage 4 — The journey and the skills report

```text
Read CLAUDE.md, docs/UI_GUIDE.md and content/skills.json first. If a frontend-design or design-engineering skill is available, use it. Goal: after the employee plays the assigned game levels, they get a clear report of their strong areas and weak spots, and their journey moves on.

1. Journey model: an assignment becomes a program with stages: Game (baseline levels) → Skills report → Training → Final test → Certificate. Migration: programs(id, user_id, levels_json, due, note, pass_mark DEFAULT 70, max_test_attempts DEFAULT 3, created_by, created_at, status) replacing the single assignment JSON (migrate existing assignments). The current stage is derived on the server from data, never stored by the client. API returns the journey with each stage's state (locked / available / in_progress / done) and the single next action.
2. Skills scoring in phishverse/skills.py (unit-tested with hand-worked examples): for each skill, use baseline decisions on scenarios tagged with it (primary tag weight 1, secondary 0.5); points as in content (safe 1, acceptable .6, false_alarm .4, compromise 0) with an extra penalty for severity 2–3 compromises; result 0–100 plus an evidence count. Bands: Strong ≥ 80, Watch 60–79, Weak < 60, "Not enough evidence" if fewer than 2 scenarios. Also compute: inspection habit (% of decisions made after at least one inspect), median decision time, and the 3 riskiest cues.
3. Skills report page (employee), phone-first, following UI_GUIDE:
   - A plain-language summary first (2–3 sentences: what they're good at, where they're most at risk).
   - Strong areas and weak spots as two short lists, then all skills as skill bars (label, value, band with icon + text).
   - For each weak skill: the scenarios that revealed it (what they chose, what was safer), using the `.addr` component for domains and addresses.
   - Habits: inspection rate and speed, phrased as advice.
   - One gold next-step button: "Start your training plan".
   The report is generated when the last baseline level is finished (emit report_ready via the Stage 3 helper) and is shown immediately after the final level's results screen.
4. Personal training plan: built automatically from weak skills (and Watch skills, if the manager setting allows) using the training content that Stage 5 adds; for now create the plan records with skill ids and show "Your plan" with placeholders. Manager can view and edit any person's plan.
5. Manager: the person drawer shows the same report; the people list shows each person's weakest skill.
6. Demo mode: a sample report.
7. Tests: unit tests for skills.py; API permissions; e2e: phone employee finishes baseline levels → sees the report → manager sees it live in the drawer. Screenshots of the report at 390×844 and 1440×900, light and dark.

Done when: a seeded employee who makes mixed choices gets a sensible, readable report; the journey shows Training as the next step; tests pass; commit "Stage 4: journey and skills report".
```

---

## Stage 5 — Targeted training simulations

```text
Read CLAUDE.md, docs/UI_GUIDE.md and content/skills.json first. If a frontend-design, design-engineering or animation skill is available, use it. Goal: short, simple, interactive simulations that train each weak skill, assigned automatically from the skills report.

1. Content: content/training.json with 2 simulations per skill (18 total), each 2–4 minutes, made of 4–8 rounds. Write accurate, practical content in the CLAUDE.md voice, based on public guidance (CERT-In, NCSC UK, CISA), with a short "Sources" list per simulation. Simulation types (reuse the game's encounter renderers for emails, texts, calls, chats, MFA prompts and people):
   - Spot the flags: tap every red flag inside an email/text/chat; shows found and missed.
   - Real or fake link: two similar addresses side by side, pick the real one (uses `.addr`, highlights the confusable characters after answering).
   - Sort it: swipe or drag messages into "Safe" or "Report" (touch, mouse and keyboard).
   - Call script: a branching phone call where you choose your next line; ends safe or compromised.
   - Verify the request: pick the right way to check (call back on a known number, ask in person, etc.).
   - Door decision: a quick office scene with an NPC sprite at a door or desk.
   - MFA triage: decide what to do with a series of sign-in prompts.
   Each simulation opens with Ada (using the locked game dialog box) explaining the skill in 2–3 lines, gives instant feedback after each round, and ends with a recap of 3 habits. Mastery = 80% of rounds correct; otherwise retry with the rounds shuffled and varied.
2. Extend the content validator for training.json.
3. Migration: training_progress(user_id, sim_id, attempts, best_pct, completed_at). API: GET plan, POST round results (server grades), complete.
4. The plan from Stage 4 now fills with the two simulations for each weak skill. Training is "done" when every assigned simulation reaches mastery; then the Final test unlocks (gold marker moves to it). Emit training_started / training_completed events.
5. The simulation player must work one-handed on a phone (thumb-reachable controls, swipe for Sort it), on a laptop with the mouse, and with keyboard only. Respect reduced motion.
6. Manager: the person drawer shows plan progress per skill; the overview counts people in training.
7. Tests: grading on the server, mastery rule, plan generation from a known report, keyboard-only run of one simulation of each type, phone screenshots of each type.

Done when: an employee with two weak skills gets four simulations, can finish them on a phone, and the test unlocks; tests pass; commit "Stage 5: training simulations".
```

---

## Stage 6 — The final test

```text
Read CLAUDE.md and docs/UI_GUIDE.md first. Goal: a final test of unseen scenarios, with no hints, that decides whether the employee passes.

1. Test content: write a second scenario set ("Set B", content/test_bank.json): at least 2 new scenarios per skill plus at least 6 genuine ones (36+ items), same schema as the game encounters, each with skills, cues, difficulty and severities. The validator enforces the mix.
2. Assembly: each attempt draws 12 scenarios: weighted towards the person's weak skills from the report, every skill at least once where possible, and 3 genuine scenarios. A retake draws a different set where possible. The server stores the drawn items; the client never receives outcomes before submitting.
3. Test player: a focused, full-screen sequence of encounters (no walking), using the existing encounter UI but in test mode: inspect buttons still work, no verdicts, no clue explanations, no lesson text; after each choice a neutral "Answer saved" and the next item. A progress indicator and an exit that saves the attempt. Works on phone and laptop.
4. Scoring in phishverse/metrics.py with unit tests using hand-worked values:
   H = phish handled safe or acceptable ÷ phish shown; F = genuine items marked as false alarm ÷ genuine shown; C = phish compromised ÷ phish shown;
   Cyber Score = 100 × (H + (1 − F)) / 2; d′ = z(H) − z(F) with the log-linear correction (hits + 0.5) / (n + 1).
   Pass = Cyber Score ≥ the program's pass mark (default 70) AND no severity-3 compromise.
5. Result page: pass or not, Cyber Score, and a "before vs after" comparison of each skill (baseline report vs test), in plain words. On a fail: which skills to revisit (re-opens their simulations), attempts left, and when they can retake. Emit test_started / test_passed / test_failed.
6. Manager: test attempts and scores in the person drawer; pass mark and max attempts editable per program.
7. Tests: metrics unit tests (including H = 1 and F = 0 edge cases), outcomes hidden from the client before submit, retake rules, e2e on the phone layout.

Done when: an employee can fail, retrain the flagged skills, retake and pass; the manager sees each attempt live; tests pass; commit "Stage 6: final test".
```

---

## Stage 7 — Certificate

```text
Read CLAUDE.md and docs/UI_GUIDE.md first. If a frontend-design skill is available, use it: the certificate is a signature design moment. Goal: a certificate that's issued on passing, looks great on a phone and on paper, and can be verified by anyone.

1. Migration: certificates(id, user_id, program_id, issued_at, verify_code UNIQUE (12 chars, unambiguous alphabet), score, revoked_at). Issue automatically when the test is passed; emit certificate_issued.
2. Certificate page: employee name, program, date, Cyber Score band, skills covered, verify code in the mono face, a QR code linking to the verify page, and the PhishVerse pixel shield. Pixelify Sans for the title only. Print CSS for A4 landscape so "Download PDF" can use the browser's print-to-PDF; a "Share" button that uses the Web Share API on phones and copies the link elsewhere.
3. Public verify page /verify/<code> (no login): shows valid / revoked, name, program and date only. Rate-limited. Works on a phone scanning the QR from a printed copy.
4. Employee: Certificates tab lists their certificates. Manager: certificate status per person, and revoke with a reason (audit-logged, confirm modal).
5. A small celebration on the employee's device when it's issued (confetti off under reduced motion), and the manager's pipeline moves the person to Certified live.
6. Tests: code uniqueness and format, verify page for valid / revoked / unknown codes, revoke permissions, print layout screenshot, phone screenshot.

Done when: passing the test on a phone shows the certificate there, the manager sees it live, and scanning the QR on another phone shows "Valid"; tests pass; commit "Stage 7: certificate".
```

---

## Stage 8 — Manager monitoring console

```text
Read CLAUDE.md and docs/UI_GUIDE.md (especially §5 manager layout and §7 motion) first. If a frontend-design, design-engineering or animation skill is available, use it. Goal: a manager overview that shows the whole team's journey at a glance and updates live.

1. Overview page:
   - KPI strip (compact): people in programs, completion %, average test Cyber Score, overdue, at risk.
   - Pipeline board with columns Assigned → Playing → Skills report → Training → Test → Certified, people as chips (avatar, name, a status pill when overdue or failed). When a live event moves someone, their chip glides to the new column (FLIP with transform, 320 ms, --ease-in-out) and the counts tick; reduced motion swaps instantly with a highlight.
   - Live activity feed on the right (from Stage 3), with filters.
   - Team skills heatmap: people × skills, coloured by band with the band letter in each cell (not colour alone), sortable by any skill.
2. People page: table with search, filter by department / stage / band, sort; bulk select to assign a program.
3. Programs page: create a program (levels, due date, pass mark, max attempts, note), assign to people or departments, see progress per program.
4. Person drawer: journey timeline (every event with time), skills report, training progress, test attempts, certificate, decisions table, and actions: Nudge (sends an in-app reminder that appears live on the employee's device as a toast and a banner), Edit plan, Extend due date.
5. Reports: CSV exports (people summary, decisions; escape cells starting with = + - @) and a printable team summary.
6. Charts as hand-built SVG in web/js/charts.js (no CDN libraries), themed with the tokens, with text alternatives.
7. Seed: `--seed-demo` creates 12–15 people across 3 departments spread over every stage, so the board looks real.
8. Tests: aggregation unit tests on seeded data, manager-only endpoints, live move on the board in an e2e with two contexts, screenshots at 1440×900 and 1920×1080 (projector) in both themes.

Done when: during a two-device run, every employee action is visible on the manager board within 2 seconds, the board is readable on a projector, and exports match the screen; tests pass; commit "Stage 8: monitoring console".
```

---

## Stage 9 — ML classifier (offline pipeline)

```text
Read CLAUDE.md first. Goal: train and evaluate a phishing-message classifier for the "AI Analyst". Offline only; no product changes in this stage.

1. ml/ with requirements-ml.txt (scikit-learn, pandas, numpy, joblib, matplotlib; optional transformers/torch behind a flag), README.md and DATASET_CARD.md.
2. Data: write ml/data_sources.md listing candidate public datasets of phishing and legitimate emails/SMS with source URL, licence/terms, size and whether academic use is allowed. Do NOT download anything yourself; ask me to download the ones I approve into ml/data/raw/ (gitignored), then write loaders. Also export the game, training and test-bank scenarios as a small labelled out-of-domain test set.
3. ml/prepare.py: normalise text; extract sender domain, subject, URLs and attachment names when present; dedupe near-duplicates; split train/validation/test by source or time to avoid leakage; save with a manifest.
4. ml/train.py: TF-IDF word (1–2) + char (3–5) n-grams → logistic regression baseline; hand-crafted features (lookalike domain vs an allowlist including digit/letter swaps like novac0rp, punycode, raw IP links, shorteners, display-text vs href mismatch, urgency/threat lexicon, credential or payment requests, risky attachment types); compare logistic regression, calibrated linear SVM and gradient boosting; optional DistilBERT behind --transformer. Fixed seeds; artifacts in ml/artifacts/<version>/.
5. ml/evaluate.py → report.md + plots: precision, recall, F1, ROC-AUC, PR-AUC, confusion matrix, calibration, a threshold for ≥ 95% precision on phishing, per-source results, results on our own scenarios, error analysis (10 false positives, 10 false negatives, redacted), and honest limitations.
6. explain(text, meta) → top contributing features and triggered rules in plain words ("The sender's domain imitates novacorp.com by using a zero").
7. Tests for preprocessing, lookalike detection and explain().

Done when: `python ml/train.py && python ml/evaluate.py` reproduces the report from a clean checkout plus approved data; tests pass; commit "Stage 9: ML pipeline".
```

---

## Stage 10 — ML in the product

```text
Read CLAUDE.md, docs/UI_GUIDE.md and ml/README.md first. Goal: use the Stage 9 model inside the portals.

1. phishverse/ml_service.py loads the newest artifact at startup (configurable path). Without a model, ML features hide and endpoints return 503 with a clear message.
2. POST /api/ml/check {text, sender?, subject?}: length limits, per-user rate limit, returns {label: phishing | suspicious | likely_safe, probability, reasons, model_version}. Don't store submitted text; log only verdict, length and timing.
3. Employee "Check a message" tool (phone-first): paste an email or text, see a verdict badge, reasons with the relevant words highlighted, and the fixed note "This assistant can be wrong. If in doubt, report it to IT (ext. 4357)." Three example messages to try.
4. AI Analyst in the skills report and test results: for each weak skill, a short note on what the model notices in those messages ("Like you, the model flags lookalike domains; it also weighs urgent payment requests heavily"), and on each reviewed scenario what the model would have said.
5. Manager "About the AI Analyst" page: model card (data, metrics, intended use, limitations, version).
6. Tests: validation, rate limit, 503 without a model, explain output shape, submitted text not persisted.

Done when: the check tool works on a phone, the report shows Analyst notes, and the app runs normally without a model; tests pass; commit "Stage 10: AI Analyst in the product".
```

---

## Stage 11 — Demo day: hardening, seed, deploy, rehearsal

```text
Read CLAUDE.md first. Goal: a reliable two-device demo and a project you can defend in a viva.

1. Security essentials (and SECURITY.md with a short threat model): CSRF tokens on every state-changing request in addition to the JSON rule; rate limits on login, register, verify and ML check; password minimum 10 characters with a common-password block list; session rotation on login; security headers (CSP allowing only what we use, X-Content-Type-Options, Referrer-Policy, frame-ancestors); audit log of manager actions with a viewer; every innerHTML goes through esc() (add a test with <script> in content); pip-audit and bandit via scripts/security_check with findings fixed or documented.
2. Demo reset: `python server.py --demo-day` wipes and seeds: one manager, two fresh employee accounts for live use on phones, and 12 teammates spread across every stage so the board is full. Prints all logins and the LAN URL + QR in the terminal.
3. Deploy option for when local Wi-Fi fails: a Dockerfile and a short guide for one free hosting option or a tunnel (with HTTPS and Secure cookies enabled by config), plus `python server.py --lan` for the normal case.
4. docs/DEMO.md: a 6–8 minute script for two devices (laptop on the projector = manager; phone = employee): assign → play one short level → skills report → one training simulation → test → certificate → manager board updates live at each step. Include timings, what to say at each step, a backup plan (hotspot, tunnel, pre-recorded video), and a pre-demo checklist (battery, brightness, Do Not Disturb, browser zoom, sound).
5. Docs: README, docs/ARCHITECTURE.md (module and data-flow diagram), docs/API.md (every endpoint), user guides for manager and employee with Playwright-captured screenshots from both device sizes.
6. Final check: all tests, content validation, security_check, a fresh clone set up from the README on Windows and macOS.

Done when: `--demo-day` followed by the DEMO.md script runs end to end on two real devices without a reload; tests pass; commit "Stage 11: demo day".
```

---

## Stage 12 (after the demo) — B2B extras

```text
Read CLAUDE.md and the PRODUCT_SPEC notes below. Goal: turn the single-team app into a multi-company platform. Organisations; roles org_admin / employee (platform_admin seed-only); single-use expiring invite links stored hashed; CSV import with preview and per-row errors; departments; deactivate users; every query scoped by org_id through one helper, with tests that an admin of company A gets 404 for any id from company B on every endpoint. Migrate existing data into one "NovaCorp" organisation. Optional module: simulated phishing emails to a local Mailpit inbox with per-recipient tracking links, a friendly "this was a training simulation" landing page that assigns the matching simulation, no password fields anywhere, opt-in per organisation. Follow docs/UI_GUIDE.md for all new screens; tests; commit per part.
```

---

## Reusable prompts

**Fix prompt**
```text
Something from the last stage isn't right. What I did: <steps, and on which device>. What I expected: <expected>. What happened: <actual, plus any console or server error text>.
Find the root cause before changing code and explain it in two sentences. Fix it, add a test that would have caught it, and run the full test suite.
```

**UI review prompt** (before committing any stage with screens)
```text
Review every screen changed in this stage against docs/UI_GUIDE.md. If a design-engineering or frontend-design skill is available, use it for the review. Take Playwright screenshots at 390×844 and 1440×900 in light and dark, look at them, and list problems in a table with columns Before | After | Why (spacing, alignment, contrast, type scale, touch targets, focus, motion rules, copy). Then fix the real ones and re-take the screenshots.
```

**Code review prompt**
```text
Review this stage's changes against its "Done when" list and CLAUDE.md: tests cover the new behaviour; login and role checks on every new endpoint; users can't reach other users' data; no innerHTML without esc(); demo mode still opens from file://; live events emitted for new milestones; README/CLAUDE.md updated. List problems by severity, then fix the real ones.
```

**Two-device check prompt**
```text
Run the two-device e2e: a desktop manager context (1440×900) and a phone employee context (390×844, touch). Walk the full flow that exists so far and assert the manager view updates without reloads after each employee step. Report timings and any step that needed a reload.
```
