import pytest
from werkzeug.security import generate_password_hash

from phishverse import create_app, db
from phishverse.auth import new_user_id

MANAGER_EMAIL = "manager@novacorp.local"
MANAGER_PASSWORD = "manager123"
PASSWORD = "password123"


@pytest.fixture
def app(tmp_path):
    return create_app({"DB_PATH": str(tmp_path / "test.db"), "SECRET_KEY": "test-secret", "TESTING": True})


@pytest.fixture
def client(app):
    return app.test_client()


def create_user(app, email, role="employee", name=None, dept="Testing", password=PASSWORD):
    """Insert a user straight into the database and return their id."""
    uid = new_user_id()
    conn = db.connect(app.config["DB_PATH"])
    conn.execute("INSERT INTO users (id,name,email,pw_hash,role,dept,joined_at) VALUES (?,?,?,?,?,?,?)",
                 (uid, name or email.split("@")[0].title(), email.lower(), generate_password_hash(password),
                  role, dept, db.now_ms()))
    conn.commit()
    conn.close()
    return uid


def login(client, email, password=PASSWORD):
    r = client.post("/api/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.get_json()
    return r.get_json()


@pytest.fixture
def manager(app):
    """A signed-in test client for the default manager."""
    c = app.test_client()
    login(c, MANAGER_EMAIL, MANAGER_PASSWORD)
    return c


@pytest.fixture
def employee(app):
    """(signed-in client, user id) for a fresh employee."""
    uid = create_user(app, "asha@novacorp.local", name="Asha Rao")
    c = app.test_client()
    login(c, "asha@novacorp.local")
    return c, uid


@pytest.fixture
def make_user(app):
    """make_user(email, role="employee", name=None, dept="Testing", password=PASSWORD) -> user id"""
    return lambda email, **kw: create_user(app, email, **kw)


@pytest.fixture
def sign_in(app):
    """sign_in(email, password=PASSWORD) -> a new test client with that user signed in"""
    def _sign_in(email, password=PASSWORD):
        c = app.test_client()
        login(c, email, password)
        return c
    return _sign_in


@pytest.fixture
def content(app):
    return app.extensions["pv_content"]


def action_for(content, level_id, task_id, outcome):
    """Index of the first action in a scenario with the given outcome."""
    acts = content.scored_task(level_id, task_id)["enc"]["acts"]
    return next(i for i, a in enumerate(acts) if a["o"] == outcome)


@pytest.fixture
def play(content):
    """play(client, level_id, outcomes={task_id: outcome}, default="safe") -> finish response JSON.

    Plays a whole level through the API the way the game does: start, one decision per scenario, finish.
    """
    def _play(client, level_id, outcomes=None, default="safe", purpose="baseline"):
        outcomes = outcomes or {}
        r = client.post("/api/sessions", json={"level_id": level_id, "purpose": purpose})
        assert r.status_code == 201, r.get_json()
        sid = r.get_json()["id"]
        for t in content.scored_tasks(level_id):
            idx = action_for(content, level_id, t["id"], outcomes.get(t["id"], default))
            d = client.post(f"/api/sessions/{sid}/decisions", json={"task_id": t["id"], "action_index": idx,
                                                                   "inspected": [0], "response_ms": 4000})
            assert d.status_code == 201, d.get_json()
        f = client.post(f"/api/sessions/{sid}/finish", json={})
        assert f.status_code == 200, f.get_json()
        return f.get_json()
    return _play
