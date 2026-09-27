// The 4x4 grid graph. Cells are integers 0..15, cell = row * N + col (row 0 at the top).
// Mirrors revrecom/grid.py.

export const N = 4;
export const NUM_DISTRICTS = 4;
export const DISTRICT_SIZE = 4;
export const CELLS = Array.from({ length: N * N }, (_, i) => i);

export const rc = (v) => [Math.floor(v / N), v % N];

export const NEIGHBORS = CELLS.map((v) => {
  const [r, c] = rc(v);
  const out = [];
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && rr < N && cc >= 0 && cc < N) out.push(rr * N + cc);
  }
  return out;
});

export const EDGES = CELLS.flatMap((a) => NEIGHBORS[a].filter((b) => a < b).map((b) => [a, b]));
