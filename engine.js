/* Contagion engine: a DebtRank-style stress propagation over the AI dependency graph.
   Stress h in [0,1] per node. Shock sources start at the investment cut.
   Each round, the NEW stress of a node flows to the nodes that depend on it,
   scaled by edge weight (how much the target depends on the source) and the
   target's amplifier (leverage) minus its cushion (real revenue / cash). */
(function () {
  const LAG = {
    // share of final stress visible at each horizon, by how fast a layer reacts (model assumption)
    fast:    { "30d": 0.85, "6m": 1.0,  "1y": 1.0,  "3y": 1.0 },
    medium:  { "30d": 0.35, "6m": 0.85, "1y": 1.0,  "3y": 1.0 },
    slow:    { "30d": 0.12, "6m": 0.55, "1y": 0.95, "3y": 1.0 },
    slowest: { "30d": 0.05, "6m": 0.30, "1y": 0.70, "3y": 1.0 },
  };
  // share of stress that heals by year 3 if underlying AI demand is strong (demand = 1)
  const RECOVERY = { fast: 0.55, medium: 0.45, slow: 0.25, slowest: 0.30 };

  const BANDS = [
    { min: 0.75, key: "critical", label: "Critical" },
    { min: 0.5, key: "distressed", label: "Distressed" },
    { min: 0.25, key: "strained", label: "Strained" },
    { min: 0.08, key: "pressured", label: "Pressured" },
    { min: 0, key: "stable", label: "Stable" },
  ];
  const band = (h) => BANDS.find((b) => h >= b.min);

  function simulate(D, p) {
    // p: {cut 0..0.9, demand 0..1, policy 0..1, contracts 0..1}
    const nodes = D.nodes;
    const idx = new Map(nodes.map((n, i) => [n.id, i]));
    const n = nodes.length;
    let h = new Float64Array(n), prev = new Float64Array(n);
    const relief = new Float64Array(n); // benefit side: cheaper compute, freed talent, etc.
    nodes.forEach((nd, i) => { if (nd.shock) h[i] = Math.min(1, p.cut * nd.shock); });

    const out = new Map();
    D.edges.forEach((e) => {
      const i = idx.get(e.source), j = idx.get(e.target);
      if (i == null || j == null) return;
      if (!out.has(i)) out.set(i, []);
      out.get(i).push({ j, e });
    });

    const rounds = [Float64Array.from(h)];
    const crossed = new Map(); // node -> latest {round, band}
    const events = []; // every band crossing, in order
    const flows = []; // per round: [{e, amount}]
    nodes.forEach((nd, i) => { if (h[i] > 0) crossed.set(i, { round: 0, band: band(h[i]).key }); });

    for (let r = 1; r <= 9; r++) {
      const dh = h.map((v, i) => v - prev[i]);
      prev = Float64Array.from(h);
      const next = Float64Array.from(h);
      const roundFlows = [];
      for (const [i, list] of out) {
        if (dh[i] < 1e-4) continue;
        for (const { j, e } of list) {
          const tgt = nodes[j];
          if (e.kind === "relief") { relief[j] = Math.min(1, relief[j] + dh[i] * e.w); continue; }
          let w = e.w;
          if (e.kind === "contract") w *= 1 - 0.45 * p.contracts; // take-or-pay contracts slow pass-through
          let amp = tgt.amp ?? 1;
          if (h[j] > (tgt.fragile ?? 0.6)) amp *= 1.35; // fire-sale / refinancing spiral above fragility point
          if (["macro", "labor", "markets", "india"].includes(tgt.layer)) amp *= 1 - 0.4 * p.policy;
          const cushion = (tgt.cushion ?? 0) * (0.4 + 0.6 * p.demand);
          const add = dh[i] * w * amp * (1 - cushion) * 0.92; // 0.92 damping per hop
          if (add > 1e-4) { next[j] += add; roundFlows.push({ e, amount: add }); }
        }
      }
      for (let k = 0; k < n; k++) {
        next[k] = Math.min(1, next[k]);
        const b = band(next[k]).key;
        const old = crossed.get(k);
        if (next[k] >= 0.08 && (!old || old.band !== b)) { crossed.set(k, { round: r, band: b }); events.push({ round: r, k, band: b, h: next[k] }); }
      }
      h = next;
      rounds.push(Float64Array.from(h));
      flows.push(roundFlows);
      if (Math.max(...h.map((v, k) => v - prev[k])) < 1e-3) break;
    }

    const log = events.map((ev) => ({ round: ev.round, node: nodes[ev.k], band: ev.band, h: ev.h }));
    return { h, rounds, flows, log, idx, relief };
  }

  function atHorizon(D, sim, horizon, demand) {
    return D.nodes.map((nd, i) => {
      const lag = LAG[nd.lag || "slow"];
      let v = sim.h[i] * lag[horizon];
      if (horizon === "3y") v *= 1 - RECOVERY[nd.lag || "slow"] * demand;
      return v;
    });
  }

  // Detect directed cycles (circular money flows) among investment/contract/purchase edges.
  function findCycles(D, maxLen = 4) {
    const kinds = new Set(["investment", "contract", "purchase", "equity-for-orders"]);
    const adj = new Map();
    D.edges.forEach((e) => {
      if (!kinds.has(e.kind)) return;
      if (!adj.has(e.money_from)) adj.set(e.money_from, []);
      adj.get(e.money_from).push(e);
    });
    const cycles = [], seen = new Set();
    const ids = [...adj.keys()];
    for (const start of ids) {
      const stack = [[start, [], [start]]];
      while (stack.length) {
        const [cur, path, visited] = stack.pop();
        for (const e of adj.get(cur) || []) {
          const nxt = e.money_to;
          if (nxt === start && path.length + 1 >= 2) {
            const p = [...path, e];
            const key = [...p.map((x) => x.money_from)].sort().join(">");
            if (!seen.has(key)) { seen.add(key); cycles.push(p); }
          } else if (!visited.includes(nxt) && path.length + 1 < maxLen) {
            stack.push([nxt, [...path, e], [...visited, nxt]]);
          }
        }
      }
    }
    return cycles;
  }

  window.Engine = { simulate, atHorizon, findCycles, band, BANDS, LAG, RECOVERY };
})();
