import json

import pytest

ASSIGN = {"levels": ["orientation", "inbox"], "due": "2026-12-31", "note": "Hi"}


def test_employee_cannot_manage(employee, make_user):
    c, _uid = employee
    other = make_user("ben@novacorp.local")
    assert c.put(f"/api/assignments/{other}", json=ASSIGN).status_code == 403
    assert c.delete(f"/api/assignments/{other}", json={}).status_code == 403
    assert c.put("/api/config", json={"defaultLevels": ["inbox"], "defaultDueDays": 7}).status_code == 403


def test_employee_cannot_assign_self(employee):
    c, uid = employee
    assert c.put(f"/api/assignments/{uid}", json=ASSIGN).status_code == 403


@pytest.mark.parametrize("method, path, body", [
    ("get", "/api/state", None),
    ("put", "/api/assignments/u_x", ASSIGN),
    ("delete", "/api/assignments/u_x", {}),
    ("put", "/api/config", {"defaultLevels": []}),
    ("put", "/api/profile", {"name": "X"}),
    ("post", "/api/sessions", {"level_id": "orientation"}),
    ("get", "/api/sessions/s_x", None),
    ("post", "/api/sessions/s_x/decisions", {"task_id": "usb", "action_index": 1}),
    ("post", "/api/sessions/s_x/finish", {}),
])
def test_signed_out_gets_401(client, method, path, body):
    kw = {} if body is None else {"json": body}
    assert getattr(client, method)(path, **kw).status_code == 401


@pytest.mark.parametrize("method, path", [
    ("post", "/api/login"),
    ("post", "/api/register"),
    ("post", "/api/logout"),
    ("put", "/api/assignments/u_x"),
    ("delete", "/api/assignments/u_x"),
    ("put", "/api/config"),
    ("put", "/api/profile"),
    ("post", "/api/sessions"),
    ("post", "/api/sessions/s_x/decisions"),
    ("post", "/api/sessions/s_x/finish"),
])
def test_non_json_mutation_gets_415(manager, method, path):
    r = getattr(manager, method)(path, data="levels=orientation",
                                 content_type="application/x-www-form-urlencoded")
    assert r.status_code == 415
    assert r.get_json()["error"] == "Expected a JSON request."


def test_manager_can_manage(manager, make_user):
    uid = make_user("ben@novacorp.local")
    r = manager.put(f"/api/assignments/{uid}", json=ASSIGN)
    assert r.status_code == 200 and r.get_json()["levels"] == ["orientation", "inbox"]
    assert uid in manager.get("/api/state").get_json()["assignments"]
    assert manager.delete(f"/api/assignments/{uid}", json={}).status_code == 200
    assert uid not in manager.get("/api/state").get_json()["assignments"]
    assert manager.put("/api/config", json={"defaultLevels": ["inbox", "bogus"], "defaultDueDays": 500}).get_json() == \
        {"defaultLevels": ["inbox"], "defaultDueDays": 90}


def test_assignment_validation(manager, make_user):
    uid = make_user("ben@novacorp.local")
    assert manager.put("/api/assignments/u_nobody", json=ASSIGN).status_code == 404
    assert manager.put(f"/api/assignments/{uid}", json={**ASSIGN, "levels": ["bogus"]}).status_code == 400
    assert manager.put(f"/api/assignments/{uid}", json={**ASSIGN, "due": "31/12/2026"}).status_code == 400


def test_employee_state_only_has_own_data(app, employee, manager, make_user, sign_in, play):
    c, uid = employee
    other = make_user("ben@novacorp.local", name="Ben Secretname")
    manager.put(f"/api/assignments/{other}", json={**ASSIGN, "note": "private-note-for-ben"})
    manager.put(f"/api/assignments/{uid}", json=ASSIGN)
    ben = sign_in("ben@novacorp.local")
    play(ben, "orientation", {"usb": "compromise"})

    r = c.get("/api/state")
    assert r.status_code == 200
    body = r.get_json()
    assert set(body) == {"config", "myMember", "myAssign", "myProg", "myJourney"}
    assert body["myJourney"]["program"]["user_id"] == uid
    assert body["myMember"]["name"] == "Asha Rao"
    assert body["myAssign"]["levels"] == ASSIGN["levels"]
    text = json.dumps(body)
    for leak in (other, "Ben Secretname", "ben@novacorp.local", "private-note-for-ben", "manager@novacorp.local"):
        assert leak not in text


def test_progress_is_saved_for_self_only(employee, manager, make_user, play):
    c, uid = employee
    other = make_user("ben@novacorp.local")
    play(c, "orientation")
    prog = manager.get("/api/state").get_json()["progress"]
    assert uid in prog and other not in prog


def test_progress_endpoint_removed(employee):
    c, _ = employee
    r = c.put("/api/progress", json={"levels": {"orientation": {"best": 100, "done": True}}})
    assert r.status_code == 405
