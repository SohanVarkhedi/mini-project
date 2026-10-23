"""
Training simulations in the browser (Stage 5A).

- keyboard only: every round type can be answered with Tab, arrows, Space and Enter
- touch only: miss mastery, "Try again" (new order), then master it; the plan updates
- screenshots of each round type at 390x844 and the plan at 1440x900, light and dark, into
  test-results/screens/, with the same checks as test_visual.py (no sideways scroll, visible focus,
  44 px touch targets, no console errors)
"""
import pathlib
import re
import threading

import pytest

pytest.importorskip("playwright")
from playwright.sync_api import expect  # noqa: E402
from werkzeug.serving import make_server  # noqa: E402

from phishverse import create_app, db  # noqa: E402
from phishverse.seed import seed_demo  # noqa: E402
from trainer_play import Keys, Touch, play_round, play_sim  # noqa: E402

pytestmark = pytest.mark.e2e

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCREENS = ROOT / "test-results" / "screens"
DEMO = (ROOT / "web" / "index.html").as_uri()
PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
LAPTOP = dict(viewport={"width": 1440, "height": 900})
ALL_TYPES = {"spot", "realfake", "sort", "call", "verify", "door", "mfa"}
# the first round of each type, in a simulation's first (authored-order) try
FIRST_OF_TYPE = {"realfake": "sim_sender_1", "spot": "sim_links_1", "sort": "sim_attach_1", "verify": "sim_attach_1",
                 "call": "sim_voice_1", "door": "sim_physical_1", "mfa": "sim_mfa_1"}


def new_page(browser, theme="light", **device):
    ctx = browser.new_context(color_scheme=theme, **device)
    ctx.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"),
              lambda route: route.fulfill(status=200, content_type="text/css", body=""))
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append(m.text))
    return ctx, page, errors


def demo_employee(page, hash_="#plan"):
    page.goto(DEMO + hash_)
    page.wait_for_function("() => Store.ready")
    page.evaluate("() => { Live.stop(); Store.isMgr = false; renderPortal() }")  # quiet: no sample events re-rendering
    page.wait_for_selector("[data-train]")


def test_keyboard_only_every_round_type(browser):
    ctx, page, errors = new_page(browser, **LAPTOP)
    try:
        demo_employee(page)
        keys = Keys(page)
        keys.press('[data-train="sim_links_1"]')  # start from the plan with the keyboard too
        types = set(play_sim(page, "sim_links_1", keys))
        expect(page.locator(".tr-end-h")).to_have_text("Mastered")
        keys.press("[data-continue]")
        expect(page.locator("#portal")).to_be_visible()
        expect(page.locator('[data-train="sim_links_1"]')).to_be_focused()  # focus returns to where you were
        for sim in ("sim_mfa_1", "sim_access_1"):
            page.evaluate("s => Trainer.open(s)", sim)
            types |= set(play_sim(page, sim, keys))
            keys.press("[data-continue]")
        assert types == ALL_TYPES
        assert errors == []
    finally:
        ctx.close()


def test_touch_retry_until_mastered(browser):
    ctx, page, errors = new_page(browser, **PHONE)
    try:
        demo_employee(page)
        touch = Touch(page)
        touch.press('[data-train="sim_physical_1"]')
        play_sim(page, "sim_physical_1", touch, wrong_rounds=(0, 1, 2))
        expect(page.locator(".tr-end-h")).to_have_text("Not mastered yet")
        expect(page.locator(".tr-lead")).to_contain_text("80%")
        touch.press("[data-again]")
        expect(page.locator(".tr-title-card")).to_contain_text("Try 2: the rounds and answers are in a new order.")
        page.wait_for_selector("[data-go]")
        play_sim(page, "sim_physical_1", touch, skip_intro=True)
        expect(page.locator(".tr-end-h")).to_have_text("Mastered")
        expect(page.locator(".tr-sub").first).to_contain_text("try 2")
        touch.press("[data-continue]")
        row = page.locator(".sim-row", has_text="Desks, devices and paper")
        expect(row).to_contain_text("Mastered")
        expect(row).to_contain_text("2 tries")
        assert errors == []
    finally:
        ctx.close()


def test_leaving_midway_asks_first(browser):
    ctx, page, errors = new_page(browser, **PHONE)
    try:
        demo_employee(page)
        touch = Touch(page)
        touch.press('[data-train="sim_links_1"]')
        page.wait_for_selector("#dlg:not([hidden])")
        page.evaluate("() => closeDialog()")
        cur = page.evaluate("Trainer.current()")
        play_round(page, touch, "sim_links_1", cur)
        touch.press(".tr-x")
        expect(page.locator(".tr-fb")).to_contain_text("Leave this simulation?")
        touch.press("[data-stay]")
        expect(page.locator("[data-next]")).to_be_visible()  # back where you were
        touch.press(".tr-x")
        touch.press("[data-bye]")
        expect(page.locator("#portal")).to_be_visible()
        assert page.evaluate("() => Store.demoTraining.me && Store.demoTraining.me.sim_links_1") is None  # nothing counted
        assert errors == []
    finally:
        ctx.close()


HSCROLL = "() => document.documentElement.scrollWidth - document.documentElement.clientWidth"
VISIBLE = """() => [...document.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')].filter(el => {
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !el.closest('[hidden]') && !el.disabled })"""
FOCUS_CHECK = """(els) => els.filter(el => el.matches('button, a[href]')).map(el => { el.focus({preventScroll: true});
  const cs = getComputedStyle(el), ok = el.matches(':focus-visible') && ((cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2) || cs.boxShadow !== 'none');
  return ok ? null : el.outerHTML.slice(0, 120) }).filter(Boolean)"""
# spot regions are words inside the message itself (like inline text links); their hit area is padded but they stay text height
TARGET_CHECK = """(els) => els.filter(el => !el.matches('.tr-hl')).map(el => { const r = el.getBoundingClientRect();
  return r.height >= 43.5 && r.width >= 43.5 ? null : `${Math.round(r.width)}x${Math.round(r.height)} ${el.outerHTML.slice(0, 100)}` }).filter(Boolean)"""


def checks(page, errors, phone=True):
    assert page.evaluate(HSCROLL) <= 0, "page scrolls sideways"
    page.keyboard.press("Shift+Tab")
    els = page.evaluate_handle(VISIBLE)
    assert page.evaluate(FOCUS_CHECK, els) == []
    if phone:
        assert page.evaluate(TARGET_CHECK, els) == []
    assert errors == []


@pytest.mark.parametrize("theme", ["light", "dark"])
def test_round_type_screens(browser, theme):
    ctx, page, errors = new_page(browser, theme, **PHONE)
    SCREENS.mkdir(parents=True, exist_ok=True)
    try:
        demo_employee(page)
        touch = Touch(page)
        for typ, sim in FIRST_OF_TYPE.items():
            page.evaluate("s => Trainer.open(s)", sim)
            page.wait_for_selector("#dlg:not([hidden])")
            if typ == "realfake":
                page.wait_for_timeout(900)
                page.screenshot(path=str(SCREENS / f"training-intro-390x844-{theme}.png"))
            page.evaluate("() => closeDialog()")
            while page.evaluate("Trainer.current().round.type") != typ:
                cur = page.evaluate("Trainer.current()")
                play_round(page, touch, sim, cur)
                touch.press("[data-next]")
                page.wait_for_function("i => Trainer.current().i !== i", arg=cur["i"])
            page.wait_for_timeout(500)
            page.screenshot(path=str(SCREENS / f"training-{typ}-390x844-{theme}.png"))
            checks(page, errors)
            play_round(page, touch, sim, page.evaluate("Trainer.current()"), wrong=typ in ("spot", "sort", "mfa"))
            page.wait_for_selector("[data-next]")
            page.wait_for_timeout(400)
            page.screenshot(path=str(SCREENS / f"training-{typ}-feedback-390x844-{theme}.png"))
            checks(page, errors)
            page.evaluate("() => { Store.demoTraining = {} }")
            touch.press(".tr-x")
            touch.press("[data-bye]")
        page.evaluate("s => Trainer.open(s)", "sim_links_1")
        play_sim(page, "sim_links_1", touch)
        page.wait_for_timeout(1000)
        page.screenshot(path=str(SCREENS / f"training-end-390x844-{theme}.png"))
        checks(page, errors)
    finally:
        ctx.close()


@pytest.fixture(scope="module")
def seeded_url(tmp_path_factory):
    path = tmp_path_factory.mktemp("trainui") / "train.db"
    app = create_app({"DB_PATH": str(path), "SECRET_KEY": "train-secret", "TESTING": True})
    conn = db.connect(str(path))
    seed_demo(conn, app.extensions["pv_content"])
    conn.close()
    srv = make_server("127.0.0.1", 0, app, threaded=True)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    yield f"http://127.0.0.1:{srv.server_port}/"
    srv.shutdown()
    t.join(5)


@pytest.mark.parametrize("theme", ["light", "dark"])
def test_plan_screen(browser, seeded_url, theme):
    ctx, page, errors = new_page(browser, theme, **LAPTOP)
    try:
        page.goto(seeded_url)
        page.fill("#aEmail", "rohan@novacorp.local")
        page.fill("#aPw", "demo1234")
        page.click("#authBtn")
        page.wait_for_selector(".stages")
        page.evaluate("location.hash = '#plan'")
        page.wait_for_selector(".sim-row")
        expect(page.locator(".next-marker")).to_have_count(1)
        page.wait_for_timeout(700)
        page.screenshot(path=str(SCREENS / f"training-plan-1440x900-{theme}.png"), full_page=True)
        checks(page, errors, phone=False)
    finally:
        ctx.close()
