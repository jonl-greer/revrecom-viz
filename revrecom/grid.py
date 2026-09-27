"""The 4x4 grid graph. Cells are integers 0..15, cell = row * N + col (row 0 at the top)."""

N = 4
NUM_DISTRICTS = 4
DISTRICT_SIZE = 4
CELLS = list(range(N * N))


def rc(cell):
    return divmod(cell, N)


def cell_at(r, c):
    return r * N + c


def _neighbors(cell):
    r, c = rc(cell)
    out = []
    for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        rr, cc = r + dr, c + dc
        if 0 <= rr < N and 0 <= cc < N:
            out.append(cell_at(rr, cc))
    return out


NEIGHBORS = {v: _neighbors(v) for v in CELLS}
EDGES = [(a, b) for a in CELLS for b in NEIGHBORS[a] if a < b]  # 24 grid edges
