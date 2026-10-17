"""
PhishVerse local server package.

create_app() builds the Flask app: API blueprints, static files from ./web, and a
SQLite database that is migrated (migrations/*.sql) every time the app starts.
"""
import os
import secrets

from flask import Flask, send_from_directory

from . import api, auth, db, seed

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
    """config may override DB_PATH, SECRET_KEY and TESTING (or any other Flask setting)."""
    app = Flask(__name__, static_folder=None)
    app.config.update(
        DB_PATH=default_db_path(),
        SECRET_KEY=None,
        TESTING=False,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        MAX_CONTENT_LENGTH=256 * 1024,
    )
    app.config.update(config or {})
    if not app.config["SECRET_KEY"]:
        # Tests get a throwaway key so they never create .secret_key.
        app.config["SECRET_KEY"] = secrets.token_hex(32) if app.config["TESTING"] else load_secret()

    db.init_app(app)
    app.register_blueprint(auth.bp)
    app.register_blueprint(api.bp)

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
        seed.ensure_defaults(conn)
    finally:
        conn.close()
    return app
