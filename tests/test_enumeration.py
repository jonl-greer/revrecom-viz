import json

import numpy as np

from revrecom.chain import initial_plan
from revrecom.enumerate import canonical_key, enumerate_plans, transition_matrix, weight
from revrecom.export import OUT, build_tables


def test_counts():
    t = build_tables()
    assert len(t["plans"]) == 117
    assert len(t["orbits"]) == 22
    assert len(t["duals"]) == 5
    assert [c["value"] for c in t["cut_edges"]] == [8, 10, 11, 12]


def test_orbits_partition_plans():
    t = build_tables()
    assert sum(o["size"] for o in t["orbits"]) == 117
    for o in t["orbits"]:
        assert t["plans"][o["rep"]]["orbit"] == o["id"]


def test_distributions_sum_to_one():
    t = build_tables()
    for table in ("plans", "orbits", "duals", "cut_edges"):
        assert abs(sum(x["pi"] for x in t[table]) - 1) < 1e-9


def test_starting_plans_exist():
    keys = set(enumerate_plans())
    assert canonical_key(initial_plan("strips")) in keys
    assert canonical_key(initial_plan("quadrants")) in keys


def test_exported_json_is_up_to_date():
    assert json.loads(OUT.read_text()) == json.loads(json.dumps(build_tables())), \
        "run: python -m revrecom.export"


def test_revrecom_stationary_distribution_is_exact():
    """Build RevReCom's exact transition matrix on unlabeled plans and check its
    stationary distribution equals the spanning-tree distribution."""
    keys = enumerate_plans()
    P = transition_matrix(keys)
    assert np.all(P >= -1e-12)
    vals, vecs = np.linalg.eig(P.T)
    s = np.real(vecs[:, np.argmin(abs(vals - 1))])
    s /= s.sum()
    target = np.array([weight(k) for k in keys], float)
    target /= target.sum()
    assert 0.5 * np.abs(s - target).sum() < 1e-10
