"""The real threaded server stays responsive with several event streams open (as in --lan mode)."""
import http.client
import json
import threading
import time

from werkzeug.serving import make_server

from phishverse import create_app


def login_cookie(app, email, password):
    c = app.test_client()
    assert c.post("/api/login", json={"email": email, "password": password}).status_code == 200
    return "session=" + c.get_cookie("session").value


def test_three_streams_and_fast_requests(tmp_path):
    app = create_app({"DB_PATH": str(tmp_path / "live.db"), "SECRET_KEY": "live-secret", "TESTING": True})
    reg = app.test_client().post("/api/register", json={"name": "Neha Pillai", "email": "neha@novacorp.local",
                                                        "password": "longenough"})
    assert reg.status_code == 200
    srv = make_server("127.0.0.1", 0, app, threaded=True)  # what app.run(threaded=True) uses
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    port = srv.server_port
    manager = login_cookie(app, "manager@novacorp.local", "manager123")
    employee = login_cookie(app, "neha@novacorp.local", "longenough")

    received = [[] for _ in range(3)]
    conns = []

    def listen(i):
        conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
        conns.append(conn)
        conn.request("GET", "/api/events", headers={"Cookie": manager, "Accept": "text/event-stream"})
        resp = conn.getresponse()
        assert resp.status == 200
        try:
            while True:
                line = resp.readline()
                if not line:
                    return
                if line.startswith(b"data: {"):
                    received[i].append((time.time(), json.loads(line[6:])))
        except OSError:
            return

    threads = [threading.Thread(target=listen, args=(i,), daemon=True) for i in range(3)]
    for t in threads:
        t.start()
    time.sleep(0.5)  # let all three streams connect

    def timed(path, cookie):
        conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        t0 = time.time()
        conn.request("GET", path, headers={"Cookie": cookie})
        resp = conn.getresponse()
        resp.read()
        conn.close()
        assert resp.status == 200
        return time.time() - t0

    times = [timed(p, manager) for p in ("/api/health", "/api/state", "/api/activity") * 7][:20]
    assert max(times) < 0.5, times  # still fast with three streams held open

    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    sent = time.time()
    conn.request("POST", "/api/sessions", body=json.dumps({"level_id": "inbox"}),
                 headers={"Cookie": employee, "Content-Type": "application/json"})
    assert conn.getresponse().status == 201
    conn.close()

    deadline = time.time() + 2
    while time.time() < deadline and not all(received):
        time.sleep(0.02)
    assert all(received), "every open stream should get the event"
    lags = [r[0][0] - sent for r in received]
    assert all(r[0][1]["kind"] == "level_started" and r[0][1]["name"] == "Neha Pillai" for r in received)
    assert max(lags) < 2.0, lags
    for c in conns:
        c.close()
    srv.shutdown()
