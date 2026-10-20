import json
import os
import sqlite3

import pytest

from phishverse import create_app, db

PROGRAM = {"levels": ["orientation"], "due": "2026-12-31", "note": "Start here", "pass_mark": 75,
           "max_test_attempts": 2, "allow_watch_training": True}
BAD_L1 = {"usb": "compromise", "qr": "compromise", "sticky": "acceptable", "laptop": "safe"}


def stage(j, sid):
    return next(s for s in j["stages"] if s["id"] == sid)


def assign(manager, uid, **kw):
    r = manager.put(f"/api/programs/{uid}", json={**PROGRAM, **kw})
    assert r.status_code == 200, r.get_json()
    return r.get_json()


# ---------------------------------------------------------------- derivation
def test_auto_plan_journey_for_a_new_joiner(employee):
    c, _ = employee
    j = c.get("/api/journey").get_json()
    assert j["program"]["source"] == "default" and j["program"]["id"] is None
    assert j["program"]["levels"] == ["orientation", "inbox"]
    assert [s["state"] for s in j["stages"]] == ["available", "locked", "locked", "locked", "locked"]
    assert j["current"] == "game" and j["next"]["label"] == "Start Level 1 · Office Orientation"
    assert [l["state"] for l in j["levels"]] == ["next", "locked"]


def test_game_in_progress_after_starting(employee, manager):
    c, uid = employee
    assign(manager, uid, levels=["orientation", "inbox"])
    c.post("/api/sessions", json={"level_id": "orientation"})
    j = c.get("/api/journey").get_json()
    assert stage(j, "game")["state"] == "in_progress" and j["next"]["label"] == "Resume Level 1 · Office Orientation"


def test_journey_moves_to_training_when_report_is_ready(employee, manager, play):
    c, uid = employee
    assign(manager, uid, levels=["orientation", "inbox"])
    first = play(c, "orientation", BAD_L1)
    assert first["report_ready"] is False
    j = c.get("/api/journey").get_json()
    assert stage(j, "game")["state"] == "in_progress" and stage(j, "game")["description"] == "1 of 2 levels played."
    assert [l["state"] for l in j["levels"]] == ["done", "next"] and j["next"]["level_id"] == "inbox"
    last = play(c, "inbox")
    assert last["report_ready"] is True  # the last baseline level writes the report
    j = c.get("/api/journey").get_json()
    assert [s["state"] for s in j["stages"]] == ["done", "done", "available", "locked", "locked"]
    assert j["current"] == "training" and j["next"] == {"stage": "training", "action": "plan", "label": "Start your training plan"}
    assert j["weakest"]["id"] == "physical" and "physical" in j["plan"]["skills"]
    assert "Pass mark 75%" in stage(j, "test")["description"]
    events = [e["kind"] for e in manager.get("/api/activity").get_json()["events"]]
    assert events.count("report_ready") == 1


def test_all_safe_means_nothing_to_train(employee, manager, play):
    c, uid = employee
    assign(manager, uid)
    play(c, "orientation")
    j = c.get("/api/journey").get_json()
    assert stage(j, "training")["state"] == "done" and j["plan"]["skills"] == []
    assert j["current"] == "test" and j["next"]["action"] is None


def test_first_attempt_rule_replays_dont_inflate(employee, manager, play):
    c, uid = employee
    assign(manager, uid, levels=["orientation", "inbox"])
    play(c, "orientation", BAD_L1)
    play(c, "orientation")  # a perfect replay before the report exists
    play(c, "inbox")
    rep = c.get("/api/report").get_json()
    assert rep["levels"]["orientation"] == 40  # (0 + 0 + .6 + 1) / 4: the first attempt, not the replay's 100
    phys = next(s for s in rep["skills"] if s["id"] == "physical")
    assert phys["band"] == "weak"
    play(c, "orientation")  # replays after the report don't change it either
    assert c.get("/api/report").get_json() == rep


def test_watch_skills_only_when_allowed(employee, manager, play):
    c, uid = employee
    # inbox with one acceptable answer (e1): sender_domains (1, .6, 1, 1, ...) stays Strong; links_qr becomes Watch
    assign(manager, uid, levels=["inbox"], allow_watch_training=False)
    play(c, "inbox", {"e1": "acceptable", "e2": "acceptable"})
    rep = c.get("/api/report").get_json()
    assert rep["watch"] and not rep["weak"]
    assert c.get("/api/journey").get_json()["plan"]["skills"] == []


def test_reassigning_replaces_the_program(app, employee, manager, play):
    c, uid = employee
    assign(manager, uid)
    play(c, "orientation", BAD_L1)
    assert c.get("/api/journey").get_json()["report_id"]
    assign(manager, uid, levels=["orientation", "signals"])
    j = c.get("/api/journey").get_json()
    assert j["report_id"] is None and stage(j, "game")["state"] == "available"  # a new program starts fresh
    conn = db.connect(app.config["DB_PATH"])
    statuses = sorted(r[0] for r in conn.execute("SELECT status FROM programs WHERE user_id=?", (uid,)))
    conn.close()
    assert statuses == ["active", "replaced"]


def test_auto_plan_is_stored_when_its_report_is_written(app, employee, play):
    c, uid = employee
    play(c, "orientation")
    play(c, "inbox")
    j = c.get("/api/journey").get_json()
    assert j["report_id"] and j["program"]["id"] and j["program"]["source"] == "default"
    conn = db.connect(app.config["DB_PATH"])
    assert conn.execute("SELECT created_by FROM programs WHERE user_id=?", (uid,)).fetchone()[0] == "auto"
    conn.close()


def test_removing_a_program_leaves_the_auto_plan(employee, manager):
    c, uid = employee
    assign(manager, uid, levels=["signals"])
    assert manager.delete(f"/api/programs/{uid}", json={}).status_code == 200
    assert c.get("/api/journey").get_json()["program"]["source"] == "default"


# ---------------------------------------------------------------- manager views and permissions
def test_manager_state_has_journey_summaries(employee, manager, play):
    c, uid = employee
    assign(manager, uid)
    play(c, "orientation", BAD_L1)
    s = manager.get("/api/state").get_json()
    summary = s["journeys"][uid]
    assert summary["current"] == "training" and summary["weakest"]["id"] == "physical" and summary["played"] == 1
    a = s["assignments"][uid]
    assert (a["passMark"], a["maxTestAttempts"], a["allowWatchTraining"]) == (75, 2, True)


def test_employee_cannot_read_someone_elses_report(employee, manager, make_user, sign_in, play):
    c, uid = employee
    assign(manager, uid)
    play(c, "orientation", BAD_L1)
    make_user("ben@novacorp.local")
    ben = sign_in("ben@novacorp.local")
    for path in (f"/api/people/{uid}/report", f"/api/people/{uid}/journey", f"/api/people/{uid}/plan"):
        assert ben.get(path).status_code == 403
        assert c.get(path).status_code == 403  # even your own: the self endpoints are /api/report etc.
    assert ben.get("/api/report").status_code == 404  # Ben has no report; he never sees Asha's
    assert ben.put(f"/api/people/{uid}/plan", json={"skills": []}).status_code == 403
    assert manager.get(f"/api/people/{uid}/report").get_json()["weakest"]["id"] == "physical"


def test_manager_edits_the_plan(employee, manager, play):
    c, uid = employee
    assign(manager, uid)
    assert manager.put(f"/api/people/{uid}/plan", json={"skills": ["voice"]}).status_code == 409  # no plan yet
    play(c, "orientation", BAD_L1)
    r = manager.put(f"/api/people/{uid}/plan", json={"skills": ["voice", "physical"]})
    assert r.status_code == 200 and [s["id"] for s in r.get_json()["skills"]] == ["voice", "physical"]
    assert r.get_json()["edited_by"]
    assert c.get("/api/plan").get_json()["skills"][0]["name"] == "Phone and voice scams"
    for bad in (["juggling"], ["voice", "voice"], "voice", [1]):
        assert manager.put(f"/api/people/{uid}/plan", json={"skills": bad}).status_code == 400
    assert "plan_updated" in [e["kind"] for e in c.get("/api/activity").get_json()["events"]]


@pytest.mark.parametrize("change, message", [
    ({"levels": []}, "Pick at least one module."),
    ({"pass_mark": 40}, "The pass mark must be between 50 and 100."),
    ({"pass_mark": "70"}, "The pass mark must be between 50 and 100."),
    ({"max_test_attempts": 0}, "Allow between 1 and 10 test attempts."),
    ({"due": "31/12/2026"}, "Due date must look like 2026-10-31."),
])
def test_program_validation(employee, manager, change, message):
    _, uid = employee
    r = manager.put(f"/api/programs/{uid}", json={**PROGRAM, **change})
    assert r.status_code == 400 and r.get_json()["error"] == message


def test_old_assignment_routes_still_work(employee, manager):
    _, uid = employee
    r = manager.put(f"/api/assignments/{uid}", json={"levels": ["inbox"]})
    assert r.status_code == 200 and r.get_json()["passMark"] == 70 and r.get_json()["programId"]


# ---------------------------------------------------------------- migration
def test_existing_assignments_become_programs(tmp_path):
    path = str(tmp_path / "old.db")
    conn = db.connect(path)  # a database from before programs existed: only migration 0001 applied
    conn.executescript(open(os.path.join(db.MIGRATIONS_DIR, "0001_initial.sql"), encoding="utf-8").read())
    conn.execute("INSERT INTO users VALUES ('u_a','Anu','anu@novacorp.local','x','employee','Sales',1)")
    conn.execute("INSERT INTO users VALUES ('u_b','Bo','bo@novacorp.local','x','employee','',1)")
    conn.execute("INSERT INTO assignments VALUES ('u_a', ?)", (json.dumps(
        {"levels": ["inbox", "signals"], "due": "2026-11-30", "note": "Before Diwali", "assignedAt": 1700000000000, "by": "u_m"}),))
    conn.execute("INSERT INTO assignments VALUES ('u_b', 'not json')")
    conn.execute("CREATE TABLE schema_version (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)")
    conn.execute("INSERT INTO schema_version VALUES (1, 'initial', 1)")
    conn.commit()
    conn.close()
    create_app({"DB_PATH": path, "TESTING": True})
    conn = sqlite3.connect(path)
    rows = conn.execute("SELECT user_id, levels_json, due, note, pass_mark, max_test_attempts, allow_watch_training, "
                        "created_by, created_at, status FROM programs").fetchall()
    conn.close()
    assert rows == [("u_a", '["inbox","signals"]', "2026-11-30", "Before Diwali", 70, 3, 1, "u_m", 1700000000000, "active")]
