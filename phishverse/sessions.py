"""Play sessions and decisions: the server records every choice and does all scoring.

The client says which action it picked; the outcome, severity and score come from content.
Users only ever see their own sessions (anything else is a 404).
"""
import json
import sqlite3
import uuid

from flask import Blueprint, current_app, jsonify, request

from .auth import err, require_user
from .db import get_db, now_ms
from .events import record_event

bp = Blueprint("sessions", __name__, url_prefix="/api")

PURPOSES = ("baseline", "practice", "test")
PROGRESS_PURPOSES = ("baseline", "practice")  # final-test sessions (Stage 6) don't count as level progress
MAX_RESPONSE_MS = 60 * 60 * 1000


def content():
    return current_app.extensions["pv_content"]


def new_session_id():
    return "s_" + uuid.uuid4().hex


def clamp_int(value, lo, hi):
    """int(value) clamped to [lo, hi]; anything that isn't a number counts as 0."""
    try:
        n = int(value or 0)
    except (TypeError, ValueError, OverflowError):
        n = 0
    return max(lo, min(hi, n))


def is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


# ---------------------------------------------------------------- progress summary
def level_summary(conn, sessions):
    """Summary of one level from its finished sessions (oldest first), in the shape the portal uses."""
    best = max(sessions, key=lambda s: (s["score"], s["finished_at"], s["rowid"]))  # ties: latest wins
    latest = sessions[-1]
    outcomes = {r["task_id"]: r["outcome"] for r in
                conn.execute("SELECT task_id, outcome FROM decisions WHERE session_id=? ORDER BY id", (best["id"],))}
    return {
        "best": best["score"], "last": latest["score"], "stars": max(s["stars"] for s in sessions),
        "done": True, "attempts": len(sessions), "completedAt": latest["finished_at"],
        "timeMs": max(0, latest["finished_at"] - latest["started_at"]), "outcomes": outcomes,
    }


def refresh_progress(conn, user_id):
    """Rebuild the user's progress row from their finished sessions and return it.

    Levels with sessions are derived from them. Levels that only have a summary from before
    sessions existed (Stage 0-1 databases) keep it, so upgrading never loses results.
    """
    row = conn.execute("SELECT data FROM progress WHERE user_id=?", (user_id,)).fetchone()
    data = json.loads(row[0]) if row else {}
    levels = dict(data.get("levels") or {})
    by_level = {}
    q = (f"SELECT rowid, * FROM play_sessions WHERE user_id=? AND finished_at IS NOT NULL "
         f"AND purpose IN ({','.join('?' * len(PROGRESS_PURPOSES))}) ORDER BY finished_at, rowid")
    for s in conn.execute(q, (user_id, *PROGRESS_PURPOSES)):
        by_level.setdefault(s["level_id"], []).append(s)
    last_active = data.get("lastActive") or 0
    for level_id, sessions in by_level.items():
        levels[level_id] = level_summary(conn, sessions)
        last_active = max(last_active, sessions[-1]["finished_at"])
    data = {"levels": levels, "lastActive": last_active}
    conn.execute("INSERT OR REPLACE INTO progress (user_id,data) VALUES (?,?)", (user_id, json.dumps(data)))
    return data


# ---------------------------------------------------------------- helpers
def own_session(user, sid):
    return get_db().execute("SELECT rowid, * FROM play_sessions WHERE id=? AND user_id=?", (sid, user["id"])).fetchone()


def decision_json(r):
    return {"task_id": r["task_id"], "action_index": r["action_index"], "outcome": r["outcome"],
            "severity": r["severity"], "inspected": json.loads(r["inspected_json"]),
            "n_inspections": r["n_inspections"], "response_ms": r["response_ms"], "created_at": r["created_at"]}


def session_json(s, with_decisions=True):
    out = {"id": s["id"], "level_id": s["level_id"], "purpose": s["purpose"], "started_at": s["started_at"],
           "finished_at": s["finished_at"], "score": s["score"], "stars": s["stars"]}
    if with_decisions:
        rows = get_db().execute("SELECT * FROM decisions WHERE session_id=? ORDER BY id", (s["id"],))
        out["decisions"] = [decision_json(r) for r in rows]
    return out


def no_session():
    return err("No such session.", 404)


# ---------------------------------------------------------------- routes
@bp.post("/sessions")
def start_session():
    u, e = require_user()
    if e:
        return e
    b = request.get_json(silent=True) or {}
    level_id = b.get("level_id")
    if not isinstance(level_id, str) or not content().level(level_id):
        return err("Unknown level.")
    purpose = b.get("purpose", "baseline")
    if purpose not in PURPOSES:
        return err("Purpose must be baseline, practice or test.")
    s = {"id": new_session_id(), "level_id": level_id, "purpose": purpose, "started_at": now_ms()}
    db = get_db()
    db.execute("INSERT INTO play_sessions (id,user_id,level_id,purpose,started_at,client_version) VALUES (?,?,?,?,?,?)",
               (s["id"], u["id"], level_id, purpose, s["started_at"], str(b.get("client_version", ""))[:40]))
    record_event(db, u["id"], "level_started", {"level_id": level_id, "purpose": purpose, "session_id": s["id"]}, s["started_at"])
    db.commit()
    return jsonify(s), 201


@bp.get("/sessions/<sid>")
def get_session(sid):
    u, e = require_user()
    if e:
        return e
    s = own_session(u, sid)
    return jsonify(session_json(s)) if s else no_session()


@bp.post("/sessions/<sid>/decisions")
def add_decision(sid):
    u, e = require_user()
    if e:
        return e
    s = own_session(u, sid)
    if not s:
        return no_session()
    if s["finished_at"]:
        return err("This session is already finished. Start the level again to play another round.", 409)
    b = request.get_json(silent=True) or {}
    task = content().scored_task(s["level_id"], b.get("task_id"))
    if not task:
        return err("That isn't a scenario in this level.")
    enc = task["enc"]
    idx = b.get("action_index")
    if not is_int(idx) or not 0 <= idx < len(enc["acts"]):
        return err("Pick one of the scenario's actions.")
    inspected = b.get("inspected", [])
    if not isinstance(inspected, list) or not all(is_int(i) and 0 <= i < len(enc["inspect"]) for i in inspected):
        return err("Inspected clues must be a list of clue numbers.")
    inspected = list(dict.fromkeys(inspected))  # first time each clue was opened, in order
    act = enc["acts"][idx]
    severity = act.get("sev") if act["o"] == "compromise" else None
    db = get_db()
    try:
        db.execute("INSERT INTO decisions (session_id,task_id,action_index,outcome,severity,inspected_json,n_inspections,"
                   "response_ms,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
                   (sid, task["id"], idx, act["o"], severity, json.dumps(inspected), len(inspected),
                    clamp_int(b.get("response_ms"), 0, MAX_RESPONSE_MS), now_ms()))
        db.commit()
    except sqlite3.IntegrityError:
        return err("You've already answered this scenario in this session.", 409)
    return jsonify({"task_id": task["id"], "outcome": act["o"]}), 201


@bp.post("/sessions/<sid>/finish")
def finish_session(sid):
    u, e = require_user()
    if e:
        return e
    s = own_session(u, sid)
    if not s:
        return no_session()
    db = get_db()
    tasks = content().scored_tasks(s["level_id"])
    got = {r["task_id"]: r["outcome"] for r in db.execute("SELECT task_id, outcome FROM decisions WHERE session_id=?", (sid,))}
    if not s["finished_at"]:
        missing = [t["id"] for t in tasks if t["id"] not in got]
        if missing:
            return jsonify({"error": "Finish every scenario before ending the level.", "missing": missing}), 400
        score, stars = content().score([got[t["id"]] for t in tasks])
        done_at = now_ms()
        db.execute("UPDATE play_sessions SET finished_at=?, score=?, stars=? WHERE id=?", (done_at, score, stars, sid))
        progress = refresh_progress(db, u["id"])
        record_event(db, u["id"], "level_finished", {"level_id": s["level_id"], "purpose": s["purpose"], "score": score,
                                                     "stars": stars, "session_id": sid}, done_at)
        db.commit()
        s = own_session(u, sid)
    else:  # finishing twice (e.g. a retried request) just returns the result again
        progress = json.loads((db.execute("SELECT data FROM progress WHERE user_id=?", (u["id"],)).fetchone() or ["{}"])[0])
    return jsonify({"session": session_json(s, with_decisions=False), "score": s["score"], "stars": s["stars"],
                    "outcomes": {t["id"]: got[t["id"]] for t in tasks},
                    "progress": (progress.get("levels") or {}).get(s["level_id"])})
