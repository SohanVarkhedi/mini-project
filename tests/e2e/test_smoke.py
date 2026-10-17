"""
Browser smoke test: two devices at once, the way the demo runs.

A desktop manager and a phone employee share one server. The level is completed
through the window test hooks (G, summary, showResults) instead of walking the map.
"""
import pathlib
import re
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


@pytest.fixture(scope="module")
def server_url(tmp_path_factory):
    db_path = tmp_path_factory.mktemp("e2e") / "e2e.db"
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
    expect(mgr.locator("h1.pg")).to_have_text("Team training")

    # Employee registers on the phone.
    emp.goto(server_url)
    emp.locator('[data-am="register"]').tap()
    emp.fill("#aName", EMPLOYEE["name"])
    emp.fill("#aDept", EMPLOYEE["dept"])
    emp.fill("#aEmail", EMPLOYEE["email"])
    emp.fill("#aPw", EMPLOYEE["password"])
    emp.locator("#authBtn").tap()
    expect(emp.locator(".hero h1")).to_contain_text("Hi Kavya")
    expect(emp.locator("#roleChip")).to_have_text("Employee")

    # Manager sees the new employee and assigns two modules.
    mgr.reload()
    pick = mgr.locator("label.pick", has_text=EMPLOYEE["name"])
    expect(pick).to_be_visible()
    pick.locator("input[data-sel]").check()
    for lid in ("orientation", "inbox"):
        mgr.locator(f'input[data-lv="{lid}"]').check()
    for lid in ("signals", "access", "executive"):
        mgr.locator(f'input[data-lv="{lid}"]').uncheck()
    mgr.click("#assignBtn")
    expect(mgr.locator("#assignNote")).to_have_text("Assigned to 1 person.")
    row = mgr.locator(".mrow", has_text=EMPLOYEE["name"])
    expect(row.locator(".mchip")).to_have_text(["L1", "L2"])

    # Employee sees the assignment and starts Level 1.
    emp.reload()
    expect(emp.locator(".trail .step")).to_have_count(2)
    start = emp.locator('.trail [data-play="orientation"]')
    expect(start).to_have_text("Start ▶")
    start.tap()
    expect(emp.locator("#game")).to_be_visible()
    emp.wait_for_function("() => window.G && window.G.level.id === 'orientation'")

    # Complete it through the test hooks; showResults saves via onLevelComplete.
    score = emp.evaluate("""(outs) => {
        for (const t of G.level.tasks) G.res[t.id] = t.enc ? {o: outs[t.id], insp: 2, ms: 1500} : {o: 'talk'};
        const s = summary(); G.finished = true; showResults(s); return s.score;
    }""", LEVEL1_OUTCOMES)
    assert score == 90
    expect(emp.locator("#savedNote")).to_have_text("Saved to your training record.")
    emp.locator("#resBack").tap()
    expect(emp.locator("#portal")).to_be_visible()
    expect(emp.locator('.trail .step.done')).to_have_count(1)

    # Manager dashboard shows the score chip.
    mgr.reload()
    row = mgr.locator(".mrow", has_text=EMPLOYEE["name"])
    expect(row.locator(".mchip.done")).to_have_text("L1 · 90%")
    expect(row.locator(".state")).to_contain_text("In progress")

    assert mgr_errors == []
    assert emp_errors == []


def test_file_demo_mode_starts_a_level(desktop):
    page = desktop.new_page()
    errors = watch_errors(page)
    page.goto((WEB / "index.html").as_uri())
    expect(page.locator(".banner")).to_contain_text("Demo mode (opened as a file).")
    expect(page.locator("#demoSeg")).to_be_visible()
    page.click('#demoSeg [data-r="emp"]')
    page.click('.trail [data-play="orientation"]')
    expect(page.locator("#game")).to_be_visible()
    page.wait_for_function("() => window.G && window.G.level.id === 'orientation'")
    expect(page.locator("#dlg")).to_be_visible()  # intro dialog
    expect(page.locator("#dlgName")).to_contain_text("NovaCorp HQ")
    page.wait_for_timeout(500)  # let a few frames render
    assert errors == []
