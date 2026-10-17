"""Accounts and sessions: /api/me, login, register, logout, profile."""
import re
import uuid

from flask import Blueprint, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from .db import get_db, now_ms

bp = Blueprint("auth", __name__, url_prefix="/api")

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def new_user_id():
    return "u_" + uuid.uuid4().hex[:16]


def err(msg, code=400):
    return jsonify({"error": msg}), code


def current_user():
    uid = session.get("uid")
    if not uid:
        return None
    return get_db().execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()


def require_user(role=None):
    u = current_user()
    if not u:
        return None, err("Please sign in.", 401)
    if role and u["role"] != role:
        return None, err("Only managers can do that.", 403)
    return u, None


def user_json(u):
    return {"id": u["id"], "name": u["name"], "email": u["email"], "role": u["role"], "dept": u["dept"]}


def start_session(uid):
    session.clear()
    session["uid"] = uid
    session.permanent = True


@bp.get("/me")
def me():
    u, e = require_user()
    return e if e else jsonify(user_json(u))


@bp.post("/login")
def login():
    b = request.get_json(silent=True) or {}
    email = str(b.get("email", "")).strip().lower()
    pw = str(b.get("password", ""))
    u = get_db().execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    if not u or not check_password_hash(u["pw_hash"], pw):
        return err("That email and password don't match an account.", 401)
    start_session(u["id"])
    return jsonify(user_json(u))


@bp.post("/register")
def register():
    b = request.get_json(silent=True) or {}
    name = str(b.get("name", "")).strip()[:60]
    dept = str(b.get("dept", "")).strip()[:40]
    email = str(b.get("email", "")).strip().lower()[:120]
    pw = str(b.get("password", ""))
    if not name:
        return err("Please enter your name.")
    if not EMAIL_RE.match(email):
        return err("Please enter a valid email address.")
    if len(pw) < 8:
        return err("Use a password of at least 8 characters.")
    db = get_db()
    if db.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
        return err("An account with that email already exists. Sign in instead.", 409)
    uid = new_user_id()
    db.execute("INSERT INTO users (id,name,email,pw_hash,role,dept,joined_at) VALUES (?,?,?,?,?,?,?)",
               (uid, name, email, generate_password_hash(pw), "employee", dept, now_ms()))
    db.commit()
    start_session(uid)
    return jsonify(user_json(db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()))


@bp.post("/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@bp.put("/profile")
def profile():
    u, e = require_user()
    if e:
        return e
    b = request.get_json(silent=True) or {}
    name = str(b.get("name", u["name"])).strip()[:60] or u["name"]
    dept = str(b.get("dept", u["dept"])).strip()[:40]
    db = get_db()
    db.execute("UPDATE users SET name=?, dept=? WHERE id=?", (name, dept, u["id"]))
    db.commit()
    return jsonify({"ok": True})
