import numpy as np

from revrecom.curvature import edge_curvatures, metagraph, reference_transition_matrix, sign
from revrecom.enumerate import enumerate_plans, transition_matrix, weight


def test_reference_chain_is_reversible_for_spanning_tree_distribution():
    keys = enumerate_plans()
    P = reference_transition_matrix(keys)
    pi = np.array([weight(k) for k in keys], float)
    pi /= pi.sum()
    assert np.all(P >= -1e-12)
    assert np.allclose(P.sum(axis=1), 1)
    flow = pi[:, None] * P
    assert np.abs(flow - flow.T).max() < 1e-15


def test_reference_chain_has_the_same_metagraph_as_revrecom():
    keys = enumerate_plans()
    assert metagraph(reference_transition_matrix(keys)) == metagraph(transition_matrix(keys))


def test_curvature_signs():
    kappa = edge_curvatures(reference_transition_matrix(enumerate_plans()))
    assert len(kappa) == 372
    signs = [sign(k) for k in kappa.values()]
    assert (signs.count("negative"), signs.count("zero"), signs.count("positive")) == (216, 16, 140)
