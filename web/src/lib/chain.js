// Reversible ReCom, a direct port of revrecom/chain.py (itself faithful to GerryChain's
// `reversible_recom`). A plan is an array of 16 district labels (0..3), one per cell.
// Labels are colours only; the chain does not depend on them.

import { CELLS, DISTRICT_SIZE, NEIGHBORS, NUM_DISTRICTS, rc } from './grid.js';

const PAIRS = [];
for (let a = 0; a < NUM_DISTRICTS; a++) for (let b = 0; b < NUM_DISTRICTS; b++) PAIRS.push([a, b]);

export function initialPlan(kind = 'strips') {
  if (kind === 'strips') return CELLS.map((v) => rc(v)[0]);
  if (kind === 'quadrants') return CELLS.map((v) => Math.floor(rc(v)[0] / 2) * 2 + Math.floor(rc(v)[1] / 2));
  throw new Error(kind);
}

/** Relabel districts in order of first appearance: strips -> '0000111122223333'. */
export function canonicalKey(plan) {
  const relabel = new Map();
  let out = '';
  for (const label of plan) {
    if (!relabel.has(label)) relabel.set(label, relabel.size);
    out += relabel.get(label);
  }
  return out;
}

export const districtCells = (plan, d) => CELLS.filter((v) => plan[v] === d);

export const adjacent = (plan, d1, d2) =>
  d1 !== d2 && CELLS.some((v) => plan[v] === d1 && NEIGHBORS[v].some((w) => plan[w] === d2));

/** Uniform spanning tree of the subgraph induced on `region` (Wilson's algorithm).
 *  Returns [child, parent] edges. */
export function wilsonUST(region, rng) {
  const members = new Set(region);
  const inTree = new Set([rng.choice(region)]);
  const parent = new Map();
  for (const start of region) {
    const next = new Map();
    let u = start;
    while (!inTree.has(u)) { // loop-erased random walk
      const nbrs = NEIGHBORS[u].filter((w) => members.has(w));
      next.set(u, rng.choice(nbrs));
      u = next.get(u);
    }
    u = start;
    while (!inTree.has(u)) {
      inTree.add(u);
      parent.set(u, next.get(u));
      u = next.get(u);
    }
  }
  return region.filter((v) => parent.has(v)).map((v) => [v, parent.get(v)]);
}

function component(start, edges, removed) {
  const adj = new Map();
  for (const e of edges) {
    if (e === removed) continue;
    const [a, b] = e;
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  }
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    for (const u of adj.get(queue.shift()) ?? []) {
      if (!seen.has(u)) { seen.add(u); queue.push(u); }
    }
  }
  return seen;
}

/** The tree edge splitting the region 4|4, or null. (At most one exists on 8 nodes.) */
export function balancedCut(tree, region) {
  for (const e of tree) {
    const sideA = component(e[0], tree, e);
    if (sideA.size === DISTRICT_SIZE) {
      return { edge: e, sideA: [...sideA], sideB: region.filter((v) => !sideA.has(v)) };
    }
  }
  return null;
}

/**
 * One RevReCom step. Returns an event; ev.newPlan is the plan afterwards.
 * outcome: 'same' | 'not_adjacent' | 'no_cut' | 'rejected' | 'accepted'.
 * Everything except 'accepted' is a self-loop.
 */
export function revrecomStep(plan, rng) {
  const [d1, d2] = rng.choice(PAIRS);
  const ev = { pair: [d1, d2], oldPlan: plan, newPlan: plan };
  if (d1 === d2) return { ...ev, outcome: 'same' };
  if (!adjacent(plan, d1, d2)) return { ...ev, outcome: 'not_adjacent' };

  const old1 = districtCells(plan, d1);
  const old2 = districtCells(plan, d2);
  const region = [...old1, ...old2].sort((a, b) => a - b);
  const tree = wilsonUST(region, rng);
  Object.assign(ev, { region, tree });
  const cut = balancedCut(tree, region);
  if (!cut) return { ...ev, outcome: 'no_cut' };

  const { edge, sideA, sideB } = cut;
  // colours only: each new district keeps the old label it overlaps most
  const s1 = new Set(old1), s2 = new Set(old2);
  const overlap = (side, s) => side.filter((v) => s.has(v)).length;
  const keep = overlap(sideA, s1) + overlap(sideB, s2) >= overlap(sideA, s2) + overlap(sideB, s1);
  const [da, db] = keep ? [d1, d2] : [d2, d1];
  const proposal = plan.slice();
  for (const v of sideA) proposal[v] = da;
  for (const v of sideB) proposal[v] = db;
  const setB = new Set(sideB);
  const seam = [...sideA].sort((a, b) => a - b)
    .flatMap((a) => NEIGHBORS[a].filter((b) => setB.has(b)).map((b) => [a, b]));
  const prob = 1 / seam.length;
  const u = rng();
  const accepted = u < prob;
  return {
    ...ev, cutEdge: edge, sideA, sideB, proposal, seam, prob, u,
    newPlan: accepted ? proposal : plan,
    outcome: accepted ? 'accepted' : 'rejected',
  };
}
