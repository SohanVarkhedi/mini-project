"""Sample plays for demo mode (web/index.html opened as a file). Reports are built with the real
skills.build_report at content-build time and shipped in web/js/content-data.js as PV_CONTENT.demo."""
from .skills import build_report

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
CREATED_AT = 1792000000000  # fixed, so the generated file only changes when content does


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
    reports, plays = {}, {}
    for uid, levels in DEMO_PLAYS.items():
        decisions = demo_decisions(content, levels)
        rep = build_report(content, decisions, content.skills)
        rep["levels"] = {}
        for level_id, outcomes in levels.items():
            score, stars = content.score([outcomes[t["id"]] for t in content.scored_tasks(level_id)])
            rep["levels"][level_id] = score
            plays.setdefault(uid, {})[level_id] = {"score": score, "stars": stars, "outcomes": outcomes}
        reports[uid] = {"id": f"demo_{uid}", "program_id": f"demo_{uid}", "created_at": CREATED_AT, **rep}
    return {"reports": reports, "plays": plays}
