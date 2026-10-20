"""
The journey + skills report rules exist twice: phishverse/journey.py + skills.py (server) and
web/js/rules.js (demo and live modes). Each fixture history runs through both, and every journey
state, next action, report field (scores, bands, cues, habits, summary text) must match.
"""
import json
import pathlib

import pytest

pytest.importorskip("playwright")
from phishverse import create_app, db  # noqa: E402
from phishverse.journey import create_program, journey, report_json, report_row  # noqa: E402

pytestmark = pytest.mark.e2e
ROOT = pathlib.Path(__file__).resolve().parents[2]
PROGRAM_START = 1_000_000

MIXED_L1 = {"usb": "safe", "qr": "compromise", "sticky": "acceptable", "laptop": "compromise"}
MIXED_L2 = {"e1": "safe", "e2": "safe", "e3": "false_alarm", "e4": "compromise", "e5": "safe", "e6": "safe"}
SAFE_L1 = {"usb": "safe", "qr": "safe", "sticky": "safe", "laptop": "safe"}


def S(level, outcomes, at, purpose="baseline", inspected=1, ms=9000, finished=True):
    return {"level": level, "outcomes": outcomes, "at": at, "purpose": purpose, "inspected": inspected, "ms": ms, "finished": finished}


FIXTURES = {
    "no plays": {"levels": ["orientation", "inbox"], "sessions": []},
    "partial baseline": {"levels": ["orientation", "inbox"], "sessions": [
        S("orientation", MIXED_L1, 10), S("inbox", MIXED_L2, 20, finished=False)]},
    "full baseline, mixed": {"levels": ["orientation", "inbox"], "sessions": [
        S("orientation", MIXED_L1, 10, inspected=0, ms=3000), S("inbox", MIXED_L2, 20, inspected=2, ms=15000)]},
    "no weak skills": {"levels": ["orientation"], "sessions": [S("orientation", SAFE_L1, 10, inspected=3)]},
    "replays after a report": {"levels": ["orientation", "inbox"], "sessions": [
        S("orientation", MIXED_L1, -50),                       # before the program started: ignored
        S("orientation", MIXED_L1, 10), S("inbox", MIXED_L2, 20),
        S("orientation", SAFE_L1, 30),                         # replay after the report: ignored
        S("signals", {}, 40, purpose="practice", finished=False)]},  # practice: never baseline evidence
    "watch skills excluded": {"levels": ["inbox"], "watch": False, "sessions": [
        S("inbox", {"e1": "acceptable", "e2": "acceptable", "e3": "safe", "e4": "safe", "e5": "safe", "e6": "safe"}, 10)]},
}


def decisions_for(content, s):
    out = []
    for i, t in enumerate(content.scored_tasks(s["level"])):
        want = s["outcomes"].get(t["id"], "safe")
        idx = next(k for k, a in enumerate(t["enc"]["acts"]) if a["o"] == want)
        act = t["enc"]["acts"][idx]
        out.append({"task_id": t["id"], "action_index": idx, "outcome": want,
                    "severity": act.get("sev") if want == "compromise" else None,
                    "n_inspections": min(s["inspected"], len(t["enc"]["inspect"])), "response_ms": s["ms"] + 500 * i})
    return out


def histories(content, fx):
    sessions = []
    for n, s in enumerate(fx["sessions"]):
        ds = decisions_for(content, s) if s["outcomes"] or s["finished"] else []
        score = content.score([d["outcome"] for d in ds])[0] if s["finished"] else None
        start = PROGRAM_START + s["at"] * 1000
        sessions.append({"id": f"s{n}", "level_id": s["level"], "purpose": s["purpose"], "started_at": start,
                         "finished_at": start + 500 if s["finished"] else None, "score": score, "decisions": ds, "_order": n})
    return sessions


def python_journey(tmp_path, content, fx, sessions):
    app = create_app({"DB_PATH": str(tmp_path / "parity.db"), "TESTING": True})
    conn = db.connect(app.config["DB_PATH"])
    conn.execute("INSERT INTO users (id,name,email,pw_hash,role,dept,joined_at) VALUES ('u_p','Pat','p@x.y','x','employee','',1)")
    create_program(conn, "u_p", fx["levels"], "2099-12-31", "", allow_watch_training=fx.get("watch", True), created_at=PROGRAM_START)
    for s in sessions:
        conn.execute("INSERT INTO play_sessions (id,user_id,level_id,purpose,started_at,finished_at,score,stars) VALUES (?,?,?,?,?,?,?,1)",
                     (s["id"], "u_p", s["level_id"], s["purpose"], s["started_at"], s["finished_at"], s["score"]))
        for d in s["decisions"]:
            conn.execute("INSERT INTO decisions (session_id,task_id,action_index,outcome,severity,inspected_json,n_inspections,response_ms,created_at)"
                         " VALUES (?,?,?,?,?,'[]',?,?,1)", (s["id"], d["task_id"], d["action_index"], d["outcome"], d["severity"],
                                                          d["n_inspections"], d["response_ms"]))
    user = conn.execute("SELECT * FROM users WHERE id='u_p'").fetchone()
    j = journey(conn, content, user)
    rep = report_json(report_row(conn, j["program"]["id"])) if j["report_id"] else None
    conn.close()
    return j, rep


def normal(j, report):
    keep = {k: j[k] for k in ("levels", "stages", "current", "next", "weakest", "overdue")}
    keep["plan"] = j["plan"]["skills"] if j["plan"] else None
    if report:
        keep["report"] = {k: report[k] for k in ("skills", "strong", "weak", "watch", "weakest", "cues", "habits", "decisions",
                                                 "compromises", "safe", "summary", "summary_manager", "advice", "levels")}
    else:
        keep["report"] = None
    return json.loads(json.dumps(keep, sort_keys=True))


@pytest.mark.parametrize("name", list(FIXTURES))
def test_python_and_js_agree(page, tmp_path, name):
    from phishverse.content import load
    content = load()
    fx = FIXTURES[name]
    sessions = histories(content, fx)
    pj, prep = python_journey(tmp_path, content, fx, sessions)
    page.goto("about:blank")
    page.add_script_tag(path=str(ROOT / "web" / "js" / "content-data.js"))
    page.add_script_tag(path=str(ROOT / "web" / "js" / "rules.js"))
    program = {"levels": fx["levels"], "due": "2099-12-31", "pass_mark": 70, "allow_watch_training": fx.get("watch", True),
               "created_at": PROGRAM_START}
    jj = page.evaluate("([p, s]) => PVRules.journey(PV_CONTENT, PV_CONTENT.skills, p, s, null, '2026-01-01')", [program, sessions])
    py, js = normal(pj, prep), normal(jj, jj["report"])
    assert py == js
    if name == "full baseline, mixed":  # make sure the fixture really exercises the report
        assert py["report"]["weak"] and py["report"]["cues"] and py["current"] == "training"
    if name == "replays after a report":
        assert py["report"]["levels"]["orientation"] == 40  # the first try (1 + 0 + .6 + 0) / 4, not the perfect replay
