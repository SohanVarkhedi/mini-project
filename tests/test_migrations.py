import json
import sqlite3

import pytest

from phishverse import create_app, db

# The inline schema server.py used before migrations existed (do not update).
LEGACY_SCHEMA = """
CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, pw_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manager','employee')), dept TEXT NOT NULL DEFAULT '', joined_at INTEGER NOT NULL);
CREATE TABLE assignments (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL);
CREATE TABLE progress (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL);
CREATE TABLE config (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);
"""


def versions(path):
    conn = sqlite3.connect(path)
    try:
        return [r[0] for r in conn.execute("SELECT version FROM schema_version ORDER BY version")]
    finally:
        conn.close()


def test_fresh_database_is_migrated(tmp_path):
    path = str(tmp_path / "fresh.db")
    create_app({"DB_PATH": path, "TESTING": True})
    assert versions(path) == [v for v, _, _ in db.migration_files()]


def test_legacy_database_upgrades_and_keeps_data(tmp_path):
    from werkzeug.security import generate_password_hash
    path = str(tmp_path / "legacy.db")
    conn = sqlite3.connect(path)
    conn.executescript(LEGACY_SCHEMA)
    conn.execute("INSERT INTO users VALUES ('u_old','Old Boss','boss@novacorp.local',?,'manager','Security',1)",
                 (generate_password_hash("oldpassword"),))
    conn.execute("INSERT INTO assignments VALUES ('u_old',?)", (json.dumps({"levels": ["inbox"]}),))
    conn.execute("INSERT INTO config VALUES (1,?)", (json.dumps({"defaultLevels": ["access"], "defaultDueDays": 30}),))
    conn.commit()
    conn.close()

    app = create_app({"DB_PATH": path, "TESTING": True})
    assert 1 in versions(path)
    c = app.test_client()
    assert c.post("/api/login", json={"email": "boss@novacorp.local", "password": "oldpassword"}).status_code == 200
    state = c.get("/api/state").get_json()
    assert state["config"] == {"defaultLevels": ["access"], "defaultDueDays": 30}
    assert state["assignments"]["u_old"]["levels"] == ["inbox"]  # the assignment became an active program
    # No second default manager was added because one already existed.
    assert [m["name"] for m in state["members"].values()] == ["Old Boss"]


def test_migrate_is_idempotent(tmp_path):
    path = str(tmp_path / "x.db")
    conn = db.connect(path)
    first = db.migrate(conn)
    assert first and db.migrate(conn) == []
    conn.close()


def test_new_files_apply_in_order_once(tmp_path):
    mig = tmp_path / "migrations"
    mig.mkdir()
    (mig / "0001_a.sql").write_text("CREATE TABLE a (x INTEGER);")
    (mig / "0003_c.sql").write_text("INSERT INTO a VALUES (3);")
    (mig / "0002_b.sql").write_text("INSERT INTO a VALUES (2);")
    (mig / "README.txt").write_text("ignored")
    conn = db.connect(str(tmp_path / "x.db"))
    assert db.migrate(conn, str(mig)) == [1, 2, 3]
    assert [r[0] for r in conn.execute("SELECT x FROM a")] == [2, 3]
    (mig / "0004_d.sql").write_text("ALTER TABLE a ADD COLUMN y TEXT;")
    assert db.migrate(conn, str(mig)) == [4]
    conn.close()


def test_failed_migration_rolls_back(tmp_path):
    mig = tmp_path / "migrations"
    mig.mkdir()
    (mig / "0001_a.sql").write_text("CREATE TABLE a (x INTEGER);")
    (mig / "0002_bad.sql").write_text("INSERT INTO a VALUES (1); INSERT INTO nope VALUES (1);")
    conn = db.connect(str(tmp_path / "x.db"))
    with pytest.raises(RuntimeError, match="0002_bad.sql"):
        db.migrate(conn, str(mig))
    assert [r[0] for r in conn.execute("SELECT version FROM schema_version")] == [1]
    assert conn.execute("SELECT COUNT(*) FROM a").fetchone()[0] == 0
    conn.close()
