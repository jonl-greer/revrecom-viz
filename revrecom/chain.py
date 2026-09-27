"""Reversible ReCom, faithful to GerryChain's `reversible_recom`
(Cannon, Duchin, Randall & Rule 2022), specialised to 4 districts of 4 cells.

A plan is a tuple of 16 district labels (0..3), one per cell. Labels are colours only;
the chain's behaviour does not depend on them.
"""

from collections import deque

from .grid import CELLS, DISTRICT_SIZE, NEIGHBORS, NUM_DISTRICTS, rc


def initial_plan(kind="strips"):
    """'strips': four horizontal rows.  'quadrants': four 2x2 squares."""
    if kind == "strips":
        return tuple(rc(v)[0] for v in CELLS)
    if kind == "quadrants":
        return tuple((rc(v)[0] // 2) * 2 + rc(v)[1] // 2 for v in CELLS)
    raise ValueError(kind)


def district_cells(plan, d):
    return {v for v in CELLS if plan[v] == d}


def adjacent(plan, d1, d2):
    return d1 != d2 and any(plan[w] == d2 for v in CELLS if plan[v] == d1 for w in NEIGHBORS[v])


def wilson_ust(region, rng):
    """Uniform spanning tree of the subgraph induced on `region` (Wilson's algorithm).
    Returns a list of (child, parent) edges."""
    region = sorted(region)
    members = set(region)
    in_tree, parent = {rng.choice(region)}, {}
    for start in region:
        nxt, u = {}, start
        while u not in in_tree:  # loop-erased random walk
            nxt[u] = rng.choice([w for w in NEIGHBORS[u] if w in members])
            u = nxt[u]
        u = start
        while u not in in_tree:
            in_tree.add(u)
            parent[u] = nxt[u]
            u = nxt[u]
    return [(v, parent[v]) for v in region if v in parent]


def component(start, edges, removed):
    adj = {}
    for a, b in edges:
        if (a, b) != removed:
            adj.setdefault(a, []).append(b)
            adj.setdefault(b, []).append(a)
    seen, queue = {start}, deque([start])
    while queue:
        for u in adj.get(queue.popleft(), []):
            if u not in seen:
                seen.add(u)
                queue.append(u)
    return seen


def balanced_cut(tree, region):
    """(edge, side_a, side_b) for the tree edge splitting the region 4|4, or None.
    A tree on 8 nodes has at most one such edge, so max_balanced_edge_cuts = 1."""
    for e in tree:
        side_a = component(e[0], tree, e)
        if len(side_a) == DISTRICT_SIZE:
            return e, side_a, set(region) - side_a
    return None


def revrecom_step(plan, rng, include_same_pair=True):
    """One RevReCom step. Returns an event dict; ev['new_plan'] is the plan afterwards.

    outcome is one of: 'same', 'not_adjacent', 'no_cut', 'rejected', 'accepted'.
    Every outcome except 'accepted' is a self-loop (new_plan == plan).
    """
    ds = range(NUM_DISTRICTS)
    pairs = [(a, b) for a in ds for b in ds if include_same_pair or a != b]
    d1, d2 = rng.choice(pairs)
    ev = {"pair": (d1, d2), "old_plan": plan, "new_plan": plan}
    if d1 == d2:
        return {**ev, "outcome": "same"}
    if not adjacent(plan, d1, d2):
        return {**ev, "outcome": "not_adjacent"}

    old1, old2 = district_cells(plan, d1), district_cells(plan, d2)
    region = old1 | old2
    tree = wilson_ust(region, rng)
    ev.update(region=region, tree=tree)
    cut = balanced_cut(tree, region)
    if cut is None:
        return {**ev, "outcome": "no_cut"}

    edge, side_a, side_b = cut
    # colours only: each new district keeps the old label it overlaps most
    if len(side_a & old1) + len(side_b & old2) >= len(side_a & old2) + len(side_b & old1):
        da, db = d1, d2
    else:
        da, db = d2, d1
    proposal = list(plan)
    for v in side_a:
        proposal[v] = da
    for v in side_b:
        proposal[v] = db
    proposal = tuple(proposal)
    seam = [(a, b) for a in sorted(side_a) for b in NEIGHBORS[a] if b in side_b]
    prob = 1 / len(seam)
    u = rng.random()
    accepted = u < prob
    ev.update(cut_edge=edge, proposal=proposal, seam=seam, prob=prob, u=u,
              new_plan=proposal if accepted else plan)
    return {**ev, "outcome": "accepted" if accepted else "rejected"}
