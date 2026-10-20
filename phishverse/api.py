"""Training data: state and config. Plus the app-wide API guards. Programs live in journey.py.

Level ids come from content/levels.json; progress is written by sessions.py when a level is finished."""
import json

from flask import Blueprint, current_app, jsonify, request

from .auth import err, require_user
from .db import get_db
from . import journey as journey_mod

bp = Blueprint("api", __name__, url_prefix="/api")

def level_ids():
    return current_app.extensions["pv_content"].level_ids


def default_config(content):
    """New databases auto-assign the first two levels, due in 14 days."""
    return {"defaultLevels": content.level_ids[:2], "defaultDueDays": 14}


@bp.before_app_request
def csrf_guard():
    # Mutating API calls must be JSON (browsers can't send that cross-site without CORS).
    if request.path.startswith("/api/") and request.method in ("POST", "PUT", "DELETE"):
        if not request.is_json:
            return err("Expected a JSON request.", 415)


@bp.after_app_request
def no_cache_api(resp):
    if request.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


def member_json(u):
    return {"name": u["name"], "dept": u["dept"], "joinedAt": u["joined_at"], "role": u["role"]}


def load_json(table, uid):
    # table is always a literal from this module, never user input.
    row = get_db().execute(f"SELECT data FROM {table} WHERE user_id=?", (uid,)).fetchone()
    return json.loads(row["data"]) if row else None


def get_config():
    row = get_db().execute("SELECT data FROM config WHERE id=1").fetchone()
    return json.loads(row["data"]) if row else {"defaultLevels": [], "defaultDueDays": 14}


@bp.get("/health")
def health():
    return jsonify({"ok": True})


@bp.get("/state")
def state():
    u, e = require_user()
    if e:
        return e
    db = get_db()
    content = current_app.extensions["pv_content"]
    mine = journey_mod.journey(db, content, u)
    out = {
        "config": get_config(),
        "myMember": member_json(u),
        # the auto plan stays implicit (id None) until it's stored; the portal derives it from config
        "myAssign": journey_mod.assignment_json(mine["program"]) if mine["program"] and mine["program"]["id"] else None,
        "myProg": load_json("progress", u["id"]),
        "myJourney": mine,
    }
    if u["role"] == "manager":
        users = db.execute("SELECT * FROM users").fetchall()
        out["members"] = {r["id"]: member_json(r) for r in users}
        out["journeys"] = {r["id"]: journey_mod.journey_summary(journey_mod.journey(db, content, r)) for r in users}
        out["assignments"] = {r["user_id"]: journey_mod.assignment_json(journey_mod.program_json(r))
                              for r in db.execute("SELECT * FROM programs WHERE status='active'")}
        out["progress"] = {r["user_id"]: json.loads(r["data"]) for r in db.execute("SELECT * FROM progress")}
    db.commit()  # journeys may have written a report that was due
    return jsonify(out)


@bp.put("/config")
def put_config():
    _u, e = require_user("manager")
    if e:
        return e
    b = request.get_json(silent=True) or {}
    levels = [l for l in b.get("defaultLevels", []) if l in level_ids()]
    try:
        days = max(1, min(90, int(b.get("defaultDueDays", 14))))
    except (TypeError, ValueError):
        days = 14
    data = {"defaultLevels": levels, "defaultDueDays": days}
    db = get_db()
    db.execute("INSERT OR REPLACE INTO config (id,data) VALUES (1,?)", (json.dumps(data),))
    db.commit()
    return jsonify(data)
