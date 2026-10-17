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
│   └── seed.py          # default manager + --seed-demo sample data
├── migrations/          # 0001_initial.sql, 0002_..., applied in order at startup
├── tests/               # pytest: API tests + tests/e2e Playwright smoke test
├── docs/                # UI_GUIDE.md (design rules), ROADMAP_PROMPTS.md (stages)
├── requirements.txt     # runtime dependency (Flask)
├── requirements-dev.txt # + pytest and Playwright
└── web/
    ├── index.html       # portal + game page
    ├── styles.css
    └── js/
        ├── core.js      # map, characters, props, office artwork
        ├── content.js   # levels, scenarios, NPCs, object placement
        ├── engine.js    # movement, rendering, highlights, dialog, encounters, audio
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

1. Sign in as the manager. You'll see the team dashboard.
2. In a **private/incognito window** (or on your phone, see `--lan` below),
   open http://localhost:5000, choose
   **Create account** and register an employee.
3. Back in the manager window, refresh. Tick the new employee, pick modules
   and a due date, then click **Assign**.
4. In the employee window, refresh and click **Start** on Level 1.
5. Finish the level, talk to Ada, and the score is saved. The manager's
   dashboard shows it within about 10 seconds, or immediately after a refresh.

## Use it from your phone (same Wi-Fi)

```bash
python server.py --lan
```

The server prints two addresses:

```
  PhishVerse is running  (Ctrl+C to stop)
    On this computer:           http://localhost:5000
    On your phone (same Wi-Fi): http://192.168.1.23:5000
```

Open the second one on any phone, tablet or laptop on the same network. The
manager can keep the dashboard open on the laptop while an employee plays on
a phone. If the phone can't connect:

- Windows asks to allow Python through the firewall the first time. Allow it
  on **private** networks. If you missed the prompt, allow `python.exe` in
  *Windows Security → Firewall → Allow an app through firewall*.
- Make sure the Wi-Fi is set to a private network, not public.
- Guest and college Wi-Fi networks often block devices from reaching each
  other. A phone hotspot works as a fallback: connect the laptop to it.

`--lan` binds to `0.0.0.0` (all network interfaces). `--host 0.0.0.0` does the
same without printing the LAN address. Do this only on a network you trust:
this is a development server, not a hardened production setup.

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
| M | Toggle minimap |

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
browser test starts its own server on a free port and drives two browser
windows at once: a manager on a 1440×900 laptop and an employee on a phone.

Database changes go in a new numbered file in `migrations/` (for example
`0002_certificates.sql`). The server applies new files in order at startup and
records them in the `schema_version` table. Never edit a file that has already
been committed.

## Notes

- Fonts load from Google Fonts. Without internet, the page falls back to
  system fonts.
- Other options: `python server.py --port 8080`.
