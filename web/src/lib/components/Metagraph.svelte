<script>
  import { MetagraphChart, curvatureScale } from '../metagraph.js';

  // current: () => plan id, read on reset. hops: a plain array the page appends
  // {from, to, kappa} to, consumed on each version.
  let { plans, edges, current, hops, reset, version, hopMs = 0, width = 1176, height = 720, onhover } = $props();

  let svgEl;
  let chart;
  let lastReset = null;

  $effect(() => {
    const r = reset, ms = hopMs;
    void version;
    if (!chart) chart = new MetagraphChart(svgEl, { plans, edges, width, height, onhover });
    if (r !== lastReset) {
      lastReset = r;
      hops.length = 0;
      chart.jump(current());
    }
    chart.travel(hops.splice(0), ms);
  });
  $effect(() => () => chart?.destroy());

  // legend: the same scale, sampled across [-max, +max]
  const color = curvatureScale(edges);
  const m = color.max;
  const stops = Array.from({ length: 21 }, (_, i) => -m + (2 * m * i) / 20);
  const ticks = [-0.04, -0.02, 0, 0.02, 0.04].filter((t) => Math.abs(t) <= m);
  const LW = 260;
  const lx = (k) => ((k + m) / (2 * m)) * LW;
</script>

<div class="legend" aria-hidden="true">
  <span class="kscale"><span>Edge curvature κ: negative</span>
  <svg width={LW + 24} height="38" viewBox="-12 0 {LW + 24} 38">
    <defs>
      <linearGradient id="kappa-grad">
        {#each stops as k, i (i)}<stop offset="{(i / 20) * 100}%" stop-color={color(k)} />{/each}
      </linearGradient>
    </defs>
    <rect x="0" y="4" width={LW} height="8" rx="2" fill="url(#kappa-grad)" />
    {#each ticks as t (t)}
      <line x1={lx(t)} x2={lx(t)} y1="12" y2="16" stroke="currentColor" />
      <text x={lx(t)} y="28" text-anchor="middle">{t === 0 ? '0' : t.toFixed(2)}</text>
    {/each}
  </svg>
  <span>positive</span></span>
  <span class="ball"><span class="dot"></span> Current plan</span>
</div>

<svg bind:this={svgEl} class="graph" role="img"
  aria-label="Metagraph of the 117 plans, edges coloured by curvature, with the chain's current plan marked"></svg>

<style>
  .graph { display: block; width: 100%; height: auto; }
  .legend { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; font-size: 0.8rem; color: var(--muted); }
  .legend text { font-size: 11px; fill: var(--muted); font-variant-numeric: tabular-nums; }
  .kscale { display: inline-flex; align-items: flex-start; gap: 6px; line-height: 16px; }
  .ball { display: inline-flex; align-items: center; gap: 6px; }
  .dot { width: 12px; height: 12px; border-radius: 50%; background: var(--cut); box-shadow: 0 0 0 1.5px #fff, 0 0 0 2.5px var(--rule); }
</style>
