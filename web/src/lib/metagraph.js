// The metagraph: one node per plan (drawn as the plan itself), one edge per move the chain
// can make, coloured by that edge's Ollivier-Ricci curvature. A ball sits under the
// current plan and travels every edge the chain crosses, in order, leaving a fading trail.
// D3 owns everything inside the <svg> it is given.

import * as d3 from 'd3';
import { COLORS } from './colors.js';
import { drawPlanThumb } from './thumbs.js';

// diverging: red (negative) <- grey (zero) -> blue (positive), darker further from zero.
// The midpoint grey is darker than a chart-white so near-zero edges stay visible on paper.
const NEG = '#B2182B';
const MID = '#BCC2CD';
const POS = '#2166AC';
const TRAIL = 60; // most recent crossed edges left glowing

/** Symmetric around zero so equal |kappa| gets equal darkness on both sides. */
export function curvatureScale(edges) {
  const m = d3.max(edges, (e) => Math.abs(e.kappa));
  const neg = d3.interpolateLab(MID, NEG), pos = d3.interpolateLab(MID, POS);
  const color = (k) => (k < 0 ? neg(Math.min(1, -k / m)) : pos(Math.min(1, k / m)));
  color.max = m;
  return color;
}

/** Deterministic force layout (d3-force starts from a phyllotaxis, no randomness). */
function layout(plans, edges, width, height, size) {
  const nodes = plans.map((p) => ({ id: p.id }));
  const links = edges.map((e) => ({ source: e.a, target: e.b }));
  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id((d) => d.id).distance(size * 2.2).strength(0.35))
    .force('charge', d3.forceManyBody().strength(-size * 9))
    .force('collide', d3.forceCollide(size * 0.85))
    .force('x', d3.forceX(0).strength(0.04))
    .force('y', d3.forceY(0).strength(0.04))
    .stop();
  for (let i = 0; i < 400; i++) sim.tick();
  const pad = size;
  const [x0, x1] = d3.extent(nodes, (d) => d.x);
  const [y0, y1] = d3.extent(nodes, (d) => d.y);
  // stretch each axis to fill the panel; the layout has no meaningful aspect ratio
  const kx = (width - 2 * pad) / (x1 - x0), ky = (height - 2 * pad) / (y1 - y0);
  return nodes.map((d) => [pad + kx * (d.x - x0), pad + ky * (d.y - y0)]);
}

export class MetagraphChart {
  /**
   * @param opts.plans   plan records (id, key)
   * @param opts.edges   metagraph edges {a, b, kappa, sign}
   * @param opts.onhover ({kind: 'plan'|'edge', i} | null, event) => void
   */
  constructor(svgEl, { plans, edges, width, height, size = 28, onhover }) {
    this.size = size;
    this.pos = layout(plans, edges, width, height, size);
    this.color = curvatureScale(edges);
    const P = (i) => this.pos[i];

    const svg = d3.select(svgEl).attr('viewBox', `0 0 ${width} ${height}`);
    svg.selectAll('*').remove();
    const gEdges = svg.append('g');
    this.gCrossed = svg.append('g');
    this.ball = svg.append('circle').attr('r', size * 0.95).attr('fill', COLORS.cut)
      .attr('stroke', '#FFFFFF').attr('stroke-width', 2).attr('opacity', 0);
    const gNodes = svg.append('g');
    const gHover = svg.append('g');

    // strongest curvature on top, so the dark edges aren't buried under grey ones
    const order = d3.range(edges.length).sort((i, j) => Math.abs(edges[i].kappa) - Math.abs(edges[j].kappa));
    gEdges.selectAll('line').data(order).join('line')
      .attr('x1', (i) => P(edges[i].a)[0]).attr('y1', (i) => P(edges[i].a)[1])
      .attr('x2', (i) => P(edges[i].b)[0]).attr('y2', (i) => P(edges[i].b)[1])
      .attr('stroke', (i) => this.color(edges[i].kappa)).attr('stroke-width', 1.6)
      .attr('stroke-linecap', 'round');
    this.edges = edges;

    plans.forEach((p) => drawPlanThumb(
      gNodes.append('g').attr('transform', `translate(${P(p.id)[0] - size / 2},${P(p.id)[1] - size / 2})`),
      p.key, size));

    // hit targets: wide invisible strokes for edges, squares bigger than the node
    const hl = svg.append('g').attr('pointer-events', 'none');
    const leave = () => { hl.selectAll('*').remove(); onhover?.(null, null); };
    gHover.selectAll('line').data(order).join('line')
      .attr('x1', (i) => P(edges[i].a)[0]).attr('y1', (i) => P(edges[i].a)[1])
      .attr('x2', (i) => P(edges[i].b)[0]).attr('y2', (i) => P(edges[i].b)[1])
      .attr('stroke', 'transparent').attr('stroke-width', 8)
      .on('mouseenter mousemove', (event, i) => {
        hl.selectAll('*').remove();
        const e = edges[i];
        hl.append('line').attr('x1', P(e.a)[0]).attr('y1', P(e.a)[1]).attr('x2', P(e.b)[0]).attr('y2', P(e.b)[1])
          .attr('stroke', COLORS.ink).attr('stroke-width', 4).attr('stroke-linecap', 'round');
        hl.append('line').attr('x1', P(e.a)[0]).attr('y1', P(e.a)[1]).attr('x2', P(e.b)[0]).attr('y2', P(e.b)[1])
          .attr('stroke', this.color(e.kappa)).attr('stroke-width', 2).attr('stroke-linecap', 'round');
        onhover?.({ kind: 'edge', i }, event);
      })
      .on('mouseleave', leave);
    gHover.selectAll('rect').data(plans).join('rect')
      .attr('x', (p) => P(p.id)[0] - size * 0.7).attr('y', (p) => P(p.id)[1] - size * 0.7)
      .attr('width', size * 1.4).attr('height', size * 1.4).attr('fill', 'transparent')
      .on('mouseenter mousemove', (event, p) => {
        hl.selectAll('*').remove();
        hl.append('rect').attr('x', P(p.id)[0] - size / 2 - 2.5).attr('y', P(p.id)[1] - size / 2 - 2.5)
          .attr('width', size + 5).attr('height', size + 5).attr('fill', 'none')
          .attr('stroke', COLORS.ink).attr('stroke-width', 2).attr('rx', 2);
        onhover?.({ kind: 'plan', i: p.id }, event);
      })
      .on('mouseleave', leave);

    this.at = null;       // plan id the ball rests on (or is leaving)
    this.queue = [];      // hops still to travel: [from, to, kappa]
    this.progress = 0;    // 0..1 along queue[0]
    this.hopMs = 0;
    this.last = null;
    this.frame = null;
  }

  /** Put the ball on a plan with no travel (start, reset). */
  jump(current) {
    if (!(current >= 0)) return; // before the page has a plan
    this.queue = [];
    this.progress = 0;
    this.gCrossed.selectAll('*').interrupt().remove();
    this.at = current;
    const [x, y] = this.pos[current];
    this.ball.attr('cx', x).attr('cy', y).attr('opacity', 1);
  }

  /**
   * Queue edges for the ball to travel, in the order the chain crossed them.
   * @param hops   [{from, to, kappa}]
   * @param hopMs  time per edge; the ball speeds up when hops pile up, but never skips one
   */
  travel(hops, hopMs) {
    this.hopMs = hopMs;
    for (const h of hops) this.queue.push([h.from, h.to, h.kappa]);
    if (this.queue.length && this.frame == null) {
      this.last = performance.now();
      this.frame = requestAnimationFrame((t) => this.tick(t));
    }
  }

  tick(now) {
    let budget = now - this.last;
    this.last = now;
    const done = [];
    while (this.queue.length) {
      // catch up when behind: a backlog of n hops runs about n/2 times faster. At high
      // turbo speeds that means several edges per frame, each still travelled and trailed.
      const ms = Math.max(1, this.hopMs / Math.max(1, this.queue.length / 2));
      const need = (1 - this.progress) * ms;
      if (budget < need) { this.progress += budget / ms; break; }
      budget -= need;
      this.at = this.queue[0][1];
      this.progress = 0;
      done.push(this.queue.shift());
    }
    this.trail(done.slice(-TRAIL));
    const pos = this.queue.length ? this.lerp(this.queue[0], this.progress) : this.pos[this.at];
    this.ball.attr('cx', pos[0]).attr('cy', pos[1]);
    this.frame = this.queue.length ? requestAnimationFrame((t) => this.tick(t)) : null;
  }

  lerp([a, b], t) {
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; // ease in-out per edge
    const [ax, ay] = this.pos[a], [bx, by] = this.pos[b];
    return [ax + (bx - ax) * e, ay + (by - ay) * e];
  }

  /** Leave the edges just travelled glowing, fading out; keep only the latest TRAIL. */
  trail(hops) {
    const fade = Math.max(600, this.hopMs * 3);
    for (const [a, b, kappa] of hops) {
      const [ax, ay] = this.pos[a], [bx, by] = this.pos[b];
      this.gCrossed.append('line').attr('x1', ax).attr('y1', ay).attr('x2', bx).attr('y2', by)
        .attr('stroke', this.color(kappa)).attr('stroke-width', 5).attr('stroke-linecap', 'round')
        .transition().duration(fade).ease(d3.easeQuadIn).attr('opacity', 0).remove();
    }
    const lines = this.gCrossed.selectAll('line').nodes();
    for (let i = 0; i < lines.length - TRAIL; i++) d3.select(lines[i]).interrupt().remove();
  }

  destroy() {
    if (this.frame != null) cancelAnimationFrame(this.frame);
  }
}
