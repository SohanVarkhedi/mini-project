"""Training routes: start an attempt, answer rounds (graded here), complete. Owner only; managers read.

  GET  /api/training                         my plan's simulations and progress
  POST /api/training/<sim_id>/start          new attempt: rounds without answers (shuffled after the first try)
  POST /api/training/<sim_id>/rounds         {attempt_id, round, answer} -> correct, score, explanation
  POST /api/training/<sim_id>/complete       {attempt_id} -> pct, mastered (>= 80%), plan_done
  GET  /api/people/<uid>/training            manager view of someone's progress
"""
import json
import uuid

from flask import Blueprint, current_app, jsonify, request

from . import auth
from . import journey as jy
from .db import get_db, now_ms
from .events import record_event
from .training import MASTERY, attempt_pct, build_attempt, client_round, grade_round, shown_detail, to_canonical

bp = Blueprint("training", __name__, url_prefix="/api")


def content():
    return current_app.extensions["pv_content"]


def plan_context(conn, user):
    """(program, plan sim ids) for the user's current program, or (None, [])."""
    j = jy.journey(conn, content(), user)
    if not j["program"] or not j.get("training"):
        return j["program"], []
    return j["program"], [s["id"] for s in j["training"]["sims"]]


def training_json(conn, user):
    j = jy.journey(conn, content(), user)
    conn.commit()
    return {"program_id": j["program"]["id"] if j["program"] else None, **(j.get("training") or {"sims": [], "mastered": 0, "total": 0})}


@bp.get("/training")
def my_training():
    u, e = auth.require_user()
    return e if e else jsonify(training_json(get_db(), u))


@bp.get("/people/<uid>/training")
def person_training(uid):
    person, e = jy.person_or_error(uid)
    return e if e else jsonify(training_json(get_db(), person))


def own_attempt(conn, u, sim_id, attempt_id):
    return conn.execute("SELECT * FROM training_attempts WHERE id=? AND user_id=? AND sim_id=?",
                        (str(attempt_id), u["id"], sim_id)).fetchone()


@bp.post("/training/<sim_id>/start")
def start(sim_id):
    u, e = auth.require_user()
    if e:
        return e
    conn = get_db()
    prog, sims = plan_context(conn, u)
    if sim_id not in sims:
        return auth.err("That simulation isn't in your training plan.", 404)
    sim = content().sims[sim_id]
    tried = conn.execute("SELECT COUNT(*) FROM training_attempts WHERE user_id=? AND program_id=? AND sim_id=?",
                         (u["id"], prog["id"], sim_id)).fetchone()[0]
    plan = build_attempt(sim, shuffle=tried > 0, seed=uuid.uuid4().int)  # retries shuffle rounds and options
    aid = "ta_" + uuid.uuid4().hex
    conn.execute("INSERT INTO training_attempts (id,user_id,program_id,sim_id,plan_json,started_at) VALUES (?,?,?,?,?,?)",
                 (aid, u["id"], prog["id"], sim_id, json.dumps(plan), now_ms()))
    conn.commit()
    return jsonify({"attempt_id": aid, "attempt": tried + 1, "sim": {
        "id": sim["id"], "skill": sim["skill"], "title": sim["title"], "minutes": sim["minutes"], "intro": sim["intro"],
        "recap": sim["recap"], "sources": sim["sources"], "rounds": [client_round(sim, entry) for entry in plan]}}), 201


@bp.post("/training/<sim_id>/rounds")
def answer(sim_id):
    u, e = auth.require_user()
    if e:
        return e
    conn = get_db()
    b = request.get_json(silent=True) or {}
    a = own_attempt(conn, u, sim_id, b.get("attempt_id"))
    if not a:
        return auth.err("No such training attempt.", 404)
    if a["finished_at"]:
        return auth.err("This attempt is finished. Start again to play another round.", 409)
    plan, answers = json.loads(a["plan_json"]), json.loads(a["answers_json"])
    i = b.get("round")
    if isinstance(i, bool) or not isinstance(i, int) or not 0 <= i < len(plan):
        return auth.err("Unknown round.")
    if str(i) in answers:
        return auth.err("You've already answered this round.", 409)
    sim, entry = content().sims[sim_id], plan[i]
    try:
        canonical = to_canonical(sim, entry, b.get("answer"))
    except ValueError as ex:
        return auth.err(f"That answer doesn't fit this round ({ex}).")
    result = grade_round(sim["rounds"][entry["r"]], canonical)
    first_ever = not conn.execute("SELECT 1 FROM training_attempts WHERE user_id=? AND program_id=? AND answers_json!='{}'",
                                  (u["id"], a["program_id"])).fetchone()
    answers[str(i)] = {"answer": canonical, "score": result["score"]}
    conn.execute("UPDATE training_attempts SET answers_json=? WHERE id=?", (json.dumps(answers), a["id"]))
    if first_ever:
        record_event(conn, u["id"], "training_started", {"program_id": a["program_id"], "sim_id": sim_id, "title": sim["title"]})
    conn.commit()
    return jsonify({"round": i, **shown_detail(sim["rounds"][entry["r"]], entry, result)})


@bp.post("/training/<sim_id>/complete")
def complete(sim_id):
    u, e = auth.require_user()
    if e:
        return e
    conn = get_db()
    b = request.get_json(silent=True) or {}
    a = own_attempt(conn, u, sim_id, b.get("attempt_id"))
    if not a:
        return auth.err("No such training attempt.", 404)
    plan, answers = json.loads(a["plan_json"]), json.loads(a["answers_json"])
    if len(answers) != len(plan):
        return jsonify({"error": "Answer every round first.", "missing": [i for i in range(len(plan)) if str(i) not in answers]}), 400
    pct = attempt_pct([answers[str(i)]["score"] for i in range(len(plan))])
    sim, now = content().sims[sim_id], now_ms()
    if not a["finished_at"]:
        conn.execute("UPDATE training_attempts SET finished_at=?, pct=? WHERE id=?", (now, pct, a["id"]))
        conn.execute("INSERT INTO training_progress (user_id,program_id,sim_id,attempts,best_pct,completed_at) VALUES (?,?,?,1,?,?) "
                     "ON CONFLICT(user_id,program_id,sim_id) DO UPDATE SET attempts=attempts+1, best_pct=MAX(best_pct,excluded.best_pct), "
                     "completed_at=COALESCE(completed_at, excluded.completed_at)",
                     (u["id"], a["program_id"], sim_id, pct, now if pct >= MASTERY else None))
        record_event(conn, u["id"], "training_progress", {"program_id": a["program_id"], "sim_id": sim_id, "title": sim["title"],
                                                         "skill": sim["skill"], "pct": pct, "mastered": pct >= MASTERY})
    j = jy.journey(conn, content(), u)
    t = j.get("training") or {"mastered": 0, "total": 0}
    plan_done = t["total"] > 0 and t["mastered"] == t["total"]
    plan_finished = False  # this attempt finished the plan
    if plan_done and not conn.execute("SELECT 1 FROM activity WHERE user_id=? AND kind='training_completed' AND data_json LIKE ?",
                                      (u["id"], f'%"{a["program_id"]}"%')).fetchone():
        record_event(conn, u["id"], "training_completed", {"program_id": a["program_id"], "simulations": t["total"]})
        plan_finished = True
    conn.commit()
    row = conn.execute("SELECT * FROM training_progress WHERE user_id=? AND program_id=? AND sim_id=?",
                       (u["id"], a["program_id"], sim_id)).fetchone()
    return jsonify({"pct": pct, "mastered": pct >= MASTERY, "best_pct": row["best_pct"], "attempts": row["attempts"],
                    "sim_mastered": row["completed_at"] is not None, "plan_done": plan_done, "plan_finished": plan_finished, "next": j["next"]})
