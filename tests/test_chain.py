import random
from collections import Counter

from revrecom.chain import initial_plan, revrecom_step
from revrecom.enumerate import _connected, canonical_key
from revrecom.export import build_tables


def test_every_step_is_a_valid_plan():
    rng = random.Random(0)
    plan = initial_plan("strips")
    for _ in range(5000):
        ev = revrecom_step(plan, rng)
        plan = ev["new_plan"]
        for d in range(4):
            cells = {v for v in range(16) if plan[v] == d}
            assert len(cells) == 4 and _connected(cells)
        if ev["outcome"] != "accepted":
            assert ev["new_plan"] == ev["old_plan"]


def test_long_run_approaches_ground_truth():
    t = build_tables()
    dual_of = {p["key"]: p["dual"] for p in t["plans"]}
    rng = random.Random(1)
    plan = initial_plan("strips")
    counts, steps = Counter(), 200_000
    for _ in range(steps):
        plan = revrecom_step(plan, rng)["new_plan"]
        counts[dual_of[canonical_key(plan)]] += 1
    tv = 0.5 * sum(abs(counts[d["id"]] / steps - d["pi"]) for d in t["duals"])
    assert tv < 0.02
