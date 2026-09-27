// Small pictures used under histogram bins and in tooltips.
import { DISTRICT_COLORS } from './colors.js';
import { N } from './grid.js';

/** Node positions (unit box) and edges for each dual-graph class. */
export const GLYPHS = {
  path: { nodes: [[0, 0.5], [0.33, 0.5], [0.67, 0.5], [1, 0.5]], edges: [[0, 1], [1, 2], [2, 3]] },
  star: { nodes: [[0.5, 0.55], [0.5, 0], [0.05, 0.85], [0.95, 0.85]], edges: [[0, 1], [0, 2], [0, 3]] },
  '4-cycle': { nodes: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]], edges: [[0, 1], [1, 2], [2, 3], [3, 0]] },
  paw: { nodes: [[0.5, 0], [0.5, 0.42], [0.1, 1], [0.9, 1]], edges: [[0, 1], [1, 2], [1, 3], [2, 3]] },
  diamond: { nodes: [[0.5, 0], [0, 0.5], [1, 0.5], [0.5, 1]], edges: [[0, 1], [0, 2], [1, 3], [2, 3], [1, 2]] },
  K4: { nodes: [[0.5, 0], [0.05, 0.95], [0.95, 0.95], [0.5, 0.62]], edges: [[0, 1], [0, 2], [1, 2], [0, 3], [1, 3], [2, 3]] },
};

/** Cells of a plan key as {x, y, fill} squares in a size x size box. */
export function planSquares(key, size) {
  const s = size / N;
  return [...key].map((ch, v) => ({ x: (v % N) * s, y: Math.floor(v / N) * s, s, fill: DISTRICT_COLORS[+ch] }));
}

/** Borders between different districts, as [x1, y1, x2, y2] in a size x size box. */
export function planSeams(key, size) {
  const s = size / N;
  const out = [];
  for (let v = 0; v < N * N; v++) {
    const r = Math.floor(v / N), c = v % N;
    if (c < N - 1 && key[v] !== key[v + 1]) out.push([(c + 1) * s, r * s, (c + 1) * s, (r + 1) * s]);
    if (r < N - 1 && key[v] !== key[v + N]) out.push([c * s, (r + 1) * s, (c + 1) * s, (r + 1) * s]);
  }
  return out;
}

/** Draw a plan thumbnail into a d3 <g>. */
export function drawPlanThumb(g, key, size) {
  g.selectAll('rect').data(planSquares(key, size)).join('rect')
    .attr('x', (d) => d.x).attr('y', (d) => d.y).attr('width', (d) => d.s).attr('height', (d) => d.s)
    .attr('fill', (d) => d.fill);
  g.selectAll('line').data(planSeams(key, size)).join('line')
    .attr('x1', (d) => d[0]).attr('y1', (d) => d[1]).attr('x2', (d) => d[2]).attr('y2', (d) => d[3])
    .attr('stroke', '#11141B').attr('stroke-width', 1.2).attr('stroke-linecap', 'square');
  g.append('rect').attr('width', size).attr('height', size).attr('fill', 'none')
    .attr('stroke', '#11141B').attr('stroke-width', 1.2);
}

/** Draw a dual-graph glyph into a d3 <g>. */
export function drawGlyph(g, name, size, color) {
  const { nodes, edges } = GLYPHS[name];
  const p = (i) => nodes[i].map((c) => c * size);
  g.selectAll('line').data(edges).join('line')
    .attr('x1', ([a]) => p(a)[0]).attr('y1', ([a]) => p(a)[1])
    .attr('x2', ([, b]) => p(b)[0]).attr('y2', ([, b]) => p(b)[1])
    .attr('stroke', color).attr('stroke-width', 1.4);
  g.selectAll('circle').data(nodes).join('circle')
    .attr('cx', (d) => d[0] * size).attr('cy', (d) => d[1] * size).attr('r', 2.6).attr('fill', color);
}
