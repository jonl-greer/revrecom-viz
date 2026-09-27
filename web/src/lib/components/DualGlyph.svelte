<script>
  import { GLYPHS } from '../thumbs.js';
  let { name, size = 56, color = 'currentColor' } = $props();
  const pad = 5;
  let g = $derived(GLYPHS[name]);
  const p = (xy) => xy.map((c) => pad + c * (size - 2 * pad));
</script>

<svg width={size} height={size} aria-hidden="true">
  {#each g.edges as [a, b]}
    <line x1={p(g.nodes[a])[0]} y1={p(g.nodes[a])[1]} x2={p(g.nodes[b])[0]} y2={p(g.nodes[b])[1]} stroke={color} stroke-width="2" />
  {/each}
  {#each g.nodes as n}
    <circle cx={p(n)[0]} cy={p(n)[1]} r="4" fill={color} />
  {/each}
</svg>
