<script>
  import { HistogramChart } from '../histogram.js';

  let {
    bins, counts, total, version, scale = 'linear', drop = -1, ms = 0,
    axis = 'none', axisData = [], groups = null, shadow = true, width = 640, height = 180, onhover, label,
  } = $props();

  let svgEl;
  let chart;

  $effect(() => {
    // re-run whenever a step is recorded or the scale changes
    const v = version, s = scale, d = drop, dur = ms, t = total;
    if (!chart) chart = new HistogramChart(svgEl, { bins, axis, axisData, groups, shadow, width, height, onhover });
    chart.update({ counts, total: t, scale: s, drop: d, ms: dur });
    void v;
  });
</script>

<svg bind:this={svgEl} role="img" aria-label={label}></svg>

<style>
  svg { display: block; width: 100%; height: auto; overflow: visible; }
</style>
