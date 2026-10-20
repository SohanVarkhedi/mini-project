"""
Skills report: turns a person's baseline decisions into strong areas, weak spots, risky cues and habits.

Pure functions (no database, no Flask) so every rule is unit-tested with hand-worked numbers:

  points      safe 1 · acceptable .6 · false_alarm .4 · compromise 0 (the content's outcome scale)
  penalty     0.1 for a severity-2 compromise, 0.2 for severity 3. A compromise already scores 0, so the
              penalty is taken off the skill's total (weighted like the points), and the skill floors at 0
  per skill   weight 1 for a scenario's primary skill, 0.5 for its secondary;
              score = 100 x max(0, weighted points - weighted penalties) / weighted evidence
  bands       Strong >= 80 · Watch 60-79 · Weak < 60 · "insufficient" when weighted evidence < 1.5
  cues        phishing scenarios only (trusting a genuine request is correct); failure = compromise;
              the 3 riskiest cues with at least 2 phishing scenarios each
  habits      inspection rate, median decision time, false-alarm rate on genuine scenarios
"""
import math

SEVERITY_PENALTY = {2: 0.1, 3: 0.2}
STRONG, WATCH = 80, 60
MIN_EVIDENCE = 1.5
MIN_CUE_SCENARIOS = 2
TOP_CUES = 3
BANDS = {"strong": "Strong", "watch": "Watch", "weak": "Weak", "insufficient": "Not enough evidence"}
CUE_PHRASES = {  # finishes "especially when ..."
    "urgency": "there's an urgent deadline", "authority": "the request seems to come from someone senior or official",
    "reward": "there's a reward on offer", "fear": "there's a threat or a scare", "curiosity": "something looks tempting to open",
    "familiarity": "a familiar name is used", "secrecy": "you're asked to keep it quiet", "helpfulness": "someone asks you for a favour",
}
ART_ADDRESS_KEYS = ("addr", "num", "link", "loc")


def round_half_up(x):
    return math.floor(x + 0.5)


def decision_points(outcome, severity, outcome_scale):
    """(points, penalty) for one decision."""
    pts = outcome_scale[outcome]["pts"]
    pen = SEVERITY_PENALTY.get(severity or 0, 0) if outcome == "compromise" else 0.0
    return pts, pen


def band(score, evidence):
    if evidence < MIN_EVIDENCE or score is None:
        return "insufficient"
    return "strong" if score >= STRONG else "watch" if score >= WATCH else "weak"


def median(values):
    v = sorted(values)
    if not v:
        return None
    mid = len(v) // 2
    return v[mid] if len(v) % 2 else (v[mid - 1] + v[mid]) / 2


def scenario_addresses(enc):
    """Domains, addresses and numbers shown in a scenario (rendered with the .addr component)."""
    art, out = enc.get("art") or {}, []
    for k in ART_ADDRESS_KEYS:
        v = art.get(k)
        if isinstance(v, dict):
            v = v.get("h")
        if isinstance(v, str) and v.strip():
            out.append(v.split(" · ")[0].strip())
    return out


def build_report(content, decisions, skills_meta):
    """decisions: [{level_id, task_id, action_index, outcome, severity, n_inspections, response_ms}]
    skills_meta: content/skills.json "skills" list (order = display order)."""
    scale = content.outcomes
    acc = {s["id"]: {"w": 0.0, "pts": 0.0, "pen": 0.0, "n": 0, "items": []} for s in skills_meta}
    cues = {}
    legit_n = legit_fa = inspected = 0
    times = []
    rows = []
    for d in decisions:
        task = content.scored_task(d["level_id"], d["task_id"])
        if not task:
            continue  # content changed since; the stored decision no longer maps to a scenario
        enc = task["enc"]
        act = enc["acts"][d["action_index"]]
        p, pen = decision_points(d["outcome"], d.get("severity"), scale)
        safe_act = next((a for a in enc["acts"] if a["o"] == "safe"), None)
        row = {"level_id": d["level_id"], "task_id": d["task_id"], "title": enc["title"], "channel": enc["ch"],
               "legit": bool(enc.get("legit")), "chose": act["l"], "outcome": d["outcome"],
               "outcome_label": scale[d["outcome"]]["label"], "severity": d.get("severity"),
               "safer": safe_act["l"] if safe_act else None, "lesson": enc["lesson"], "points": round(p - pen, 2),
               "addresses": scenario_addresses(enc), "skills": list(enc["skills"]), "cues": list(enc["cues"])}
        rows.append(row)
        for k, sid in enumerate(enc["skills"]):
            if sid not in acc:
                continue
            w = 1.0 if k == 0 else 0.5
            a = acc[sid]
            a["w"] += w
            a["pts"] += w * p
            a["pen"] += w * pen
            a["n"] += 1
            a["items"].append(row)
        if enc.get("legit"):
            legit_n += 1
            legit_fa += d["outcome"] == "false_alarm"
        else:
            for cue in enc["cues"]:
                c = cues.setdefault(cue, {"n": 0, "fails": 0})
                c["n"] += 1
                c["fails"] += d["outcome"] == "compromise"
        inspected += (d.get("n_inspections") or 0) > 0
        if d.get("response_ms") is not None:
            times.append(d["response_ms"])

    skills = []
    for s in skills_meta:
        a = acc[s["id"]]
        score = round_half_up(100 * max(0.0, a["pts"] - a["pen"]) / a["w"]) if a["w"] else None
        b = band(score, a["w"])
        revealed = sorted((r for r in a["items"] if r["outcome"] != "safe"), key=lambda r: (r["points"], r["title"]))
        skills.append({"id": s["id"], "name": s["name"], "icon": s["icon"], "description": s["description"],
                       "score": score, "band": b, "band_label": BANDS[b], "evidence": round(a["w"], 2),
                       "scenarios": a["n"], "safe": sum(r["outcome"] == "safe" for r in a["items"]),
                       "tasks": [f"{r['level_id']}/{r['task_id']}" for r in a["items"]],
                       "safe_tasks": [f"{r['level_id']}/{r['task_id']}" for r in a["items"] if r["outcome"] == "safe"], "revealed": revealed if b in ("weak", "watch") else []})

    ranked = [s for s in skills if s["band"] != "insufficient"]
    strong = sorted((s for s in ranked if s["band"] == "strong"), key=lambda s: (-s["score"], -s["evidence"]))
    weak = sorted((s for s in ranked if s["band"] == "weak"), key=lambda s: (s["score"], -s["evidence"]))
    watch = sorted((s for s in ranked if s["band"] == "watch"), key=lambda s: (s["score"], -s["evidence"]))
    weakest = (weak or watch or [None])[0]

    risky = [{"cue": c, "phrase": CUE_PHRASES[c], "scenarios": v["n"], "fails": v["fails"],
              "rate": round_half_up(100 * v["fails"] / v["n"])}
             for c, v in cues.items() if v["n"] >= MIN_CUE_SCENARIOS and v["fails"] > 0]
    risky.sort(key=lambda r: (-r["rate"], -r["fails"], r["cue"]))

    total = len(rows)
    habits = {
        "decisions": total,
        "inspected": inspected,
        "inspection_rate": round_half_up(100 * inspected / total) if total else None,
        "median_ms": int(median(times)) if times else None,
        "genuine": legit_n,
        "false_alarms": legit_fa,
        "false_alarm_rate": round_half_up(100 * legit_fa / legit_n) if legit_n else None,
    }
    report = {
        "skills": skills,
        "strong": [s["id"] for s in strong],
        "weak": [s["id"] for s in weak],
        "watch": [s["id"] for s in watch],
        "weakest": {"id": weakest["id"], "name": weakest["name"], "score": weakest["score"]} if weakest else None,
        "cues": risky[:TOP_CUES],
        "habits": habits,
        "decisions": total,
        "compromises": sum(r["outcome"] == "compromise" for r in rows),
        "safe": sum(r["outcome"] == "safe" for r in rows),
    }
    report["summary"] = summary(report)
    report["summary_manager"] = summary(report, perspective="they")
    report["advice"] = habit_advice(habits)
    return report


# ---------------------------------------------------------------- words
def _lower(name):
    """Sentence-case a skill name mid-sentence, keeping acronyms (MFA) intact."""
    return name if name[:2].isupper() else name[0].lower() + name[1:]


def _join(items):
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " and " + items[-1]


def _of(k, n, noun):
    """'all 5 situations', 'both situations', '3 of 4 situations', 'the one situation'."""
    if n == 1:
        return f"the one {noun}"
    if k == n:
        return f"both {noun}s" if n == 2 else f"all {n} {noun}s"
    return f"{k} of {n} {noun}s"


def _safe_calls(k, n, you):
    """The no-strong-areas opening sentence, natural for every k from 0 to n."""
    subj, poss = ("You", "your") if you else ("They", "their")
    if n == 1:
        return f"{subj} made the safe call in the one situation." if k else f"{subj} didn't make the safe call in the one situation."
    if k == 0:
        return f"None of {poss} {n} choices was the safe call."
    if k == n:
        return f"{subj} made the safe call in {'both' if n == 2 else f'all {n}'} situations."
    return f"{subj} made the safe call in {k} of {n} situations."


def _count_word(n):
    return ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n] if 0 <= n <= 10 else str(n)


def summary(report, perspective="you"):
    """2-3 plain sentences: what they're good at, where they're most at risk, what happens next. Kind and specific."""
    you = perspective == "you"
    sk = {s["id"]: s for s in report["skills"]}
    sents = []
    strong = [sk[i] for i in report["strong"][:2]]
    if strong:
        names = " and on ".join(_lower(s["name"]) for s in strong)
        n = len({t for s in strong for t in s["tasks"]})  # a scenario tagged with both counts once
        safe = len({t for s in strong for t in s["safe_tasks"]})
        sents.append(f"{'You were' if you else 'They were'} strong on {names}, making the safe call in {_of(safe, n, 'situation')} there.")
    elif report["decisions"]:
        sents.append(_safe_calls(report["safe"], report["decisions"], you))
    w = report["weakest"]
    if w:
        s = sk[w["id"]]
        # only name a pressure tactic that was really part of this skill's slips (no false links)
        slipped = {c for r in s["revealed"] if r["outcome"] == "compromise" for c in r.get("cues", [])}
        cue = next((c for c in report["cues"] if c["cue"] in slipped), None)
        risk = f"{'You' if you else 'They'}'re most at risk from {_lower(s['name'])}"
        if cue:
            risk += f", especially when {cue['phrase']}"
            if not you:
                risk = risk.replace("you're asked", "they're asked").replace("asks you", "asks them")
        sents.append(risk + ".")
        n = len(report["weak"]) + len(report["watch"])
        if you:
            sents.append(f"Your training plan starts there{'' if n <= 1 else f' and covers {_count_word(n)} skills in all'}, "
                         f"with short simulations rather than long lessons.")
        else:
            sents.append(f"Their training plan starts there{'' if n <= 1 else f' and covers {_count_word(n)} skills'}.")
    else:
        sents.append(f"{'You' if you else 'They'} showed no weak spots, so training is optional and the final test is next.")
    return " ".join(sents[:3])


def habit_advice(h):
    tips = []
    n = h["decisions"]
    if n:
        k = h["inspected"]
        if k == 0:
            tips.append({"icon": "search", "text": "You decided without opening any clues. Checking first is the habit that catches most scams."})
        elif k == n:
            tips.append({"icon": "search", "text": f"You opened clues before deciding in {_of(k, n, 'situation')}. Keep that habit: checking first catches most scams."})
        elif k / n >= 0.8:
            tips.append({"icon": "search", "text": f"You opened clues before deciding in {k} of {n} situations. Keep that habit: checking first catches most scams."})
        else:
            tips.append({"icon": "search", "text": f"You opened clues before deciding in {k} of {n} situations. Checking first is the habit that catches most scams."})
    if h["median_ms"] is not None:
        secs = max(1, round_half_up(h["median_ms"] / 1000))
        if secs < 6:
            tips.append({"icon": "clock", "text": f"You usually decided within {secs} seconds. Slow down a little: scams count on quick reactions."})
        else:
            tips.append({"icon": "clock", "text": f"You usually took about {secs} seconds per decision. That's a careful pace; keep it when you're busy."})
    if h["genuine"]:
        fa, g = h["false_alarms"], h["genuine"]
        if fa == 0:
            what = "the one genuine request" if g == 1 else ("both genuine requests" if g == 2 else f"all {g} genuine requests")
            tips.append({"icon": "check", "text": f"You trusted {what}. Security isn't about saying no to everything."})
        else:
            what = "the one genuine request as a scam" if g == 1 else f"{_of(fa, g, 'genuine request')} as scams"
            tips.append({"icon": "info", "text": f"You reported {what}. When unsure, verify through a known channel instead of refusing."})
    return tips


def plan_skills(report, include_watch):
    """The skills a training plan covers: Weak first (weakest first), then Watch if allowed."""
    return list(report["weak"]) + (list(report["watch"]) if include_watch else [])
