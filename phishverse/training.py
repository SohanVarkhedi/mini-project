"""
Training simulations (content/training.json): validation, attempts, client views and grading.

Rounds are graded here, never in the browser (local mode). An attempt fixes the round order and every
option order (shuffled from the second attempt on); the client answers in the order it was shown and
to_canonical() maps that back before grade_round() runs. web/js/rules.js mirrors grade_round() for demo
mode; tests/e2e/test_parity.py keeps the two identical.

Round types and their answers (canonical, i.e. in content order):
  spot      [region id, ...]                  score = max(0, found - wrong) / flags
  realfake  option index                      1 or 0
  sort      {item id: "safe" | "report"}       share of items sorted right
  call      [choice index per turn]           1 if the call ends safe, else 0
  verify    option index                      1 or 0
  door      option index                      1 or 0
  mfa       ["approve"|"deny"|"report", ...]  per prompt: right answer 1; "deny" on a fake prompt .5
"""
import random
import re

TYPES = {"spot", "realfake", "sort", "call", "verify", "door", "mfa"}
CHANNELS = {"email", "sms", "call", "chat", "mfa", "object", "person"}
HL_BUILTIN = {  # data-hl ids the game's artHTML renders for each channel (see content.HL_KEYS)
    "email": {"addr", "link", "attach"}, "sms": {"addr", "link"}, "call": {"addr"}, "chat": {"addr"},
    "mfa": {"loc"}, "object": set(), "person": set(),
}
ART_PRESENT = {"addr": ("addr", "num", "badge"), "link": ("link",), "attach": ("attach",), "loc": ("loc",)}
MARK = re.compile(r"\[\[([a-z0-9_]+)\|([^\]]+)\]\]")
MFA_ANSWERS = ("approve", "deny", "report")
MASTERY = 80
LIMITS = {"title": 60, "prompt": 200, "explain": 220, "why": 200, "option": 120, "intro": 200, "recap": 140, "line": 200}


def round_half_up(x):
    import math
    return math.floor(x + 0.5)


# ---------------------------------------------------------------- validation
def _texts(art):
    out = []
    for v in art.values():
        if isinstance(v, str):
            out.append(v)
        elif isinstance(v, list):
            out += [x for x in v if isinstance(x, str)]
        elif isinstance(v, dict):
            out += [x for x in v.values() if isinstance(x, str)]
    return out


def artifact_regions(artifact):
    """Region ids a spot artifact actually renders."""
    ch, art = artifact.get("ch"), artifact.get("art") or {}
    ids = {m.group(1) for t in _texts(art) for m in MARK.finditer(t)}
    for hl in HL_BUILTIN.get(ch, set()):
        if any(art.get(k) for k in ART_PRESENT[hl]):
            ids.add(hl)
    return ids


def validate(doc, skill_ids, npc_ids):
    errs = []
    err = errs.append
    sims = doc.get("simulations") or []
    ids = [s.get("id") for s in sims]
    if len(ids) != len(set(ids)):
        err("training: duplicate simulation id")
    covered = set()

    def text(where, key, v, limit_key):
        if not isinstance(v, str) or not v.strip():
            err(f"{where}: {key} is missing")
        elif len(v) > LIMITS[limit_key]:
            err(f"{where}: {key} is {len(v)} characters (max {LIMITS[limit_key]})")

    def one_correct(where, options, flag):
        if not isinstance(options, list) or not options:
            err(f"{where}: options are missing")
            return
        for i, o in enumerate(options):
            text(f"{where} option {i}", "text", o.get("text"), "option")
        n = sum(1 for o in options if o.get(flag) is True)
        if n != 1:
            err(f"{where}: needs exactly one option with {flag}: true (has {n})")

    for s in sims:
        sw = f"training {s.get('id')}"
        if s.get("skill") not in skill_ids:
            err(f"{sw}: unknown skill '{s.get('skill')}'")
        else:
            covered.add(s["skill"])
        text(sw, "title", s.get("title"), "title")
        if s.get("minutes") not in (2, 3, 4):
            err(f"{sw}: minutes must be 2, 3 or 4")
        intro = s.get("intro")
        if not isinstance(intro, list) or not 2 <= len(intro) <= 3:
            err(f"{sw}: intro needs 2 or 3 lines for Ada")
        for line in intro or []:
            text(sw, "intro line", line, "intro")
        recap = s.get("recap")
        if not isinstance(recap, list) or len(recap) != 3:
            err(f"{sw}: recap needs exactly 3 habits")
        for line in recap or []:
            text(sw, "recap habit", line, "recap")
        srcs = s.get("sources")
        if not isinstance(srcs, list) or not srcs or not all(isinstance(x, dict) and x.get("org") and x.get("title") for x in srcs):
            err(f"{sw}: sources need at least one {{org, title}}")
        if any("url" in x or "http" in str(x) for x in srcs or []):
            err(f"{sw}: sources list organisation and page title only (no URLs)")
        rounds = s.get("rounds")
        if not isinstance(rounds, list) or not 5 <= len(rounds) <= 7:
            err(f"{sw}: needs 5 to 7 rounds")
            rounds = rounds if isinstance(rounds, list) else []
        if len({r.get("type") for r in rounds}) < 2:
            err(f"{sw}: mix at least 2 round types")
        rids = [r.get("id") for r in rounds]
        if len(rids) != len(set(rids)):
            err(f"{sw}: duplicate round id")
        for r in rounds:
            w = f"{sw}/{r.get('id')}"
            t = r.get("type")
            if t not in TYPES:
                err(f"{w}: unknown type '{t}'")
                continue
            text(w, "prompt", r.get("prompt"), "prompt")
            text(w, "explain", r.get("explain"), "explain")
            if t == "spot":
                a = r.get("artifact") or {}
                if a.get("ch") not in CHANNELS or not isinstance(a.get("art"), dict):
                    err(f"{w}: artifact needs ch and art")
                    continue
                have = artifact_regions(a)
                regions = r.get("regions") or []
                rid = [g.get("id") for g in regions]
                if len(rid) != len(set(rid)):
                    err(f"{w}: duplicate region id")
                for g in regions:
                    if g.get("id") not in have:
                        err(f"{w}: region '{g.get('id')}' isn't in the artifact")
                    if not isinstance(g.get("flag"), bool):
                        err(f"{w}: region '{g.get('id')}' needs flag true/false")
                    text(f"{w} region {g.get('id')}", "label", g.get("label"), "option")
                    text(f"{w} region {g.get('id')}", "why", g.get("why"), "why")
                if not any(g.get("flag") for g in regions):
                    err(f"{w}: needs at least one red-flag region")
                if set(have) - set(rid):
                    err(f"{w}: artifact has regions with no answer: {sorted(set(have) - set(rid))}")
            elif t == "realfake":
                opts = r.get("options") or []
                if len(opts) != 2:
                    err(f"{w}: needs exactly 2 options")
                one_correct(w, opts, "real")
                for o in opts:
                    if not o.get("real") and not o.get("note"):
                        err(f"{w}: the fake option needs a note explaining the difference")
            elif t in ("verify", "door"):
                opts = r.get("options") or []
                if not 3 <= len(opts) <= 4:
                    err(f"{w}: needs 3 or 4 options")
                one_correct(w, opts, "correct")
                if t == "door":
                    if r.get("npc") not in npc_ids:
                        err(f"{w}: unknown NPC '{r.get('npc')}'")
                    if not isinstance(r.get("lines"), list) or not r["lines"]:
                        err(f"{w}: door needs the NPC's lines")
                    text(w, "place", r.get("place"), "option")
            elif t == "sort":
                items = r.get("items") or []
                if not 4 <= len(items) <= 6:
                    err(f"{w}: needs 4 to 6 items")
                iid = [i.get("id") for i in items]
                if len(iid) != len(set(iid)):
                    err(f"{w}: duplicate item id")
                if not any(i.get("safe") is True for i in items) or not any(i.get("safe") is False for i in items):
                    err(f"{w}: needs at least one safe and one report item")
                for i in items:
                    text(f"{w} item {i.get('id')}", "label", i.get("label"), "option")
                    text(f"{w} item {i.get('id')}", "why", i.get("why"), "why")
            elif t == "mfa":
                ps = r.get("prompts") or []
                if not 2 <= len(ps) <= 4:
                    err(f"{w}: needs 2 to 4 prompts")
                if not any(p.get("answer") == "approve" for p in ps) or not any(p.get("answer") != "approve" for p in ps):
                    err(f"{w}: mix genuine (approve) and fake prompts")
                for i, p in enumerate(ps):
                    if p.get("answer") not in ("approve", "report"):
                        err(f"{w} prompt {i}: answer must be approve or report")
                    for k in ("app", "loc", "time", "context"):
                        if not p.get(k):
                            err(f"{w} prompt {i}: {k} is missing")
                    text(f"{w} prompt {i}", "why", p.get("why"), "why")
            elif t == "call":
                nodes = r.get("nodes") or {}
                if "start" not in nodes:
                    err(f"{w}: call needs a start node")
                    continue
                ends = set()

                def walk(nid, depth, seen):
                    if depth > 4:
                        err(f"{w}: call is longer than 4 turns")
                        return
                    node = nodes.get(nid)
                    if not node:
                        err(f"{w}: missing node '{nid}'")
                        return
                    if not node.get("say") or not 2 <= len(node.get("choices") or []) <= 3:
                        err(f"{w} node {nid}: needs lines and 2 or 3 choices")
                    for c in node.get("choices") or []:
                        text(f"{w} node {nid}", "choice", c.get("text"), "option")
                        if "end" in c:
                            if c["end"] not in ("safe", "compromise"):
                                err(f"{w} node {nid}: end must be safe or compromise")
                            ends.add(c["end"])
                            text(f"{w} node {nid}", "why", c.get("why"), "why")
                        elif c.get("next") in seen:
                            err(f"{w} node {nid}: loops back to '{c['next']}'")
                        else:
                            walk(c.get("next"), depth + 1, seen | {c.get("next")})
                walk("start", 1, {"start"})
                if ends != {"safe", "compromise"}:
                    err(f"{w}: needs at least one safe and one compromise ending")
                if not (r.get("caller") or {}).get("name"):
                    err(f"{w}: caller name is missing")
    for sk in sorted(set(skill_ids) - covered):
        err(f"training: no simulation for skill '{sk}'")
    return errs


# ---------------------------------------------------------------- attempts (shuffles) and client views
def build_attempt(sim, shuffle, seed=None):
    """Round order + option permutations for one attempt. perm lists map shown position -> content index."""
    rng = random.Random(seed)
    order = list(range(len(sim["rounds"])))
    if shuffle:
        rng.shuffle(order)
    plan = []
    for i in order:
        r = sim["rounds"][i]

        def perm(n):
            p = list(range(n))
            if shuffle:
                rng.shuffle(p)
            return p
        entry = {"r": i}
        if r["type"] in ("realfake", "verify", "door"):
            entry["options"] = perm(len(r["options"]))
        elif r["type"] == "sort":
            entry["items"] = perm(len(r["items"]))
        elif r["type"] == "mfa":
            entry["prompts"] = perm(len(r["prompts"]))
        elif r["type"] == "call":
            entry["choices"] = {nid: perm(len(n["choices"])) for nid, n in r["nodes"].items()}
        plan.append(entry)
    return plan


def client_round(sim, entry):
    """What the browser may see before answering: no flags, no correct options, no endings, no explanations."""
    r = sim["rounds"][entry["r"]]
    out = {"id": r["id"], "type": r["type"], "prompt": r["prompt"]}
    t = r["type"]
    if t == "spot":
        out["artifact"] = r["artifact"]  # region markers carry ids only; flags stay here
        out["regions"] = [{"id": g["id"]} for g in r["regions"]]
    elif t == "realfake":
        out["options"] = [{"text": r["options"][i]["text"]} for i in entry["options"]]
    elif t in ("verify", "door"):
        out["options"] = [{"text": r["options"][i]["text"]} for i in entry["options"]]
        if t == "door":
            out.update(npc=r["npc"], place=r["place"], lines=r["lines"])
        if r.get("request"):
            out["request"] = r["request"]
    elif t == "sort":
        out["items"] = [{"id": r["items"][i]["id"], "label": r["items"][i]["label"], "detail": r["items"][i].get("detail", "")}
                        for i in entry["items"]]
    elif t == "mfa":
        out["prompts"] = [{k: r["prompts"][i][k] for k in ("app", "loc", "time", "context")} for i in entry["prompts"]]
    elif t == "call":
        out["caller"] = r["caller"]
        out["nodes"] = {nid: {"say": n["say"], "choices": [
            {"text": n["choices"][i]["text"], **({"next": n["choices"][i]["next"]} if "next" in n["choices"][i] else {"end": True})}
            for i in entry["choices"][nid]]} for nid, n in r["nodes"].items()}
    return out


def to_canonical(sim, entry, answer):
    """Map an answer given in the shown order back to content order. Raises ValueError if malformed."""
    r = sim["rounds"][entry["r"]]
    t = r["type"]

    def idx(a, n):
        if isinstance(a, bool) or not isinstance(a, int) or not 0 <= a < n:
            raise ValueError("bad index")
        return a
    if t == "spot":
        valid = {g["id"] for g in r["regions"]}
        if not isinstance(answer, list) or not all(isinstance(a, str) and a in valid for a in answer):
            raise ValueError("bad regions")
        return sorted(set(answer))
    if t in ("realfake", "verify", "door"):
        return entry["options"][idx(answer, len(entry["options"]))]
    if t == "sort":
        ids = {i["id"] for i in r["items"]}
        if not isinstance(answer, dict) or set(answer) != ids or not all(v in ("safe", "report") for v in answer.values()):
            raise ValueError("sort every item")
        return dict(answer)
    if t == "mfa":
        n = len(r["prompts"])
        if not isinstance(answer, list) or len(answer) != n or not all(a in MFA_ANSWERS for a in answer):
            raise ValueError("answer every prompt")
        out = [None] * n
        for shown, a in enumerate(answer):
            out[entry["prompts"][shown]] = a
        return out
    if t == "call":
        if not isinstance(answer, list) or not answer:
            raise ValueError("bad path")
        node, path = "start", []
        for a in answer:
            choices = r["nodes"][node]["choices"]
            i = entry["choices"][node][idx(a, len(choices))]
            path.append(i)
            c = choices[i]
            if "end" in c:
                if len(path) != len(answer):
                    raise ValueError("path continues after the call ended")
                return path
            node = c["next"]
        raise ValueError("the call hasn't ended")
    raise ValueError("unknown type")


# ---------------------------------------------------------------- grading (canonical answers)
def grade_round(r, ans):
    """Score 0..1, correct (score == 1), and what to show afterwards (canonical indices)."""
    t = r["type"]
    if t == "spot":
        flags = {g["id"] for g in r["regions"] if g["flag"]}
        tapped = set(ans)
        found, wrong = len(flags & tapped), len(tapped - flags)
        score = max(0.0, (found - wrong) / len(flags))
        detail = {"regions": [{"id": g["id"], "label": g["label"], "flag": g["flag"], "why": g["why"], "tapped": g["id"] in tapped}
                              for g in r["regions"]], "found": found, "missed": len(flags) - found, "wrong": wrong}
    elif t in ("realfake", "verify", "door"):
        key = "real" if t == "realfake" else "correct"
        right = next(i for i, o in enumerate(r["options"]) if o.get(key))
        score = 1.0 if ans == right else 0.0
        detail = {"chose": ans, "right": right, "options": [{"text": o["text"], "right": bool(o.get(key)), "note": o.get("note", "")}
                                                           for o in r["options"]]}
    elif t == "sort":
        rows = [{"id": i["id"], "label": i["label"], "safe": i["safe"], "chose": ans[i["id"]],
                 "right": (ans[i["id"]] == "safe") == i["safe"], "why": i["why"]} for i in r["items"]]
        score = sum(x["right"] for x in rows) / len(rows)
        detail = {"items": rows}
    elif t == "mfa":
        rows = []
        for p, a in zip(r["prompts"], ans):
            s = 1.0 if a == p["answer"] else (0.5 if p["answer"] == "report" and a == "deny" else 0.0)
            rows.append({"answer": p["answer"], "chose": a, "score": s, "why": p["why"], "app": p["app"], "loc": p["loc"], "time": p["time"]})
        score = sum(x["score"] for x in rows) / len(rows)
        detail = {"prompts": rows}
    elif t == "call":
        node, c = "start", None
        for i in ans:
            c = r["nodes"][node]["choices"][i]
            node = c.get("next")
        score = 1.0 if c["end"] == "safe" else 0.0
        detail = {"outcome": c["end"], "why": c["why"]}
    else:
        raise ValueError(t)
    score = round(score, 4)
    return {"score": score, "correct": score >= 1.0, "explain": r["explain"], "detail": detail}


def shown_detail(r, entry, result):
    """Re-express canonical indices in the order this attempt showed them."""
    d = dict(result["detail"])
    t = r["type"]
    if t in ("realfake", "verify", "door"):
        p = entry["options"]
        d["chose"], d["right"] = p.index(d["chose"]), p.index(d["right"])
        d["options"] = [d["options"][i] for i in p]
    elif t == "sort":
        order = [r["items"][i]["id"] for i in entry["items"]]
        d["items"] = sorted(d["items"], key=lambda x: order.index(x["id"]))
    elif t == "mfa":
        d["prompts"] = [d["prompts"][i] for i in entry["prompts"]]
    return {**result, "detail": d}


def attempt_pct(scores):
    return round_half_up(100 * sum(scores) / len(scores)) if scores else 0


def sims_for_skills(doc, skill_ids):
    """The plan's simulations, in plan order (each skill's simulations in content order)."""
    by_skill = {}
    for s in doc["simulations"]:
        by_skill.setdefault(s["skill"], []).append(s)
    return [s for sk in skill_ids for s in by_skill.get(sk, [])]


def metadata(doc):
    """What every page may know about a simulation (web/js/content-data.js)."""
    return [{"id": s["id"], "skill": s["skill"], "title": s["title"], "minutes": s["minutes"], "rounds": len(s["rounds"]),
             "types": sorted({r["type"] for r in s["rounds"]}), "intro": s["intro"], "recap": s["recap"], "sources": s["sources"]}
            for s in doc["simulations"]]
