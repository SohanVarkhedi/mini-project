import pytest

GOOD = {"name": "Kavya Rao", "dept": "Finance", "email": "kavya@novacorp.local", "password": "longenough"}


@pytest.mark.parametrize("change, message", [
    ({"name": "  "}, "Please enter your name."),
    ({"email": "not-an-email"}, "Please enter a valid email address."),
    ({"email": "a@b"}, "Please enter a valid email address."),
    ({"password": "short"}, "Use a password of at least 8 characters."),
])
def test_register_validation(client, change, message):
    r = client.post("/api/register", json={**GOOD, **change})
    assert r.status_code == 400
    assert r.get_json()["error"] == message


def test_register_creates_signed_in_employee(client):
    r = client.post("/api/register", json={**GOOD, "email": "  Kavya@NovaCorp.local "})
    assert r.status_code == 200
    body = r.get_json()
    assert body["role"] == "employee"
    assert body["email"] == "kavya@novacorp.local"
    assert "pw_hash" not in body
    me = client.get("/api/me")
    assert me.status_code == 200 and me.get_json()["id"] == body["id"]


def test_register_duplicate_email(client, app):
    assert client.post("/api/register", json=GOOD).status_code == 200
    other = app.test_client()
    r = other.post("/api/register", json={**GOOD, "email": GOOD["email"].upper()})
    assert r.status_code == 409
    assert "already exists" in r.get_json()["error"]


def test_login_wrong_password(client, make_user):
    make_user("dev@novacorp.local")
    r = client.post("/api/login", json={"email": "dev@novacorp.local", "password": "wrong-password"})
    assert r.status_code == 401
    assert client.get("/api/me").status_code == 401


def test_login_unknown_email_same_message(client, make_user):
    make_user("dev@novacorp.local")
    wrong_pw = client.post("/api/login", json={"email": "dev@novacorp.local", "password": "nope-nope"})
    no_user = client.post("/api/login", json={"email": "ghost@novacorp.local", "password": "nope-nope"})
    assert no_user.status_code == 401
    assert no_user.get_json() == wrong_pw.get_json()


def test_login_then_logout(client, make_user):
    make_user("dev@novacorp.local", name="Dev Kumar")
    r = client.post("/api/login", json={"email": "DEV@novacorp.local", "password": "password123"})
    assert r.status_code == 200 and r.get_json()["name"] == "Dev Kumar"
    assert client.get("/api/me").status_code == 200
    assert client.post("/api/logout", json={}).status_code == 200
    assert client.get("/api/me").status_code == 401


def test_me_signed_out(client):
    r = client.get("/api/me")
    assert r.status_code == 401
    assert r.get_json()["error"] == "Please sign in."
    assert r.headers["Cache-Control"] == "no-store"


def test_default_manager_exists(client):
    r = client.post("/api/login", json={"email": "manager@novacorp.local", "password": "manager123"})
    assert r.status_code == 200 and r.get_json()["role"] == "manager"


def test_session_cookie_flags(client):
    r = client.post("/api/register", json=GOOD)
    cookie = r.headers["Set-Cookie"]
    assert "HttpOnly" in cookie and "SameSite=Lax" in cookie
