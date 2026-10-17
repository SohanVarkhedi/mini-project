"""SQLite access: one connection per request, plus the migration runner."""
import os
import re
import sqlite3
import time

from flask import current_app, g

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIGRATIONS_DIR = os.path.join(BASE, "migrations")
MIGRATION_RE = re.compile(r"^(\d{4})_([a-z0-9_]+)\.sql$")


def now_ms():
    return int(time.time() * 1000)


def connect(path):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_db():
    if "db" not in g:
        g.db = connect(current_app.config["DB_PATH"])
    return g.db


def close_db(_exc=None):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_app(app):
    app.teardown_appcontext(close_db)


# ---------------------------------------------------------------- migrations
def migration_files(directory=MIGRATIONS_DIR):
    """[(version, name, path)] sorted by version. Ignores files that don't match NNNN_name.sql."""
    out = []
    for fn in os.listdir(directory):
        m = MIGRATION_RE.match(fn)
        if m:
            out.append((int(m.group(1)), m.group(2), os.path.join(directory, fn)))
    out.sort()
    versions = [v for v, _, _ in out]
    if len(versions) != len(set(versions)):
        raise RuntimeError(f"Two migration files share a version number in {directory}.")
    return out


def applied_versions(conn):
    conn.execute("CREATE TABLE IF NOT EXISTS schema_version ("
                 "version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)")
    conn.commit()
    return {r[0] for r in conn.execute("SELECT version FROM schema_version")}


def migrate(conn, directory=MIGRATIONS_DIR):
    """Apply unapplied migrations in order, each in its own transaction. Returns the versions applied."""
    done = applied_versions(conn)
    applied = []
    for version, name, path in migration_files(directory):
        if version in done:
            continue
        with open(path, encoding="utf-8") as f:
            sql = f.read()
        # version and name come from a strict filename regex, so inlining them is safe.
        script = (f"BEGIN;\n{sql}\n;\nINSERT INTO schema_version (version,name,applied_at) "
                  f"VALUES ({version},'{name}',{now_ms()});\nCOMMIT;")
        try:
            conn.executescript(script)
        except sqlite3.Error as e:
            if conn.in_transaction:
                conn.execute("ROLLBACK")
            raise RuntimeError(f"Migration {os.path.basename(path)} failed: {e}") from e
        applied.append(version)
    return applied
