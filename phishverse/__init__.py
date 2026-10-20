"""
PhishVerse local server package.

create_app() builds the Flask app: API blueprints, static files from ./web, and a
SQLite database that is migrated (migrations/*.sql) every time the app starts.
Scenario content is loaded and validated from content/*.json at startup.
"""
import os
import secrets

from flask import Flask, send_from_directory

from . import api, auth, connect, db, events, seed, sessions
from . import content as content_mod

BASE = db.BASE
WEB = os.path.join(BASE, "web")
SECRET_FILE = os.path.join(BASE, ".secret_key")


def default_db_path():
    return os.environ.get("PHISHVERSE_DB", os.path.join(BASE, "phishverse.db"))


def load_secret():
    if os.path.exists(SECRET_FILE):
        with open(SECRET_FILE) as f:
            return f.read().strip()
    key = secrets.token_hex(32)
    with open(SECRET_FILE, "w") as f:
        f.write(key)
    return key


def create_app(config=None):
    """config may override DB_PATH, SECRET_KEY, TESTING, CONTENT_DIR, LAN_URL and EVENTS_HEARTBEAT (seconds)."""
    app = Flask(__name__, static_folder=None)
    app.config.update(
        DB_PATH=default_db_path(),
        SECRET_KEY=None,
        TESTING=False,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        MAX_CONTENT_LENGTH=256 * 1024,
        CONTENT_DIR=content_mod.CONTENT_DIR,
        LAN_URL=None,  # set by server.py --lan: the address phones use
    )
    app.config.update(config or {})
    if not app.config["SECRET_KEY"]:
        # Tests get a throwaway key so they never create .secret_key.
        app.config["SECRET_KEY"] = secrets.token_hex(32) if app.config["TESTING"] else load_secret()

    app.extensions["pv_content"] = content_mod.load(app.config["CONTENT_DIR"])  # raises if content is invalid
    db.init_app(app)
    events.init_app(app)
    app.register_blueprint(auth.bp)
    app.register_blueprint(api.bp)
    app.register_blueprint(sessions.bp)
    app.register_blueprint(events.bp)
    app.register_blueprint(connect.bp)

    @app.get("/")
    def index():
        return send_from_directory(WEB, "index.html")

    @app.get("/<path:path>")
    def static_files(path):
        if path.startswith("api/"):
            return auth.err("Not found.", 404)
        return send_from_directory(WEB, path)

    conn = db.connect(app.config["DB_PATH"])
    try:
        db.migrate(conn)
        seed.ensure_defaults(conn, app.extensions["pv_content"])
    finally:
        conn.close()
    return app
