"""content/world_refs.json must list exactly the object and NPC ids the running JS world defines."""
import os
import pathlib
import sys

import pytest

pytest.importorskip("playwright")
from phishverse.content import CONTENT_DIR, read_json  # noqa: E402

ROOT = pathlib.Path(CONTENT_DIR).parent
sys.path.insert(0, str(ROOT / "scripts"))
from gen_world_refs import READ_WORLD  # noqa: E402

pytestmark = pytest.mark.e2e


def test_world_refs_match_runtime_world(page):
    page.route("**/fonts.googleapis.com/**", lambda r: r.fulfill(status=200, content_type="text/css", body=""))
    page.goto((ROOT / "web" / "index.html").as_uri())
    page.wait_for_function("() => typeof objects !== 'undefined' && objects.length > 0")
    world = page.evaluate(READ_WORLD)
    refs = read_json(os.path.join(CONTENT_DIR, "world_refs.json"))
    assert refs["objects"] == dict(sorted(world["objects"].items()))
    assert refs["npcs"] == dict(sorted(world["npcs"].items()))


def test_every_objective_is_reachable_on_foot(page):
    """Each task's object or NPC must have a free tile next to it that the player can walk to from the level start."""
    page.route("**/fonts.googleapis.com/**", lambda r: r.fulfill(status=200, content_type="text/css", body=""))
    page.goto((ROOT / "web" / "index.html").as_uri())
    page.wait_for_function("() => typeof objects !== 'undefined' && objects.length > 0")
    unreachable = page.evaluate("""() => { audioInit = () => {}; const bad = [];
      for (const lv of LEVELS) { startLevel(lv.id, {});
        for (const t of lv.tasks) { const ok = walkToTarget(targetRef(t)); path = []; pendingAct = null; if (!ok) bad.push(lv.id + '/' + t.id) } }
      stopGame(); return bad }""")
    assert unreachable == []
