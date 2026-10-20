"""phishverse/skills.py with tiny hand-made content, so every number can be checked by hand."""
import pytest

from phishverse.content import Content
from phishverse.skills import band, build_report, decision_points, habit_advice, plan_skills, summary

OUTCOMES = {"safe": {"pts": 1, "label": "Safe call", "icon": "✓", "col": "#0"},
            "acceptable": {"pts": 0.6, "label": "Not bad", "icon": "~", "col": "#0"},
            "false_alarm": {"pts": 0.4, "label": "False alarm", "icon": "!", "col": "#0"},
            "compromise": {"pts": 0, "label": "Compromised", "icon": "x", "col": "#0"}}
SKILLS = [{"id": "alpha", "name": "Alpha checks", "description": "a", "icon": "mail"},
          {"id": "beta", "name": "Beta calls", "description": "b", "icon": "phone"},
          {"id": "gamma", "name": "Gamma doors", "description": "c", "icon": "door"}]
ACTS = [{"l": "Report it", "o": "safe", "fb": "."}, {"l": "Ignore it", "o": "acceptable", "fb": "."},
        {"l": "Click it", "o": "compromise", "fb": ".", "sev": 1}, {"l": "Pay it", "o": "compromise", "fb": ".", "sev": 3}]


def scenario(tid, skills, cues, legit=False, sev2=False):
    acts = ([{"l": "Carry on", "o": "safe", "fb": "."}, {"l": "Report it", "o": "false_alarm", "fb": "."}] if legit else
            [dict(a) for a in ACTS])
    if sev2:
        acts[2]["sev"] = 2
    return {"id": tid, "label": tid, "at": {"obj": "x"}, "enc": {"ch": "email", "title": f"Scenario {tid}", "legit": legit,
            "skills": skills, "cues": cues, "difficulty": 1, "art": {"addr": f"{tid}@novac0rp.com"},
            "inspect": [{"l": "Look", "c": "Clue", "f": not legit}, {"l": "Look again", "c": "Clue", "f": not legit}],
            "acts": acts, "lesson": f"Lesson {tid}"}}


CONTENT = Content({"outcomes": OUTCOMES, "levels": [{"id": "L", "n": 1, "title": "L", "tasks": [
    scenario("s1", ["alpha", "beta"], ["urgency", "authority"]),
    scenario("s2", ["alpha"], ["urgency"]),
    scenario("s3", ["beta", "gamma"], ["authority"], legit=True),
    scenario("s4", ["gamma"], ["curiosity", "authority"], sev2=True),
    scenario("s5", ["beta"], ["authority"]),
]}]}, {"skills": SKILLS})


def d(task, action, inspected=1, ms=10000):
    acts = CONTENT.scored_task("L", task)["enc"]["acts"]
    return {"level_id": "L", "task_id": task, "action_index": action, "outcome": acts[action]["o"],
            "severity": acts[action].get("sev") if acts[action]["o"] == "compromise" else None,
            "n_inspections": inspected, "response_ms": ms}


def skill(report, sid):
    return next(s for s in report["skills"] if s["id"] == sid)


# ---------------------------------------------------------------- points and penalties
def test_decision_points():
    assert decision_points("safe", None, OUTCOMES) == (1, 0)
    assert decision_points("acceptable", None, OUTCOMES) == (0.6, 0)
    assert decision_points("false_alarm", None, OUTCOMES) == (0.4, 0)
    assert decision_points("compromise", 1, OUTCOMES) == (0, 0)
    assert decision_points("compromise", 2, OUTCOMES) == (0, 0.1)
    assert decision_points("compromise", 3, OUTCOMES) == (0, 0.2)


def test_weights_primary_one_secondary_half():
    # s1 safe   -> alpha (primary, w1): 1;  beta (secondary, w.5): .5
    # s2 accept -> alpha (w1): .6
    # alpha = (1 + .6) / 2 = 80 (evidence 2.0); beta = .5 / .5 = 100 but evidence .5 -> not enough evidence
    r = build_report(CONTENT, [d("s1", 0), d("s2", 1)], SKILLS)
    a, b = skill(r, "alpha"), skill(r, "beta")
    assert (a["score"], a["evidence"], a["band"]) == (80, 2.0, "strong")
    assert (b["score"], b["evidence"], b["band"]) == (100, 0.5, "insufficient")


def test_severity_penalty_lowers_the_skill():
    # alpha: s1 "Pay it" (compromise sev 3: 0 pts, -.2) + s2 safe (1)  ->  (1 - .2) / 2 = 40
    # beta (s1 secondary, w.5): 0 - .5 x .2 = -.1 -> floored at 0
    r = build_report(CONTENT, [d("s1", 3), d("s2", 0)], SKILLS)
    assert skill(r, "alpha")["score"] == 40
    plain = build_report(CONTENT, [d("s1", 2), d("s2", 0)], SKILLS)  # severity-1 compromise: no penalty
    assert skill(plain, "alpha")["score"] == 50


def test_severity_two_penalty_and_floor():
    # gamma: s4 compromise sev 2 (0, -.1) + s3 secondary safe (w.5: .5)  ->  (.5 - .1) / 1.5 = 26.7 -> 27
    r = build_report(CONTENT, [d("s4", 2), d("s3", 0)], SKILLS)
    assert skill(r, "gamma")["score"] == 27 and skill(r, "gamma")["evidence"] == 1.5
    # only the sev-2 compromise with some other evidence at 0: floored, never negative
    r = build_report(CONTENT, [d("s4", 2), d("s3", 1)], SKILLS)  # false alarm .4 x .5 = .2;  (.2 - .1) / 1.5 = 6.7 -> 7
    assert skill(r, "gamma")["score"] == 7


@pytest.mark.parametrize("score, evidence, expected", [
    (100, 3, "strong"), (80, 3, "strong"), (79, 3, "watch"), (60, 3, "watch"), (59, 3, "weak"), (0, 3, "weak"),
    (100, 1.49, "insufficient"), (0, 1.5, "weak"), (None, 0, "insufficient"),
])
def test_bands(score, evidence, expected):
    assert band(score, evidence) == expected


def test_not_enough_evidence_is_never_strong_or_weak():
    r = build_report(CONTENT, [d("s5", 3)], SKILLS)  # beta: one scenario, w 1.0 < 1.5
    assert skill(r, "beta")["band"] == "insufficient" and "beta" not in r["weak"] and r["weakest"] is None


# ---------------------------------------------------------------- cues
def test_cues_use_phishing_scenarios_only():
    # authority appears on s1, s4, s5 (phishing) and s3 (legit). Reporting the legit s3 is a false alarm,
    # but trusting genuine requests is the goal, so s3 must not count towards cue failures.
    r = build_report(CONTENT, [d("s1", 2), d("s3", 1), d("s4", 0), d("s5", 3), d("s2", 0)], SKILLS)
    cues = {c["cue"]: c for c in r["cues"]}
    assert cues["authority"]["scenarios"] == 3 and cues["authority"]["fails"] == 2 and cues["authority"]["rate"] == 67
    assert cues["urgency"]["scenarios"] == 2 and cues["urgency"]["fails"] == 1 and cues["urgency"]["rate"] == 50
    assert "curiosity" not in cues  # only one phishing scenario carries it
    assert [c["cue"] for c in r["cues"]] == ["authority", "urgency"]  # riskiest first, at most 3


def test_no_risky_cues_when_nothing_was_failed():
    r = build_report(CONTENT, [d("s1", 0), d("s2", 0), d("s5", 1)], SKILLS)
    assert r["cues"] == []


# ---------------------------------------------------------------- habits and the rest
def test_habits():
    ds = [d("s1", 0, inspected=2, ms=4000), d("s2", 0, inspected=0, ms=12000), d("s3", 1, inspected=1, ms=9000),
          d("s4", 0, inspected=0, ms=20000)]
    h = build_report(CONTENT, ds, SKILLS)["habits"]
    assert (h["decisions"], h["inspected"], h["inspection_rate"]) == (4, 2, 50)
    assert h["median_ms"] == 10500  # median of 4000, 9000, 12000, 20000
    assert (h["genuine"], h["false_alarms"], h["false_alarm_rate"]) == (1, 1, 100)


def test_habit_advice_wording():
    tips = [t["text"] for t in habit_advice({"decisions": 10, "inspected": 4, "median_ms": 3200, "genuine": 2, "false_alarms": 0})]
    assert tips[0] == "You opened clues before deciding in 4 of 10 situations. Checking first is the habit that catches most scams."
    assert "Slow down a little" in tips[1]
    assert tips[2].startswith("You trusted both genuine requests.")


def test_revealed_scenarios_for_weak_skills():
    r = build_report(CONTENT, [d("s1", 3), d("s2", 2), d("s3", 0)], SKILLS)
    a = skill(r, "alpha")
    assert a["band"] == "weak"
    first = a["revealed"][0]
    assert first["task_id"] == "s1" and first["chose"] == "Pay it" and first["safer"] == "Report it"  # worst first
    assert first["addresses"] == ["s1@novac0rp.com"]
    assert skill(r, "gamma")["revealed"] == []  # not weak: nothing listed


def test_summary_is_kind_and_specific():
    r = build_report(CONTENT, [d("s1", 3), d("s2", 2), d("s3", 0), d("s4", 0), d("s5", 0)], SKILLS)
    text = summary(r)
    assert text.count(".") <= 4 and "most at risk from alpha checks" in text
    assert summary(r, perspective="they").startswith("They")


def test_plan_skills_weak_then_watch():
    r = {"weak": ["beta"], "watch": ["alpha"]}
    assert plan_skills(r, include_watch=True) == ["beta", "alpha"]
    assert plan_skills(r, include_watch=False) == ["beta"]


def test_summary_only_links_cues_that_were_part_of_the_slips():
    # alpha's slip (s2 compromise) used urgency; authority failures happened on beta-only scenario s5.
    r = build_report(CONTENT, [d("s1", 0), d("s2", 2), d("s5", 2), d("s4", 2), d("s3", 0)], SKILLS)
    weakest = r["weakest"]["id"]
    text = summary(r)
    slipped = {c for x in next(s for s in r["skills"] if s["id"] == weakest)["revealed"] if x["outcome"] == "compromise" for c in x["cues"]}
    named = [c for c in r["cues"] if c["phrase"] in text]
    assert all(c["cue"] in slipped for c in named)


@pytest.mark.parametrize("n", [1, 2, 3, 10])
def test_safe_call_sentence_reads_naturally_for_every_count(n):
    from phishverse.skills import _safe_calls
    for k in range(n + 1):
        text = _safe_calls(k, n, True)
        assert text.endswith(".") and "start to build on" not in text
        assert " 0 of" not in text and "1 situations" not in text and "of 1 " not in text
        assert not (k == n and f"{k} of {n}" in text)  # "all 10" / "both", never "10 of 10"
    assert _safe_calls(0, 10, True) == "None of your 10 choices was the safe call."
    assert _safe_calls(7, 10, True) == "You made the safe call in 7 of 10 situations."
    assert _safe_calls(10, 10, False) == "They made the safe call in all 10 situations."


def test_zero_clues_advice():
    tips = habit_advice({"decisions": 6, "inspected": 0, "median_ms": None, "genuine": 0, "false_alarms": 0})
    assert tips[0]["text"] == "You decided without opening any clues. Checking first is the habit that catches most scams."
