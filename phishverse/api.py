"""Training data: state, assignments, config. Plus the app-wide API guards.

Level ids come from content/levels.json; progress is written by sessions.py when a level is finished."""
import json
import re

from flask import Blueprint, current_app, jsonify, request

from .auth import err, require_user
from .db import get_db, now_ms
from .events import record_event

bp = Blueprint("api", __name__, url_prefix="/api")

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


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
    out = {
        "config": get_config(),
        "myMember": member_json(u),
        "myAssign": load_json("assignments", u["id"]),
        "myProg": load_json("progress", u["id"]),
    }
    if u["role"] == "manager":
        out["members"] = {r["id"]: member_json(r) for r in db.execute("SELECT * FROM users")}
        out["assignments"] = {r["user_id"]: json.loads(r["data"]) for r in db.execute("SELECT * FROM assignments")}
        out["progress"] = {r["user_id"]: json.loads(r["data"]) for r in db.execute("SELECT * FROM progress")}
    return jsonify(out)


@bp.put("/assignments/<uid>")
def put_assignment(uid):
    u, e = require_user("manager")
    if e:
        return e
    db = get_db()
    if not db.execute("SELECT 1 FROM users WHERE id=?", (uid,)).fetchone():
        return err("No such team member.", 404)
    b = request.get_json(silent=True) or {}
    levels = [l for l in b.get("levels", []) if l in level_ids()]
    if not levels:
        return err("Pick at least one module.")
    due = str(b.get("due", ""))
    if due and not DATE_RE.match(due):
        return err("Due date must look like 2026-10-31.")
    data = {"levels": levels, "due": due, "note": str(b.get("note", ""))[:240],
            "assignedAt": now_ms(), "by": u["id"]}
    db.execute("INSERT OR REPLACE INTO assignments (user_id,data) VALUES (?,?)", (uid, json.dumps(data)))
    record_event(db, uid, "assigned", {"levels": levels, "due": due, "note": data["note"], "by": u["id"]})
    db.commit()
    return jsonify(data)


@bp.delete("/assignments/<uid>")
def delete_assignment(uid):
    u, e = require_user("manager")
    if e:
        return e
    db = get_db()
    if db.execute("DELETE FROM assignments WHERE user_id=?", (uid,)).rowcount:
        record_event(db, uid, "unassigned", {"by": u["id"]})
    db.commit()
    return jsonify({"ok": True})


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
