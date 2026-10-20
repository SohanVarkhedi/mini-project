import json
import sqlite3

import pytest

from conftest import action_for
from phishverse import db
from phishverse.seed import seed_demo


def start(client, level_id="orientation", **kw):
    r = client.post("/api/sessions", json={"level_id": level_id, **kw})
    assert r.status_code == 201, r.get_json()
    return r.get_json()["id"]


def decide(client, sid, task_id, action_index, **kw):
    return client.post(f"/api/sessions/{sid}/decisions", json={"task_id": task_id, "action_index": action_index, **kw})


# ---------------------------------------------------------------- starting
def test_start_session(employee):
    c, _ = employee
    r = c.post("/api/sessions", json={"level_id": "inbox", "purpose": "practice", "client_version": "pv-web"})
    assert r.status_code == 201
    body = r.get_json()
    assert body["id"].startswith("s_") and body["level_id"] == "inbox" and body["purpose"] == "practice"
    s = c.get(f"/api/sessions/{body['id']}").get_json()
    assert s["finished_at"] is None and s["decisions"] == [] and s["score"] is None


@pytest.mark.parametrize("payload, message", [
    ({"level_id": "level99"}, "Unknown level."),
    ({}, "Unknown level."),
    ({"level_id": "orientation", "purpose": "fun"}, "Purpose must be baseline, practice or test."),
])
def test_start_session_validation(employee, payload, message):
    c, _ = employee
    r = c.post("/api/sessions", json=payload)
    assert r.status_code == 400 and r.get_json()["error"] == message


def test_purpose_defaults_to_baseline(employee):
    c, _ = employee
    sid = start(c)
    assert c.get(f"/api/sessions/{sid}").get_json()["purpose"] == "baseline"


# ---------------------------------------------------------------- decisions
def test_outcome_comes_from_content_even_if_client_lies(employee, content):
    c, _ = employee
    sid = start(c)
    plug_in = action_for(content, "orientation", "usb", "compromise")
    r = decide(c, sid, "usb", plug_in, outcome="safe", severity=0, score=100, inspected=[2, 0, 2], response_ms=5300)
    assert r.status_code == 201 and r.get_json() == {"task_id": "usb", "outcome": "compromise"}
    d = c.get(f"/api/sessions/{sid}").get_json()["decisions"][0]
    assert d["outcome"] == "compromise"
    assert d["severity"] == 3  # plugging in an unknown drive: malware run
    assert d["inspected"] == [2, 0] and d["n_inspections"] == 2  # first-opened order, duplicates dropped
    assert d["response_ms"] == 5300


def test_non_compromise_has_no_severity(employee, content):
    c, _ = employee
    sid = start(c)
    decide(c, sid, "usb", action_for(content, "orientation", "usb", "safe"))
    assert c.get(f"/api/sessions/{sid}").get_json()["decisions"][0]["severity"] is None


def test_duplicate_decision_rejected(employee):
    c, _ = employee
    sid = start(c)
    assert decide(c, sid, "usb", 1).status_code == 201
    r = decide(c, sid, "usb", 0)
    assert r.status_code == 409
    assert c.get(f"/api/sessions/{sid}").get_json()["decisions"][0]["action_index"] == 1  # first answer stands


@pytest.mark.parametrize("payload, code", [
    ({"task_id": "meet", "action_index": 0}, 400),         # a talk task, not a scenario
    ({"task_id": "e1", "action_index": 0}, 400),           # a scenario from another level
    ({"task_id": "usb", "action_index": 4}, 400),          # out of range
    ({"task_id": "usb", "action_index": -1}, 400),
    ({"task_id": "usb", "action_index": "1"}, 400),
    ({"task_id": "usb", "action_index": True}, 400),
    ({"task_id": "usb", "action_index": 1, "inspected": [9]}, 400),
    ({"task_id": "usb", "action_index": 1, "inspected": "0,1"}, 400),
    ({"task_id": "usb", "action_index": 1, "inspected": [0, "1"]}, 400),
])
def test_decision_validation(employee, payload, code):
    c, _ = employee
    sid = start(c)
    assert c.post(f"/api/sessions/{sid}/decisions", json=payload).status_code == code


def test_response_ms_is_clamped(employee):
    c, _ = employee
    sid = start(c)
    decide(c, sid, "usb", 1, response_ms="soon")
    decide(c, sid, "qr", 1, response_ms=10**12)
    ds = c.get(f"/api/sessions/{sid}").get_json()["decisions"]
    assert [d["response_ms"] for d in ds] == [0, 3600000]


# ---------------------------------------------------------------- other people's sessions
def test_no_access_to_someone_elses_session(employee, make_user, sign_in, manager):
    c, _ = employee
    sid = start(c)
    make_user("ben@novacorp.local")
    for other in (sign_in("ben@novacorp.local"), manager):
        assert other.get(f"/api/sessions/{sid}").status_code == 404
        assert decide(other, sid, "usb", 1).status_code == 404
        assert other.post(f"/api/sessions/{sid}/finish", json={}).status_code == 404
    assert c.get(f"/api/sessions/{sid}").get_json()["decisions"] == []  # nothing was written


def test_unknown_session_is_404(employee):
    c, _ = employee
    assert c.get("/api/sessions/s_nope").status_code == 404


# ---------------------------------------------------------------- finishing and scoring
def test_finish_with_missing_decisions_rejected(employee):
    c, _ = employee
    sid = start(c)
    decide(c, sid, "usb", 1)
    r = c.post(f"/api/sessions/{sid}/finish", json={})
    assert r.status_code == 400
    assert r.get_json()["missing"] == ["qr", "sticky", "laptop"]
    assert c.get(f"/api/sessions/{sid}").get_json()["finished_at"] is None


def test_no_decisions_after_finish(employee, play, content):
    c, _ = employee
    sid = play(c, "orientation")["session"]["id"]
    assert decide(c, sid, "usb", 0).status_code == 409


def test_finish_twice_returns_same_result(employee, content):
    c, _ = employee
    sid = start(c)
    for t in content.scored_tasks("orientation"):
        decide(c, sid, t["id"], action_for(content, "orientation", t["id"], "safe"))
    first = c.post(f"/api/sessions/{sid}/finish", json={}).get_json()
    again = c.post(f"/api/sessions/{sid}/finish", json={})
    assert again.status_code == 200 and again.get_json()["score"] == first["score"] == 100


@pytest.mark.parametrize("outcomes, score, stars", [
    ({}, 100, 3),                                                         # all safe
    ({"sticky": "acceptable"}, 90, 3),                                    # (1+1+.6+1)/4
    ({"usb": "compromise", "qr": "compromise", "laptop": "acceptable"}, 40, 1),
    ({"usb": "acceptable", "qr": "acceptable"}, 80, 2),
    ({"usb": "compromise", "qr": "compromise", "sticky": "compromise", "laptop": "compromise"}, 0, 1),
])
def test_score_formula_level1(employee, play, outcomes, score, stars):
    c, _ = employee
    r = play(c, "orientation", outcomes)
    assert (r["score"], r["stars"]) == (score, stars)


def test_score_formula_rounds_half_up_like_the_game(employee, play):
    # Level 2 has 6 scenarios. 5 safe + 1 false alarm = 5.4/6 = 90%; 4 safe + 1 acceptable + 1 compromise = 4.6/6 = 76.67 -> 77
    c, _ = employee
    assert play(c, "inbox", {"e3": "false_alarm"})["score"] == 90
    assert play(c, "inbox", {"e1": "acceptable", "e2": "compromise"})["score"] == 77


def test_score_matches_content_score(content):
    assert content.score(["safe", "acceptable", "false_alarm", "compromise"]) == (50, 1)
    assert content.score(["safe"] * 3 + ["acceptable"]) == (90, 3)
    assert content.score(["safe", "acceptable"]) == (80, 2)  # 0.8 -> 80, not 79 or 81


# ---------------------------------------------------------------- progress summary
def test_finish_updates_progress(employee, play, manager):
    c, uid = employee
    r = play(c, "orientation", {"sticky": "acceptable"})
    assert r["outcomes"] == {"usb": "safe", "qr": "safe", "sticky": "acceptable", "laptop": "safe"}
    assert r["progress"]["best"] == 90 and r["progress"]["attempts"] == 1 and r["progress"]["done"] is True
    mine = c.get("/api/state").get_json()["myProg"]
    assert mine["levels"]["orientation"]["best"] == 90
    assert manager.get("/api/state").get_json()["progress"][uid]["levels"]["orientation"]["best"] == 90


def test_progress_best_attempts_and_outcomes(employee, play):
    c, _ = employee
    play(c, "orientation", {"usb": "compromise"})                # 75
    play(c, "orientation")                                       # 100
    play(c, "orientation", {"qr": "acceptable"})                 # 90
    L = c.get("/api/state").get_json()["myProg"]["levels"]["orientation"]
    assert (L["best"], L["last"], L["attempts"], L["stars"]) == (100, 90, 3, 3)
    assert set(L["outcomes"].values()) == {"safe"}  # outcomes of the best attempt, as the dashboard shows


def test_practice_counts_test_does_not(employee, play):
    c, _ = employee
    play(c, "inbox", purpose="practice")
    play(c, "signals", purpose="test")
    levels = c.get("/api/state").get_json()["myProg"]["levels"]
    assert "inbox" in levels and "signals" not in levels


def test_legacy_progress_is_kept(app, employee, play):
    """Results saved before sessions existed (Stage 0-1) stay until that level is played again."""
    c, uid = employee
    legacy = {"levels": {"access": {"best": 64, "last": 64, "stars": 1, "done": True, "attempts": 2,
                                    "completedAt": 1, "timeMs": 0, "outcomes": {"a1": "compromise"}}}, "lastActive": 1}
    conn = db.connect(app.config["DB_PATH"])
    conn.execute("INSERT OR REPLACE INTO progress (user_id,data) VALUES (?,?)", (uid, json.dumps(legacy)))
    conn.commit()
    conn.close()
    play(c, "orientation")
    levels = c.get("/api/state").get_json()["myProg"]["levels"]
    assert levels["access"]["best"] == 64 and levels["orientation"]["best"] == 100


def test_abandoned_sessions_dont_count(employee, play, content):
    c, _ = employee
    sid = start(c, "orientation")
    decide(c, sid, "usb", 0)  # left without finishing
    assert c.get("/api/state").get_json()["myProg"] is None


# ---------------------------------------------------------------- seed
def test_seed_creates_real_sessions(app, content, sign_in):
    conn = db.connect(app.config["DB_PATH"])
    seed_demo(conn, content)
    seed_demo(conn, content)  # idempotent
    n_sessions = conn.execute("SELECT COUNT(*) FROM play_sessions").fetchone()[0]
    n_decisions = conn.execute("SELECT COUNT(*) FROM decisions").fetchone()[0]
    per_session = conn.execute("SELECT s.level_id, COUNT(d.id) FROM play_sessions s JOIN decisions d ON d.session_id=s.id "
                               "GROUP BY s.id").fetchall()
    conn.close()
    assert n_sessions == 7 and n_decisions == 4 + 6 + 4 + 4 + 6 + 4 + 5  # Aarav 2, Sara 1, Rohan 2, Meera 2
    assert all(n == len(content.scored_tasks(lid)) for lid, n in per_session)
    aarav = sign_in("aarav@novacorp.local", "demo1234")
    levels = aarav.get("/api/state").get_json()["myProg"]["levels"]
    assert levels["orientation"]["best"] == 90  # derived from the seeded decisions, not typed in
    assert levels["inbox"]["outcomes"]["e2"] == "compromise"


def test_decisions_schema_rejects_bad_rows(app):
    conn = db.connect(app.config["DB_PATH"])
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO play_sessions (id,user_id,level_id,purpose,started_at) VALUES ('s1','nobody','x','fun',1)")
    conn.close()
