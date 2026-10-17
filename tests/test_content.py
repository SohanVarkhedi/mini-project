import copy
import json
import os
import re
import shutil

import pytest

from phishverse import create_app
from phishverse.content import (CONTENT_DIR, CONTENT_JS, CUES, read_json, render_content_js, validate,
                                world_js_sha256)

ROOT = os.path.dirname(CONTENT_DIR)


@pytest.fixture(scope="module")
def docs():
    return (read_json(os.path.join(CONTENT_DIR, "levels.json")), read_json(os.path.join(CONTENT_DIR, "skills.json")),
            read_json(os.path.join(CONTENT_DIR, "world_refs.json")))


def scenarios(levels_doc):
    return [(L["id"], t) for L in levels_doc["levels"] for t in L["tasks"] if t.get("enc")]


def find(levels_doc, task_id):
    return next(t for L in levels_doc["levels"] for t in L["tasks"] if t["id"] == task_id)


def problems_after(docs, change):
    levels, skills, refs = copy.deepcopy(docs)
    change(levels, skills, refs)
    return validate(levels, skills, refs)


# ---------------------------------------------------------------- the real content
def test_content_is_valid(docs):
    assert validate(*docs) == []


def test_every_scenario_is_tagged(docs):
    levels, skills, _ = docs
    assert len(scenarios(levels)) == 25
    for _, t in scenarios(levels):
        e = t["enc"]
        assert 1 <= len(e["skills"]) <= 2 and e["cues"] and set(e["cues"]) <= CUES and e["difficulty"] in (1, 2, 3)
        for a in e["acts"]:
            assert (a["o"] == "compromise") == ("sev" in a)


def test_every_skill_is_covered_twice(docs):
    levels, skills, _ = docs
    counts = {s["id"]: 0 for s in skills["skills"]}
    for _, t in scenarios(levels):
        for s in t["enc"]["skills"]:
            counts[s] += 1
    assert len(counts) == 9 and min(counts.values()) >= 2, counts


def test_skill_icons_exist_in_ui_js(docs):
    ui = open(os.path.join(ROOT, "web", "js", "ui.js"), encoding="utf-8").read()
    names = set(re.findall(r"^\s+(\w+):'<", ui, flags=re.M))
    missing = [s["icon"] for s in docs[1]["skills"] if s["icon"] not in names]
    assert missing == []


def test_content_data_js_is_up_to_date():
    with open(CONTENT_JS, encoding="utf-8") as f:
        on_disk = f.read().replace("\r\n", "\n")
    assert on_disk == render_content_js(), "web/js/content-data.js is stale: run python scripts/build_content.py"


def test_world_refs_match_world_js(docs):
    assert docs[2]["source_sha256"] == world_js_sha256(), \
        "web/js/content.js changed since world_refs.json was made: run python scripts/gen_world_refs.py"


# ---------------------------------------------------------------- each rule catches its problem
def _set(task_id, path, value):
    def change(levels, skills, refs):
        node = find(levels, task_id)
        *head, last = path
        for k in head:
            node = node[k]
        if value is DELETE:
            del node[last]
        else:
            node[last] = value
    return change


DELETE = object()

RULES = [
    ("duplicate task id", _set("qr", ["id"], "usb"), "duplicate task id"),
    ("after points nowhere", _set("usb", ["after"], "nope"), "after 'nope'"),
    ("after points to another level", _set("usb", ["after"], "e1"), "after 'e1'"),
    ("unknown object", _set("usb", ["at"], {"obj": "spaceship"}), "object 'spaceship'"),
    ("unknown npc", _set("meet", ["at"], {"npc": "gandalf"}), "NPC 'gandalf'"),
    ("object from another level", _set("e1", ["at"], {"obj": "laptop"}), "only exists in levels"),
    ("npc from another level", _set("e6", ["at"], {"npc": "vik"}), "only appears in levels"),
    ("one action", _set("usb", ["enc", "acts"], [{"l": "Hand it to IT", "o": "safe", "fb": "Good."}]), "2 to 4 actions"),
    ("five actions", _set("qr", ["enc", "acts"], [{"l": f"A{i}", "o": "safe", "fb": "Ok."} for i in range(5)]), "2 to 4 actions"),
    ("no safe action", _set("qr", ["enc", "acts", 1, "o"], "acceptable"), "at least one safe"),
    ("bad outcome", _set("qr", ["enc", "acts", 2, "o"], "meh"), "outcome 'meh'"),
    ("legit without false alarm", _set("e3", ["enc", "acts", 1, "o"], "acceptable"), "needs at least one false_alarm"),
    ("legit with compromise", _set("e3", ["enc", "acts", 2], {"l": "Click", "o": "compromise", "fb": "No.", "sev": 1}),
     "can't have a compromise"),
    ("hl not valid for channel", _set("c1", ["enc", "inspect", 0, "hl"], "attach"), "hl 'attach' isn't valid for call"),
    ("hl on an object", _set("usb", ["enc", "inspect", 0, "hl"], "link"), "isn't valid for object"),
    ("no lesson", _set("usb", ["enc", "lesson"], ""), "lesson is missing"),
    ("long title", _set("usb", ["enc", "title"], "x" * 81), "enc.title is 81 characters"),
    ("long feedback", _set("usb", ["enc", "acts", 0, "fb"], "x" * 161), "act.fb is 161 characters"),
    ("compromise without sev", _set("usb", ["enc", "acts", 0, "sev"], DELETE), "needs sev 1, 2 or 3"),
    ("sev out of range", _set("usb", ["enc", "acts", 0, "sev"], 4), "needs sev 1, 2 or 3"),
    ("sev on a safe action", _set("usb", ["enc", "acts", 1, "sev"], 1), "only compromise actions have sev"),
    ("no cues", _set("usb", ["enc", "cues"], []), "cues must be"),
    ("unknown cue", _set("usb", ["enc", "cues"], ["greed"]), "cues must be"),
    ("no difficulty", _set("usb", ["enc", "difficulty"], DELETE), "difficulty must be"),
    ("difficulty 4", _set("usb", ["enc", "difficulty"], 4), "difficulty must be"),
    ("no skills", _set("usb", ["enc", "skills"], []), "skills must list 1 or 2"),
    ("three skills", _set("usb", ["enc", "skills"], ["physical", "access", "voice"]), "skills must list 1 or 2"),
    ("unknown skill", _set("usb", ["enc", "skills"], ["juggling"]), "unknown skill 'juggling'"),
    ("legit with red flag", _set("e3", ["enc", "inspect", 0, "f"], True), "shouldn't have red-flag clues"),
    ("unknown channel", _set("usb", ["enc", "ch"], "fax"), "unknown channel 'fax'"),
]


@pytest.mark.parametrize("name, change, expected", RULES, ids=[r[0] for r in RULES])
def test_validator_catches(docs, name, change, expected):
    problems = problems_after(docs, change)
    assert any(expected in p for p in problems), problems


def test_validator_catches_thin_skill_coverage(docs):
    def change(levels, skills, refs):
        for _, t in scenarios(levels):
            t["enc"]["skills"] = [s for s in t["enc"]["skills"] if s != "attachments"] or ["physical"]
    assert any("skill attachments is tested by 0" in p for p in problems_after(docs, change))


def test_validator_catches_duplicate_level(docs):
    def change(levels, skills, refs):
        levels["levels"][1]["id"] = "orientation"
    assert "duplicate level id" in problems_after(docs, change)


def test_validator_catches_bad_outcome_scale(docs):
    def change(levels, skills, refs):
        del levels["outcomes"]["acceptable"]
    assert any("outcomes must define" in p for p in problems_after(docs, change))


# ---------------------------------------------------------------- the server reads content, not constants
def test_server_reads_levels_from_content(tmp_path, docs):
    content_dir = tmp_path / "content"
    shutil.copytree(CONTENT_DIR, content_dir)
    levels = copy.deepcopy(docs[0])
    extra = copy.deepcopy(levels["levels"][1])  # inbox: its desk and NPC exist in every level
    extra.update(id="bonus", n=6, title="Bonus Round")
    levels["levels"].append(extra)
    (content_dir / "levels.json").write_text(json.dumps(levels), encoding="utf-8")
    app = create_app({"DB_PATH": str(tmp_path / "x.db"), "TESTING": True, "CONTENT_DIR": str(content_dir)})
    assert app.extensions["pv_content"].level_ids[-1] == "bonus"
    c = app.test_client()
    c.post("/api/login", json={"email": "manager@novacorp.local", "password": "manager123"})
    assert c.post("/api/sessions", json={"level_id": "bonus"}).status_code == 201
    me = c.get("/api/me").get_json()["id"]
    assert c.put(f"/api/assignments/{me}", json={"levels": ["bonus"]}).get_json()["levels"] == ["bonus"]


def test_server_refuses_invalid_content(tmp_path, docs):
    content_dir = tmp_path / "content"
    shutil.copytree(CONTENT_DIR, content_dir)
    levels = copy.deepcopy(docs[0])
    levels["levels"][0]["tasks"][1]["enc"]["acts"][1]["o"] = "acceptable"  # usb: no safe action left
    (content_dir / "levels.json").write_text(json.dumps(levels), encoding="utf-8")
    with pytest.raises(RuntimeError, match="needs at least one safe action"):
        create_app({"DB_PATH": str(tmp_path / "x.db"), "TESTING": True, "CONTENT_DIR": str(content_dir)})
