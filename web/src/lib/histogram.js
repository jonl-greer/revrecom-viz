// A histogram of observed visit shares (bars) over ground-truth probabilities (shadows).
// D3 owns everything inside the <svg> it is given.

import * as d3 from 'd3';
import { COLORS } from './colors.js';
import { drawGlyph, drawPlanThumb } from './thumbs.js';

const LOG_MIN = 1e-4;
const LOG_TICKS = [1e-4, 1e-3, 1e-2, 1e-1, 1];
const LOG_LABEL = { 1e-4: '0.01%', 1e-3: '0.1%', 1e-2: '1%', 1e-1: '10%', 1: '100%' };
const AXIS_SPACE = { none: 4, labels: 22, thumbs: 30, glyphs: 38 };

export class HistogramChart {
  /**
   * @param svgEl   the <svg>
   * @param opts.bins    [{pi, ...}] in display order
   * @param opts.axis    'none' | 'labels' | 'thumbs' | 'glyphs'
   * @param opts.axisData per-bin label text / plan key / glyph name
   * @param opts.groups  optional per-bin group id, drawn as an alternating band (orbits)
   * @param opts.onhover (index | null, event) => void
   */
  constructor(svgEl, { bins, axis = 'none', axisData = [], groups = null, width, height, onhover }) {
    this.bins = bins;
    this.width = width;
    this.height = height;
    this.m = { top: 18, right: 4, left: 44, bottom: AXIS_SPACE[axis] + (groups ? 7 : 0) };
    this.innerH = height - this.m.top - this.m.bottom;
    this.maxPi = d3.max(bins, (b) => b.pi);

    const svg = d3.select(svgEl).attr('viewBox', `0 0 ${width} ${height}`);
    svg.selectAll('*').remove();
    const g = svg.append('g').attr('transform', `translate(${this.m.left},${this.m.top})`);
    this.x = d3.scaleBand().domain(d3.range(bins.length)).range([0, width - this.m.left - this.m.right])
      .paddingInner(bins.length > 50 ? 0.12 : 0.18).paddingOuter(0.05);
    this.barFrac = bins.length > 50 ? 0.7 : 0.5;

    this.gAxis = g.append('g').attr('class', 'y-axis');
    this.gShadows = g.append('g');
    this.gBars = g.append('g');
    this.gStrips = g.append('g');
    this.gOverflow = g.append('g');
    const gBottom = g.append('g').attr('transform', `translate(0,${this.innerH})`);
    this.gHover = g.append('g');

    this.shadows = this.gShadows.selectAll('rect').data(bins).join('rect')
      .attr('x', (_, i) => this.x(i)).attr('width', this.x.bandwidth()).attr('fill', COLORS.shadow);
    const bw = this.x.bandwidth() * this.barFrac;
    this.barX = (i) => this.x(i) + (this.x.bandwidth() - bw) / 2;
    this.barW = bw;
    this.bars = this.gBars.selectAll('rect').data(bins).join('rect')
      .attr('x', (_, i) => this.barX(i)).attr('width', bw).attr('fill', COLORS.ink)
      .attr('y', this.innerH).attr('height', 0);

    gBottom.append('line').attr('x1', 0).attr('x2', this.x.range()[1])
      .attr('stroke', COLORS.ink).attr('stroke-width', 1);

    // group band (e.g. orbits under the plan bins)
    let axisTop = 3;
    if (groups) {
      gBottom.selectAll('rect.band').data(bins).join('rect').attr('class', 'band')
        .attr('x', (_, i) => this.x(i) - (this.x.step() - this.x.bandwidth()) / 2).attr('width', this.x.step())
        .attr('y', 3).attr('height', 4)
        .attr('fill', (_, i) => (groups[i] % 2 ? COLORS.bandA : COLORS.bandB));
      axisTop = 10;
    }

    const cx = (i) => this.x(i) + this.x.bandwidth() / 2;
    if (axis === 'labels') {
      gBottom.selectAll('text').data(axisData).join('text')
        .attr('x', (_, i) => cx(i)).attr('y', axisTop + 13).attr('text-anchor', 'middle')
        .attr('class', 'axis-label').text((d) => d);
    } else if (axis === 'thumbs') {
      const size = Math.min(this.x.bandwidth(), 24);
      axisData.forEach((key, i) => drawPlanThumb(
        gBottom.append('g').attr('transform', `translate(${cx(i) - size / 2},${axisTop + 2})`), key, size));
    } else if (axis === 'glyphs') {
      const size = 26;
      axisData.forEach((name, i) => drawGlyph(
        gBottom.append('g').attr('transform', `translate(${cx(i) - size / 2},${axisTop + 5})`), name, size, COLORS.ink));
    }

    // hover targets span the whole column, including the axis picture
    this.gHover.selectAll('rect').data(bins).join('rect')
      .attr('x', (_, i) => this.x(i) - (this.x.step() - this.x.bandwidth()) / 2).attr('width', this.x.step())
      .attr('y', 0).attr('height', this.innerH + this.m.bottom)
      .attr('fill', 'transparent')
      .on('mouseenter mousemove', (event, d) => {
        const i = bins.indexOf(d);
        this.shadows.attr('stroke', (_, j) => (j === i ? COLORS.ink : null)).attr('stroke-width', 1);
        onhover?.(i, event);
      })
      .on('mouseleave', () => {
        this.shadows.attr('stroke', null);
        onhover?.(null, null);
      });

    this.scaleMode = null;
    this.yMax = null;
  }

  yScale(scale, maxObserved) {
    if (scale === 'log') return d3.scaleLog().domain([LOG_MIN, 1]).range([this.innerH, 0]).clamp(true);
    // fixed to the ground truth's range so the shadows never jump; taller bars are clipped
    // at the top and labelled with their value
    const top = Math.ceil((this.maxPi * 1.15) / 0.05) * 0.05;
    return d3.scaleLinear().domain([0, top]).range([this.innerH, 0]).clamp(true);
  }

  /**
   * @param counts  Float64Array of visits per bin
   * @param total   number of steps so far
   * @param scale   'linear' | 'log'
   * @param drop    bin index that just got a visit (-1 for none)
   * @param ms      animation length; 0 = update instantly
   */
  update({ counts, total, scale, drop = -1, ms = 0 }) {
    const share = (i) => (total ? counts[i] / total : 0);
    const maxObserved = total ? d3.max(this.bins, (_, i) => share(i)) : 0;
    const y = this.yScale(scale, maxObserved);
    const h = (v) => (scale === 'log' && v < LOG_MIN ? 0 : this.innerH - y(v));
    const top = y.domain()[1];
    const over = total ? this.bins.map((_, i) => i).filter((i) => share(i) > top) : [];
    this.gOverflow.selectAll('text').data(over, (i) => i).join('text')
      .attr('class', 'overflow-label').attr('text-anchor', 'middle').attr('y', -5)
      .attr('x', (i) => this.x(i) + this.x.bandwidth() / 2)
      .text((i) => `${Math.round(share(i) * 100)}%`);
    const scaleChanged = scale !== this.scaleMode;
    this.scaleMode = scale;

    const axis = scale === 'log'
      ? d3.axisLeft(y).tickValues(LOG_TICKS).tickFormat((v) => LOG_LABEL[v])
      : d3.axisLeft(y).ticks(4).tickFormat(d3.format('.0%'));
    axis.tickSizeOuter(0).tickSize(4);
    const dur = scaleChanged ? 300 : ms;
    const tr = (sel) => (dur ? sel.transition().duration(dur).ease(d3.easeCubicOut) : sel);

    tr(this.gAxis).call(axis);
    tr(this.shadows).attr('y', (b) => this.innerH - h(b.pi)).attr('height', (b) => h(b.pi));

    const barsUpdate = () => tr(this.bars)
      .attr('y', (_, i) => this.innerH - h(share(i))).attr('height', (_, i) => h(share(i)));

    if (drop >= 0 && ms > 0) {
      // a strip falls into the bin, then every bar settles to its new share
      const fall = ms * 0.55;
      const target = this.innerH - h(share(drop));
      const strip = this.gStrips.append('rect')
        .attr('x', this.barX(drop)).attr('width', this.barW).attr('y', -6).attr('height', 4)
        .attr('fill', COLORS.cut).attr('rx', 1);
      strip.transition().duration(fall).ease(d3.easeQuadIn).attr('y', target - 4)
        .transition().duration(ms * 0.45).attr('opacity', 0).remove();
      if (this.pending) clearTimeout(this.pending);
      this.pending = setTimeout(() => { this.pending = null; barsUpdate(); }, fall);
    } else {
      if (this.pending) { clearTimeout(this.pending); this.pending = null; }
      barsUpdate();
    }
  }
}
