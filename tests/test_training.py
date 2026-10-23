import copy
import json
import os

import pytest

from phishverse.content import CONTENT_JS, load
from phishverse.training import validate

BAD_L1 = {"usb": "compromise", "qr": "compromise", "sticky": "acceptable", "laptop": "safe"}
LEAKY_KEYS = {"real", "correct", "flag", "why", "answer", "explain", "note", "safe"}


@pytest.fixture
def trainee(employee, manager, play, content):
    """An employee whose report flags Devices, desks and printouts (and maybe more)."""
    c, uid = employee
    manager.put(f"/api/programs/{uid}", json={"levels": ["orientation"]})
    play(c, "orientation", BAD_L1)
    return c, uid


def plan_sims(c):
    return [s["id"] for s in c.get("/api/training").get_json()["sims"]]


def right_answer(content, sim_id, shown):
    """The correct answer for a round as the client saw it (options may be shuffled)."""
    r = next(x for x in content.sims[sim_id]["rounds"] if x["id"] == shown["id"])
    t = r["type"]
    if t == "spot":
        return [g["id"] for g in r["regions"] if g["flag"]]
    if t in ("realfake", "verify", "door"):
        key = "real" if t == "realfake" else "correct"
        good = next(o["text"] for o in r["options"] if o.get(key))
        return [o["text"] for o in shown["options"]].index(good)
    if t == "sort":
        return {i["id"]: "safe" if i["safe"] else "report" for i in r["items"]}
    if t == "mfa":
        by = {(p["app"], p["loc"], p["time"], p["context"]): p["answer"] for p in r["prompts"]}
        return [by[(p["app"], p["loc"], p["time"], p["context"])] for p in shown["prompts"]]
    if t == "call":
        node, path = "start", []
        while True:
            content_choices = r["nodes"][node]["choices"]
            good = next((c for c in content_choices if c.get("end") == "safe"), None) or next(c for c in content_choices if "next" in c)
            path.append([c["text"] for c in shown["nodes"][node]["choices"]].index(good["text"]))
            if "end" in good:
                return path
            node = good["next"]


def wrong_answer(content, sim_id, shown):
    r = next(x for x in content.sims[sim_id]["rounds"] if x["id"] == shown["id"])
    t = r["type"]
    if t == "spot":
        return [g["id"] for g in r["regions"] if not g["flag"]][:1]
    if t in ("realfake", "verify", "door"):
        return (right_answer(content, sim_id, shown) + 1) % len(shown["options"])
    if t == "sort":
        return {i["id"]: "report" if i["safe"] else "safe" for i in r["items"]}
    if t == "mfa":
        return ["approve" if a != "approve" else "report" for a in right_answer(content, sim_id, shown)]
    if t == "call":
        for i, c in enumerate(shown["nodes"]["start"]["choices"]):
            orig = next(x for x in r["nodes"]["start"]["choices"] if x["text"] == c["text"])
            if orig.get("end") == "compromise":
                return [i]


def run(c, content, sim_id, correct=True, wrong_rounds=()):
    s = c.post(f"/api/training/{sim_id}/start", json={})
    assert s.status_code == 201, s.get_json()
    body = s.get_json()
    for i, shown in enumerate(body["sim"]["rounds"]):
        ans = right_answer(content, sim_id, shown) if correct and i not in wrong_rounds else wrong_answer(content, sim_id, shown)
        r = c.post(f"/api/training/{sim_id}/rounds", json={"attempt_id": body["attempt_id"], "round": i, "answer": ans})
        assert r.status_code == 200, r.get_json()
    done = c.post(f"/api/training/{sim_id}/complete", json={"attempt_id": body["attempt_id"]})
    assert done.status_code == 200, done.get_json()
    return body, done.get_json()


# ---------------------------------------------------------------- no answer leakage
def keys_in(obj, found=None):
    found = set() if found is None else found
    if isinstance(obj, dict):
        for k, v in obj.items():
            found.add(k)
            keys_in(v, found)
    elif isinstance(obj, list):
        for v in obj:
            keys_in(v, found)
    return found


def test_start_sends_no_answers(trainee):
    c, _ = trainee
    sim = plan_sims(c)[0]
    body = c.post(f"/api/training/{sim}/start", json={}).get_json()
    assert not keys_in(body["sim"]["rounds"]) & LEAKY_KEYS
    assert '"end": "safe"' not in json.dumps(body) and '"compromise"' not in json.dumps(body)


def test_content_data_js_has_no_training_answers():
    with open(CONTENT_JS, encoding="utf-8") as f:
        data = json.loads(f.read().split("=", 1)[1].rsplit(";", 1)[0])
    assert data["training"] and not keys_in(data["training"]) & (LEAKY_KEYS - {"safe"})
    assert "rounds" in data["training"][0] and isinstance(data["training"][0]["rounds"], int)  # a count, not the rounds


# ---------------------------------------------------------------- grading
def test_rounds_are_graded_on_the_server(trainee, content):
    c, _ = trainee
    sim = plan_sims(c)[0]
    body = c.post(f"/api/training/{sim}/start", json={}).get_json()
    first = body["sim"]["rounds"][0]
    good = c.post(f"/api/training/{sim}/rounds", json={"attempt_id": body["attempt_id"], "round": 0,
                                                       "answer": right_answer(content, sim, first)}).get_json()
    assert good["correct"] is True and good["score"] == 1 and good["explain"]
    second = body["sim"]["rounds"][1]
    bad = c.post(f"/api/training/{sim}/rounds", json={"attempt_id": body["attempt_id"], "round": 1,
                                                      "answer": wrong_answer(content, sim, second), "correct": True, "score": 1}).get_json()
    assert bad["correct"] is False and bad["score"] < 1  # the client's claims are ignored
    again = c.post(f"/api/training/{sim}/rounds", json={"attempt_id": body["attempt_id"], "round": 0, "answer": right_answer(content, sim, first)})
    assert again.status_code == 409


@pytest.mark.parametrize("payload", [{"round": 0, "answer": 99}, {"round": 99, "answer": 0}, {"round": "0", "answer": 0}, {"round": 0, "answer": "x"}])
def test_malformed_answers_rejected(trainee, payload):
    c, _ = trainee
    sim = plan_sims(c)[0]
    body = c.post(f"/api/training/{sim}/start", json={}).get_json()
    assert c.post(f"/api/training/{sim}/rounds", json={"attempt_id": body["attempt_id"], **payload}).status_code == 400


def test_spot_partial_credit(trainee, content):
    c, _ = trainee
    sim = "sim_physical_1"
    assert sim in plan_sims(c)
    body = c.post(f"/api/training/{sim}/start", json={}).get_json()
    i, shown = next((i, r) for i, r in enumerate(body["sim"]["rounds"]) if r["type"] == "spot")
    flags = right_answer(content, sim, shown)
    r = c.post(f"/api/training/{sim}/rounds", json={"attempt_id": body["attempt_id"], "round": i, "answer": flags[:2] + ["mug"]}).get_json()
    assert r["score"] == pytest.approx((2 - 1) / 3, abs=1e-4) and r["detail"]["missed"] == 1 and r["detail"]["wrong"] == 1


# ---------------------------------------------------------------- mastery, retries, plan completion
def test_mastery_needs_80_percent(trainee, content):
    c, _ = trainee
    sim = plan_sims(c)[0]
    _body, low = run(c, content, sim, wrong_rounds=(0, 1))
    assert low["mastered"] is False and low["pct"] < 80 and low["attempts"] == 1
    _body, high = run(c, content, sim)
    assert high["mastered"] is True and high["pct"] == 100 and high["best_pct"] == 100 and high["attempts"] == 2


def test_complete_needs_every_round(trainee, content):
    c, _ = trainee
    sim = plan_sims(c)[0]
    body = c.post(f"/api/training/{sim}/start", json={}).get_json()
    r = c.post(f"/api/training/{sim}/complete", json={"attempt_id": body["attempt_id"]})
    assert r.status_code == 400 and r.get_json()["missing"]


def test_retries_shuffle_rounds_and_options(trainee):
    c, _ = trainee
    sim = plan_sims(c)[0]
    first = c.post(f"/api/training/{sim}/start", json={}).get_json()["sim"]["rounds"]
    authored = [r["id"] for r in first]
    assert authored == sorted(authored, key=lambda x: int(x[1:]))  # the first try is in the authored order
    orders = set()
    for _ in range(6):
        rounds = c.post(f"/api/training/{sim}/start", json={}).get_json()["sim"]["rounds"]
        orders.add(json.dumps([r["id"] for r in rounds]) + json.dumps([r.get("options") or r.get("items") for r in rounds]))
    assert len(orders) > 1


def test_finishing_the_plan_moves_to_the_final_test(trainee, content, manager):
    c, uid = trainee
    sims = plan_sims(c)
    assert c.get("/api/journey").get_json()["next"]["label"] == "Start your training plan"
    for i, sim in enumerate(sims):
        _body, done = run(c, content, sim)
        assert done["plan_finished"] is (i == len(sims) - 1) and done["plan_done"] is (i == len(sims) - 1)
        j = c.get("/api/journey").get_json()
        if i < len(sims) - 1:
            assert j["current"] == "training" and j["next"]["label"] == "Continue your training plan"
    j = c.get("/api/journey").get_json()
    assert next(s for s in j["stages"] if s["id"] == "training")["state"] == "done"
    assert j["current"] == "test" and j["next"] == {"stage": "test", "action": None, "label": "Final test: arrives in the next update"}
    kinds = [e["kind"] for e in manager.get("/api/activity?limit=100").get_json()["events"]]
    assert kinds.count("training_started") == 1
    assert kinds.count("training_progress") == len(sims)
    _body, replay = run(c, content, sims[0])  # replaying after the plan is done doesn't finish it again
    assert replay["plan_done"] is True and replay["plan_finished"] is False
    assert manager.get("/api/state").get_json()["journeys"][uid]["current"] == "test"
    kinds = [e["kind"] for e in manager.get("/api/activity?limit=100").get_json()["events"]]
    assert kinds.count("training_completed") == 1


def test_journey_lists_the_plans_simulations(trainee, content):
    c, _ = trainee
    j = c.get("/api/journey").get_json()
    sims = j["training"]["sims"]
    assert [s["skill"] for s in sims] == j["plan"]["skills"]  # one simulation per skill, plan order
    assert all(s["attempts"] == 0 and not s["mastered"] for s in sims)


# ---------------------------------------------------------------- permissions
def test_permissions(trainee, make_user, sign_in, manager, content):
    c, uid = trainee
    sim = plan_sims(c)[0]
    body = c.post(f"/api/training/{sim}/start", json={}).get_json()
    make_user("ben@novacorp.local")
    ben = sign_in("ben@novacorp.local")
    assert ben.post(f"/api/training/{sim}/rounds", json={"attempt_id": body["attempt_id"], "round": 0, "answer": 0}).status_code == 404
    assert ben.post(f"/api/training/{sim}/complete", json={"attempt_id": body["attempt_id"]}).status_code == 404
    assert ben.post(f"/api/training/{sim}/start", json={}).status_code == 404  # Ben has no plan
    assert c.post("/api/training/sim_payments_1/start", json={}).status_code == 404  # not in Asha's plan
    assert ben.get(f"/api/people/{uid}/training").status_code == 403
    assert manager.get(f"/api/people/{uid}/training").get_json()["total"] >= 1


def test_signed_out(client):
    assert client.get("/api/training").status_code == 401
    assert client.post("/api/training/sim_physical_1/start", json={}).status_code == 401


# ---------------------------------------------------------------- content validation
@pytest.fixture(scope="module")
def doc():
    return load().training


def problems(doc, change):
    d = copy.deepcopy(doc)
    change(d)
    from phishverse.content import load as _l
    skills = [s["id"] for s in _l().skills]
    return validate(d, skills, {"rex", "courier", "vik", "kabir", "zoe", "ada", "mira"})


def test_training_content_is_valid(doc):
    assert problems(doc, lambda d: None) == []
    assert len(doc["simulations"]) == 9


@pytest.mark.parametrize("name, change, expected", [
    ("too few rounds", lambda d: d["simulations"][0].update(rounds=d["simulations"][0]["rounds"][:4]), "5 to 7 rounds"),
    ("one type only", lambda d: d["simulations"][0].update(rounds=[r for r in d["simulations"][0]["rounds"] if r["type"] == "realfake"] * 2), "at least 2 round types"),
    ("two real options", lambda d: d["simulations"][0]["rounds"][0]["options"][1].update(real=True), "exactly one option with real"),
    ("no correct option", lambda d: d["simulations"][0]["rounds"][6]["options"][0].pop("correct"), "exactly one option with correct"),
    ("missing region", lambda d: d["simulations"][0]["rounds"][2]["regions"].append({"id": "ghost", "label": "x", "flag": True, "why": "x"}), "region 'ghost' isn't in the artifact"),
    ("unknown type", lambda d: d["simulations"][0]["rounds"][0].update(type="quiz"), "unknown type 'quiz'"),
    ("no sources", lambda d: d["simulations"][0].update(sources=[]), "sources need"),
    ("url in sources", lambda d: d["simulations"][0]["sources"].append({"org": "X", "title": "Y", "url": "https://x"}), "no URLs"),
    ("skill uncovered", lambda d: d["simulations"].pop(), "no simulation for skill"),
    ("call without safe end", lambda d: [c.update(end="compromise") for n in d["simulations"][3]["rounds"][0]["nodes"].values() for c in n["choices"] if "end" in c], "safe and one compromise"),
    ("unknown npc", lambda d: d["simulations"][6]["rounds"][0].update(npc="gandalf"), "unknown NPC"),
    ("recap of 2", lambda d: d["simulations"][0].update(recap=d["simulations"][0]["recap"][:2]), "exactly 3 habits"),
])
def test_training_validator_catches(doc, name, change, expected):
    assert any(expected in p for p in problems(doc, change)), problems(doc, change)


def test_training_data_js_is_up_to_date():
    from phishverse.content import TRAINING_JS, render_training_js
    assert os.path.exists(TRAINING_JS)
    with open(TRAINING_JS, encoding="utf-8") as f:
        assert f.read().replace("\r\n", "\n") == render_training_js()
