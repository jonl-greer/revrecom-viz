// Draws the grid and animates one RevReCom event, phase by phase, like the Manim scene.
// D3 owns everything inside the <svg> it is given.

import * as d3 from 'd3';
import { districtCells } from './chain.js';
import { COLORS, DISTRICT_COLORS, mergedColor } from './colors.js';
import { CELLS, EDGES, N, NEIGHBORS, rc } from './grid.js';

// Phase durations in ms at speed 1 (equal to the Manim scene at SPEED = 0.5).
export const BASE_MS = {
  select: 125, merge: 150, tree: 250, pause: 50, cut: 150, propose: 175, resolve: 150, stay: 150,
};

const S = 90; // cell size
const M = 10; // margin
export const GRID_PX = N * S + 2 * M;
const W = { grid: 1, border: 8, highlight: 7, tree: 5, cut: 9, node: 7 };
const DIM = 0.3;

const X = (v) => M + rc(v)[1] * S;
const Y = (v) => M + rc(v)[0] * S;
const CX = (v) => X(v) + S / 2;
const CY = (v) => Y(v) + S / 2;
const edgeKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

function side(v, dir) {
  const x = X(v), y = Y(v);
  return { u: [x, y, x + S, y], d: [x, y + S, x + S, y + S], l: [x, y, x, y + S], r: [x + S, y, x + S, y + S] }[dir];
}
function sharedSide(a, b) {
  const [ra, ca] = rc(a), [rb, cb] = rc(b);
  return side(a, rb < ra ? 'u' : rb > ra ? 'd' : cb < ca ? 'l' : 'r');
}
function outlineSegments(cells) {
  const set = new Set(cells);
  const segs = [];
  for (const v of cells) {
    const [r, c] = rc(v);
    for (const [dr, dc, dir] of [[-1, 0, 'u'], [1, 0, 'd'], [0, -1, 'l'], [0, 1, 'r']]) {
      const rr = r + dr, cc = c + dc;
      const inside = rr >= 0 && rr < N && cc >= 0 && cc < N && set.has(rr * N + cc);
      if (!inside) segs.push(side(v, dir));
    }
  }
  return segs;
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const done = (transition) => transition.end().catch(() => {});

export class GridAnimator {
  constructor(svgEl) {
    this.svg = d3.select(svgEl).attr('viewBox', `0 0 ${GRID_PX} ${GRID_PX}`);
    this.svg.selectAll('*').remove();
    // dark board, like the video: dimmed districts read as dark and white outlines stand out
    this.svg.append('rect').attr('width', GRID_PX).attr('height', GRID_PX).attr('rx', 6).attr('fill', COLORS.board);
    this.gCells = this.svg.append('g');
    this.gSeams = this.svg.append('g');
    this.gPerimeter = this.svg.append('g');
    this.gHighlight = this.svg.append('g');
    this.gTreeEdges = this.svg.append('g');
    this.gTreeNodes = this.svg.append('g');
    this.cells = this.gCells.selectAll('rect').data(CELLS).join('rect')
      .attr('x', X).attr('y', Y).attr('width', S).attr('height', S)
      .attr('stroke', COLORS.gridLine).attr('stroke-width', W.grid);
    this.gPerimeter.append('rect').attr('x', M).attr('y', M).attr('width', N * S).attr('height', N * S)
      .attr('fill', 'none').attr('stroke', COLORS.border).attr('stroke-width', W.border)
      .attr('stroke-linejoin', 'miter');
    this.seams = new Map();
    this.rate = 1;
  }

  // ---------- instant drawing ----------
  show(plan) {
    this.svg.selectAll('*').interrupt();
    this.gHighlight.selectAll('*').remove();
    this.gTreeEdges.selectAll('*').remove();
    this.gTreeNodes.selectAll('*').remove();
    this.cells.attr('fill', (v) => DISTRICT_COLORS[plan[v]]).attr('fill-opacity', 1);
    this.gSeams.selectAll('*').remove();
    this.seams.clear();
    for (const [v, w] of EDGES) {
      if (plan[v] !== plan[w]) {
        this.seams.set(edgeKey(v, w), this.segment(this.gSeams, sharedSide(v, w), COLORS.border, W.border));
      }
    }
    this.plan = plan;
  }

  segment(g, [x1, y1, x2, y2], color, width) {
    return g.append('line').attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2)
      .attr('stroke', color).attr('stroke-width', width).attr('stroke-linecap', 'square');
  }

  segments(g, segs, color, width) {
    const lines = segs.map((s) => this.segment(g, s, color, width).node());
    return d3.selectAll(lines);
  }

  // ---------- transition helpers ----------
  t(selection, phase, fraction = 1) {
    return selection.transition().duration((BASE_MS[phase] * fraction) / this.rate).ease(d3.easeCubicInOut);
  }

  cellSel(cells) {
    const set = new Set(cells);
    return this.cells.filter((v) => set.has(v));
  }

  dimOthers(region, opacity, phase, fraction) {
    const set = new Set(region);
    return done(this.t(this.cells.filter((v) => !set.has(v)), phase, fraction).attr('fill-opacity', opacity));
  }

  draw(lines, phase, fraction = 1) {
    // "Create": stroke draws along the line
    lines.each(function () {
      const len = Math.hypot(this.x2.baseVal.value - this.x1.baseVal.value, this.y2.baseVal.value - this.y1.baseVal.value);
      d3.select(this).attr('stroke-dasharray', `${len} ${len}`).attr('stroke-dashoffset', len);
    });
    return done(this.t(lines, phase, fraction).attr('stroke-dashoffset', 0))
      .then(() => lines.attr('stroke-dasharray', null));
  }

  fadeOut(selection, phase, fraction = 1) {
    return done(this.t(selection, phase, fraction).attr('opacity', 0)).then(() => selection.remove());
  }

  // ---------- one event ----------
  async animate(ev, rate = 1) {
    this.rate = rate;
    const plan = ev.oldPlan;
    const [d1, d2] = ev.pair;
    const c1 = districtCells(plan, d1);
    const c2 = d1 === d2 ? [] : districtCells(plan, d2);
    const region = [...c1, ...c2];

    // 1. select
    const hl = this.segments(this.gHighlight, [...outlineSegments(c1), ...outlineSegments(c2)],
      COLORS.highlight, W.highlight).attr('opacity', 0);
    await Promise.all([
      this.dimOthers(region, DIM, 'select'),
      done(this.t(hl, 'select').attr('opacity', 1)),
    ]);
    if (ev.outcome === 'same' || ev.outcome === 'not_adjacent') {
      await done(this.t(hl, 'stay', 0.5).attr('stroke', COLORS.reject));
      await Promise.all([this.fadeOut(hl, 'stay', 0.5), this.dimOthers(region, 1, 'stay', 0.5)]);
      return;
    }

    // 2. merge
    const seamKeys = [...this.seams.keys()].filter((k) => {
      const [a, b] = k.split('-').map(Number);
      const labels = new Set([plan[a], plan[b]]);
      return labels.has(d1) && labels.has(d2);
    });
    const oldSeams = d3.selectAll(seamKeys.map((k) => this.seams.get(k).node()));
    seamKeys.forEach((k) => this.seams.delete(k));
    const merged = this.segments(this.gHighlight, outlineSegments(region), COLORS.highlight, W.highlight)
      .attr('opacity', 0);
    await Promise.all([
      this.fadeOut(oldSeams, 'merge'),
      this.fadeOut(hl, 'merge'),
      done(this.t(merged, 'merge').attr('opacity', 1)),
      done(this.t(this.cellSel(region), 'merge').attr('fill', mergedColor(d1, d2))),
    ]);

    // 3. one spanning tree: nodes pop in, edges draw
    const nodes = this.gTreeNodes.selectAll(null).data(region).enter().append('circle')
      .attr('cx', CX).attr('cy', CY).attr('r', 0).attr('fill', COLORS.tree);
    const edgeEls = new Map();
    for (const e of ev.tree) {
      const line = this.segment(this.gTreeEdges, [CX(e[0]), CY(e[0]), CX(e[1]), CY(e[1])], COLORS.tree, W.tree)
        .attr('stroke-linecap', 'round');
      edgeEls.set(e, line);
    }
    const edges = d3.selectAll([...edgeEls.values()].map((s) => s.node()));
    await Promise.all([
      done(this.t(nodes, 'tree', 0.4).delay((_, i) => (i * BASE_MS.tree * 0.05) / this.rate).attr('r', W.node)),
      sleep((BASE_MS.tree * 0.3) / this.rate).then(() => this.draw(edges, 'tree', 0.7)),
    ]);
    await sleep(BASE_MS.pause / this.rate);

    if (ev.outcome === 'no_cut') {
      await Promise.all([
        done(this.t(edges, 'stay', 0.5).attr('stroke', COLORS.reject)),
        done(this.t(merged, 'stay', 0.5).attr('stroke', COLORS.reject)),
      ]);
      await this.revert(plan, region, [nodes, edges, merged]);
      return;
    }

    // 4. cut edge: pink flash, then cut
    const cutLine = edgeEls.get(ev.cutEdge);
    await done(this.t(cutLine, 'cut', 0.5).attr('stroke', COLORS.cut).attr('stroke-width', W.cut));
    const mx = (CX(ev.cutEdge[0]) + CX(ev.cutEdge[1])) / 2, my = (CY(ev.cutEdge[0]) + CY(ev.cutEdge[1])) / 2;
    await done(this.t(cutLine, 'cut', 0.5).attr('x1', mx).attr('y1', my).attr('x2', mx).attr('y2', my)
      .attr('opacity', 0));
    cutLine.remove();

    // 5. proposal: new districts, seam drawn in pink
    const proposal = ev.proposal;
    const propSeams = ev.seam.map(([a, b]) => ({
      key: edgeKey(a, b), line: this.segment(this.gSeams, sharedSide(a, b), COLORS.cut, W.border),
    }));
    const propSel = d3.selectAll(propSeams.map((s) => s.line.node()));
    const rest = d3.selectAll([...edgeEls.entries()].filter(([e]) => e !== ev.cutEdge).map(([, s]) => s.node()));
    await Promise.all([
      done(this.t(this.cellSel(region), 'propose').attr('fill', (v) => DISTRICT_COLORS[proposal[v]])),
      this.fadeOut(nodes, 'propose'),
      this.fadeOut(rest, 'propose'),
      this.draw(propSel, 'propose'),
    ]);
    await sleep(BASE_MS.pause / this.rate);

    // 6. accept (seam turns black) or reject (seam flashes red, revert)
    if (ev.outcome === 'accepted') {
      propSeams.forEach(({ key, line }) => this.seams.set(key, line));
      await Promise.all([
        done(this.t(propSel, 'resolve').attr('stroke', COLORS.border)),
        this.fadeOut(merged, 'resolve'),
        this.dimOthers(region, 1, 'resolve'),
      ]);
      this.plan = ev.newPlan;
    } else {
      await Promise.all([
        done(this.t(propSel, 'stay', 0.5).attr('stroke', COLORS.reject)),
        done(this.t(merged, 'stay', 0.5).attr('stroke', COLORS.reject)),
      ]);
      await this.revert(plan, region, [propSel, merged]);
    }
  }

  /** Return the region to how it was before this step (a self-loop). */
  async revert(plan, region, toRemove) {
    const inRegion = new Set(region);
    const lines = [];
    for (const a of region) {
      for (const b of NEIGHBORS[a]) {
        if (a < b && inRegion.has(b) && plan[a] !== plan[b]) {
          const line = this.segment(this.gSeams, sharedSide(a, b), COLORS.border, W.border);
          this.seams.set(edgeKey(a, b), line);
          lines.push(line.node());
        }
      }
    }
    await Promise.all([
      done(this.t(this.cellSel(region), 'resolve').attr('fill', (v) => DISTRICT_COLORS[plan[v]])),
      ...toRemove.map((s) => this.fadeOut(s, 'resolve')),
      this.draw(d3.selectAll(lines), 'resolve'),
      this.dimOthers([...inRegion], 1, 'resolve'),
    ]);
  }
}
