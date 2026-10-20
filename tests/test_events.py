import json
import time

import pytest

from phishverse import db
from phishverse.events import NUDGE_INTERVAL_MS, record_event
from phishverse.seed import seed_demo


class Stream:
    """Reads /api/events one SSE block at a time (the server yields whole blocks)."""

    def __init__(self, client, query="", headers=None):
        self.resp = client.get("/api/events" + query, headers=headers or {}, buffered=False)
        assert self.resp.status_code == 200, self.resp.status_code
        assert self.resp.mimetype == "text/event-stream"
        self.it = iter(self.resp.response)
        preamble = self.block()
        assert preamble["retry"] == "3000"

    def block(self):
        raw = next(self.it).decode()
        fields = {}
        for line in raw.strip("\n").split("\n"):
            if line.startswith(":"):
                continue
            k, _, v = line.partition(": ")
            fields[k] = v
        return fields

    def next_event(self, max_pings=3):
        """The next real event, skipping up to max_pings heartbeats; None if only heartbeats arrive."""
        for _ in range(max_pings + 1):
            b = self.block()
            if b.get("event") == "ping":
                continue
            ev = json.loads(b["data"])
            assert int(b["id"]) == ev["id"]
            return ev
        return None

    def close(self):
        self.resp.close()


@pytest.fixture
def two_employees(make_user, sign_in):
    make_user("asha@novacorp.local", name="Asha Rao")
    make_user("ben@novacorp.local", name="Ben Joseph")
    return sign_in("asha@novacorp.local"), sign_in("ben@novacorp.local")


def user_id(client):
    return client.get("/api/me").get_json()["id"]


# ---------------------------------------------------------------- delivery and visibility
def test_employee_action_reaches_manager_not_other_employee(manager, two_employees):
    asha, ben = two_employees
    m, b = Stream(manager), Stream(ben)
    asha.post("/api/sessions", json={"level_id": "inbox"})
    ev = m.next_event()
    assert ev["kind"] == "level_started" and ev["name"] == "Asha Rao" and ev["data"]["level_id"] == "inbox"
    assert b.next_event(max_pings=2) is None  # only heartbeats for Ben
    m.close()
    b.close()


def test_employee_gets_events_about_themselves(manager, two_employees):
    asha, ben = two_employees
    a = Stream(asha)
    manager.put(f"/api/assignments/{user_id(ben)}", json={"levels": ["inbox"]})
    manager.put(f"/api/assignments/{user_id(asha)}", json={"levels": ["orientation", "inbox"], "due": "2026-12-01"})
    ev = a.next_event()
    assert ev["kind"] == "assigned" and ev["user_id"] == user_id(asha)  # Ben's assignment never arrives
    assert ev["data"]["levels"] == ["orientation", "inbox"] and ev["data"]["due"] == "2026-12-01"
    a.close()


def test_finish_event_carries_score(manager, employee, play):
    c, uid = employee
    m = Stream(manager)
    play(c, "orientation", {"sticky": "acceptable"})
    kinds = [m.next_event() for _ in range(2)]
    assert [e["kind"] for e in kinds] == ["level_started", "level_finished"]
    assert kinds[1]["data"]["score"] == 90 and kinds[1]["data"]["stars"] == 3 and kinds[1]["user_id"] == uid
    m.close()


def test_heartbeat(manager):
    m = Stream(manager)
    t0 = time.time()
    b = m.block()
    assert b["event"] == "ping" and time.time() - t0 < 1.0  # heartbeat is 0.2 s in tests, 15 s by default
    m.close()


def test_default_heartbeat_is_15s(tmp_path):
    from phishverse import create_app
    app = create_app({"DB_PATH": str(tmp_path / "h.db"), "TESTING": True})
    assert app.config["EVENTS_HEARTBEAT"] == 15.0


def test_new_stream_starts_now_without_history(manager, employee):
    c, _ = employee
    c.post("/api/sessions", json={"level_id": "inbox"})  # before connecting
    m = Stream(manager)
    assert m.next_event(max_pings=1) is None
    m.close()


def test_last_event_id_replays_missed_events(manager, employee):
    c, uid = employee
    first = manager.put(f"/api/assignments/{uid}", json={"levels": ["inbox"]})
    assert first.status_code == 200
    latest = manager.get("/api/activity?limit=1").get_json()["events"][0]["id"]
    c.post("/api/sessions", json={"level_id": "inbox"})
    manager.delete(f"/api/assignments/{uid}", json={})
    m = Stream(manager, headers={"Last-Event-ID": str(latest)})  # what a browser sends when it reconnects
    assert [m.next_event()["kind"] for _ in range(2)] == ["level_started", "unassigned"]
    m.close()


def test_last_id_query_and_replay_respects_visibility(manager, two_employees):
    asha, ben = two_employees
    asha.post("/api/sessions", json={"level_id": "inbox"})
    ben.post("/api/sessions", json={"level_id": "signals"})
    b = Stream(ben, "?last_id=0")
    ev = b.next_event()
    assert ev["kind"] == "joined" or ev["user_id"] == user_id(ben)
    seen = [ev] + [e for e in (b.next_event(max_pings=1) for _ in range(3)) if e]
    assert seen and all(e["user_id"] == user_id(ben) for e in seen)
    b.close()


def test_stream_needs_login(client):
    assert client.get("/api/events").status_code == 401


# ---------------------------------------------------------------- the activity feed
def test_activity_feed(manager, two_employees):
    asha, ben = two_employees
    asha.post("/api/sessions", json={"level_id": "inbox"})
    ben.post("/api/sessions", json={"level_id": "signals"})
    team = manager.get("/api/activity").get_json()
    assert [e["name"] for e in team["events"][:2]] == ["Ben Joseph", "Asha Rao"]  # newest first
    mine = asha.get("/api/activity").get_json()["events"]
    assert {e["user_id"] for e in mine} == {user_id(asha)}
    after = manager.get(f"/api/activity?after={team['events'][1]['id'] - 1}").get_json()["events"]
    assert [e["name"] for e in after] == ["Asha Rao", "Ben Joseph"]  # polling: oldest first
    assert manager.get("/api/activity?after=x").status_code == 400


def test_events_for_each_action(client, manager, content):
    r = client.post("/api/register", json={"name": "Zara Ali", "email": "zara@novacorp.local", "password": "longenough"})
    uid = r.get_json()["id"]
    manager.put(f"/api/assignments/{uid}", json={"levels": ["inbox"]})
    manager.delete(f"/api/assignments/{uid}", json={})
    manager.delete(f"/api/assignments/{uid}", json={})  # nothing left to remove: no second event
    kinds = [e["kind"] for e in reversed(manager.get("/api/activity").get_json()["events"])]
    assert kinds == ["joined", "assigned", "unassigned"]


def test_record_event_rejects_unknown_kinds(app):
    conn = db.connect(app.config["DB_PATH"])
    with pytest.raises(ValueError):
        record_event(conn, "u_x", "party_started", {})
    conn.close()


def test_seed_writes_activity(app, content, manager):
    conn = db.connect(app.config["DB_PATH"])
    seed_demo(conn, content)
    conn.close()
    kinds = [e["kind"] for e in manager.get("/api/activity?limit=100").get_json()["events"]]
    assert kinds.count("level_finished") == 5 and kinds.count("joined") == 4 and kinds.count("assigned") == 3


# ---------------------------------------------------------------- nudges
def test_nudge_reaches_employee_live(manager, two_employees):
    asha, ben = two_employees
    a, b = Stream(asha), Stream(ben)
    r = manager.post("/api/nudges", json={"user_id": user_id(asha), "message": "  Please finish   Level 2 today. "})
    assert r.status_code == 201 and r.get_json()["message"] == "Please finish Level 2 today."
    ev = a.next_event()
    assert ev["kind"] == "nudge_sent" and ev["data"]["message"] == "Please finish Level 2 today."
    assert ev["data"]["by_name"] == "Team Manager"
    assert b.next_event(max_pings=1) is None
    a.close()
    b.close()


def test_nudge_permissions(client, manager, two_employees):
    asha, ben = two_employees
    target = user_id(ben)
    assert asha.post("/api/nudges", json={"user_id": target}).status_code == 403
    assert client.post("/api/nudges", json={"user_id": target}).status_code == 401
    assert manager.post("/api/nudges", json={"user_id": "u_nobody"}).status_code == 404
    assert manager.post("/api/nudges", json={"user_id": user_id(manager)}).status_code == 400
    assert manager.post("/api/nudges", json={"user_id": target, "message": "x" * 141}).status_code == 400
    assert manager.post("/api/nudges", json={"user_id": target, "message": 5}).status_code == 400
    assert manager.post("/api/nudges", json={"user_id": target, "message": "x" * 140}).status_code == 201


def test_nudge_rate_limit(app, manager, two_employees):
    asha, ben = two_employees
    assert manager.post("/api/nudges", json={"user_id": user_id(asha)}).status_code == 201
    again = manager.post("/api/nudges", json={"user_id": user_id(asha), "message": "Second try"})
    assert again.status_code == 429
    assert again.headers["Retry-After"] == "600" and "10 min" in again.get_json()["error"]
    assert manager.post("/api/nudges", json={"user_id": user_id(ben)}).status_code == 201  # per person
    conn = db.connect(app.config["DB_PATH"])  # pretend the first nudge was 10 minutes ago
    conn.execute("UPDATE activity SET created_at=created_at-? WHERE kind='nudge_sent' AND user_id=?",
                 (NUDGE_INTERVAL_MS, user_id(asha)))
    conn.commit()
    conn.close()
    assert manager.post("/api/nudges", json={"user_id": user_id(asha)}).status_code == 201


# ---------------------------------------------------------------- connect a device
def test_connect_qr_manager_only(app, client, manager, employee):
    c, _ = employee
    assert client.get("/api/connect/qr.svg").status_code == 401
    assert c.get("/api/connect/qr.svg").status_code == 403
    assert c.get("/api/connect").status_code == 403
    assert manager.get("/api/connect").get_json()["lan"] is False
    assert manager.get("/api/connect/qr.svg").status_code == 409  # not running with --lan
    app.config["LAN_URL"] = "http://192.168.1.23:5000"
    info = manager.get("/api/connect").get_json()
    assert info == {"lan": True, "url": "http://192.168.1.23:5000", "this_url": "http://localhost"}
    r = manager.get("/api/connect/qr.svg")
    assert r.status_code == 200 and r.mimetype == "image/svg+xml"
    assert r.data.lstrip().startswith(b"<svg") and b"QR code for http://192.168.1.23:5000" in r.data


# ---------------------------------------------------------------- same account, several devices
def test_same_account_on_two_devices(employee, sign_in):
    laptop, _ = employee
    phone = sign_in("asha@novacorp.local")
    s = Stream(phone)
    assert laptop.post("/api/logout", json={}).status_code == 200
    assert laptop.get("/api/me").status_code == 401
    assert phone.get("/api/me").status_code == 200  # the other device stays signed in
    phone.post("/api/sessions", json={"level_id": "inbox"})
    assert s.next_event()["kind"] == "level_started"
    s.close()
