"""Training data: state, assignments, config, progress. Plus the app-wide API guards."""
import json
import re

from flask import Blueprint, jsonify, request

from .auth import err, require_user
from .db import get_db, now_ms

bp = Blueprint("api", __name__, url_prefix="/api")

LEVEL_IDS = ["orientation", "inbox", "signals", "access", "executive"]
OUTCOMES = {"safe", "acceptable", "false_alarm", "compromise"}
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
DEFAULT_CONFIG = {"defaultLevels": ["orientation", "inbox"], "defaultDueDays": 14}


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
    levels = [l for l in b.get("levels", []) if l in LEVEL_IDS]
    if not levels:
        return err("Pick at least one module.")
    due = str(b.get("due", ""))
    if due and not DATE_RE.match(due):
        return err("Due date must look like 2026-10-31.")
    data = {"levels": levels, "due": due, "note": str(b.get("note", ""))[:240],
            "assignedAt": now_ms(), "by": u["id"]}
    db.execute("INSERT OR REPLACE INTO assignments (user_id,data) VALUES (?,?)", (uid, json.dumps(data)))
    db.commit()
    return jsonify(data)


@bp.delete("/assignments/<uid>")
def delete_assignment(uid):
    _u, e = require_user("manager")
    if e:
        return e
    db = get_db()
    db.execute("DELETE FROM assignments WHERE user_id=?", (uid,))
    db.commit()
    return jsonify({"ok": True})


@bp.put("/config")
def put_config():
    _u, e = require_user("manager")
    if e:
        return e
    b = request.get_json(silent=True) or {}
    levels = [l for l in b.get("defaultLevels", []) if l in LEVEL_IDS]
    try:
        days = max(1, min(90, int(b.get("defaultDueDays", 14))))
    except (TypeError, ValueError):
        days = 14
    data = {"defaultLevels": levels, "defaultDueDays": days}
    db = get_db()
    db.execute("INSERT OR REPLACE INTO config (id,data) VALUES (1,?)", (json.dumps(data),))
    db.commit()
    return jsonify(data)


def clamp_int(value, lo, hi):
    """int(value) clamped to [lo, hi]; anything that isn't a number counts as 0."""
    try:
        n = int(value or 0)
    except (TypeError, ValueError, OverflowError):
        n = 0
    return max(lo, min(hi, n))


def clean_progress(levels_in):
    """Keep known levels only, clamp numbers, drop unknown outcomes."""
    clean = {}
    for lid, L in levels_in.items():
        if lid not in LEVEL_IDS or not isinstance(L, dict):
            continue
        outs = {str(k)[:20]: v for k, v in (L.get("outcomes") or {}).items() if v in OUTCOMES}
        num = lambda k, lo, hi: clamp_int(L.get(k), lo, hi)
        clean[lid] = {"best": num("best", 0, 100), "last": num("last", 0, 100), "stars": num("stars", 0, 3),
                      "done": bool(L.get("done")), "attempts": num("attempts", 0, 10000),
                      "completedAt": num("completedAt", 0, 10**14), "timeMs": num("timeMs", 0, 10**9),
                      "outcomes": outs}
    return clean


@bp.put("/progress")
def put_progress():
    u, e = require_user()
    if e:
        return e
    b = request.get_json(silent=True) or {}
    levels_in = b.get("levels") or {}
    if not isinstance(levels_in, dict):
        return err("Bad progress data.")
    data = {"levels": clean_progress(levels_in), "lastActive": now_ms()}
    db = get_db()
    db.execute("INSERT OR REPLACE INTO progress (user_id,data) VALUES (?,?)", (u["id"], json.dumps(data)))
    db.commit()
    return jsonify(data)
