"""Startup data: the default manager and config, plus --seed-demo sample employees."""
import json
import os
import time

from werkzeug.security import generate_password_hash

from .api import DEFAULT_CONFIG, LEVEL_IDS
from .auth import new_user_id
from .db import now_ms

DEFAULT_MANAGER = {
    "email": os.environ.get("PHISHVERSE_MANAGER_EMAIL", "manager@novacorp.local"),
    "password": os.environ.get("PHISHVERSE_MANAGER_PASSWORD", "manager123"),
    "name": "Team Manager",
}


def ensure_defaults(conn):
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
        conn.execute("INSERT INTO config (id,data) VALUES (1,?)", (json.dumps(DEFAULT_CONFIG),))
    conn.commit()


def set_manager_password(conn, password):
    conn.execute("UPDATE users SET pw_hash=? WHERE role='manager'", (generate_password_hash(password),))
    conn.commit()


def seed_demo(conn):
    t = now_ms()
    day = 86400000
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

    def due(days):
        return time.strftime("%Y-%m-%d", time.localtime((t + days * day) / 1000))

    def lv(best, outs):
        return {"best": best, "last": best, "stars": 3 if best >= 90 else 2 if best >= 70 else 1, "done": True,
                "attempts": 1, "completedAt": t - 2 * day, "outcomes": outs}

    assigns = {
        "aarav@novacorp.local": {"levels": ["orientation", "inbox", "signals"], "due": due(5), "note": "Please finish before the quarterly review."},
        "sara@novacorp.local": {"levels": LEVEL_IDS, "due": due(-2), "note": ""},
        "rohan@novacorp.local": {"levels": ["orientation", "inbox"], "due": due(10), "note": ""},
    }
    progress = {
        "aarav@novacorp.local": {"levels": {"orientation": lv(85, {"usb": "safe", "qr": "safe", "sticky": "acceptable", "laptop": "safe"}),
                                            "inbox": lv(73, {"e1": "safe", "e2": "compromise", "e3": "safe", "e4": "safe", "e5": "false_alarm", "e6": "safe"})},
                                 "lastActive": t - 3600000},
        "sara@novacorp.local": {"levels": {"orientation": lv(100, {"usb": "safe", "qr": "safe", "sticky": "safe", "laptop": "safe"})}, "lastActive": t - 4 * day},
        "rohan@novacorp.local": {"levels": {"orientation": lv(55, {"usb": "compromise", "qr": "compromise", "sticky": "safe", "laptop": "acceptable"}),
                                            "inbox": lv(93, {"e1": "safe", "e2": "safe", "e3": "safe", "e4": "safe", "e5": "safe", "e6": "acceptable"})},
                                 "lastActive": t - 8 * 3600000},
    }
    for email, a in assigns.items():
        a.update({"assignedAt": t - 5 * day, "by": "seed"})
        conn.execute("INSERT OR REPLACE INTO assignments (user_id,data) VALUES (?,?)", (ids[email], json.dumps(a)))
    for email, p in progress.items():
        conn.execute("INSERT OR REPLACE INTO progress (user_id,data) VALUES (?,?)", (ids[email], json.dumps(p)))
    conn.commit()
    print("  Added sample employees (password for all: demo1234):")
    for email, name, _ in people:
        print(f"    {name:<12} {email}")
    print()
