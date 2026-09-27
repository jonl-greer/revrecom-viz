// Run with: npm test   (node's built-in test runner)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { CELLS, NEIGHBORS } from './grid.js';
import { initialPlan, revrecomStep } from './chain.js';
import { makeRng } from './rng.js';
import { buildTables, tvDistance } from './tables.js';

const data = JSON.parse(readFileSync(new URL('./data/plans.json', import.meta.url)));
const tables = buildTables(data);

const connected = (cells) => {
  const set = new Set(cells), seen = new Set([cells[0]]), stack = [cells[0]];
  while (stack.length) for (const w of NEIGHBORS[stack.pop()]) if (set.has(w) && !seen.has(w)) { seen.add(w); stack.push(w); }
  return seen.size === cells.length;
};

test('tables have the expected sizes', () => {
  assert.equal(tables.plans.length, 117);
  assert.equal(tables.orbits.length, 22);
  assert.equal(tables.duals.length, 5);
  assert.deepEqual(tables.cut_edges.map((c) => c.value), [8, 10, 11, 12]);
});

test('every step lands on a known, valid plan', () => {
  const rng = makeRng(0);
  let plan = initialPlan('strips');
  for (let i = 0; i < 5000; i++) {
    const ev = revrecomStep(plan, rng);
    if (ev.outcome !== 'accepted') assert.equal(ev.newPlan, ev.oldPlan);
    plan = ev.newPlan;
    assert.ok(tables.lookup(plan), 'plan missing from plans.json');
    for (let d = 0; d < 4; d++) {
      const cells = CELLS.filter((v) => plan[v] === d);
      assert.equal(cells.length, 4);
      assert.ok(connected(cells));
    }
  }
});

test('long run approaches the spanning-tree distribution', () => {
  const rng = makeRng(1);
  let plan = initialPlan('strips');
  const steps = 300_000;
  const duals = new Float64Array(5), cuts = new Float64Array(4);
  for (let i = 0; i < steps; i++) {
    plan = revrecomStep(plan, rng).newPlan;
    const p = tables.lookup(plan);
    duals[p.dual]++;
    cuts[p.cut_bin]++;
  }
  assert.ok(tvDistance(duals, steps, tables.duals) < 0.02);
  assert.ok(tvDistance(cuts, steps, tables.cut_edges) < 0.02);
});
