// Lookups built from plans.json (written by `python -m revrecom.export`).
// Every histogram's bins are in the same order as the JSON tables.

import { canonicalKey } from './chain.js';

export function buildTables(data) {
  const keyToPlan = new Map(data.plans.map((p) => [p.key, p]));
  const n = data.plans.length;
  const edges = new Map(data.metagraph_edges.map((e) => [e.a * n + e.b, e]));
  return {
    ...data,
    /** Plan record for any labelled plan (colours ignored). */
    lookup: (plan) => keyToPlan.get(canonicalKey(plan)),
    /** Metagraph edge between two plan ids, or undefined if the chain can't move between them. */
    edge: (i, j) => edges.get(Math.min(i, j) * n + Math.max(i, j)),
  };
}

/** Total variation distance between observed counts and a table's ground truth. */
export function tvDistance(counts, total, bins) {
  if (!total) return null;
  let s = 0;
  for (let i = 0; i < bins.length; i++) s += Math.abs(counts[i] / total - bins[i].pi);
  return s / 2;
}
