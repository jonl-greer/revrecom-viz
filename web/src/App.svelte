<script>
  import { onMount } from 'svelte';
  import DualGlyph from './lib/components/DualGlyph.svelte';
  import Histogram from './lib/components/Histogram.svelte';
  import Metagraph from './lib/components/Metagraph.svelte';
  import PlanThumb from './lib/components/PlanThumb.svelte';
  import { initialPlan, revrecomStep } from './lib/chain.js';
  import data from './lib/data/plans.json';
  import { int, pct } from './lib/format.js';
  import { GridAnimator, GRID_PX } from './lib/gridAnimator.js';
  import { makeRng } from './lib/rng.js';
  import { buildTables, tvDistance } from './lib/tables.js';

  const tables = buildTables(data);
  const reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- controls ----------
  let seed = $state(379);
  let start = $state('strips');
  let speed = $state(1);            // 1 = the Manim video at SPEED 0.5
  let turbo = $state(false);        // skip the grid animation
  let turboExp = $state(2);         // steps per frame = 10^turboExp
  let playing = $state(false);
  let scales = $state({ plans: 'linear', orbits: 'linear', duals: 'linear', cuts: 'linear', curvature: 'linear' });
  const stepsPerFrame = $derived(Math.max(1, Math.round(10 ** turboExp)));

  // ---------- chain state ----------
  let plan = initialPlan('strips');
  let planId = -1;
  let rng = makeRng(379);
  let step = $state(0);
  let accepted = $state(0);
  let moves = $state(0);            // steps that changed the plan, i.e. crossed a metagraph edge
  let version = $state(0);
  const hops = [];                  // edges crossed since the metagraph last drew
  let resets = $state(0);
  let drops = $state({ plans: -1, orbits: -1, duals: -1, cuts: -1, curvature: -1 });
  const counts = {
    plans: new Float64Array(tables.plans.length),
    orbits: new Float64Array(tables.orbits.length),
    duals: new Float64Array(tables.duals.length),
    cuts: new Float64Array(tables.cut_edges.length),
    curvature: new Float64Array(tables.curvature.length),
  };
  const NO_DROPS = { plans: -1, orbits: -1, duals: -1, cuts: -1, curvature: -1 };

  let gridEl;
  let animator;
  let runToken = 0;
  let busy = false;

  const tv = $derived.by(() => {
    void version;
    return {
      plans: tvDistance(counts.plans, step, tables.plans),
      orbits: tvDistance(counts.orbits, step, tables.orbits),
      duals: tvDistance(counts.duals, step, tables.duals),
      cuts: tvDistance(counts.cuts, step, tables.cut_edges),
    };
  });
  const dropMs = $derived(turbo || reducedMotion ? 0 : 420 / speed);
  // time for the metagraph ball to travel one edge
  const hopMs = $derived(reducedMotion ? 0 : turbo ? 150 : 420 / speed);

  function record(ev) {
    plan = ev.newPlan;
    step += 1;
    if (ev.outcome === 'accepted') accepted += 1;
    const p = tables.lookup(plan);
    counts.plans[p.id]++;
    counts.orbits[p.orbit]++;
    counts.duals[p.dual]++;
    counts.cuts[p.cut_bin]++;
    const prev = planId;
    const edge = p.id === prev ? null : tables.edge(prev, p.id);
    planId = p.id;
    if (edge) {
      hops.push({ from: prev, to: p.id, kappa: edge.kappa });
      moves += 1;
      counts.curvature[edge.sign]++;
    }
    return { p, edge };
  }

  async function animatedStep(token) {
    const ev = revrecomStep(plan, rng);
    await animator.animate(ev, speed);
    if (token !== runToken) return;
    const { p, edge } = record(ev);
    drops = reducedMotion ? NO_DROPS : { plans: p.id, orbits: p.orbit, duals: p.dual, cuts: p.cut_bin, curvature: edge ? edge.sign : -1 };
    version += 1;
  }

  function instantSteps(n) {
    for (let i = 0; i < n; i++) record(revrecomStep(plan, rng));
    animator.show(plan);
    drops = NO_DROPS;
    version += 1;
  }

  const nextFrame = () => new Promise((res) => requestAnimationFrame(res));

  async function loop() {
    const token = ++runToken;
    while (playing && token === runToken) {
      if (turbo) {
        instantSteps(stepsPerFrame);
        await nextFrame();
      } else {
        await animatedStep(token);
      }
    }
  }

  function togglePlay() {
    playing = !playing;
    if (playing) loop();
  }

  async function stepOnce() {
    if (playing || busy) return;
    busy = true;
    if (turbo) instantSteps(1);
    else await animatedStep(runToken);
    busy = false;
  }

  function reset() {
    playing = false;
    runToken += 1;
    busy = false;
    rng = makeRng(Number(seed) >>> 0);
    plan = initialPlan(start);
    planId = tables.lookup(plan).id;
    step = 0;
    accepted = 0;
    moves = 0;
    for (const c of Object.values(counts)) c.fill(0);
    drops = NO_DROPS;
    resets += 1;
    animator.show(plan);
    version += 1;
  }

  onMount(() => {
    animator = new GridAnimator(gridEl);
    reset();
  });

  // ---------- hover details ----------
  let hover = $state(null); // { kind, i, x, y }
  let innerWidth = $state(1200);
  let innerHeight = $state(800);
  const metaHover = (h, event) => {
    hover = h == null ? null : { kind: h.kind === 'plan' ? 'metaplan' : 'metaedge', i: h.i, x: event.clientX, y: event.clientY };
  };
  const hoverFor = (kind) => (i, event) => {
    hover = i == null ? null : { kind, i, x: event.clientX, y: event.clientY };
  };
  const detail = $derived.by(() => {
    void version;
    if (!hover) return null;
    const { kind, i } = hover;
    const observed = (arr) => (step ? arr[i] / step : null);
    if (kind === 'plans') {
      const p = tables.plans[i];
      return { kind, title: `Plan ${p.id + 1} of 117`, key: p.key, pi: p.pi, obs: observed(counts.plans), visits: counts.plans[i],
        note: `Orbit ${p.orbit + 1}, ${tables.duals[p.dual].name} dual graph, ${p.cut_edges} cut edges` };
    }
    if (kind === 'orbits') {
      const o = tables.orbits[i];
      return { kind, title: `Orbit ${o.id + 1} of 22`, key: tables.plans[o.rep].key, pi: o.pi, obs: observed(counts.orbits), visits: counts.orbits[i],
        note: `${o.size} ${o.size === 1 ? 'plan' : 'plans'} related by rotation or reflection` };
    }
    if (kind === 'duals') {
      const d = tables.duals[i];
      return { kind, title: `${d.name[0].toUpperCase()}${d.name.slice(1)}`, glyph: d.name, pi: d.pi, obs: observed(counts.duals), visits: counts.duals[i],
        note: `${d.plans} plans have this district adjacency graph` };
    }
    if (kind === 'metaplan') {
      const p = tables.plans[i];
      return { kind, title: `Plan ${p.id + 1} of 117${p.id === planId ? ' (current)' : ''}`, key: p.key, pi: p.pi,
        obs: observed(counts.plans), visits: counts.plans[i],
        note: `${tables.metagraph_edges.filter((e) => e.a === i || e.b === i).length} neighbours in the metagraph` };
    }
    if (kind === 'metaedge') {
      const e = tables.metagraph_edges[i];
      const [a, b] = [tables.plans[e.a], tables.plans[e.b]];
      return { kind, title: `Edge between plans ${a.id + 1} and ${b.id + 1}`, keys: [a.key, b.key],
        lines: [`κ = ${e.kappa.toFixed(4)} (${tables.curvature[e.sign].sign})`] };
    }
    if (kind === 'curvature') {
      const c = tables.curvature[i];
      return { kind, title: `${c.sign[0].toUpperCase()}${c.sign.slice(1)} curvature`,
        obs: moves ? counts.curvature[i] / moves : null, visits: counts.curvature[i], of: moves, unit: 'moves',
        note: `${c.edges} of ${tables.metagraph_edges.length} metagraph edges` };
    }
    const c = tables.cut_edges[i];
    return { kind, title: `${c.value} cut edges`, pi: c.pi, obs: observed(counts.cuts), visits: counts.cuts[i],
      note: 'Grid edges joining two different districts' };
  });

  const planGroups = tables.plans.map((p) => p.orbit);
  const orbitKeys = tables.orbits.map((o) => tables.plans[o.rep].key);
  const dualNames = tables.duals.map((d) => d.name);
  const cutLabels = tables.cut_edges.map((c) => String(c.value));
  const curvatureLabels = tables.curvature.map((c) => ({ negative: 'κ < 0', zero: 'κ = 0', positive: 'κ > 0' })[c.sign]);

  const HISTS = [
    { id: 'plans', title: 'Plans', sub: '117 plans, most to least likely. The band underneath groups plans by orbit.',
      bins: tables.plans, height: 190, axis: 'none', groups: planGroups, wide: true },
    { id: 'orbits', title: 'Orbits under rotation and reflection', sub: '22 orbits, most to least likely.',
      bins: tables.orbits, height: 190, axis: 'thumbs', axisData: orbitKeys, wide: true },
    { id: 'duals', title: 'District dual graphs', sub: 'Which districts border which.',
      bins: tables.duals, height: 200, width: 320, axis: 'glyphs', axisData: dualNames },
    { id: 'cuts', title: 'Cut edges', sub: 'Edges between districts.',
      bins: tables.cut_edges, height: 200, width: 320, axis: 'labels', axisData: cutLabels },
    { id: 'curvature', title: 'Curvature of edges crossed', sub: 'Ollivier-Ricci sign of the metagraph edge behind each move.',
      bins: tables.curvature, height: 200, width: 320, axis: 'labels', axisData: curvatureLabels, perMove: true, shadow: false },
  ];
</script>

<svelte:window bind:innerWidth bind:innerHeight />

<main>
  <header>
    <h1>RevReCom on 4×4 grid</h1>
    <p class="lede">
    </p>
  </header>

  <div class="layout">
    <section class="chain" aria-label="Chain">
      <svg bind:this={gridEl} class="grid" width={GRID_PX} height={GRID_PX} role="img"
        aria-label="Current districting plan"></svg>

      <dl class="counters">
        <div><dt>Step</dt><dd>{int(step)}</dd></div>
        <div><dt>Accepted moves</dt><dd>{int(accepted)}</dd></div>
      </dl>

      <div class="controls">
        <div class="buttons">
          <button class="primary" onclick={togglePlay}>{playing ? 'Pause' : 'Play'}</button>
          <button onclick={stepOnce} disabled={playing}>Step</button>
          <button onclick={reset}>Reset</button>
        </div>

        <label class="row">
          <span>Animation speed</span>
          <input type="range" min="0.25" max="4" step="0.25" bind:value={speed} disabled={turbo} />
          <output>{speed}×</output>
        </label>

        <label class="row check">
          <input type="checkbox" bind:checked={turbo} />
          <span>Skip the animation and run fast</span>
        </label>
        {#if turbo}
          <label class="row">
            <span>Steps per frame</span>
            <input type="range" min="0" max="3.7" step="0.1" bind:value={turboExp} />
            <output>{int(stepsPerFrame)}</output>
          </label>
        {/if}

        <div class="row pair">
          <label><span>Seed</span><input type="number" bind:value={seed} min="0" /></label>
          <label><span>Start from</span>
            <select bind:value={start}>
              <option value="strips">Strips</option>
              <option value="quadrants">Squares</option>
            </select>
          </label>
        </div>
        <p class="hint">Seed and start take effect on reset.</p>
      </div>

      <ul class="key">
        <li><span class="swatch" style="background: var(--cut)"></span> Pink: the cut edge, then the proposed seam</li>
        <li><span class="swatch" style="background: var(--reject)"></span> Red: the chain stays where it is</li>
      </ul>
    </section>

    <section class="hists" aria-label="Histograms">
      {#each HISTS as h (h.id)}
        <figure class:wide={h.wide}>
          <figcaption>
            <div class="title-row">
              <h2>{h.title}</h2>
              <div class="scale" role="group" aria-label="{h.title} scale">
                <button class:on={scales[h.id] === 'linear'} onclick={() => (scales[h.id] = 'linear')}>Linear</button>
                <button class:on={scales[h.id] === 'log'} onclick={() => (scales[h.id] = 'log')}>Log</button>
              </div>
            </div>
            <p class="sub">{h.sub} {#if h.id in tv}<span class="tv">Distance from target {tv[h.id] == null ? '–' : tv[h.id].toFixed(3)}</span>{/if}</p>
          </figcaption>
          <Histogram
            label={h.title}
            bins={h.bins}
            counts={counts[h.id]}
            total={h.perMove ? moves : step}
            {version}
            scale={scales[h.id]}
            drop={drops[h.id]}
            ms={dropMs}
            axis={h.axis}
            axisData={h.axisData}
            groups={h.groups}
            shadow={h.shadow ?? true}
            width={h.width ?? 660}
            height={h.height}
            onhover={hoverFor(h.id)}
          />
        </figure>
      {/each}
    </section>
  </div>

  <section class="metagraph" aria-label="Metagraph">
    <div class="title-row">
      <h2>Metagraph of the 117 plans</h2>
    </div>
    <p class="sub">Each node is a plan; each edge is a move the chain can make, coloured by its Ollivier-Ricci curvature. The ball follows the chain.</p>
    <Metagraph
      plans={tables.plans}
      edges={tables.metagraph_edges}
      current={() => planId}
      {hops}
      reset={resets}
      {version}
      {hopMs}
      onhover={metaHover}
    />
  </section>

  {#if detail}
    <div class="tooltip" style="left: {Math.min(hover.x + 16, innerWidth - 330)}px; top: {Math.min(hover.y + 16, innerHeight - 150)}px">
      {#if detail.key}<PlanThumb key={detail.key} size={64} />{/if}
      {#if detail.keys}{#each detail.keys as k (k)}<PlanThumb key={k} size={56} />{/each}{/if}
      {#if detail.glyph}<DualGlyph name={detail.glyph} size={56} />{/if}
      <div>
        <strong>{detail.title}</strong>
        {#if detail.pi != null}<p>Target {pct(detail.pi)}</p>{/if}
        {#if detail.lines}
          {#each detail.lines as l (l)}<p>{l}</p>{/each}
        {:else}
          <p>Observed {pct(detail.obs)} <span class="muted">({int(detail.visits)} of {int(detail.of ?? step)} {detail.unit ?? 'steps'})</span></p>
        {/if}
        {#if detail.note}<p class="muted">{detail.note}</p>{/if}
      </div>
    </div>
  {/if}

  <footer>
    <p>
    </p>
  </footer>
</main>
