"""
Team activity: one log (the activity table), one writer (record_event), and live delivery.

  record_event(conn, user_id, kind, data)   the only way events are written
  GET  /api/events     Server-Sent Events. Managers get every event; employees only events about
                       themselves. Heartbeat ("ping") every 15 s; resumes from Last-Event-ID.
  GET  /api/activity   recent events (newest first), or ?after=<id> (oldest first) for polling clients
  POST /api/nudges     manager sends a reminder; one per person per 10 minutes

Streams don't share state with requests: each one reads the activity table by id. A request that
records an event wakes the streams once its transaction has committed (see notify_after_request).
"""
import json
import threading

from flask import Blueprint, Response, current_app, g, jsonify, request

from . import auth  # module reference: auth also imports record_event from here
from .db import connect, get_db, now_ms

bp = Blueprint("events", __name__, url_prefix="/api")

KINDS = {"joined", "assigned", "unassigned", "level_started", "level_finished", "nudge_sent", "report_ready", "plan_updated",
         "training_started", "training_progress", "training_completed"}
NUDGE_MAX_CHARS = 140
NUDGE_INTERVAL_MS = 10 * 60 * 1000
PAGE = 100


class Broker:
    """Wakes waiting streams. Holds no events itself, only a change counter."""

    def __init__(self):
        self._cond = threading.Condition()
        self.seq = 0

    def notify(self):
        with self._cond:
            self.seq += 1
            self._cond.notify_all()

    def wait(self, seen, timeout):
        """Block until seq != seen or the timeout passes; return the current seq."""
        with self._cond:
            self._cond.wait_for(lambda: self.seq != seen, timeout)
            return self.seq


def init_app(app):
    app.extensions["pv_broker"] = Broker()
    app.config.setdefault("EVENTS_HEARTBEAT", 15.0)

    @app.teardown_request
    def notify_after_request(_exc):
        if g.pop("pv_events_pending", False):
            app.extensions["pv_broker"].notify()


def record_event(conn, user_id, kind, data=None, created_at=None):
    """Write one activity row. Streams are woken after the current request finishes (and has committed)."""
    if kind not in KINDS:
        raise ValueError(f"unknown event kind {kind!r}")
    cur = conn.execute("INSERT INTO activity (user_id,kind,data_json,created_at) VALUES (?,?,?,?)",
                       (user_id, kind, json.dumps(data or {}), created_at or now_ms()))
    try:
        g.pv_events_pending = True
    except RuntimeError:  # outside a request (seed, CLI): nobody is listening
        pass
    return cur.lastrowid


# ---------------------------------------------------------------- reading
def visible_sql(user):
    """WHERE clause + params: managers see the team, employees see events about themselves."""
    if user["role"] == "manager":
        return "1=1", ()
    return "a.user_id=?", (user["id"],)


def event_json(r):
    return {"id": r["id"], "kind": r["kind"], "user_id": r["user_id"], "name": r["name"],
            "data": json.loads(r["data_json"]), "created_at": r["created_at"]}


def events_after(conn, user, after_id, limit=PAGE):
    where, params = visible_sql(user)
    rows = conn.execute(f"SELECT a.*, u.name FROM activity a LEFT JOIN users u ON u.id=a.user_id "
                        f"WHERE a.id>? AND {where} ORDER BY a.id LIMIT ?", (after_id, *params, limit))
    return [event_json(r) for r in rows]


def latest_id(conn):
    return conn.execute("SELECT COALESCE(MAX(id),0) FROM activity").fetchone()[0]


def sse(ev):
    return f"id: {ev['id']}\ndata: {json.dumps(ev, separators=(',', ':'))}\n\n"


def resume_point(conn):
    """Last-Event-ID header (browser reconnects) > ?last_id= (first connect) > now (no history)."""
    for raw in (request.headers.get("Last-Event-ID"), request.args.get("last_id")):
        if raw is not None:
            try:
                return max(0, int(raw))
            except ValueError:
                pass
    return latest_id(conn)


@bp.get("/events")
def stream():
    u, e = auth.require_user()
    if e:
        return e
    user = {"id": u["id"], "role": u["role"]}
    db_path = current_app.config["DB_PATH"]
    broker = current_app.extensions["pv_broker"]
    heartbeat = float(current_app.config["EVENTS_HEARTBEAT"])
    c = connect(db_path)
    try:
        last = resume_point(c)
    finally:
        c.close()

    def gen():
        conn = connect(db_path)
        cursor = last
        try:
            yield f"retry: 3000\n: connected as {user['role']}\n\n"
            while True:
                seen = broker.seq  # read before querying, so a commit in between still wakes us
                batch = events_after(conn, user, cursor)
                for ev in batch:
                    cursor = ev["id"]
                    yield sse(ev)
                if batch:
                    continue
                if broker.wait(seen, heartbeat) == seen:
                    yield f"event: ping\ndata: {now_ms()}\n\n"
        finally:
            conn.close()

    return Response(gen(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no", "Connection": "keep-alive"})


@bp.get("/activity")
def activity():
    u, e = auth.require_user()
    if e:
        return e
    conn = get_db()
    after = request.args.get("after")
    if after is not None:  # polling fallback: everything after an id, oldest first
        try:
            after = max(0, int(after))
        except ValueError:
            return auth.err("after must be an event id.")
        return jsonify({"events": events_after(conn, u, after), "latest_id": latest_id(conn)})
    try:
        limit = max(1, min(PAGE, int(request.args.get("limit", 30))))
    except ValueError:
        limit = 30
    where, params = visible_sql(u)
    rows = conn.execute(f"SELECT a.*, u.name FROM activity a LEFT JOIN users u ON u.id=a.user_id WHERE {where} "
                        f"ORDER BY a.id DESC LIMIT ?", (*params, limit))
    return jsonify({"events": [event_json(r) for r in rows], "latest_id": latest_id(conn)})


# ---------------------------------------------------------------- nudges
@bp.post("/nudges")
def nudge():
    u, e = auth.require_user("manager")
    if e:
        return e
    b = request.get_json(silent=True) or {}
    conn = get_db()
    target = conn.execute("SELECT id, name FROM users WHERE id=?", (str(b.get("user_id", "")),)).fetchone()
    if not target:
        return auth.err("No such team member.", 404)
    if target["id"] == u["id"]:
        return auth.err("You can't send a reminder to yourself.")
    message = b.get("message", "")
    if not isinstance(message, str):
        return auth.err("The message must be text.")
    message = " ".join(message.split())
    if len(message) > NUDGE_MAX_CHARS:
        return auth.err(f"Keep the message to {NUDGE_MAX_CHARS} characters or fewer.")
    last = conn.execute("SELECT created_at FROM activity WHERE user_id=? AND kind='nudge_sent' ORDER BY id DESC LIMIT 1",
                        (target["id"],)).fetchone()
    now = now_ms()
    if last and now - last[0] < NUDGE_INTERVAL_MS:
        wait_min = max(1, -(-(NUDGE_INTERVAL_MS - (now - last[0])) // 60000))
        r = jsonify({"error": f"{target['name'].split()[0]} already got a reminder recently. "
                              f"You can send another in {wait_min} min.", "retry_after_s": wait_min * 60})
        r.headers["Retry-After"] = str(wait_min * 60)
        return r, 429
    eid = record_event(conn, target["id"], "nudge_sent", {"message": message, "by": u["id"], "by_name": u["name"]}, now)
    conn.commit()
    return jsonify({"id": eid, "user_id": target["id"], "message": message, "created_at": now}), 201

