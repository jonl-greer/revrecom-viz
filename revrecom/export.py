"""Build the ground-truth tables and write them as JSON for the web app.

    python -m revrecom.export            # writes web/src/lib/data/plans.json

Ordering (this is the histogram order on the page):
  orbits  : by probability, high to low; ties by orbit key
  plans   : by probability, high to low; ties by orbit (so symmetric plans sit together)
  duals   : by probability, high to low
  cut edges: numerical
  curvature: negative, zero, positive
Ids are positions in these orders.
"""

import json
from collections import defaultdict
from pathlib import Path

from .curvature import SIGNS, edge_curvatures, reference_transition_matrix, sign
from .enumerate import cut_edge_count, dual_class, enumerate_plans, orbit_key, weight

OUT = Path(__file__).resolve().parent.parent / "web" / "src" / "lib" / "data" / "plans.json"


def build_tables():
    keys = enumerate_plans()
    w = {k: weight(k) for k in keys}
    total = sum(w.values())
    pi = {k: w[k] / total for k in keys}

    orbit_of = {k: orbit_key(k) for k in keys}
    orbit_pi, orbit_members = defaultdict(float), defaultdict(list)
    for k in keys:
        orbit_pi[orbit_of[k]] += pi[k]
        orbit_members[orbit_of[k]].append(k)
    orbit_order = sorted(orbit_pi, key=lambda o: (-orbit_pi[o], o))
    orbit_id = {o: i for i, o in enumerate(orbit_order)}

    plan_order = sorted(keys, key=lambda k: (-pi[k], orbit_id[orbit_of[k]], k))
    plan_id = {k: i for i, k in enumerate(plan_order)}

    dual_of = {k: dual_class(k) for k in keys}
    dual_pi, dual_count = defaultdict(float), defaultdict(int)
    for k in keys:
        dual_pi[dual_of[k]] += pi[k]
        dual_count[dual_of[k]] += 1
    dual_order = sorted(dual_pi, key=lambda d: (-dual_pi[d], d))
    dual_id = {d: i for i, d in enumerate(dual_order)}

    cut_of = {k: cut_edge_count(k) for k in keys}
    cut_pi = defaultdict(float)
    for k in keys:
        cut_pi[cut_of[k]] += pi[k]
    cut_values = sorted(cut_pi)
    cut_id = {c: i for i, c in enumerate(cut_values)}

    kappa = edge_curvatures(reference_transition_matrix(keys))
    sign_id = {s: i for i, s in enumerate(SIGNS)}
    sign_count = defaultdict(int)
    for k in kappa.values():
        sign_count[sign(k)] += 1

    r = lambda x: round(x, 12)
    return {
        "generated_by": "python -m revrecom.export",
        "grid_size": 4,
        "total_weight": total,
        "plans": [
            {"id": plan_id[k], "key": k, "weight": w[k], "pi": r(pi[k]),
             "orbit": orbit_id[orbit_of[k]], "dual": dual_id[dual_of[k]],
             "cut_edges": cut_of[k], "cut_bin": cut_id[cut_of[k]]}
            for k in plan_order
        ],
        "orbits": [
            {"id": orbit_id[o], "rep": plan_id[o], "size": len(orbit_members[o]), "pi": r(orbit_pi[o])}
            for o in orbit_order
        ],
        "duals": [
            {"id": dual_id[d], "name": d, "plans": dual_count[d], "pi": r(dual_pi[d])}
            for d in dual_order
        ],
        "cut_edges": [{"id": cut_id[c], "value": c, "pi": r(cut_pi[c])} for c in cut_values],
        "curvature": [
            {"id": sign_id[s], "sign": s, "edges": sign_count[s]}
            for s in SIGNS
        ],
        "metagraph_edges": sorted((
            {"a": min(plan_id[keys[i]], plan_id[keys[j]]), "b": max(plan_id[keys[i]], plan_id[keys[j]]),
             "kappa": r(k), "sign": sign_id[sign(k)]}
            for (i, j), k in kappa.items()
        ), key=lambda e: (e["a"], e["b"])),
    }


def main():
    tables = build_tables()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(tables, indent=1) + "\n")
    signs = ", ".join(f"{c['edges']} {c['sign']}" for c in tables["curvature"])
    print(f"wrote {OUT}: {len(tables['plans'])} plans, {len(tables['orbits'])} orbits, "
          f"{len(tables['duals'])} dual classes, cut edges {[c['value'] for c in tables['cut_edges']]}, "
          f"{len(tables['metagraph_edges'])} metagraph edges ({signs})")


if __name__ == "__main__":
    main()
