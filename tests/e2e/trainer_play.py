"""Play a training simulation in the browser, by touch or keyboard only (shared by the e2e tests).

The browser never gets the answers (in local mode the server grades), so the test reads them from
content/training.json and works out which shown option, item or reply is right.
"""
import json
import pathlib

from playwright.sync_api import expect

ROOT = pathlib.Path(__file__).resolve().parents[2]
SIMS = {s["id"]: s for s in json.loads((ROOT / "content" / "training.json").read_text(encoding="utf-8"))["simulations"]}


def answer_for(sim_id, shown, wrong=False):
    """What to pick for the round on screen: ('options', k) / ('spot', ids) / ('sort', [safe?]) / ('call', [k...]) / ('mfa', [...])."""
    r = next(x for x in SIMS[sim_id]["rounds"] if x["id"] == shown["id"])
    t = r["type"]
    if t == "spot":
        ids = [g["id"] for g in r["regions"] if g["flag"]]
        return [g["id"] for g in r["regions"] if not g["flag"]][:1] if wrong else ids
    if t in ("realfake", "verify", "door"):
        key = "real" if t == "realfake" else "correct"
        good = next(o["text"] for o in r["options"] if o.get(key))
        k = [o["text"] for o in shown["options"]].index(good)
        return (k + 1) % len(shown["options"]) if wrong else k
    if t == "sort":
        by = {i["id"]: i["safe"] for i in r["items"]}
        return [by[i["id"]] != wrong for i in shown["items"]]
    if t == "mfa":
        by = {(p["app"], p["loc"], p["time"], p["context"]): p["answer"] for p in r["prompts"]}
        right = [by[(p["app"], p["loc"], p["time"], p["context"])] for p in shown["prompts"]]
        return ["approve" if a != "approve" else "report" for a in right] if wrong else right
    if t == "call":
        node, path = "start", []
        while True:
            choices = r["nodes"][node]["choices"]
            c = next((c for c in choices if c.get("end") == ("compromise" if wrong else "safe")), None) or next(c for c in choices if "next" in c)
            path.append([x["text"] for x in shown["nodes"][node]["choices"]].index(c["text"]))
            if "end" in c:
                return path
            node = c["next"]


class Touch:
    def __init__(self, page):
        self.page = page
        self.cdp = page.context.new_cdp_session(page)

    def press(self, selector, key=None):
        self.page.locator(selector).first.tap()

    def swipe(self, selector, safe):
        box = self.page.locator(selector).bounding_box()
        x, y, dx = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, -160 if safe else 160
        self.cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
        for k in range(1, 9):
            self.cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x + dx * k / 8, "y": y + 2}]})
        self.cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})


class Keys:
    """Keyboard only: Tab to a control (checks focus really lands on it), then Enter / Space / arrows."""
    def __init__(self, page):
        self.page = page

    def focus(self, selector):
        for _ in range(40):
            if self.page.evaluate("s => !!document.activeElement && document.activeElement.matches(s)", selector):
                return
            self.page.keyboard.press("Tab")
        raise AssertionError(f"Tab never reached {selector}")

    def press(self, selector, key="Enter"):
        self.focus(selector)
        self.page.keyboard.press(key)

    def swipe(self, selector, safe):
        self.focus(selector)
        self.page.keyboard.press("ArrowLeft" if safe else "ArrowRight")
        self.page.keyboard.press("Enter")


def play_round(page, how, sim_id, cur, wrong=False):
    shown, t = cur["round"], cur["round"]["type"]
    ans = answer_for(sim_id, shown, wrong)
    if t == "spot":
        for rid in ans:
            how.press(f'.tr-task [data-r="{rid}"]', "Enter" if isinstance(how, Touch) else " ")
        how.press("[data-check]")
    elif t in ("realfake", "verify", "door"):
        how.press(f'.tr-opt[data-i="{ans}"]')
    elif t == "sort":
        for n, safe in enumerate(ans):
            card = f'.tr-card[aria-label^="Item {n + 1} of"]'
            page.wait_for_selector(card)
            page.wait_for_timeout(50)
            how.swipe(card, safe)
    elif t == "call":
        for k in ans:
            page.wait_for_selector(f'.tr-reply[data-i="{k}"]')
            how.press(f'.tr-reply[data-i="{k}"]')
    elif t == "mfa":
        for n, a in enumerate(ans):
            page.wait_for_function("n => Trainer.current() && document.querySelector('.tr-mfa-n') && document.querySelector('.tr-mfa-n').textContent.startsWith('Prompt ' + (n + 1))", arg=n)
            how.press(f'[data-a="{a}"]')


def play_sim(page, sim_id, how, wrong_rounds=(), skip_intro=False):
    """From the trainer opening to the end screen. Returns the round types played."""
    if not skip_intro:
        page.wait_for_selector("#dlg:not([hidden])")
        while page.evaluate("() => D.open"):
            if isinstance(how, Keys):
                expect(page.locator("#dlgNext")).to_be_focused()
                page.keyboard.press("Enter")
            else:
                page.locator("#dlgNext").tap()
            page.wait_for_timeout(60)
    else:
        how.press("[data-go]")
    types = []
    while True:
        cur = page.evaluate("Trainer.current()")
        if not cur:
            break
        types.append(cur["round"]["type"])
        play_round(page, how, sim_id, cur, cur["i"] in wrong_rounds)
        nxt = page.locator("[data-next]")
        expect(nxt).to_be_visible()
        if isinstance(how, Keys):
            expect(nxt).to_be_focused()  # focus moves to Next by itself
            page.keyboard.press("Enter")
        else:
            nxt.tap()
        page.wait_for_function("i => !Trainer.current() || Trainer.current().i !== i", arg=cur["i"])
    expect(page.locator(".tr-end")).to_be_visible()
    return types
