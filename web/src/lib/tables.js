// Lookups built from plans.json (written by `python -m revrecom.export`).
// Every histogram's bins are in the same order as the JSON tables.

import { canonicalKey } from './chain.js';

export function buildTables(data) {
  const keyToPlan = new Map(data.plans.map((p) => [p.key, p]));
  return {
    ...data,
    /** Plan record for any labelled plan (colours ignored). */
    lookup: (plan) => keyToPlan.get(canonicalKey(plan)),
  };
}

/** Total variation distance between observed counts and a table's ground truth. */
export function tvDistance(counts, total, bins) {
  if (!total) return null;
  let s = 0;
  for (let i = 0; i < bins.length; i++) s += Math.abs(counts[i] / total - bins[i].pi);
  return s / 2;
}
