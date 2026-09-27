"""Ollivier-Ricci curvature of the metagraph's edges.

The metagraph has one node per plan and an edge wherever one recombination step can move
between two plans. For an edge (x, y),

    kappa(x, y) = 1 - W1(P(x, .), P(y, .))

where P(x, .) is a row of an exact transition matrix (self-loop mass included) and W1 is
the earth mover's distance under shortest-path distance in the metagraph.

The ground-truth curvature uses `reference_transition_matrix`, the Metropolised ReCom
chain it was first computed on (build_transition_matrix in the 4x4 curvature notebook),
not the RevReCom chain the page runs. Both chains have the same metagraph edges.
"""

from collections import deque
from itertools import combinations

import numpy as np
from scipy.optimize import linprog

from .enumerate import _connected, canonical_key, districts, spanning_tree_count
from .grid import CELLS, DISTRICT_SIZE, NEIGHBORS, NUM_DISTRICTS

ZERO_TOL = 1e-10
SIGNS = ["negative", "zero", "positive"]


def _adjacent(A, B):
    return any(w in B for v in A for w in NEIGHBORS[v])


def reference_transition_matrix(keys):
    """Metropolised ReCom: pick one of the C adjacent district pairs uniformly, draw a
    spanning tree of their union, cut one of its 7 edges uniformly (unbalanced cuts stay
    put), and accept with probability min(1, seam_old * C_old / (seam_new * C_new))."""
    idx = {k: i for i, k in enumerate(keys)}
    n_pairs = {k: sum(_adjacent(A, B) for A, B in combinations(districts(k), 2)) for k in keys}
    P = np.zeros((len(keys), len(keys)))
    for k in keys:
        D = districts(k)
        for a, b in combinations(range(NUM_DISTRICTS), 2):
            if not _adjacent(D[a], D[b]):
                continue
            region = D[a] | D[b]
            t_region = spanning_tree_count(region)
            seam_old = sum(1 for v in D[a] for w in NEIGHBORS[v] if w in D[b])
            for A in combinations(sorted(region), DISTRICT_SIZE):
                A = set(A)
                B = region - A
                if min(A) != min(region) or A in (D[a], D[b]) or not (_connected(A) and _connected(B)):
                    continue  # each unordered split once, and only splits that change the plan
                seam = sum(1 for v in A for w in NEIGHBORS[v] if w in B)
                new = [0] * len(CELLS)
                for j, d in enumerate(D):
                    for v in d:
                        new[v] = j
                for v in A:
                    new[v] = a
                for v in B:
                    new[v] = b
                key = canonical_key(new)
                proposal = spanning_tree_count(A) * spanning_tree_count(B) * seam / (
                    t_region * n_pairs[k] * (len(region) - 1))
                accept = min(1, seam_old * n_pairs[k] / (seam * n_pairs[key]))
                P[idx[k], idx[key]] += proposal * accept
        P[idx[k], idx[k]] = 1 - P[idx[k]].sum()
    return P


def metagraph(P):
    """Adjacency lists: i ~ j when either direction has positive probability."""
    n = len(P)
    return [[j for j in range(n) if j != i and (P[i, j] > 0 or P[j, i] > 0)] for i in range(n)]


def hop_distances(adj):
    n = len(adj)
    D = np.full((n, n), np.inf)
    for s in range(n):
        D[s, s] = 0
        queue = deque([s])
        while queue:
            v = queue.popleft()
            for w in adj[v]:
                if D[s, w] == np.inf:
                    D[s, w] = D[s, v] + 1
                    queue.append(w)
    return D


def wasserstein1(mu, nu, cost):
    """Exact W1 between two discrete distributions as a transport LP."""
    m, n = cost.shape
    A_eq = np.zeros((m + n, m * n))
    for i in range(m):
        A_eq[i, i * n:(i + 1) * n] = 1
    for j in range(n):
        A_eq[m + j, j::n] = 1
    res = linprog(cost.ravel(), A_eq=A_eq, b_eq=np.concatenate([mu, nu]), bounds=(0, None),
                  method="highs")
    if not res.success:
        raise RuntimeError(res.message)
    return res.fun


def edge_curvatures(P):
    """{(i, j): kappa} for every metagraph edge with i < j."""
    adj = metagraph(P)
    D = hop_distances(adj)
    out = {}
    for i in range(len(P)):
        for j in adj[i]:
            if j < i:
                continue
            si, sj = np.flatnonzero(P[i]), np.flatnonzero(P[j])
            out[(i, j)] = 1 - wasserstein1(P[i, si], P[j, sj], D[np.ix_(si, sj)])
    return out


def sign(kappa):
    if abs(kappa) <= ZERO_TOL:
        return "zero"
    return "positive" if kappa > 0 else "negative"
