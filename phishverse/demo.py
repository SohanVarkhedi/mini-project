"""Sample plays for demo mode (web/index.html opened as a file), shipped in web/js/content-data.js as
PV_CONTENT.demo. Reports are computed in the browser by web/js/rules.js (kept identical to skills.py)."""

# demo member id -> {level: {task: outcome}}. Mixed on purpose so the reports have strengths and weak spots.
DEMO_PLAYS = {
    "me": {
        "orientation": {"usb": "safe", "qr": "compromise", "sticky": "safe", "laptop": "acceptable"},
        "inbox": {"e1": "safe", "e2": "compromise", "e3": "false_alarm", "e4": "safe", "e5": "safe", "e6": "safe"},
    },
    "a3": {
        "orientation": {"usb": "compromise", "qr": "compromise", "sticky": "safe", "laptop": "acceptable"},
        "inbox": {"e1": "safe", "e2": "safe", "e3": "safe", "e4": "safe", "e5": "safe", "e6": "acceptable"},
    },
}


def demo_decisions(content, plays):
    out = []
    for level_id, outcomes in plays.items():
        for i, t in enumerate(content.scored_tasks(level_id)):
            want = outcomes[t["id"]]
            idx = next(k for k, a in enumerate(t["enc"]["acts"]) if a["o"] == want)
            act = t["enc"]["acts"][idx]
            n = {"safe": len(t["enc"]["inspect"]), "compromise": 0}.get(want, 1)
            out.append({"level_id": level_id, "task_id": t["id"], "action_index": idx, "outcome": want,
                        "severity": act.get("sev") if want == "compromise" else None, "n_inspections": n,
                        "response_ms": 7000 + 3000 * n + 1100 * i})
    return out


def demo_data(content):
    """Sample sessions (with decisions) per demo member. The browser builds journeys and reports from
    them with web/js/rules.js, the same rules as the server."""
    sessions = {}
    for uid, levels in DEMO_PLAYS.items():
        for n, (level_id, outcomes) in enumerate(levels.items()):
            ds = [{k: v for k, v in d.items() if k != "level_id"} for d in demo_decisions(content, {level_id: outcomes})]
            score, stars = content.score([outcomes[t["id"]] for t in content.scored_tasks(level_id)])
            sessions.setdefault(uid, []).append({"level_id": level_id, "purpose": "baseline", "started_at": 1000 + 10 * n,
                                                 "finished_at": 1005 + 10 * n, "score": score, "stars": stars, "outcomes": outcomes,
                                                 "decisions": ds})
    return {"sessions": sessions}
