"""
Browser smoke test: two devices at once, the way the demo runs.

A desktop manager and a phone employee share one server. The employee answers every
scenario through the real encounter UI (opened with the openEncounter test hook instead of
walking the map); the server records each decision and scores the level.
"""
import pathlib
import re
import sqlite3
import threading

import pytest

pytest.importorskip("playwright")
from playwright.sync_api import expect  # noqa: E402
from werkzeug.serving import make_server  # noqa: E402

from phishverse import create_app  # noqa: E402

pytestmark = pytest.mark.e2e

WEB = pathlib.Path(__file__).resolve().parents[2] / "web"
PHONE_UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
            "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1")
EMPLOYEE = {"name": "Kavya Rao", "dept": "Finance", "email": "kavya@novacorp.local", "password": "kavya-pass-1"}
# Level 1 outcomes: 3 safe + 1 acceptable = (1+1+1+0.6)/4 -> 90%.
LEVEL1_OUTCOMES = {"usb": "safe", "qr": "safe", "sticky": "safe", "laptop": "acceptable"}


DB = {}


@pytest.fixture(scope="module")
def server_url(tmp_path_factory):
    db_path = tmp_path_factory.mktemp("e2e") / "e2e.db"
    DB["path"] = str(db_path)
    app = create_app({"DB_PATH": str(db_path), "SECRET_KEY": "e2e-secret", "TESTING": True})
    srv = make_server("127.0.0.1", 0, app, threaded=True)  # port 0 = any free port
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    yield f"http://127.0.0.1:{srv.server_port}/"
    srv.shutdown()
    t.join(5)


def watch_errors(page):
    """Collect uncaught page errors and console errors (missing favicon etc. excluded)."""
    errors = []
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text
            and errors.append(f"console: {m.text}"))
    return errors


def offline_fonts(context):
    # Keep the test offline and deterministic: Google Fonts get an empty stylesheet.
    context.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"),
                  lambda route: route.fulfill(status=200, content_type="text/css", body=""))


@pytest.fixture
def desktop(browser):
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    offline_fonts(ctx)
    yield ctx
    ctx.close()


@pytest.fixture
def phone(browser):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3,
                              is_mobile=True, has_touch=True, user_agent=PHONE_UA)
    offline_fonts(ctx)
    yield ctx
    ctx.close()


def test_manager_and_employee_on_two_devices(server_url, desktop, phone):
    mgr = desktop.new_page()
    emp = phone.new_page()
    mgr_errors, emp_errors = watch_errors(mgr), watch_errors(emp)

    # Manager signs in on the laptop.
    mgr.goto(server_url)
    mgr.fill("#aEmail", "manager@novacorp.local")
    mgr.fill("#aPw", "manager123")
    mgr.click("#authBtn")
    expect(mgr.locator("#pageTitle")).to_have_text("Overview")

    # Employee registers on the phone.
    emp.goto(server_url)
    emp.locator('[data-am="register"]').tap()
    emp.fill("#aName", EMPLOYEE["name"])
    emp.fill("#aDept", EMPLOYEE["dept"])
    emp.fill("#aEmail", EMPLOYEE["email"])
    emp.fill("#aPw", EMPLOYEE["password"])
    emp.locator("#authBtn").tap()
    expect(emp.locator("#greetH")).to_have_text("Hi Kavya")
    expect(emp.locator("#roleChip")).to_have_text("Employee")

    # Manager sees the new employee and assigns two modules.
    mgr.reload()
    pick = mgr.locator("#assignForm label.check", has_text=EMPLOYEE["name"])
    expect(pick).to_be_visible()
    pick.locator("input[data-sel]").check()
    for lid in ("orientation", "inbox"):
        mgr.locator(f'input[data-lv="{lid}"]').check()
    for lid in ("signals", "access", "executive"):
        mgr.locator(f'input[data-lv="{lid}"]').uncheck()
    mgr.click("#assignBtn")
    expect(mgr.locator(".toast-item")).to_contain_text("Assigned to 1 person")
    row = mgr.locator("tr[data-person]", has_text=EMPLOYEE["name"])
    expect(row.locator(".score-chip")).to_have_text(["L1", "L2"])

    # Employee sees the assignment and starts Level 1.
    emp.reload()
    expect(emp.locator(".journey .j-step")).to_have_count(2)
    start = emp.locator('.journey [data-play="orientation"]')
    expect(start).to_have_text("Start")
    expect(emp.locator(".next-marker")).to_have_count(1)  # one gold marker, on the next step
    start.tap()
    expect(emp.locator("#game")).to_be_visible()
    emp.wait_for_function("() => window.G && window.G.level.id === 'orientation'")

    # Answer each scenario in the encounter UI: inspect one clue, pick the action, continue.
    emp.wait_for_selector("#dlg:not([hidden])")
    emp.evaluate("() => closeDialog()")
    for task_id, outcome in LEVEL1_OUTCOMES.items():
        idx = emp.evaluate("""([id, o]) => { const t = G.level.tasks.find(x => x.id === id); openEncounter(t);
            return t.enc.acts.findIndex(a => a.o === o) }""", [task_id, outcome])
        emp.locator('#encIns [data-i="0"]').tap()
        emp.locator(f'#encActs [data-a="{idx}"]').tap()
        emp.locator("#encDone").tap()
    emp.evaluate("() => { G.res.meet = {o: 'talk'}; G.finished = true; showResults(summary()) }")
    expect(emp.locator("#savedNote")).to_have_text("Saved to your training record.")
    expect(emp.locator(".res .score b")).to_have_text("90%")

    # The server recorded one session and one decision per scenario, and scored it.
    conn = sqlite3.connect(DB["path"])
    sessions = conn.execute("SELECT id, level_id, purpose, score, stars, finished_at FROM play_sessions").fetchall()
    assert len(sessions) == 1
    sid, level_id, purpose, score, stars, finished_at = sessions[0]
    assert (level_id, purpose, score, stars) == ("orientation", "baseline", 90, 3) and finished_at
    rows = conn.execute("SELECT task_id, outcome, inspected_json FROM decisions WHERE session_id=? ORDER BY id", (sid,)).fetchall()
    conn.close()
    assert [(t, o) for t, o, _ in rows] == list(LEVEL1_OUTCOMES.items())
    assert all(i == "[0]" for _, _, i in rows)
    emp.locator("#resBack").tap()
    expect(emp.locator("#portal")).to_be_visible()
    expect(emp.locator('.j-step[data-state="done"]')).to_have_count(1)

    # Manager dashboard shows the score chip.
    mgr.reload()
    row = mgr.locator("tr[data-person]", has_text=EMPLOYEE["name"])
    expect(row.locator('.score-chip[data-state="done"]')).to_have_text("L1 · 90%")
    expect(row.locator('[data-col="status"]')).to_contain_text("In progress")

    assert mgr_errors == []
    assert emp_errors == []


def test_file_demo_mode_starts_a_level(desktop):
    page = desktop.new_page()
    errors = watch_errors(page)
    page.goto((WEB / "index.html").as_uri())
    expect(page.locator(".banner")).to_contain_text("Demo mode (opened as a file).")
    expect(page.locator("#demoSeg")).to_be_visible()
    page.click('#demoSeg [data-r="emp"]')
    page.click('.journey [data-play="orientation"]')
    expect(page.locator("#game")).to_be_visible()
    page.wait_for_function("() => window.G && window.G.level.id === 'orientation'")
    expect(page.locator("#dlg")).to_be_visible()  # intro dialog
    expect(page.locator("#dlgName")).to_contain_text("NovaCorp HQ")
    page.wait_for_timeout(500)  # let a few frames render
    assert errors == []


def test_unreachable_server_shows_local_result(server_url, desktop):
    """If the session API can't be reached, the player still sees their score and is told it wasn't saved."""
    page = desktop.new_page()
    page.goto(server_url)
    page.locator('[data-am="register"]').click()
    page.fill("#aName", "Offline Olivia")
    page.fill("#aEmail", "olivia@novacorp.local")
    page.fill("#aPw", "olivia-pass-1")
    page.click("#authBtn")
    expect(page.locator("#greetH")).to_have_text("Hi Offline")
    page.route("**/api/sessions**", lambda route: route.abort())
    page.locator('.journey [data-play="orientation"]').click()
    page.wait_for_function("() => window.G && window.G.level.id === 'orientation'")
    page.evaluate("""() => { for (const t of scoredTasks(G.level)) onDecision(G.level.id, t, {act: 1, o: 'safe', inspected: [], ms: 1});
        for (const t of G.level.tasks) G.res[t.id] = t.enc ? {o: 'safe', insp: 0} : {o: 'talk'};
        G.finished = true; showResults(summary()) }""")
    expect(page.locator("#savedNote")).to_contain_text("wasn't saved")
    expect(page.locator(".res .score b")).to_have_text("100%")
