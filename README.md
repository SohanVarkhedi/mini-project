# PhishVerse Training (local)

A browser-based security-awareness game with a training portal.
Managers assign levels to employees. Employees play them in the browser, and
their scores are saved to a local database.

- 5 levels, 25 scenarios (physical red flags, email phishing, calls/SMS/MFA,
  tailgating and pretexting, and a business-email-compromise boss level)
- Manager dashboard: assign modules, set due dates, add notes, auto-assign
  new joiners, see completion, scores and the most-missed scenarios
- Employee portal: training path, badges, best scores, replays

## What's in the folder

```
phishverse-local/
├── server.py            # command line: python server.py [--seed-demo] [--lan] ...
├── phishverse/          # the Flask app
│   ├── __init__.py      # create_app(): config, blueprints, static files
│   ├── db.py            # SQLite connection per request + migration runner
│   ├── auth.py          # sign in, register, sign out, profile
│   ├── api.py           # state, assignments, config, progress
│   ├── content.py       # loads and validates content/*.json, scoring
│   ├── sessions.py      # play sessions and decisions (server-side scoring)
│   ├── events.py        # activity log, live updates (Server-Sent Events), reminders
│   ├── connect.py       # LAN address + QR code for the Connect a device panel
│   ├── journey.py       # programs and the journey: game, report, training, test, certificate
│   ├── skills.py        # skills report scoring (strong areas, weak spots, habits)
│   ├── training.py      # training simulations: validation, shuffling, grading
│   ├── training_api.py  # training routes (the server grades every round)
│   ├── demo.py          # sample plays behind the demo-mode skills reports
│   └── seed.py          # default manager + --seed-demo sample data
├── migrations/          # 0001_initial.sql, 0002_..., applied in order at startup
├── content/             # levels.json (scenarios), skills.json, training.json (simulations), world_refs.json (generated)
├── scripts/             # build_content.py, validate_content.py, gen_world_refs.py
├── tests/               # pytest: API tests + tests/e2e Playwright smoke test
├── docs/                # UI_GUIDE.md, MULTI_DEVICE.md (laptop + phone setup), ROADMAP_PROMPTS.md
├── requirements.txt     # runtime dependency (Flask)
├── requirements-dev.txt # + pytest and Playwright
└── web/
    ├── index.html       # portal + game page
    ├── styleguide.html  # every portal component, light and dark (/styleguide.html)
    ├── css/
    │   ├── tokens.css     # colours (light + dark), type, spacing, radii, motion
    │   ├── base.css       # reset + portal typography
    │   ├── components.css # buttons, fields, tables, drawer, toast, ...
    │   ├── portal.css     # sign-in, manager and employee layouts
    │   ├── game.css       # the game's styles (unchanged look)
    │   └── trainer.css    # training simulations (inside the game's dark look)
    └── js/
        ├── core.js      # map, characters, props, office artwork
        ├── content-data.js # generated from content/*.json (lets demo mode work from a file)
        ├── training-data.js # generated: simulations WITH answers, loaded only in demo mode
        ├── content.js   # NPCs and object placement
        ├── engine.js    # movement, rendering, highlights, dialog, encounters, audio
        ├── touch.js     # on-screen joystick and action button for touch screens
        ├── ui.js        # design-system helpers: toast, drawer, confirm, inspected text, theme
        ├── live.js      # live updates: EventSource with reconnect and a polling fallback
        ├── rules.js     # journey, report and grading rules for demo mode (same as the server)
        ├── trainer.js   # the training simulation player
        ├── journey.js   # journey stages, skills report, training plan
        └── portal.js    # manager/employee portal + data layer
```

`phishverse.db` and `.secret_key` are created the first time you run the
server. Delete `phishverse.db` to start over. An existing `phishverse.db` is
upgraded automatically when the server starts (see `migrations/`).

## Run it

You need **Python 3.10 or newer**. Check with `python --version`
(on macOS/Linux you may need `python3`).

### Windows (PowerShell)

```powershell
cd path\to\phishverse-local
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python server.py --seed-demo
```

If PowerShell blocks the activate script, run this once and try again:
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

### macOS / Linux

```bash
cd path/to/phishverse-local
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python server.py --seed-demo
```

Then open **http://localhost:5000** in your browser.

`--seed-demo` adds four sample employees with results so the dashboard isn't
empty. Leave it off for a clean start.

## The journey

Every employee follows the same path, shown on their **Journey** page:

1. **Game**: the levels their manager assigned. Their first try at each level counts.
2. **Skills report**: ready the moment the last level is finished. It shows strong areas,
   weak spots, the situations that revealed them (and the safer choice), the pressure tactics
   that worked on them, and their habits. Managers see the same report in the person's panel,
   live.
3. **Training**: one short simulation (2 to 4 minutes, 5 to 7 rounds) for each skill in their
   plan, weakest first. Seven kinds of round: spot the red flags, real or fake, sort (swipe),
   phone call, check it safely, someone at the door, and sign-in prompts. Score 80% to master a
   simulation; below that, **Try again** replays it in a new order. Managers can adjust the plan
   and watch each simulation's tries and best score live in the person's panel.
4. **Final test** and 5. **Certificate**: coming in later updates.

Managers use **Assign program** on the overview to choose levels, a due date, a note, the
final-test pass mark, how many test attempts are allowed, and whether "Watch" skills (60 to 79%)
get training as well as weak ones.

## Accounts

| Who | Email | Password |
|---|---|---|
| Manager | `manager@novacorp.local` | `manager123` |
| Sample employees (with `--seed-demo`) | `aarav@`, `sara@`, `rohan@`, `meera@novacorp.local` | `demo1234` |

New employees use **Create account** on the sign-in screen and appear on the
manager's dashboard straight away.

Change the manager password:

```bash
python server.py --set-manager-password "a-better-password"
```

Or pick the manager login before the first run with environment variables
`PHISHVERSE_MANAGER_EMAIL` and `PHISHVERSE_MANAGER_PASSWORD`.

## Try the whole flow

1. Sign in as the manager. You'll see the team overview.
2. In a **private/incognito window** (or on your phone, see `--lan` below),
   open http://localhost:5000, choose
   **Create account** and register an employee.
3. Back in the manager window (no need to refresh: new people appear live),
   under **Assign program**, tick the new employee, pick modules and a due date, then click
   **Assign program**.
4. The employee window shows **New training assigned** straight away. Click
   **Start** on Level 1.
5. Finish the level, talk to Ada, and the server scores it. Every decision is
   recorded, including which clues you inspected first. The manager's window
   shows it in **Live activity** within a second or two, without a refresh.
6. Play the second level. The results screen offers **See your skills report**, and the
   manager's people table shows the employee's weakest skill.
7. Open **Start your training plan** and play the simulations. With the employee's panel open
   on the **Training plan** tab, the manager sees each one move to **Mastered** as it happens.

## Use it from your phone (same Wi-Fi)

```bash
python server.py --lan
```

Full guide, including firewall prompts, campus Wi-Fi and tunnels: [docs/MULTI_DEVICE.md](docs/MULTI_DEVICE.md).

The server prints two addresses:

```
  PhishVerse is running  (Ctrl+C to stop)
    On this computer:           http://localhost:5000
    On your phone (same Wi-Fi): http://192.168.1.23:5000
```

Open the second one on any phone, tablet or laptop on the same network, or
click **Connect a device** in the manager's top bar and scan the QR code. The
manager's dashboard updates live while an employee plays on a phone: the
**Live activity** feed, the scores and the counts change within a second or two,
without refreshing. Managers can send a reminder from a person's row (the bell);
it pops up on the employee's device. If the phone can't connect:

- Windows asks to allow Python through the firewall the first time. Allow it
  on **private** networks. If you missed the prompt, allow `python.exe` in
  *Windows Security → Firewall → Allow an app through firewall*.
- Make sure the Wi-Fi is set to a private network, not public.
- Guest and college Wi-Fi networks often block devices from reaching each
  other. A phone hotspot works as a fallback: connect the laptop to it.

`--lan` binds to `0.0.0.0` (all network interfaces). `--host 0.0.0.0` does the
same without printing the LAN address. Do this only on a network you trust:
this is a development server, not a hardened production setup.

## Light and dark

The portal follows your device's light or dark setting. To choose one, use the
theme switch in the manager's top bar or on the employee **Profile** page. The
choice is saved in that browser. The game is always dark. See every component
at http://localhost:5000/styleguide.html.

## Quick look without Python

Double-click `web/index.html`. It opens in **demo mode** with sample data and
a Manager/Employee switch. Nothing is saved.

## Controls

| Key | Action |
|---|---|
| WASD / arrow keys | Walk |
| Shift | Hurry |
| Space / E | Talk, inspect |
| Click / tap | Walk there (click a person to talk) |
| Joystick (touch screens, bottom-left) | Walk; push to the edge to hurry |
| **A** button (touch screens, bottom-right) | Talk, inspect, next page |
| M | Toggle minimap |

On phones and tablets the joystick appears under your thumb anywhere in the lower-left of the
screen, and the **A** button glows gold when something is in front of you. Left-handed? Turn on
**Left-handed controls** on the Profile page to swap the sides.

Gold glow, beams and edge arrows mark your objectives. Click an objective in
the top-right list to walk to it.

## Development

Install the dev tools once (inside the virtual environment):

```bash
pip install -r requirements-dev.txt
python -m playwright install chromium     # browser for the end-to-end test
```

Run the tests from the project folder:

```bash
pytest                  # everything, including the browser test (about 30 s)
pytest -m "not e2e"     # fast API tests only
pytest tests/e2e        # browser test only; add --headed to watch it
```

The tests use a temporary database, so they never touch `phishverse.db`. The
browser tests start their own server on a free port. One drives two browser
windows at once: a manager on a 1440×900 laptop and an employee on a phone.
The other takes screenshots of the sign-in, manager overview, employee journey,
demo mode and style guide at 390×844 and 1440×900, in light and dark, and saves
them to `test-results/screens/`. It also checks there is no sideways scrolling,
every button and link shows a focus ring, and phone touch targets are at least
44 px.

### Editing scenarios

Scenarios live in `content/levels.json`. After editing:

```bash
python scripts/build_content.py      # regenerate web/js/content-data.js
python scripts/validate_content.py   # check ids, actions, tags and text lengths
```

Each scenario lists the skills it tests (`content/skills.json`), the pressure cues it uses,
a difficulty from 1 to 3, and a severity from 1 to 3 on every action that ends in a
compromise. The server won't start if the content is invalid.

Training simulations live in `content/training.json` (one per skill; the same two commands
rebuild and check them). The answers stay on the server: `content-data.js` only gets titles and
round counts, and `training-data.js` (with answers) is loaded only by demo mode. If you move objects or people
in `web/js/content.js`, run `python scripts/gen_world_refs.py` too.

### Database changes

Database changes go in a new numbered file in `migrations/` (for example
`0002_certificates.sql`). The server applies new files in order at startup and
records them in the `schema_version` table. Never edit a file that has already
been committed.

## Notes

- Fonts load from Google Fonts. Without internet, the page falls back to
  system fonts.
- Other options: `python server.py --port 8080`.
