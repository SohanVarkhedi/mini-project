"""
Portal screens at phone (390×844) and laptop (1440×900) sizes, light and dark (docs/UI_GUIDE.md §9).

Saves full-page screenshots to test-results/screens/ and checks, on every screen:
no horizontal scroll, a visible focus style on every button and link, touch targets ≥ 44 px on
the phone layout, and no console errors. Google Fonts load when the network allows; offline the
fonts request gets an empty stylesheet so the test still runs.
"""
import pathlib
import re
import threading

import pytest

pytest.importorskip("playwright")
from werkzeug.serving import make_server  # noqa: E402

from phishverse import create_app, db  # noqa: E402
from phishverse.seed import seed_demo  # noqa: E402

pytestmark = pytest.mark.e2e

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCREENS = ROOT / "test-results" / "screens"
PHONE_UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
            "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1")
DEVICES = {
    "phone": dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                  user_agent=PHONE_UA),
    "laptop": dict(viewport={"width": 1440, "height": 900}),
}
SCREEN_NAMES = ["sign-in", "manager-overview", "employee-journey", "styleguide", "demo-employee"]


@pytest.fixture(scope="module")
def seeded_url(tmp_path_factory):
    path = tmp_path_factory.mktemp("visual") / "visual.db"
    app = create_app({"DB_PATH": str(path), "SECRET_KEY": "visual-secret", "TESTING": True})
    conn = db.connect(str(path))
    seed_demo(conn, app.extensions["pv_content"])
    conn.close()
    srv = make_server("127.0.0.1", 0, app, threaded=True)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    yield f"http://127.0.0.1:{srv.server_port}/"
    srv.shutdown()
    t.join(5)


def fonts_or_empty(route):
    try:
        route.fulfill(response=route.fetch(timeout=4000))
    except Exception:
        route.fulfill(status=200, content_type="text/css", body="")


def sign_in(page, url, email, password):
    page.goto(url)
    page.fill("#aEmail", email)
    page.fill("#aPw", password)
    page.click("#authBtn")


def open_screen(page, url, name):
    if name == "sign-in":
        page.goto(url)
        page.wait_for_selector("#authForm")
    elif name == "manager-overview":
        sign_in(page, url, "manager@novacorp.local", "manager123")
        page.wait_for_selector(".kpi-strip")
    elif name == "employee-journey":
        sign_in(page, url, "aarav@novacorp.local", "demo1234")
        page.wait_for_selector(".journey")
    elif name == "demo-employee":  # web/index.html opened as a file: demo data, role switch in the header
        page.goto((ROOT / "web" / "index.html").as_uri())
        page.wait_for_selector(".kpi-strip")
        if page.locator("#menuBtn").is_visible():
            page.click("#menuBtn")
            page.click('.top-menu [data-r="emp"]')
        else:
            page.click('#demoSeg [data-r="emp"]')
        page.wait_for_selector(".journey")
    elif name == "styleguide":
        page.goto(url + "styleguide.html")
        page.wait_for_selector(".sg-col")
    page.evaluate("document.fonts.ready")
    page.wait_for_timeout(700)  # let first-load stagger finish


HSCROLL = "() => document.documentElement.scrollWidth - document.documentElement.clientWidth"

INTERACTIVE = """() => [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])')]
  .filter(el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !el.closest('[hidden], .sr-only') && !el.disabled; })"""

FOCUS_CHECK = """(els) => els.filter(el => el.matches('button, a[href]')).map(el => {
    el.focus({preventScroll: true});
    const cs = getComputedStyle(el), visible = el.matches(':focus-visible') &&
      ((cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2) || cs.boxShadow !== 'none');
    return visible ? null : (el.outerHTML.slice(0, 120));
  }).filter(Boolean)"""

TARGET_CHECK = """(els) => els.map(el => {
    if (el.matches('input[type=checkbox], input[type=radio]')) el = el.closest('label') || el;
    if (el.matches('a') && el.closest('p, .banner, .field-hint, .sg-intro')) return null;  // inline text links are exempt
    const r = el.getBoundingClientRect();
    return (r.height >= 43.5 && r.width >= 43.5) ? null : `${Math.round(r.width)}x${Math.round(r.height)} ${el.outerHTML.slice(0, 100)}`;
  }).filter(Boolean)"""


@pytest.mark.parametrize("theme", ["light", "dark"])
@pytest.mark.parametrize("device", ["phone", "laptop"])
@pytest.mark.parametrize("screen", SCREEN_NAMES)
def test_portal_screen(browser, seeded_url, screen, device, theme):
    ctx = browser.new_context(color_scheme=theme, **DEVICES[device])
    ctx.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), fonts_or_empty)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text
            and errors.append(f"console: {m.text}"))
    try:
        open_screen(page, seeded_url, screen)
        SCREENS.mkdir(parents=True, exist_ok=True)
        w, h = DEVICES[device]["viewport"].values()
        page.screenshot(path=str(SCREENS / f"{screen}-{w}x{h}-{theme}.png"), full_page=True)

        assert page.evaluate(HSCROLL) <= 0, "page scrolls horizontally"

        page.keyboard.press("Tab")  # switch the browser into keyboard focus mode
        els = page.evaluate_handle(INTERACTIVE)
        no_focus = page.evaluate(FOCUS_CHECK, els)
        assert no_focus == [], f"no visible focus style: {no_focus}"

        if device == "phone":
            small = page.evaluate(TARGET_CHECK, els)
            assert small == [], f"touch targets under 44px: {small}"
        assert errors == []
    finally:
        ctx.close()
