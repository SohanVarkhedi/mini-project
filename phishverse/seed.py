"""Startup data: the default manager and config, plus --seed-demo sample employees."""
import json
import os
import time

from werkzeug.security import generate_password_hash

from .api import default_config
from .auth import new_user_id
from .db import now_ms
from .events import record_event
from .sessions import new_session_id, refresh_progress

DEFAULT_MANAGER = {
    "email": os.environ.get("PHISHVERSE_MANAGER_EMAIL", "manager@novacorp.local"),
    "password": os.environ.get("PHISHVERSE_MANAGER_PASSWORD", "manager123"),
    "name": "Team Manager",
}


def ensure_defaults(conn, content):
    """Create the first manager and the default config if they don't exist yet."""
    has_mgr = conn.execute("SELECT 1 FROM users WHERE role='manager' LIMIT 1").fetchone()
    if not has_mgr:
        conn.execute(
            "INSERT INTO users (id,name,email,pw_hash,role,dept,joined_at) VALUES (?,?,?,?,?,?,?)",
            (new_user_id(), DEFAULT_MANAGER["name"], DEFAULT_MANAGER["email"].lower(),
             generate_password_hash(DEFAULT_MANAGER["password"]), "manager", "Security", now_ms()),
        )
        print(f"\n  Created manager account: {DEFAULT_MANAGER['email']} / {DEFAULT_MANAGER['password']}")
        print("  (change it with: python server.py --set-manager-password NEWPASSWORD)\n")
    if not conn.execute("SELECT 1 FROM config WHERE id=1").fetchone():
        conn.execute("INSERT INTO config (id,data) VALUES (1,?)", (json.dumps(default_config(content)),))
    conn.commit()


def set_manager_password(conn, password):
    conn.execute("UPDATE users SET pw_hash=? WHERE role='manager'", (generate_password_hash(password),))
    conn.commit()


def record_play(conn, content, user_id, level_id, outcomes, finished_at, purpose="baseline"):
    """Store a finished play exactly as the API would: one session, one decision per scenario.

    For each scenario the first action with the wanted outcome is used, and the clues opened
    reflect how careful the choice was (safe: every clue; acceptable/false alarm: one; compromise: none).
    """
    tasks = content.scored_tasks(level_id)
    started = finished_at - 60000 * (2 + 2 * len(tasks))
    sid = new_session_id()
    conn.execute("INSERT INTO play_sessions (id,user_id,level_id,purpose,started_at,client_version) VALUES (?,?,?,?,?,?)",
                 (sid, user_id, level_id, purpose, started, "seed"))
    picked = []
    for i, t in enumerate(tasks):
        enc, want = t["enc"], outcomes[t["id"]]
        idx = next(k for k, a in enumerate(enc["acts"]) if a["o"] == want)
        act = enc["acts"][idx]
        n = {"safe": len(enc["inspect"]), "compromise": 0}.get(want, 1)
        inspected = list(range(n))
        conn.execute("INSERT INTO decisions (session_id,task_id,action_index,outcome,severity,inspected_json,n_inspections,"
                     "response_ms,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
                     (sid, t["id"], idx, want, act.get("sev") if want == "compromise" else None, json.dumps(inspected),
                      n, 8000 + 3500 * n + 1500 * i, started + 60000 * (2 + 2 * i)))
        picked.append(want)
    score, stars = content.score(picked)
    conn.execute("UPDATE play_sessions SET finished_at=?, score=?, stars=? WHERE id=?", (finished_at, score, stars, sid))
    record_event(conn, user_id, "level_started", {"level_id": level_id, "purpose": purpose, "session_id": sid}, started)
    record_event(conn, user_id, "level_finished", {"level_id": level_id, "purpose": purpose, "score": score, "stars": stars,
                                                   "session_id": sid}, finished_at)
    return sid


def seed_demo(conn, content):
    t = now_ms()
    day = 86400000
    hour = 3600000
    people = [
        ("aarav@novacorp.local", "Aarav Mehta", "Sales"),
        ("sara@novacorp.local", "Sara Khan", "Finance"),
        ("rohan@novacorp.local", "Rohan Das", "Engineering"),
        ("meera@novacorp.local", "Meera Iyer", "People & HR"),
    ]
    ids = {}
    for email, name, dept in people:
        row = conn.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()
        if row:
            ids[email] = row[0]
            continue
        uid = new_user_id()
        ids[email] = uid
        conn.execute("INSERT INTO users (id,name,email,pw_hash,role,dept,joined_at) VALUES (?,?,?,?,?,?,?)",
                     (uid, name, email, generate_password_hash("demo1234"), "employee", dept, t - 10 * day))
        record_event(conn, uid, "joined", {"dept": dept}, t - 10 * day)

    def due(days):
        return time.strftime("%Y-%m-%d", time.localtime((t + days * day) / 1000))

    assigns = {
        "aarav@novacorp.local": {"levels": ["orientation", "inbox", "signals"], "due": due(5), "note": "Please finish before the quarterly review."},
        "sara@novacorp.local": {"levels": list(content.level_ids), "due": due(-2), "note": ""},
        "rohan@novacorp.local": {"levels": ["orientation", "inbox"], "due": due(10), "note": ""},
    }
    # (level, outcome per scenario, finished at)
    plays = {
        "aarav@novacorp.local": [
            ("orientation", {"usb": "safe", "qr": "safe", "sticky": "acceptable", "laptop": "safe"}, t - 2 * day),
            ("inbox", {"e1": "safe", "e2": "compromise", "e3": "safe", "e4": "safe", "e5": "false_alarm", "e6": "safe"}, t - hour),
        ],
        "sara@novacorp.local": [
            ("orientation", {"usb": "safe", "qr": "safe", "sticky": "safe", "laptop": "safe"}, t - 4 * day),
        ],
        "rohan@novacorp.local": [
            ("orientation", {"usb": "compromise", "qr": "compromise", "sticky": "safe", "laptop": "acceptable"}, t - 2 * day),
            ("inbox", {"e1": "safe", "e2": "safe", "e3": "safe", "e4": "safe", "e5": "safe", "e6": "acceptable"}, t - 8 * hour),
        ],
    }
    for email, a in assigns.items():
        a.update({"assignedAt": t - 5 * day, "by": "seed"})
        had = conn.execute("SELECT 1 FROM assignments WHERE user_id=?", (ids[email],)).fetchone()
        conn.execute("INSERT OR REPLACE INTO assignments (user_id,data) VALUES (?,?)", (ids[email], json.dumps(a)))
        if not had:
            record_event(conn, ids[email], "assigned", {"levels": a["levels"], "due": a["due"], "note": a["note"], "by": "seed"},
                         t - 5 * day)
    for email, runs in plays.items():
        for level_id, outcomes, finished_at in runs:
            exists = conn.execute("SELECT 1 FROM play_sessions WHERE user_id=? AND level_id=? AND finished_at IS NOT NULL",
                                  (ids[email], level_id)).fetchone()
            if not exists:  # re-running --seed-demo doesn't add duplicate plays
                record_play(conn, content, ids[email], level_id, outcomes, finished_at)
        refresh_progress(conn, ids[email])
    conn.commit()
    print("  Added sample employees (password for all: demo1234):")
    for email, name, _ in people:
        print(f"    {name:<12} {email}")
    print()
