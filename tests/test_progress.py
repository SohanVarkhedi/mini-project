def put(client, levels):
    r = client.put("/api/progress", json={"levels": levels})
    assert r.status_code == 200
    return r.get_json()


def test_unknown_level_ids_dropped(employee):
    c, _ = employee
    out = put(c, {"orientation": {"best": 80, "done": True}, "level99": {"best": 100}, "__proto__": {"best": 1}})
    assert list(out["levels"]) == ["orientation"]


def test_non_dict_level_dropped(employee):
    c, _ = employee
    out = put(c, {"orientation": "done", "inbox": {"best": 60}})
    assert list(out["levels"]) == ["inbox"]


def test_scores_clamped(employee):
    c, _ = employee
    L = put(c, {"orientation": {"best": 150, "last": -20, "stars": 9, "attempts": -3, "timeMs": 10**12}})["levels"]["orientation"]
    assert L["best"] == 100
    assert L["last"] == 0
    assert L["stars"] == 3
    assert L["attempts"] == 0
    assert L["timeMs"] == 10**9


def test_scores_in_range_kept(employee):
    c, _ = employee
    L = put(c, {"inbox": {"best": 73, "last": 55, "stars": 2, "attempts": 4, "done": 1}})["levels"]["inbox"]
    assert (L["best"], L["last"], L["stars"], L["attempts"], L["done"]) == (73, 55, 2, 4, True)


def test_bad_outcomes_dropped(employee):
    c, _ = employee
    outs = put(c, {"orientation": {"best": 90, "outcomes": {
        "usb": "safe", "qr": "acceptable", "sticky": "false_alarm", "laptop": "compromise",
        "x1": "hacked", "x2": None, "x3": 1, "x4": "SAFE",
    }}})["levels"]["orientation"]["outcomes"]
    assert outs == {"usb": "safe", "qr": "acceptable", "sticky": "false_alarm", "laptop": "compromise"}


def test_outcome_keys_truncated(employee):
    c, _ = employee
    outs = put(c, {"orientation": {"outcomes": {"k" * 50: "safe"}}})["levels"]["orientation"]["outcomes"]
    assert list(outs) == ["k" * 20]


def test_non_dict_levels_rejected(employee):
    c, _ = employee
    r = c.put("/api/progress", json={"levels": ["orientation"]})
    assert r.status_code == 400


def test_saved_progress_is_the_clean_copy(employee):
    c, _ = employee
    put(c, {"orientation": {"best": 999, "outcomes": {"usb": "nope"}}, "bogus": {}})
    prog = c.get("/api/state").get_json()["myProg"]
    assert prog["levels"] == {"orientation": {"best": 100, "last": 0, "stars": 0, "done": False, "attempts": 0,
                                              "completedAt": 0, "timeMs": 0, "outcomes": {}}}
    assert prog["lastActive"] > 0


def test_unparseable_numbers_count_as_zero(employee):
    c, _ = employee
    L = put(c, {"orientation": {"best": "abc", "last": [1], "stars": {"x": 1}, "attempts": "7",
                                "timeMs": None, "completedAt": "1e5", "done": True}})["levels"]["orientation"]
    assert (L["best"], L["last"], L["stars"], L["attempts"], L["timeMs"], L["completedAt"]) == (0, 0, 0, 7, 0, 0)


def test_non_finite_numbers_count_as_zero(employee):
    c, _ = employee
    r = c.put("/api/progress", data='{"levels": {"inbox": {"best": Infinity, "last": NaN}}}',
              content_type="application/json")
    assert r.status_code == 200
    L = r.get_json()["levels"]["inbox"]
    assert (L["best"], L["last"]) == (0, 0)
