"""Exact enumeration of every plan, with its D4 orbit, dual-graph class, cut-edge count,
and spanning-tree weight. Plans are identified by a canonical key: the 16 labels
relabelled in order of first appearance, e.g. strips -> '0000111122223333'."""

from itertools import combinations

import numpy as np

from .grid import CELLS, DISTRICT_SIZE, EDGES, N, NEIGHBORS, NUM_DISTRICTS, cell_at, rc


# ---------- canonical keys ----------
def canonical_key(plan):
    relabel, out = {}, []
    for label in plan:
        relabel.setdefault(label, len(relabel))
        out.append(str(relabel[label]))
    return "".join(out)


def key_to_plan(key):
    return tuple(int(ch) for ch in key)


def districts(key):
    plan = key_to_plan(key)
    return [frozenset(v for v in CELLS if plan[v] == d) for d in range(NUM_DISTRICTS)]


# ---------- the dihedral group D4 acting on cells ----------
def _sym(f):
    return [cell_at(*f(*rc(v))) for v in CELLS]


M = N - 1
SYMMETRIES = [_sym(f) for f in (
    lambda r, c: (r, c),          # identity
    lambda r, c: (c, M - r),      # rotate 90
    lambda r, c: (M - r, M - c),  # rotate 180
    lambda r, c: (M - c, r),      # rotate 270
    lambda r, c: (r, M - c),      # reflect left-right
    lambda r, c: (M - r, c),      # reflect top-bottom
    lambda r, c: (c, r),          # reflect main diagonal
    lambda r, c: (M - c, M - r),  # reflect anti-diagonal
)]


def apply_symmetry(sym, plan):
    out = [None] * len(CELLS)
    for v in CELLS:
        out[sym[v]] = plan[v]
    return tuple(out)


def orbit_key(key):
    plan = key_to_plan(key)
    return min(canonical_key(apply_symmetry(s, plan)) for s in SYMMETRIES)


# ---------- plan statistics ----------
def spanning_tree_count(cells):
    """Matrix-tree theorem on the subgraph induced by `cells`."""
    cells = sorted(cells)
    ix = {v: i for i, v in enumerate(cells)}
    L = np.zeros((len(cells), len(cells)))
    for v in cells:
        for w in NEIGHBORS[v]:
            if w in ix:
                L[ix[v], ix[v]] += 1
                L[ix[v], ix[w]] -= 1
    return int(round(np.linalg.det(L[1:, 1:]))) if len(cells) > 1 else 1


def weight(key):
    """Spanning-tree weight: product of spanning-tree counts of the districts."""
    return int(np.prod([spanning_tree_count(d) for d in districts(key)]))


def cut_edge_count(key):
    plan = key_to_plan(key)
    return sum(1 for a, b in EDGES if plan[a] != plan[b])


def dual_edges(key):
    plan = key_to_plan(key)
    return sorted({tuple(sorted((plan[a], plan[b]))) for a, b in EDGES if plan[a] != plan[b]})


DUAL_NAMES = {
    (3, (1, 1, 2, 2)): "path",
    (3, (1, 1, 1, 3)): "star",
    (4, (2, 2, 2, 2)): "4-cycle",
    (4, (1, 2, 2, 3)): "paw",
    (5, (2, 2, 3, 3)): "diamond",
    (6, (3, 3, 3, 3)): "K4",
}


def dual_class(key):
    """Isomorphism class of the district adjacency graph (4 nodes, connected)."""
    edges = dual_edges(key)
    degrees = tuple(sorted(sum(d in e for e in edges) for d in range(NUM_DISTRICTS)))
    return DUAL_NAMES[(len(edges), degrees)]


# ---------- enumeration ----------
def _connected(cells):
    cells = set(cells)
    start = next(iter(cells))
    seen, stack = {start}, [start]
    while stack:
        for w in NEIGHBORS[stack.pop()]:
            if w in cells and w not in seen:
                seen.add(w)
                stack.append(w)
    return len(seen) == len(cells)


def enumerate_plans():
    """All partitions of the grid into NUM_DISTRICTS connected districts of DISTRICT_SIZE."""
    keys = set()

    def grow(remaining, parts):
        if not remaining:
            plan = [0] * len(CELLS)
            for d, part in enumerate(parts):
                for v in part:
                    plan[v] = d
            keys.add(canonical_key(plan))
            return
        first = min(remaining)
        for rest in combinations(sorted(remaining - {first}), DISTRICT_SIZE - 1):
            part = {first, *rest}
            if _connected(part):
                grow(remaining - part, parts + [part])

    grow(set(CELLS), [])
    return sorted(keys)
