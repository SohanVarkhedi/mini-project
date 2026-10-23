"""
Programs and the journey: Game (baseline levels) -> Skills report -> Training -> Final test -> Certificate.

Everything about where someone is comes from data: their active program, their finished baseline
sessions, and the stored report and plan. Nothing here trusts the client.

  effective_program()  the active program, or the auto plan for new joiners (config) until it's needed
  ensure_report()      writes the report + training plan once the last baseline level is finished
  journey()            stage states and the single next action
"""
import json
import time
import uuid

from flask import Blueprint, current_app, jsonify, request

from . import auth
from .db import get_db, now_ms
from .events import record_event
from .skills import build_report, plan_skills

bp = Blueprint("journey", __name__, url_prefix="/api")

DAY_MS = 86400000
STAGES = [
    ("game", "Game", "Play your assigned levels. Your first try at each one becomes your skills report."),
    ("report", "Skills report", "Your strong areas and weak spots, built from your choices in the game."),
    ("training", "Training", "Short simulations for the skills you need to practise."),
    ("test", "Final test", "Unseen scenarios with no hints."),
    ("certificate", "Certificate", "A certificate your manager can verify when you pass the final test."),
]
PROGRAM_DEFAULTS = {"pass_mark": 70, "max_test_attempts": 3, "allow_watch_training": True}


def content():
    return current_app.extensions["pv_content"]


def new_id(prefix):
    return prefix + uuid.uuid4().hex


# ---------------------------------------------------------------- programs
def program_json(r):
    return {"id": r["id"], "user_id": r["user_id"], "levels": json.loads(r["levels_json"]), "due": r["due"],
            "note": r["note"], "pass_mark": r["pass_mark"], "max_test_attempts": r["max_test_attempts"],
            "allow_watch_training": bool(r["allow_watch_training"]), "created_by": r["created_by"],
            "created_at": r["created_at"], "status": r["status"],
            "source": "default" if r["created_by"] == "auto" else "manager"}


def active_program(conn, user_id):
    r = conn.execute("SELECT * FROM programs WHERE user_id=? AND status='active'", (user_id,)).fetchone()
    return program_json(r) if r else None


def default_program(conn, user, level_ids):
    """The auto plan for people who join without one (manager's 'Auto-assign new joiners'). Not stored yet."""
    row = conn.execute("SELECT data FROM config WHERE id=1").fetchone()
    cfg = json.loads(row[0]) if row else {}
    levels = [l for l in cfg.get("defaultLevels") or [] if l in level_ids]
    if not levels:
        return None
    days = cfg.get("defaultDueDays") or 14
    due = time.strftime("%Y-%m-%d", time.localtime((user["joined_at"] + days * DAY_MS) / 1000))
    return {"id": None, "user_id": user["id"], "levels": levels, "due": due, "note": "", **PROGRAM_DEFAULTS,
            "created_by": "auto", "created_at": user["joined_at"], "status": "active", "source": "default"}


def effective_program(conn, user, level_ids):
    return active_program(conn, user["id"]) or default_program(conn, user, level_ids)


def create_program(conn, user_id, levels, due="", note="", pass_mark=70, max_test_attempts=3,
                   allow_watch_training=True, created_by="", created_at=None):
    """Replace the person's active program (the old one is kept as 'replaced')."""
    conn.execute("UPDATE programs SET status='replaced' WHERE user_id=? AND status='active'", (user_id,))
    pid = new_id("p_")
    conn.execute("INSERT INTO programs (id,user_id,levels_json,due,note,pass_mark,max_test_attempts,allow_watch_training,"
                 "created_by,created_at,status) VALUES (?,?,?,?,?,?,?,?,?,?, 'active')",
                 (pid, user_id, json.dumps(list(levels)), due, note, pass_mark, max_test_attempts,
                  1 if allow_watch_training else 0, created_by, created_at or now_ms()))
    return active_program(conn, user_id)


def remove_program(conn, user_id):
    return conn.execute("UPDATE programs SET status='removed' WHERE user_id=? AND status='active'", (user_id,)).rowcount


def materialize(conn, prog):
    """Store an auto plan as a real program (needed once a report belongs to it)."""
    if prog["id"]:
        return prog
    return create_program(conn, prog["user_id"], prog["levels"], prog["due"], "", created_by="auto",
                          created_at=prog["created_at"])


def assignment_json(p):
    """The shape the portal has always used for an assignment."""
    return {"levels": p["levels"], "due": p["due"], "note": p["note"], "assignedAt": p["created_at"],
            "by": p["created_by"], "passMark": p["pass_mark"], "maxTestAttempts": p["max_test_attempts"],
            "allowWatchTraining": p["allow_watch_training"], "programId": p["id"], "source": p["source"]}


# ---------------------------------------------------------------- evidence
def first_attempts(conn, user_id, prog):
    """{level_id: first finished baseline session started since the program began}. Replays don't count."""
    out = {}
    q = ("SELECT * FROM play_sessions WHERE user_id=? AND purpose='baseline' AND finished_at IS NOT NULL "
         "AND started_at>=? ORDER BY finished_at, rowid")
    for s in conn.execute(q, (user_id, prog["created_at"])):
        if s["level_id"] in prog["levels"] and s["level_id"] not in out:
            out[s["level_id"]] = s
    return out


def started_levels(conn, user_id, prog):
    rows = conn.execute("SELECT DISTINCT level_id FROM play_sessions WHERE user_id=? AND purpose='baseline' AND started_at>=?",
                        (user_id, prog["created_at"]))
    return {r[0] for r in rows} & set(prog["levels"])


def report_row(conn, program_id):
    return conn.execute("SELECT * FROM reports WHERE program_id=?", (program_id,)).fetchone() if program_id else None


def plan_row(conn, program_id):
    return conn.execute("SELECT * FROM training_plans WHERE program_id=?", (program_id,)).fetchone() if program_id else None


def report_json(r):
    return {"id": r["id"], "program_id": r["program_id"], "created_at": r["created_at"], **json.loads(r["data_json"])}


def ensure_report(conn, content_, user, prog=None):
    """Write the report and training plan once every program level has a first baseline attempt.
    Returns (report row or None, created_now)."""
    prog = prog or effective_program(conn, user, content_.level_ids)
    if not prog:
        return None, False
    existing = report_row(conn, prog["id"])
    if existing:
        return existing, False
    firsts = first_attempts(conn, user["id"], prog)
    if any(l not in firsts for l in prog["levels"]):
        return None, False
    prog = materialize(conn, prog)
    decisions = []
    for level_id in prog["levels"]:
        for d in conn.execute("SELECT * FROM decisions WHERE session_id=? ORDER BY id", (firsts[level_id]["id"],)):
            decisions.append({"level_id": level_id, "task_id": d["task_id"], "action_index": d["action_index"],
                              "outcome": d["outcome"], "severity": d["severity"], "n_inspections": d["n_inspections"],
                              "response_ms": d["response_ms"]})
    data = build_report(content_, decisions, content_.skills)
    data["levels"] = {l: firsts[l]["score"] for l in prog["levels"]}
    created = max(s["finished_at"] for s in firsts.values())
    rid = new_id("r_")
    conn.execute("INSERT INTO reports (id,program_id,user_id,data_json,created_at) VALUES (?,?,?,?,?)",
                 (rid, prog["id"], user["id"], json.dumps(data), created))
    conn.execute("INSERT INTO training_plans (id,program_id,skills_json,created_at) VALUES (?,?,?,?)",
                 (new_id("t_"), prog["id"], json.dumps(plan_skills(data, prog["allow_watch_training"])), created))
    record_event(conn, user["id"], "report_ready", {"program_id": prog["id"], "report_id": rid, "weakest": data["weakest"],
                                                    "weak": data["weak"], "strong": data["strong"]}, created)
    return report_row(conn, prog["id"]), True


# ---------------------------------------------------------------- the journey
def journey(conn, content_, user):
    prog = effective_program(conn, user, content_.level_ids)
    if not prog:
        return {"program": None, "levels": [], "stages": [dict(id=i, title=t, state="locked", description=d) for i, t, d in STAGES],
                "current": None, "next": None, "report_id": None, "weakest": None, "plan": None}
    rep, _ = ensure_report(conn, content_, user, prog)
    prog = active_program(conn, user["id"]) or prog  # ensure_report may have stored the auto plan
    firsts = first_attempts(conn, user["id"], prog)
    started = started_levels(conn, user["id"], prog)
    levels, next_level = [], None
    for lid in prog["levels"]:
        L = content_.level(lid)
        done = lid in firsts
        state = "done" if done else ("next" if next_level is None else "locked")
        if state == "next":
            next_level = lid
        levels.append({"id": lid, "n": L["n"] if L else None, "title": L["title"] if L else lid, "state": state,
                       "score": firsts[lid]["score"] if done else None, "started": lid in started})
    n_done = len(firsts)
    game_done = n_done == len(prog["levels"])
    report = report_json(rep) if rep else None
    plan = plan_row(conn, prog["id"]) if report else None
    plan_skill_ids = json.loads(plan["skills_json"]) if plan else []
    names = {s["id"]: s["name"] for s in content_.skills}

    st = {}
    st["game"] = ("done" if game_done else "in_progress" if n_done or started else "available",
                  f"{n_done} of {len(prog['levels'])} levels played.")
    st["report"] = ("done" if report else "locked",
                    "Ready." if report else "Unlocks when you've played every level once.")
    training = training_status(conn, content_, user["id"], prog["id"], plan_skill_ids) if report else None
    st["training"] = training_stage(training, plan_skill_ids, names, bool(report))
    st["test"] = ("locked", f"Unseen scenarios, no hints. Pass mark {prog['pass_mark']}%. Arrives in the next update.")
    st["certificate"] = ("locked", "Pass the final test to earn a certificate your manager can verify.")
    stages = [{"id": i, "title": t, "state": st[i][0], "description": st[i][1], "about": d} for i, t, d in STAGES]
    current = next((s["id"] for s in stages if s["state"] != "done"), None)

    nxt = None
    if current == "game":
        L = content_.level(next_level)
        verb = "Resume" if next_level in started else "Start"
        nxt = {"stage": "game", "action": "play", "level_id": next_level, "label": f"{verb} Level {L['n']} · {L['title']}"}
    elif current == "training":
        started_training = any(x["attempts"] for x in training["sims"])
        nxt = {"stage": "training", "action": "plan", "label": "Continue your training plan" if started_training else "Start your training plan"}
    elif current == "test":
        nxt = {"stage": "test", "action": None, "label": "Final test: arrives in the next update"}
    return {"program": prog, "levels": levels, "stages": stages, "current": current, "next": nxt,
            "report_id": report["id"] if report else None, "weakest": report["weakest"] if report else None,
            "plan": {"skills": plan_skill_ids, "edited_by": plan["edited_by"], "edited_at": plan["edited_at"]} if plan else None,
            "training": training,
            "overdue": bool(prog["due"] and not game_done and prog["due"] < time.strftime("%Y-%m-%d"))}


def training_status(conn, content_, user_id, program_id, skill_ids):
    """The plan's simulations (weak skills first, then Watch) with progress."""
    from .training import sims_for_skills
    rows = {r["sim_id"]: r for r in conn.execute("SELECT * FROM training_progress WHERE user_id=? AND program_id=?", (user_id, program_id))}
    sims = []
    for s in sims_for_skills(content_.training, skill_ids):
        r = rows.get(s["id"])
        sims.append({"id": s["id"], "skill": s["skill"], "title": s["title"], "minutes": s["minutes"], "rounds": len(s["rounds"]),
                     "attempts": r["attempts"] if r else 0, "best_pct": r["best_pct"] if r else 0,
                     "mastered": bool(r and r["completed_at"])})
    return {"sims": sims, "mastered": sum(x["mastered"] for x in sims), "total": len(sims)}


def training_stage(training, plan_skill_ids, names, has_report):
    """(state, description) of the Training stage."""
    if not has_report:
        return ("locked", "Short simulations for the skills your report flags.")
    sims = training["sims"]
    if not sims:
        return ("done", "No weak spots, so there's nothing you have to practise.")
    n, done = len(sims), training["mastered"]
    if done == n:
        return ("done", f"All {n} simulation{'' if n == 1 else 's'} mastered.")
    if any(x["attempts"] for x in sims):
        return ("in_progress", f"{done} of {n} simulations mastered.")
    skills = ", ".join(names.get(sk, sk) for sk in plan_skill_ids[:3])
    return ("available", f"{n} short simulation{'' if n == 1 else 's'} for {skills}. About {sum(x['minutes'] for x in sims)} minutes in all.")


def journey_summary(j):
    """What the manager's people table shows."""
    if not j["program"]:
        return None
    game = next(s for s in j["stages"] if s["id"] == "game")
    played = sum(1 for l in j["levels"] if l["state"] == "done")
    return {"current": j["current"], "game": game["state"], "played": played, "levels": len(j["levels"]),
            "weakest": j["weakest"], "report_id": j["report_id"], "overdue": j["overdue"],
            "plan": j["plan"]["skills"] if j["plan"] else None,
            "training": {"mastered": j["training"]["mastered"], "total": j["training"]["total"]} if j.get("training") else None}


# ---------------------------------------------------------------- routes
def user_row(conn, uid):
    return conn.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()


def person_or_error(uid):
    u, e = auth.require_user("manager")
    if e:
        return None, e
    person = user_row(get_db(), uid)
    return (person, None) if person else (None, auth.err("No such team member.", 404))


def plan_json(conn, j):
    if not j["plan"]:
        return None
    meta = {s["id"]: s for s in content().skills}
    rep = report_row(conn, j["program"]["id"]) if j["report_id"] else None
    scores = {s["id"]: s for s in json.loads(rep["data_json"])["skills"]} if rep else {}
    return {"program_id": j["program"]["id"], "edited_by": j["plan"]["edited_by"], "edited_at": j["plan"]["edited_at"],
            "allow_watch_training": j["program"]["allow_watch_training"],
            "skills": [{"id": s, "name": meta[s]["name"], "icon": meta[s]["icon"], "description": meta[s]["description"],
                        "score": scores.get(s, {}).get("score"), "band": scores.get(s, {}).get("band")}
                       for s in j["plan"]["skills"] if s in meta]}


def journey_response(person):
    conn = get_db()
    j = journey(conn, content(), person)
    conn.commit()  # ensure_report may have written the report
    return j


@bp.get("/journey")
def my_journey():
    u, e = auth.require_user()
    return e if e else jsonify(journey_response(u))


@bp.get("/report")
def my_report():
    u, e = auth.require_user()
    if e:
        return e
    j = journey_response(u)
    rep = report_row(get_db(), j["program"]["id"]) if j["report_id"] else None
    return jsonify(report_json(rep)) if rep else auth.err("No skills report yet. It's ready after you play every level once.", 404)


@bp.get("/plan")
def my_plan():
    u, e = auth.require_user()
    if e:
        return e
    p = plan_json(get_db(), journey_response(u))
    return jsonify(p) if p else auth.err("No training plan yet.", 404)


@bp.get("/people/<uid>/journey")
def person_journey(uid):
    person, e = person_or_error(uid)
    return e if e else jsonify(journey_response(person))


@bp.get("/people/<uid>/report")
def person_report(uid):
    person, e = person_or_error(uid)
    if e:
        return e
    j = journey_response(person)
    rep = report_row(get_db(), j["program"]["id"]) if j["report_id"] else None
    return jsonify(report_json(rep)) if rep else auth.err("No skills report yet.", 404)


@bp.route("/people/<uid>/plan", methods=["GET", "PUT"])
def person_plan(uid):
    person, e = person_or_error(uid)
    if e:
        return e
    conn = get_db()
    j = journey_response(person)
    if request.method == "PUT":
        if not j["plan"]:
            return auth.err("There's no training plan yet: it's made when the skills report is ready.", 409)
        skills = (request.get_json(silent=True) or {}).get("skills")
        valid = {s["id"] for s in content().skills}
        if not isinstance(skills, list) or not all(isinstance(s, str) and s in valid for s in skills) or len(set(skills)) != len(skills):
            return auth.err("Choose skills from the list.")
        me, _ = auth.require_user()
        conn.execute("UPDATE training_plans SET skills_json=?, edited_by=?, edited_at=? WHERE program_id=?",
                     (json.dumps(skills), me["id"], now_ms(), j["program"]["id"]))
        record_event(conn, person["id"], "plan_updated", {"program_id": j["program"]["id"], "skills": skills, "by": me["id"]})
        conn.commit()
        j = journey(conn, content(), person)
    p = plan_json(conn, j)
    return jsonify(p) if p else auth.err("No training plan yet.", 404)


def parse_program(b, level_ids):
    """Validate a program body. Returns (fields, error message)."""
    levels = [l for l in b.get("levels", []) if l in level_ids] if isinstance(b.get("levels"), list) else []
    if not levels:
        return None, "Pick at least one module."
    due = str(b.get("due", ""))
    if due and not (len(due) == 10 and due[4] == "-" and due[7] == "-" and due.replace("-", "").isdigit()):
        return None, "Due date must look like 2026-10-31."

    def int_in(key, lo, hi, default):
        v = b.get(key, default)
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not lo <= v <= hi:
            raise ValueError(key)
        return int(v)
    try:
        pass_mark = int_in("pass_mark", 50, 100, 70)
    except ValueError:
        return None, "The pass mark must be between 50 and 100."
    try:
        attempts = int_in("max_test_attempts", 1, 10, 3)
    except ValueError:
        return None, "Allow between 1 and 10 test attempts."
    return {"levels": levels, "due": due, "note": str(b.get("note", ""))[:240], "pass_mark": pass_mark,
            "max_test_attempts": attempts, "allow_watch_training": bool(b.get("allow_watch_training", True))}, None


def put_program(uid):
    u, e = auth.require_user("manager")
    if e:
        return e
    conn = get_db()
    if not user_row(conn, uid):
        return auth.err("No such team member.", 404)
    fields, msg = parse_program(request.get_json(silent=True) or {}, content().level_ids)
    if msg:
        return auth.err(msg)
    p = create_program(conn, uid, created_by=u["id"], **fields)
    record_event(conn, uid, "assigned", {"levels": p["levels"], "due": p["due"], "note": p["note"], "by": u["id"],
                                         "program_id": p["id"], "pass_mark": p["pass_mark"]})
    conn.commit()
    return jsonify(assignment_json(p))


def delete_program(uid):
    u, e = auth.require_user("manager")
    if e:
        return e
    conn = get_db()
    if remove_program(conn, uid):
        record_event(conn, uid, "unassigned", {"by": u["id"]})
    conn.commit()
    return jsonify({"ok": True})


# /api/assignments/<uid> stays as an alias so older clients keep working.
for rule in ("/programs/<uid>", "/assignments/<uid>"):
    bp.add_url_rule(rule, f"put_program_{rule.split('/')[1]}", put_program, methods=["PUT"])
    bp.add_url_rule(rule, f"delete_program_{rule.split('/')[1]}", delete_program, methods=["DELETE"])
