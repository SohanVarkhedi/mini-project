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
import time

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
# Level 2 with two slips on links, so the report has a weak spot
LEVEL2_OUTCOMES = {"e1": "compromise", "e2": "compromise", "e3": "safe", "e4": "safe", "e5": "safe", "e6": "safe"}


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
    expect(mgr.locator('.topbar-tools [data-live]')).to_have_attribute("data-state", "connected")
    feed = mgr.locator("#feed")

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

    # The manager's page (never reloaded) shows the new employee and the join in the feed.
    expect(feed.locator(".feed-item").first).to_contain_text("Kavya joined the team", timeout=2000)
    pick = mgr.locator("#assignForm label.check", has_text=EMPLOYEE["name"])
    expect(pick).to_be_visible(timeout=2000)
    pick.locator("input[data-sel]").check()
    for lid in ("orientation", "inbox"):
        mgr.locator(f'input[data-lv="{lid}"]').check()
    for lid in ("signals", "access", "executive"):
        mgr.locator(f'input[data-lv="{lid}"]').uncheck()
    mgr.click("#assignBtn")
    expect(mgr.locator(".toast-item")).to_contain_text("Program assigned to 1 person")
    row = mgr.locator("tr[data-person]", has_text=EMPLOYEE["name"])
    expect(row.locator(".score-chip")).to_have_text(["L1", "L2"])

    # The employee's phone (never reloaded) gets a toast and the new journey.
    expect(emp.locator(".toast-item", has_text="New training assigned")).to_be_visible(timeout=2000)
    expect(emp.locator(".lvl-list .lvl")).to_have_count(2, timeout=2000)
    start = emp.locator('.lvl-list [data-play="orientation"]')
    expect(start).to_have_text("Start")
    expect(emp.locator(".next-marker")).to_have_count(1)  # one gold marker, on the next step
    start.tap()
    expect(emp.locator("#game")).to_be_visible()
    emp.wait_for_function("() => window.G && window.G.level.id === 'orientation'")
    expect(feed.locator(".feed-item").first).to_contain_text("Kavya started Office Orientation", timeout=2000)

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
    finished = time.time()
    expect(emp.locator(".res .score b")).to_have_text("90%")

    # Within 2 s, without a reload, the manager's feed and score chip show it.
    row = mgr.locator("tr[data-person]", has_text=EMPLOYEE["name"])
    expect(feed.locator(".feed-item").first).to_contain_text("Kavya finished Office Orientation · 90%", timeout=2000)
    expect(row.locator('.score-chip[data-state="done"]')).to_have_text("L1 · 90%", timeout=2000)
    feed_lag = time.time() - finished
    assert feed_lag < 2.0, feed_lag
    expect(row.locator('[data-col="status"]')).to_contain_text("Playing · 1/2")
    expect(mgr.locator(".kpi").nth(1)).to_contain_text("1 of 4 assigned modules")  # Kavya 2 + the manager's own auto plan 2

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
    expect(emp.locator('.lvl[data-state="done"]')).to_have_count(1)

    # The manager sends a reminder from the person's row; it reaches the phone without a reload.
    row.locator("[data-nudge]").click()
    mgr.fill(".modal-panel textarea", "Please finish Inbox Defense by Friday.")
    mgr.click('.modal-panel button[type="submit"]')
    expect(mgr.locator(".toast-item", has_text="Reminder sent to Kavya")).to_be_visible()
    sent = time.time()
    expect(emp.locator(".toast-item", has_text="Reminder from your manager")).to_contain_text("Inbox Defense by Friday", timeout=2000)
    nudge_lag = time.time() - sent
    expect(emp.locator(".nudge-banner")).to_contain_text("Please finish Inbox Defense by Friday.")
    expect(feed.locator(".feed-item").first).to_contain_text("Reminder sent to Kavya")
    # A second reminder within 10 minutes is refused.
    row.locator("[data-nudge]").click()
    mgr.click('.modal-panel button[type="submit"]')
    expect(mgr.locator(".toast-item", has_text="Reminder not sent")).to_be_visible()

    # Stage 4: the manager watches Kavya's skills report tab while she plays her last level.
    mgr.goto(server_url + "#people")
    mgr.locator("tr[data-person]", has_text=EMPLOYEE["name"]).locator("[data-details]").click()
    mgr.locator('[data-dtab="report"]').click()
    expect(mgr.locator('[data-dpanel="report"]')).to_contain_text("No skills report yet")
    emp.locator(".lvl[data-state=next] [data-play]").tap()
    emp.wait_for_function("() => window.G && window.G.level.id === 'inbox'")
    emp.wait_for_selector("#dlg:not([hidden])")
    emp.evaluate("() => closeDialog()")
    for task_id, outcome in LEVEL2_OUTCOMES.items():
        idx = emp.evaluate("""([id, o]) => { const t = G.level.tasks.find(x => x.id === id); openEncounter(t);
            return t.enc.acts.findIndex(a => a.o === o) }""", [task_id, outcome])
        emp.locator('#encIns [data-i="0"]').tap()
        emp.locator(f'#encActs [data-a="{idx}"]').tap()
        emp.locator("#encDone").tap()
    emp.evaluate("() => { G.finished = true; showResults(summary()) }")
    expect(emp.locator("#resReport")).to_have_text("See your skills report")
    report_at = time.time()
    # the manager's drawer and table update live, without a reload
    expect(mgr.locator('[data-dpanel="report"] .report-summary')).to_contain_text("most at risk", timeout=2000)
    report_lag = time.time() - report_at
    mgr.keyboard.press("Escape")
    krow = mgr.locator("tr[data-person]", has_text=EMPLOYEE["name"])
    expect(krow.locator('[data-col="status"]')).to_contain_text("Training", timeout=2000)
    expect(krow.locator('[data-col="status"]')).to_contain_text("Weakest:")
    mgr.goto(server_url + "#overview")
    expect(mgr.locator("#feed .feed-item").first).to_contain_text("Kavya's skills report is ready: weakest is")
    # the employee opens the report from the results screen; the journey's next step is Training
    emp.locator("#resReport").tap()
    expect(emp.locator(".report-summary")).to_contain_text("most at risk")
    expect(emp.locator('.report-next a[href="#plan"]')).to_have_text("Start your training plan")
    emp.locator('.bottom-nav a[href="#journey"]').tap()
    expect(emp.locator('.stage[data-current]')).to_contain_text("Training")
    expect(emp.locator(".next-marker")).to_have_count(1)
    print(f"  live lag: finish -> manager feed {feed_lag:.2f}s, nudge -> phone toast {nudge_lag:.2f}s, report -> manager drawer {report_lag:.2f}s")

    assert mgr_errors == []
    assert emp_errors == []


def test_file_demo_mode_starts_a_level(desktop):
    page = desktop.new_page()
    errors = watch_errors(page)
    page.goto((WEB / "index.html").as_uri())
    expect(page.locator(".banner")).to_contain_text("Demo mode (opened as a file).")
    expect(page.locator("#demoSeg")).to_be_visible()
    page.click('#demoSeg [data-r="emp"]')
    page.click('.lvl-list [data-play="orientation"]')
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
    page.locator('.lvl-list [data-play="orientation"]').click()
    page.wait_for_function("() => window.G && window.G.level.id === 'orientation'")
    page.evaluate("""() => { for (const t of scoredTasks(G.level)) onDecision(G.level.id, t, {act: 1, o: 'safe', inspected: [], ms: 1});
        for (const t of G.level.tasks) G.res[t.id] = t.enc ? {o: 'safe', insp: 0} : {o: 'talk'};
        G.finished = true; showResults(summary()) }""")
    expect(page.locator("#savedNote")).to_contain_text("wasn't saved")
    expect(page.locator(".res .score b")).to_have_text("100%")
