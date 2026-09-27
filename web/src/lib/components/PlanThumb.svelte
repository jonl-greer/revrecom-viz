<script>
  import { planSeams, planSquares } from '../thumbs.js';
  let { key, size = 64 } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 {size} {size}" aria-hidden="true">
  {#each planSquares(key, size) as sq}
    <rect x={sq.x} y={sq.y} width={sq.s} height={sq.s} fill={sq.fill}  />
  {/each}
  {#each planSeams(key, size) as [x1, y1, x2, y2]}
    <line {x1} {y1} {x2} {y2} stroke="#11141B" stroke-width="3" stroke-linecap="square" />
  {/each}
  <rect width={size} height={size} fill="none" stroke="#11141B" stroke-width="3" />
</svg>
