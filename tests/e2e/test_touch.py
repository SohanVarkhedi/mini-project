"""
Touch controls on a phone: floating joystick + action button (web/js/touch.js).

Touches are real multi-finger touch events sent through the Chrome DevTools Protocol, so the page
sees the same pointer events a phone produces. Runs in demo mode (web/index.html as a file).
"""
import pathlib
import re

import pytest

pytest.importorskip("playwright")
from playwright.sync_api import expect  # noqa: E402

pytestmark = pytest.mark.e2e

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCREENS = ROOT / "test-results" / "screens"
PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)


class Fingers:
    """Multi-touch via CDP. Each call sends the full set of fingers currently on the screen."""

    def __init__(self, page):
        self.page = page
        self.cdp = page.context.new_cdp_session(page)
        self.down = {}

    def _send(self, kind):
        pts = [{"x": x, "y": y, "id": i, "radiusX": 4, "radiusY": 4, "force": 1} for i, (x, y) in self.down.items()]
        self.cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": pts})

    def press(self, fid, x, y):
        self.down[fid] = (x, y)
        self._send("touchStart")

    def move(self, fid, x, y, steps=6):
        x0, y0 = self.down[fid]
        for i in range(1, steps + 1):
            self.down[fid] = (x0 + (x - x0) * i / steps, y0 + (y - y0) * i / steps)
            self._send("touchMove")
            self.page.wait_for_timeout(16)

    def lift(self, fid):
        del self.down[fid]
        self._send("touchMove" if self.down else "touchEnd")

    def tap(self, fid, x, y):
        self.press(fid, x, y)
        self.page.wait_for_timeout(40)
        self.lift(fid)


def open_game(browser, level="orientation", **ctx_kw):
    ctx = browser.new_context(**(ctx_kw or PHONE))
    ctx.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r: r.fulfill(status=200, content_type="text/css", body=""))
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto((ROOT / "web" / "index.html").as_uri())
    page.wait_for_selector(".kpi-strip")
    page.evaluate("lv => { audioInit = () => {}; startLevel(lv, {}) }", level)
    page.wait_for_selector("#dlg:not([hidden])")
    page.evaluate("() => { D.shown = D.full.length; D.typing = false; closeDialog() }")  # skip the intro
    page.wait_for_timeout(250)
    return ctx, page, errors


def state(page):
    return page.evaluate("() => ({x: player.x, y: player.y, dir: player.dir, moving: player.moving, held: [...held], running, path: path.length})")


def rest_center(page):
    box = page.locator("#joy").bounding_box()
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


def put_player(page, x, y, d):
    page.evaluate("([x, y, d]) => { player.place(x, y, d); updateCamera(0, true) }", [x, y, d])
    page.wait_for_timeout(120)


# ---------------------------------------------------------------- joystick
def test_joystick_walks_right_and_stops_on_release(browser):
    ctx, page, errors = open_game(browser)
    try:
        expect(page.locator("#joy")).to_be_visible()
        expect(page.locator("#tapBtn")).to_be_visible()
        put_player(page, 30, 38, "up")  # open lobby floor (row 38 is clear to x=49)
        x0 = state(page)["x"]
        f = Fingers(page)
        cx, cy = rest_center(page)
        f.press(1, cx, cy)
        f.move(1, cx + 40, cy)  # 2/3 of the radius: walk
        page.wait_for_timeout(700)
        s = state(page)
        assert s["dir"] == "right" and s["held"] == ["right"] and s["running"] is False
        assert s["x"] >= x0 + 2, s
        f.lift(1)
        page.wait_for_timeout(400)  # finishes the current step, then stops
        a = state(page)
        page.wait_for_timeout(400)
        b = state(page)
        assert a["held"] == [] and not b["moving"] and (a["x"], a["y"]) == (b["x"], b["y"])
        # the knob returns to the centre of the resting joystick
        knob, base = page.locator("#joyKnob").bounding_box(), page.locator("#joy").bounding_box()
        assert abs((knob["x"] + knob["width"] / 2) - (base["x"] + base["width"] / 2)) < 2
        assert errors == []
    finally:
        ctx.close()


def test_long_push_runs(browser):
    ctx, page, _ = open_game(browser)
    try:
        f = Fingers(page)
        cx, cy = rest_center(page)

        def distance(push):
            put_player(page, 24, 38, "right")
            x0 = state(page)["x"]
            f.press(1, cx, cy)
            f.move(1, cx + push, cy, steps=3)
            page.wait_for_timeout(650)
            s = state(page)
            f.lift(1)
            page.wait_for_timeout(450)
            return state(page)["x"] - x0, s["running"]

        walked, walk_running = distance(36)   # 60% of the radius
        ran, run_running = distance(58)       # 97% of the radius
        assert walk_running is False and run_running is True
        assert ran >= walked + 1, (walked, ran)
        assert state(page)["running"] is False  # releasing stops running too
    finally:
        ctx.close()


def test_dead_zone_and_diagonal_hysteresis(browser):
    ctx, page, _ = open_game(browser)
    try:
        f = Fingers(page)
        cx, cy = rest_center(page)
        put_player(page, 30, 38, "up")
        f.press(1, cx, cy)
        f.move(1, cx + 10, cy)  # inside the 25% dead zone
        assert page.evaluate("Pad.dir") is None
        f.move(1, cx + 40, cy + 5)
        assert page.evaluate("Pad.dir") == "right"
        f.move(1, cx + 30, cy + 33)  # just past the diagonal: hysteresis keeps "right"
        assert page.evaluate("Pad.dir") == "right"
        f.move(1, cx + 15, cy + 42)  # clearly down now
        assert page.evaluate("Pad.dir") == "down"
        f.lift(1)
    finally:
        ctx.close()


def test_joystick_touch_does_not_tap_to_walk_but_elsewhere_does(browser):
    ctx, page, _ = open_game(browser)
    try:
        f = Fingers(page)
        put_player(page, 30, 38, "up")
        cx, cy = rest_center(page)
        f.tap(1, cx, cy)  # a tap on the joystick: no walk target
        page.wait_for_timeout(100)
        assert state(page)["path"] == 0 and page.evaluate("marker") is None
        f.tap(2, 300, 330)  # upper half of the screen, outside the controls: walks there
        page.wait_for_timeout(100)
        assert state(page)["path"] > 0 or state(page)["moving"]
    finally:
        ctx.close()


# ---------------------------------------------------------------- action button
def test_action_button_talks_advances_and_investigates(browser):
    ctx, page, errors = open_game(browser)
    try:
        btn = page.locator("#tapBtn")
        f = Fingers(page)
        expect(btn).not_to_have_attribute("data-on", "")
        assert btn.get_attribute("aria-label") == "Action: nothing in front of you"
        # stand below Ada, facing her: the button lights up with the verb
        ada = page.evaluate("() => { const n = npc('ada'); return [n.x, n.y] }")
        put_player(page, ada[0], ada[1] + 1, "up")
        expect(btn).to_have_attribute("data-on", "")
        expect(page.locator("#actVerb")).to_have_text("Talk")
        b = btn.bounding_box()
        f.tap(1, b["x"] + 34, b["y"] + 34)
        expect(page.locator("#dlg")).to_be_visible()
        expect(page.locator("#joy")).to_be_hidden()  # no joystick during dialogs; the button stays
        expect(btn).to_be_visible()
        expect(page.locator("#actVerb")).to_have_text("Next")
        page.evaluate("() => { D.shown = D.full.length; D.typing = false; renderText() }")
        first = page.evaluate("D.i")
        b = btn.bounding_box()
        f.tap(1, b["x"] + 34, b["y"] + 34)
        assert page.evaluate("D.i") == first + 1
        dlg_top = page.locator("#dlg").bounding_box()["y"]
        assert b["y"] + b["height"] <= dlg_top  # sits above the dialog box
        while page.evaluate("D.open"):
            page.evaluate("() => { D.shown = D.full.length; D.typing = false }")
            b = btn.bounding_box()
            f.tap(1, b["x"] + 34, b["y"] + 34)
            page.wait_for_timeout(60)
        assert page.evaluate("!!G.res.meet")  # talking to Ada completed the task
        # face the USB drive: "Investigate" opens the encounter; controls hide under the modal
        spot = page.evaluate("""() => { const o = objById('usb');
            for (const [dx, dy, d] of [[0,1,'up'],[0,-1,'down'],[1,0,'left'],[-1,0,'right']]) {
              const x = o.x + dx, y = o.y + dy; if (!blocked(x, y, player)) return [x, y, d] } }""")
        put_player(page, *spot)
        expect(page.locator("#actVerb")).to_have_text("Investigate")
        b = btn.bounding_box()
        f.tap(1, b["x"] + 34, b["y"] + 34)
        expect(page.locator("#encIns")).to_be_visible()
        expect(btn).to_be_hidden()
        expect(page.locator("#joy")).to_be_hidden()
        assert errors == []
    finally:
        ctx.close()


def test_press_feedback_scale(browser):
    ctx, page, _ = open_game(browser)
    try:
        f = Fingers(page)
        b = page.locator("#tapBtn").bounding_box()
        f.press(1, b["x"] + 34, b["y"] + 34)
        page.wait_for_timeout(110)
        assert page.evaluate("getComputedStyle(document.getElementById('tapBtn')).transform").startswith("matrix(0.95")
        f.lift(1)
        page.wait_for_timeout(200)
        assert page.evaluate("getComputedStyle(document.getElementById('tapBtn')).transform") in ("none", "matrix(1, 0, 0, 1, 0, 0)")
    finally:
        ctx.close()


def test_joystick_and_button_together(browser):
    ctx, page, _ = open_game(browser)
    try:
        f = Fingers(page)
        ada = page.evaluate("() => { const n = npc('ada'); return [n.x, n.y] }")
        put_player(page, ada[0], ada[1] + 2, "up")
        cx, cy = rest_center(page)
        f.press(1, cx, cy)
        f.move(1, cx, cy - 40)  # walk up towards Ada and keep holding
        page.wait_for_timeout(500)
        assert state(page)["held"] == ["up"] and state(page)["y"] == ada[1] + 1  # blocked by Ada, still holding
        b = page.locator("#tapBtn").bounding_box()
        f.press(2, b["x"] + 34, b["y"] + 34)  # second finger on A while the first still holds the stick
        expect(page.locator("#dlg")).to_be_visible()
        f.lift(2)
        f.lift(1)
        page.wait_for_timeout(100)
        assert state(page)["held"] == []
    finally:
        ctx.close()


def test_left_handed_swaps_sides(browser):
    ctx, page, _ = open_game(browser)
    try:
        page.evaluate("Pad.setLefty(true)")
        page.wait_for_timeout(250)
        joy, btn = page.locator("#joy").bounding_box(), page.locator("#tapBtn").bounding_box()
        assert joy["x"] > 195 and btn["x"] < 195
        f = Fingers(page)
        cx, cy = joy["x"] + joy["width"] / 2, joy["y"] + joy["height"] / 2
        put_player(page, 30, 38, "up")
        f.press(1, cx, cy)
        f.move(1, cx - 40, cy)
        page.wait_for_timeout(300)
        assert state(page)["dir"] == "left"
        f.lift(1)
        page.evaluate("Pad.setLefty(false)")
    finally:
        ctx.close()


def test_lost_focus_stops_movement(browser):
    ctx, page, _ = open_game(browser)
    try:
        f = Fingers(page)
        put_player(page, 30, 38, "up")
        cx, cy = rest_center(page)
        f.press(1, cx, cy)
        f.move(1, cx + 40, cy)
        page.wait_for_timeout(200)
        page.evaluate("dispatchEvent(new Event('blur'))")
        assert state(page)["held"] == [] and page.evaluate("Pad.dir") is None
    finally:
        ctx.close()


# ---------------------------------------------------------------- desktop + screenshots
def test_controls_hidden_on_desktop(browser):
    ctx, page, _ = open_game(browser, viewport={"width": 1440, "height": 900})
    try:
        expect(page.locator("#joy")).to_be_hidden()
        expect(page.locator("#joyZone")).to_be_hidden()
        expect(page.locator("#tapBtn")).to_be_hidden()
    finally:
        ctx.close()


@pytest.mark.parametrize("orientation, size", [("portrait", (390, 844)), ("landscape", (844, 390))])
def test_screenshots(browser, orientation, size):
    ctx, page, errors = open_game(browser, viewport={"width": size[0], "height": size[1]}, device_scale_factor=2,
                                  is_mobile=True, has_touch=True)
    try:
        ada = page.evaluate("() => { const n = npc('ada'); return [n.x, n.y] }")
        put_player(page, ada[0], ada[1] + 1, "up")  # something in front: the button glows
        f = Fingers(page)
        cx, cy = rest_center(page)
        SCREENS.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(SCREENS / f"touch-idle-{orientation}.png"))
        put_player(page, 30, 38, "up")
        f.press(1, cx, cy)
        f.move(1, cx + 58, cy - 6)  # running right
        page.wait_for_timeout(250)
        page.screenshot(path=str(SCREENS / f"touch-running-{orientation}.png"))
        f.lift(1)
        # targets are at least 44 px and clear of the objectives panel
        btn, joy = page.locator("#tapBtn").bounding_box(), page.locator("#joy").bounding_box()
        assert min(btn["width"], btn["height"]) >= 44 and min(joy["width"], joy["height"]) >= 44
        tracker = page.locator("#tracker").bounding_box()
        assert btn["y"] > tracker["y"] + tracker["height"] or btn["x"] + btn["width"] < tracker["x"]
        assert btn["y"] + btn["height"] <= size[1] - 20 and joy["y"] + joy["height"] <= size[1] - 20  # clear of the gesture area
        # no minimap on phones (narrow portrait or short landscape): the stick rests at its normal spot
        expect(page.locator("#mini")).to_be_hidden()
        assert joy["x"] < 40, joy
        zone = page.locator("#joyZone").bounding_box()
        assert zone["x"] + zone["width"] >= joy["x"] + joy["width"]  # the whole resting stick is touchable
        assert errors == []
    finally:
        ctx.close()


def test_no_ghost_click_into_the_encounter(browser):
    """Pressing A opens the encounter under the finger; lifting must not choose an answer."""
    ctx, page, _ = open_game(browser)
    try:
        page.evaluate("() => { G.res.meet = {o: 'talk'}; renderTracker() }")
        spot = page.evaluate("""() => { const o = objById('usb');
            for (const [dx, dy, d] of [[0,1,'up'],[0,-1,'down'],[1,0,'left'],[-1,0,'right']]) {
              const x = o.x + dx, y = o.y + dy; if (!blocked(x, y, player)) return [x, y, d] } }""")
        put_player(page, *spot)
        b = page.locator("#tapBtn").bounding_box()
        f = Fingers(page)
        f.press(1, b["x"] + 34, b["y"] + 34)
        page.wait_for_timeout(150)
        f.lift(1)
        page.wait_for_timeout(300)
        expect(page.locator("#encActs")).to_be_visible()  # still deciding, nothing was chosen
        assert page.locator(".verdict").count() == 0
    finally:
        ctx.close()


def test_left_handed_setting_on_profile(browser):
    ctx = browser.new_context(**PHONE)
    page = ctx.new_page()
    try:
        page.goto((ROOT / "web" / "index.html").as_uri())
        page.wait_for_selector(".kpi-strip")
        page.click("#menuBtn")
        page.click('.top-menu [data-r="emp"]')  # demo: preview as the employee
        page.click('.bottom-nav a[href="#profile"]')
        page.locator("label.check", has_text="Left-handed controls").click()
        assert page.evaluate("localStorage.getItem('pv-lefty')") == "1"
        assert page.evaluate("document.getElementById('game').classList.contains('lefty')")
        page.reload()
        assert page.evaluate("Pad.lefty") is True  # saved per device
        page.evaluate("Pad.setLefty(false)")
    finally:
        ctx.close()


def test_minimap_still_on_desktop_and_m_toggles(browser):
    ctx, page, _ = open_game(browser, viewport={"width": 1440, "height": 900})
    try:
        expect(page.locator("#mini")).to_be_visible()
        page.keyboard.press("KeyM")
        expect(page.locator("#mini")).to_be_hidden()
        page.keyboard.press("KeyM")
        expect(page.locator("#mini")).to_be_visible()
    finally:
        ctx.close()


def test_tablet_landscape_keeps_minimap_beside_the_stick(browser):
    ctx, page, _ = open_game(browser, viewport={"width": 1024, "height": 768}, device_scale_factor=2,
                             is_mobile=True, has_touch=True)
    try:
        expect(page.locator("#mini")).to_be_visible()
        m, joy = page.locator("#mini").bounding_box(), page.locator("#joy").bounding_box()
        assert joy["x"] >= m["x"] + m["width"]
    finally:
        ctx.close()
