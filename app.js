/* UI layer: wires the controls, the domino map, the readouts and the static sections to window.AIB (data) + window.Engine. */
(function () {
  const D = window.AIB, M = window.MKT || { snapshot: {} }, E = window.Engine;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; };
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const fmt = (v, d = 0) => v == null || isNaN(v) ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
  const money = (bn) => bn == null ? "—" : Math.abs(bn) >= 1000 ? "$" + fmt(bn / 1000, 2) + "tn" : "$" + fmt(bn, 0) + "bn";
  const SRC = new Map((D.sources || []).map((s) => [s.id, s]));

  const state = { cut: 0.5, horizon: "1y", demand: 0.5, policy: 0.5, contracts: 0.5, selected: null, round: null, playing: false };
  let sim = null, vis = null, graph = null;
  const nodeById = new Map(D.nodes.map((n) => [n.id, n]));

  // ---------- color ----------
  function stressColor(h, a = 1) {
    // calm teal -> amber -> red -> deep crimson, interpolated in RGB
    const stops = [[0, [63, 179, 166]], [0.25, [214, 178, 76]], [0.5, [232, 127, 52]], [0.75, [229, 72, 77]], [1, [176, 22, 52]]];
    let k = 0; while (k < stops.length - 2 && h > stops[k + 1][0]) k++;
    const [t0, c0] = stops[k], [t1, c1] = stops[k + 1];
    const t = Math.max(0, Math.min(1, (h - t0) / (t1 - t0)));
    const c = c0.map((v, i) => Math.round(v + (c1[i] - v) * t));
    return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  }

  // ---------- tags ----------
  const TAG_TEXT = { reported: "Reported", estimate: "Estimate", "media-reported": "Media-reported", assumption: "Assumption", hypothetical: "Hypothetical", evidence: "Evidence", historical: "Historical", model: "Model output" };
  function tag(kind) { const t = el("span", "tag tag-" + kind, TAG_TEXT[kind] || kind); return t; }
  function srcLink(id) {
    const s = SRC.get(id); if (!s) return null;
    const a = el("a", "src", s.name); a.href = s.url; a.target = "_blank"; a.rel = "noopener";
    if (s.date) a.title = "Published / accessed " + s.date;
    return a;
  }

  // ---------- simulation ----------
  function run() {
    sim = E.simulate(D, state);
    vis = E.atHorizon(D, sim, state.horizon, state.demand);
  }
  const H = (id) => { const i = sim.idx.get(id); return i == null ? 0 : (state.round != null ? sim.rounds[Math.min(state.round, sim.rounds.length - 1)][i] : vis[i]); };
  const R = (id) => { const i = sim.idx.get(id); return i == null ? 0 : sim.relief[i]; };

  function ctx() {
    const listed = D.nodes.filter((n) => n.mcap);
    const drawdownPerStress = D.base.drawdownPerStress.value;
    const mcapLoss = listed.reduce((s, n) => s + n.mcap * H(n.id) * drawdownPerStress, 0);
    return { cut: state.cut, h: H, r: R, b: (k) => D.base[k].value, mcapLoss, horizon: state.horizon, demand: state.demand, policy: state.policy };
  }

  // ---------- controls ----------
  function bindControls() {
    const cut = $("#cut");
    cut.addEventListener("input", () => { state.cut = cut.value / 100; state.round = null; update(); });
    $$("[data-preset]").forEach((b) => b.addEventListener("click", () => { cut.value = b.dataset.preset; state.cut = b.dataset.preset / 100; state.round = null; update(); }));
    $$("[data-horizon]").forEach((b) => b.addEventListener("click", () => { state.horizon = b.dataset.horizon; state.round = null; update(); }));
    ["demand", "policy", "contracts"].forEach((k) => { const s = $("#" + k); s.addEventListener("input", () => { state[k] = s.value / 100; state.round = null; update(); }); });
    $("#play").addEventListener("click", playCascade);
    $("#reset-view").addEventListener("click", () => graph && graph.zoomToFit(600, 40));
  }

  function playCascade() {
    if (state.playing) return;
    // bring the map into view so the animation is visible, and make sure it has drawn
    const box = $(".map-box").getBoundingClientRect();
    if (box.top < 0 || box.top > window.innerHeight * 0.5) $("#map-sec").scrollIntoView({ behavior: "smooth", block: "start" });
    if (window.syncMap) window.syncMap();
    state.playing = true; $("#play").disabled = true; $("#play").textContent = "● Playing…";
    let r = 0; const total = sim.rounds.length;
    const tick = () => {
      state.round = r; paint(); renderLog(r); renderProfile();
      $("#round-readout").textContent = r === 0 ? "Round 0: the cut hits money sources" : `Round ${r} of ${total - 1}: stress spreads one hop`;
      r++;
      if (r < total) setTimeout(tick, 900);
      else setTimeout(() => { state.round = null; state.playing = false; $("#play").disabled = false; $("#play").textContent = "▶ Run cascade"; $("#round-readout").textContent = "Cascade complete. Showing the " + state.horizon + " view."; update(); }, 1200);
    };
    tick();
  }

  // ---------- map ----------
  // The artifact viewer can load the page inside a frame that is still 0px wide.
  // Drawing then gives a 0-width canvas and a broken zoom, so wait for real size and re-sync on every resize.
  function buildGraph() {
    const host = $("#map");
    renderLayerLegend();
    if (typeof ForceGraph !== "function") { host.replaceChildren(el("p", "map-fallback", "The map library didn't load. Reload the page to try again; the figures below still work.")); return; }
    let refitTimer = null, lastW = 0, lastH = 0;
    const sync = () => {
      const w = host.clientWidth, h = host.clientHeight;
      if (w < 50 || h < 50) return;
      if (!graph) { createGraph(host); lastW = w; lastH = h; return; }
      if (w === lastW && h === lastH) return;
      lastW = w; lastH = h;
      graph.width(w).height(h);
      graph.graphData().nodes.forEach((n) => { n.fx = placeX(n, w); });
      graph.d3ReheatSimulation();
      clearTimeout(refitTimer); refitTimer = setTimeout(() => graph.zoomToFit(500, 48), 700);
    };
    new ResizeObserver(sync).observe(host);
    window.addEventListener("resize", sync);
    document.addEventListener("visibilitychange", sync);
    window.syncMap = sync;
    sync();
  }
  const placeX = (n, w) => { const L = D.layers, maxCol = Math.max(...Object.values(L).map((x) => x.col)); return (L[n.layer].col / maxCol - 0.5) * w * 0.84; };

  function createGraph(host) {
    const layers = D.layers;
    const W = () => host.clientWidth, Hh = () => host.clientHeight;
    const nodes = D.nodes.map((n) => ({ ...n }));
    const links = D.edges.map((e) => ({ ...e }));
    nodes.forEach((n) => { n.fx = placeX(n, W()); });

    graph = ForceGraph()(host)
      .width(W()).height(Hh())
      .backgroundColor("rgba(0,0,0,0)")
      .graphData({ nodes, links })
      .nodeId("id")
      .nodeVal((n) => n.size || 4)
      .nodeLabel(() => "")
      .linkSource("source").linkTarget("target")
      .linkCurvature((l) => l.curve ?? 0.12)
      .linkWidth((l) => 0.4 + l.w * 3.2 * (isLinkLit(l) ? 1.6 : 1))
      .linkColor((l) => linkColor(l))
      .linkDirectionalArrowLength(4).linkDirectionalArrowRelPos(0.92)
      .linkDirectionalArrowColor((l) => linkColor(l, 0.9))
      .linkDirectionalParticles((l) => particleCount(l))
      .linkDirectionalParticleWidth((l) => 2 + l.w * 3)
      .linkDirectionalParticleSpeed((l) => 0.004 + flowOn(l) * 0.012)
      .linkDirectionalParticleColor((l) => l.kind === "relief" ? css("--relief") : stressColor(Math.max(0.35, srcStress(l))))
      .nodeCanvasObject(drawNode)
      .nodePointerAreaPaint((n, color, c) => { c.fillStyle = color; c.beginPath(); c.arc(n.x, n.y, radius(n) + 4, 0, 2 * Math.PI); c.fill(); })
      .onNodeClick((n) => select(n.id))
      .onNodeHover((n) => { host.style.cursor = n ? "pointer" : "grab"; hoverNode = n ? n.id : null; })
      .onLinkHover((l) => { hoverLink = l; showLinkTip(l); host.style.cursor = l ? "pointer" : "grab"; })
      .onLinkClick((l) => selectLink(l))
      .onBackgroundClick(() => { hoverLink = null; showLinkTip(null); })
      .cooldownTicks(140)
      .d3VelocityDecay(0.35);
    graph.d3Force("charge").strength(-260);
    graph.d3Force("link").distance(70).strength(0.04);
    // gentle vertical gravity keeps each column compact so the map fits the frame
    let simNodes = [];
    const yPull = (alpha) => simNodes.forEach((n) => { n.vy -= n.y * 0.06 * alpha; });
    yPull.initialize = (ns) => { simNodes = ns; };
    graph.d3Force("ypull", yPull);
    let fitted = false;
    graph.onEngineStop(() => { if (!fitted) { fitted = true; graph.zoomToFit(600, 48); } });
    setTimeout(() => { if (!fitted) graph.zoomToFit(600, 48); }, 2500);

    // dashed column guides drawn on the canvas, behind nodes
    graph.onRenderFramePre((c, scale) => {
      Object.values(layers).forEach((L) => {
        const x = placeX({ layer: Object.keys(layers).find((k) => layers[k] === L) }, W());
        c.save();
        c.strokeStyle = css("--grid"); c.lineWidth = 1 / scale; c.setLineDash([2 / scale, 6 / scale]);
        c.beginPath(); c.moveTo(x, -2000); c.lineTo(x, 2000); c.stroke(); c.restore();
      });
    });
  }
  let hoverNode = null, hoverLink = null;
  const srcStress = (l) => H(typeof l.source === "object" ? l.source.id : l.source);
  const tgtId = (l) => typeof l.target === "object" ? l.target.id : l.target;
  const srcId = (l) => typeof l.source === "object" ? l.source.id : l.source;
  function flowOn(l) { return Math.min(1, srcStress(l) * l.w * 3); }
  function isLinkLit(l) { return state.selected && (srcId(l) === state.selected || tgtId(l) === state.selected); }
  function particleCount(l) {
    if (l.kind === "relief") return R(tgtId(l)) > 0.02 ? 2 : 0;
    const f = srcStress(l) * l.w;
    return f > 0.25 ? 4 : f > 0.1 ? 3 : f > 0.03 ? 2 : f > 0.005 ? 1 : 0;
  }
  function linkColor(l, a) {
    const dim = state.selected && !isLinkLit(l);
    if (l.kind === "relief") return dim ? css("--line") : css("--relief");
    const s = srcStress(l);
    if (dim) return "rgba(120,135,150,0.10)";
    const live = s * l.w;
    return live > 0.02 ? stressColor(s, a ?? Math.min(0.85, 0.2 + s * 0.4 + l.w)) : `rgba(140,156,170,${(0.06 + l.w * 0.35).toFixed(2)})`;
  }
  const radius = (n) => 5 + Math.sqrt(n.size || 4) * 2.2;
  function drawNode(n, c, scale) {
    // a node has no position on the very first frame; drawing it would throw and stop the render loop
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y) || !Number.isFinite(scale)) return;
    const h = H(n.id) || 0, r = radius(n), rel = R(n.id) || 0;
    const dim = state.selected && state.selected !== n.id && !D.edges.some((e) => (e.source === state.selected && e.target === n.id) || (e.target === state.selected && e.source === n.id));
    c.globalAlpha = dim ? 0.28 : 1;
    if (h > 0.25) { // glow for strained+
      const g = c.createRadialGradient(n.x, n.y, r * 0.6, n.x, n.y, r * (1.8 + h));
      g.addColorStop(0, stressColor(h, 0.45)); g.addColorStop(1, stressColor(h, 0));
      c.fillStyle = g; c.beginPath(); c.arc(n.x, n.y, r * (1.8 + h), 0, 2 * Math.PI); c.fill();
    }
    c.beginPath(); c.arc(n.x, n.y, r, 0, 2 * Math.PI);
    c.fillStyle = css("--panel"); c.fill();
    // stress fill as a rising level inside the disc
    c.save(); c.beginPath(); c.arc(n.x, n.y, r - 1.2, 0, 2 * Math.PI); c.clip();
    c.fillStyle = stressColor(h, 0.95); c.fillRect(n.x - r, n.y + r - 2 * r * Math.max(h, 0.04), 2 * r, 2 * r * Math.max(h, 0.04));
    c.restore();
    c.lineWidth = (state.selected === n.id || hoverNode === n.id ? 2.6 : 1.3);
    c.strokeStyle = D.layers[n.layer].color; c.beginPath(); c.arc(n.x, n.y, r, 0, 2 * Math.PI); c.stroke();
    if (rel > 0.02) { c.strokeStyle = css("--relief"); c.setLineDash([2, 2]); c.beginPath(); c.arc(n.x, n.y, r + 3, 0, 2 * Math.PI); c.stroke(); c.setLineDash([]); }
    const fs = Math.max(9, 11 / Math.sqrt(scale)) ;
    c.font = `600 ${fs}px ${css("--f-mono")}`; c.textAlign = "center"; c.textBaseline = "top";
    c.fillStyle = css("--fg"); c.fillText(n.short || n.name, n.x, n.y + r + 3);
    if (scale > 1.3) { c.font = `500 ${fs * 0.85}px ${css("--f-mono")}`; c.fillStyle = stressColor(h); c.fillText(Math.round(h * 100) + "", n.x, n.y + r + 3 + fs * 1.1); }
    c.globalAlpha = 1;
  }
  function showLinkTip(l) {
    const tip = $("#linktip");
    if (!l) { tip.hidden = true; return; }
    const s = nodeById.get(srcId(l)), t = nodeById.get(tgtId(l));
    tip.replaceChildren();
    const h = el("div", "lt-h"); h.append(el("b", null, s.short || s.name), el("span", "lt-arrow", " → "), el("b", null, t.short || t.name));
    tip.append(h, el("div", "lt-kind", (l.label || l.kind) + (l.amount ? " · " + l.amount : "")), el("p", null, l.explain || ""));
    const f = el("div", "lt-foot"); if (l.status) f.append(tag(l.status === "confirmed" ? "reported" : l.status === "estimate" ? "estimate" : "media-reported"));
    f.append(el("span", "lt-w", "Dependency weight " + l.w.toFixed(2))); tip.append(f);
    tip.hidden = false;
  }
  function selectLink(l) {
    const s = srcId(l);
    select(s);
    const row = $(`[data-edge="${l.id}"]`); if (row) { row.scrollIntoView({ block: "nearest", behavior: "smooth" }); row.classList.add("flash"); setTimeout(() => row.classList.remove("flash"), 1400); }
  }

  function renderLayerLegend() {
    const lg = $("#layer-legend"); lg.replaceChildren();
    Object.values(D.layers).sort((a, b) => a.col - b.col).forEach((L) => {
      const i = el("span", "lg"); const dot = el("i"); dot.style.borderColor = L.color; i.append(dot, document.createTextNode(L.name)); lg.append(i);
    });
  }

  // ---------- profile panel ----------
  function select(id) {
    state.selected = state.selected === id ? null : id;
    showLinkTip(null);
    renderProfile(); paint();
  }
  function renderProfile() {
    const p = $("#profile"); p.replaceChildren();
    const n = state.selected ? nodeById.get(state.selected) : null;
    if (!n) {
      p.append(el("div", "pf-empty-k", "Company profile"), el("p", "pf-empty", "Tap any circle on the map to see who it depends on, who depends on it, its stress under this scenario, and the sourced numbers behind it. Tap an arrow to read why that connection exists."));
      const top = D.nodes.map((x) => ({ x, h: H(x.id) })).sort((a, b) => b.h - a.h).slice(0, 6);
      p.append(el("div", "pf-sub", "Most stressed right now"));
      const ul = el("ul", "pf-top");
      top.forEach(({ x, h }) => { const li = el("li"); const b = el("button", "linkish", x.name); b.addEventListener("click", () => select(x.id)); const v = el("span", "pf-top-v", Math.round(h * 100) + ""); v.style.color = stressColor(h); li.append(b, v); ul.append(li); });
      p.append(ul);
      return;
    }
    const h = H(n.id), bd = E.band(h);
    const head = el("div", "pf-head");
    const layer = el("div", "pf-layer", D.layers[n.layer].name); layer.style.color = D.layers[n.layer].color;
    head.append(layer, el("h3", "pf-name", n.name));
    const close = el("button", "pf-close", "×"); close.setAttribute("aria-label", "Close profile"); close.addEventListener("click", () => select(n.id)); head.append(close);
    p.append(head);

    const meter = el("div", "pf-meter");
    const bar = el("div", "pf-bar"); const fill = el("i"); fill.style.width = Math.round(h * 100) + "%"; fill.style.background = stressColor(h); bar.append(fill);
    const lab = el("div", "pf-meter-l"); lab.append(el("span", "pf-band", bd.label), el("span", "pf-score", "Stress " + Math.round(h * 100) + " / 100 · " + state.horizon));
    lab.querySelector(".pf-band").style.color = stressColor(h);
    meter.append(lab, bar); meter.append(tag("model")); p.append(meter);

    if (n.ticker && M.snapshot[n.ticker]) {
      const q = M.snapshot[n.ticker];
      const mk = el("div", "pf-mkt");
      const cells = [["Price " + q.date, (n.ticker.endsWith(".NS") || n.ticker.startsWith("^CNX") || n.ticker === "^NSEI" ? "₹" : n.ticker.endsWith(".T") ? "¥" : n.ticker.endsWith(".KS") ? "₩" : "$") + fmt(q.last, q.last > 1000 ? 0 : 2)], ["From 52-wk high", fmt(q.drawdown_from_high_pct, 1) + "%"], ["Year to date", (q.chg_ytd_pct > 0 ? "+" : "") + fmt(q.chg_ytd_pct, 1) + "%"]];
      if (n.mcap) cells.unshift(["Market value", money(n.mcap)]);
      cells.forEach(([k, v]) => { const c = el("div", "pf-cell"); c.append(el("span", "k", k), el("span", "v", v)); mk.append(c); });
      const sp = sparkline(q.spark); if (sp) mk.append(sp);
      p.append(mk);
      const ms = el("div", "pf-msrc"); ms.append(tag("reported"), document.createTextNode(" Yahoo Finance close via yfinance, " + q.date)); p.append(ms);
    }
    if (n.role) p.append(el("p", "pf-role", n.role));
    if (n.why) { const w = el("div", "pf-why"); w.append(el("div", "pf-sub", "Why it's exposed"), el("p", null, n.why)); p.append(w); }

    if (n.facts && n.facts.length) {
      p.append(el("div", "pf-sub", "Sourced numbers"));
      const dl = el("dl", "pf-facts");
      n.facts.forEach((f) => {
        const dt = el("dt", null, f.k), dd = el("dd");
        dd.append(el("span", "fv", f.v), tag(f.label || "reported"));
        const s = srcLink(f.src); if (s) dd.append(s);
        dl.append(dt, dd);
      });
      p.append(dl);
    }
    const ins = D.edges.filter((e) => e.target === n.id), outs = D.edges.filter((e) => e.source === n.id);
    const edgeList = (title, list, dir) => {
      if (!list.length) return;
      p.append(el("div", "pf-sub", title));
      const ul = el("ul", "pf-edges");
      list.sort((a, b) => b.w - a.w).forEach((e) => {
        const other = nodeById.get(dir === "in" ? e.source : e.target);
        const li = el("li"); li.dataset.edge = e.id;
        const top = el("div", "pe-top");
        const b = el("button", "linkish", other.name); b.addEventListener("click", () => select(other.id));
        const w = el("span", "pe-w"); const wi = el("i"); wi.style.width = Math.round(e.w * 100) + "%"; wi.style.background = e.kind === "relief" ? css("--relief") : stressColor(H(e.source)); w.append(wi);
        top.append(b, el("span", "pe-kind", e.label || e.kind), w);
        li.append(top);
        if (e.explain) li.append(el("p", "pe-x", e.explain));
        const foot = el("div", "pe-foot");
        if (e.amount) foot.append(el("span", "pe-amt", e.amount));
        if (e.status) foot.append(tag(e.status === "confirmed" ? "reported" : e.status === "estimate" ? "estimate" : e.status === "assumption" ? "assumption" : "media-reported"));
        const s = srcLink(e.src); if (s) foot.append(s);
        li.append(foot); ul.append(li);
      });
      p.append(ul);
    };
    edgeList("Stress reaches it from", ins, "in");
    edgeList("It passes stress to", outs, "out");
    const nm = el("p", "pf-note", "Dependency weight (bar) = share of this node's revenue, funding or value tied to the other side. Weights are analyst estimates built from the cited figures; see Method.");
    p.append(nm);
  }
  function sparkline(arr) {
    if (!arr || arr.length < 3) return null;
    const w = 120, h = 34, min = Math.min(...arr), max = Math.max(...arr);
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg"); svg.setAttribute("viewBox", `0 0 ${w} ${h}`); svg.setAttribute("class", "spark");
    const pts = arr.map((v, i) => [i / (arr.length - 1) * w, h - 3 - (v - min) / (max - min || 1) * (h - 6)]);
    const area = document.createElementNS(ns, "path"); area.setAttribute("d", "M" + pts.map((p) => p.join(",")).join("L") + `L${w},${h}L0,${h}Z`); area.setAttribute("fill", css("--spark-fill"));
    const line = document.createElementNS(ns, "path"); line.setAttribute("d", "M" + pts.map((p) => p.join(",")).join("L")); line.setAttribute("fill", "none"); line.setAttribute("stroke", css("--fg-2")); line.setAttribute("stroke-width", "1.4");
    const dot = document.createElementNS(ns, "circle"); const lp = pts[pts.length - 1]; dot.setAttribute("cx", lp[0]); dot.setAttribute("cy", lp[1]); dot.setAttribute("r", "2.6"); dot.setAttribute("fill", css("--accent"));
    svg.append(area, line, dot);
    const wrap = el("div", "pf-spark"); wrap.append(svg, el("span", "k", "52 weeks, weekly close")); return wrap;
  }

  // ---------- readouts ----------
  function renderKPIs() {
    const c = ctx(); const g = $("#kpis"); g.replaceChildren();
    D.kpis.forEach((k) => {
      const v = k.fn(c);
      const card = el("div", "kpi");
      const top = el("div", "kpi-top"); top.append(el("span", "kpi-l", k.label), tag(k.tag || "model"));
      const val = el("div", "kpi-v", k.format ? k.format(v) : fmt(v, 1));
      if (k.severity) { const s = k.severity(v, c); val.style.color = stressColor(s); card.style.setProperty("--sev", stressColor(s, 0.7)); }
      const sub = el("div", "kpi-sub", k.sub ? k.sub(c, v) : "");
      const how = el("details", "kpi-how"); how.append(el("summary", null, "How this is calculated"), el("p", null, k.how));
      if (k.src) { const fs = el("div", "kpi-src"); k.src.forEach((id) => { const a = srcLink(id); if (a) fs.append(a); }); how.append(fs); }
      card.append(top, val, sub, how); g.append(card);
    });
    $("#cut-big").textContent = Math.round(state.cut * 100) + "%";
    $("#cut-big").style.color = stressColor(Math.min(1, state.cut * 1.1));
    $("#cut-amt").textContent = "≈ " + money(state.cut * D.base.newInvestment12m.value) + " of the " + money(D.base.newInvestment12m.value) + " in new AI money expected over the next 12 months";
    $$("[data-preset]").forEach((b) => b.classList.toggle("on", +b.dataset.preset === Math.round(state.cut * 100)));
    $$("[data-horizon]").forEach((b) => b.classList.toggle("on", b.dataset.horizon === state.horizon));
    ["demand", "policy", "contracts"].forEach((k) => { $("#" + k + "-v").textContent = D.assumptionText[k](state[k]); });
  }

  function renderLog(uptoRound) {
    const ol = $("#cascade"); ol.replaceChildren();
    const items = sim.log.filter((x) => uptoRound == null || x.round <= uptoRound);
    if (!items.length) { ol.append(el("li", "muted", "Below 8% stress nothing tips. Raise the cut to see the dominoes.")); return; }
    let lastRound = -1;
    items.forEach((x) => {
      if (x.round !== lastRound) { const rl = el("li", "round-h", x.round === 1 ? "Hop 1 · direct hit" : "Hop " + x.round); ol.append(rl); lastRound = x.round; }
      const li = el("li", "ev");
      const dot = el("i"); dot.style.background = stressColor(x.h);
      const b = el("button", "linkish", x.node.name); b.addEventListener("click", () => select(x.node.id));
      const bd = E.BANDS.find((y) => y.key === x.band);
      const s = el("span", "ev-b", bd.label); s.style.color = stressColor(x.h);
      li.append(dot, b, el("span", "ev-arrow", " becomes "), s);
      ol.append(li);
    });
  }

  // ---------- charts ----------
  let chScen, chTraj, chDot;
  function charts() {
    if (!window.echarts) return;
    const base = { textStyle: { fontFamily: css("--f-mono"), color: css("--fg-2") }, grid: { left: 44, right: 16, top: 26, bottom: 36 } };
    const axis = { axisLine: { lineStyle: { color: css("--line") } }, splitLine: { lineStyle: { color: css("--grid") } }, axisLabel: { color: css("--fg-2"), fontSize: 11 } };

    // scenario comparison: average stress by layer at 25 / 50 / 90
    if (!chScen) chScen = echarts.init($("#ch-scen"), null, { renderer: "svg" });
    const L = Object.entries(D.layers).filter(([id]) => id !== "money").sort((a, b) => a[1].col - b[1].col);
    const scen = [0.25, 0.5, 0.9].map((cut) => {
      const s = E.simulate(D, { ...state, cut }); const v = E.atHorizon(D, s, state.horizon, state.demand);
      return L.map(([id]) => { const ix = D.nodes.map((n, i) => n.layer === id ? i : -1).filter((i) => i >= 0); return Math.round(ix.reduce((a, i) => a + v[i], 0) / ix.length * 100); });
    });
    chScen.setOption({ ...base, grid: { left: 8, right: 20, top: 30, bottom: 28, containLabel: true },
      legend: { top: 0, textStyle: { color: css("--fg-2"), fontSize: 11 }, itemWidth: 12, itemHeight: 8 },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, backgroundColor: css("--panel-2"), borderColor: css("--line"), textStyle: { color: css("--fg") }, valueFormatter: (v) => v + " / 100" },
      xAxis: { type: "value", max: 100, ...axis, name: "avg stress", nameTextStyle: { color: css("--fg-2") } },
      yAxis: { type: "category", data: L.map(([, x]) => x.name), inverse: true, ...axis },
      series: [["25% cut", 0.25], ["50% cut", 0.5], ["90% cut", 0.9]].map(([name, c], i) => ({ name, type: "bar", data: scen[i], barGap: "15%", itemStyle: { color: stressColor(c), borderRadius: [0, 2, 2, 0] } })) }, true);

    // trajectory across horizons for the current cut
    if (!chTraj) chTraj = echarts.init($("#ch-traj"), null, { renderer: "svg" });
    const hz = ["30d", "6m", "1y", "3y"];
    const series = D.trajectory.map((t) => ({
      name: t.label, type: "line", smooth: 0.3, symbolSize: 7,
      data: hz.map((hzn) => { const v = E.atHorizon(D, sim, hzn, state.demand); return Math.round(t.ids.reduce((a, id) => a + v[sim.idx.get(id)], 0) / t.ids.length * 100); }),
      lineStyle: { width: 2.4, color: t.color }, itemStyle: { color: t.color },
      markLine: undefined,
    }));
    chTraj.setOption({ ...base, legend: { top: 0, textStyle: { color: css("--fg-2"), fontSize: 11 } },
      tooltip: { trigger: "axis", backgroundColor: css("--panel-2"), borderColor: css("--line"), textStyle: { color: css("--fg") }, valueFormatter: (v) => v + " / 100" },
      xAxis: { type: "category", data: ["30 days", "6 months", "1 year", "3 years"], ...axis, boundaryGap: false },
      yAxis: { type: "value", max: 100, ...axis }, series }, true);
  }

  function dotcomChart() {
    if (!window.echarts || !M.history) return;
    chDot = chDot || echarts.init($("#ch-dot"), null, { renderer: "svg" });
    // align both series so month 0 is the price peak, scale to peak = 100
    const align = (arr, peakMonth) => {
      const i = arr.findIndex((x) => x[0] === peakMonth); const p = arr[i][1];
      return arr.map((x, k) => [k - i, +(x[1] / p * 100).toFixed(1), x[0]]);
    };
    const csco = M.history.CSCO_1996_2004, nvda = M.history.NVDA_2021_now, ix00 = M.history.IXIC_1995_2004;
    const nPeak = nvda.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
    const cS = align(csco, "2000-03"), nS = align(nvda, nPeak), iS = align(ix00, "2000-02");
    const axis = { axisLine: { lineStyle: { color: css("--line") } }, splitLine: { lineStyle: { color: css("--grid") } }, axisLabel: { color: css("--fg-2"), fontSize: 11 } };
    chDot.setOption({ textStyle: { fontFamily: css("--f-mono") }, grid: { left: 44, right: 18, top: 34, bottom: 40 },
      legend: { top: 0, textStyle: { color: css("--fg-2"), fontSize: 11 } },
      tooltip: { trigger: "axis", backgroundColor: css("--panel-2"), borderColor: css("--line"), textStyle: { color: css("--fg") },
        formatter: (ps) => ps.map((p) => `${p.marker} ${p.seriesName}: ${p.value[1]} <span style="opacity:.6">(${p.value[2]})</span>`).join("<br>") },
      xAxis: { type: "value", min: -48, max: 36, name: "months from peak", nameLocation: "middle", nameGap: 26, nameTextStyle: { color: css("--fg-2") }, ...axis },
      yAxis: { type: "value", name: "peak = 100", nameTextStyle: { color: css("--fg-2") }, ...axis },
      series: [
        { name: "Cisco 1996–2004", type: "line", showSymbol: false, data: cS, lineStyle: { color: css("--hot"), width: 2.2 } },
        { name: "Nasdaq 1995–2004", type: "line", showSymbol: false, data: iS, lineStyle: { color: css("--fg-2"), width: 1.4, type: "dashed" } },
        { name: "NVIDIA 2021–now (peak " + nPeak + ")", type: "line", showSymbol: false, data: nS, lineStyle: { color: css("--calm"), width: 2.4 },
          markPoint: { symbol: "circle", symbolSize: 8, data: [{ coord: nS[nS.length - 1].slice(0, 2), itemStyle: { color: css("--accent") } }], label: { show: true, formatter: "today", color: css("--fg"), position: "right", fontSize: 11 } } },
      ] }, true);
  }

  // ---------- static sections ----------
  function renderTimeline() {
    const wrap = $("#timeline"); wrap.replaceChildren();
    const cutPct = state.cut * 100;
    [["30d", "First 30 days"], ["6m", "6 months"], ["1y", "1 year"], ["3y", "3 years"]].forEach(([k, title]) => {
      const col = el("div", "tl-col" + (state.horizon === k ? " on" : ""));
      const v = E.atHorizon(D, sim, k, state.demand);
      const avg = Math.round(v.reduce((a, b) => a + b, 0) / v.length * 100);
      const hd = el("div", "tl-h"); hd.append(el("span", "tl-t", title)); const sc = el("span", "tl-s", "system stress " + avg); sc.style.color = stressColor(avg / 100); hd.append(sc);
      col.append(hd);
      const ul = el("ul");
      D.timeline[k].filter((x) => (x.minCut ?? 0) <= cutPct && (x.maxCut ?? 100) >= cutPct).forEach((x) => {
        const li = el("li", "tl-i tl-" + x.type);
        li.append(tag(x.type), el("p", null, x.text));
        if (x.src) { const a = srcLink(x.src); if (a) li.append(a); }
        ul.append(li);
      });
      col.append(ul); wrap.append(col);
    });
  }

  function renderExposure() {
    const wrap = $("#exposure"); wrap.replaceChildren();
    D.exposure.forEach((grp) => {
      const col = el("div", "ex-col ex-" + grp.key);
      col.append(el("h3", null, grp.title), el("p", "ex-lede", grp.lede));
      grp.groups.forEach((g) => {
        col.append(el("div", "ex-kind", g.kind));
        const ul = el("ul");
        g.items.forEach((it) => { const li = el("li"); li.append(el("b", null, it.name), el("span", null, it.why)); if (it.src) { const a = srcLink(it.src); if (a) li.append(a); } ul.append(li); });
        col.append(ul);
      });
      wrap.append(col);
    });
  }

  function renderLoops() {
    const wrap = $("#loops"); wrap.replaceChildren();
    D.loops.forEach((lp) => {
      const card = el("div", "loop");
      const path = el("div", "loop-path");
      lp.path.forEach((id, i) => { const b = el("button", "loop-n", nodeById.get(id)?.short || id); b.addEventListener("click", () => { select(id); $("#map-sec").scrollIntoView({ behavior: "smooth" }); }); path.append(b); if (i < lp.path.length - 1) path.append(el("span", "loop-a", lp.arrows?.[i] || "→")); });
      card.append(el("h4", null, lp.title), path, el("p", null, lp.text));
      const f = el("div", "loop-f"); f.append(tag(lp.tag || "reported")); (lp.src || []).forEach((s) => { const a = srcLink(s); if (a) f.append(a); }); card.append(f);
      wrap.append(card);
    });
  }

  function renderDotcom() {
    const tb = $("#dotcom-table tbody"); tb.replaceChildren();
    D.dotcom.forEach((r) => {
      const tr = el("tr");
      const td0 = el("th", null, r.dim); td0.scope = "row";
      const td3 = el("td", "dc-v"); const pill = el("span", "pill pill-" + r.verdict, { worse: "Riskier now", better: "Safer now", similar: "Similar" }[r.verdict]); td3.append(pill);
      const tds = el("td"); (r.src || []).forEach((s) => { const a = srcLink(s); if (a) tds.append(a); });
      tr.append(td0, el("td", null, r.then), el("td", null, r.now), td3, tds); tb.append(tr);
    });
  }

  function renderIndia() {
    const wrap = $("#india-facts"); wrap.replaceChildren();
    D.india.facts.forEach((f) => {
      const c = el("div", "in-f");
      c.append(el("div", "in-v", f.v), el("div", "in-k", f.k));
      const ft = el("div", "in-s"); ft.append(tag(f.label || "reported")); const a = srcLink(f.src); if (a) ft.append(a); c.append(ft);
      wrap.append(c);
    });
    const ch = $("#india-channels"); ch.replaceChildren();
    D.india.channels.forEach((x) => {
      const li = el("li", "ic ic-" + x.dir);
      const top = el("div", "ic-top"); const hNow = x.node ? H(x.node) : null;
      top.append(el("b", null, x.name), el("span", "ic-dir", x.dir === "hurt" ? "Hurts India" : x.dir === "help" ? "Helps India" : "Mixed"));
      if (hNow != null) { const s = el("span", "ic-h", "stress " + Math.round(hNow * 100)); s.style.color = stressColor(hNow); top.append(s); }
      li.append(top, el("p", null, x.why));
      if (x.src) { const a = srcLink(x.src); if (a) li.append(a); }
      ch.append(li);
    });
  }

  function renderLists() {
    const sp = $("#surprises"); sp.replaceChildren();
    D.surprises.forEach((s, i) => { const li = el("li"); li.append(el("span", "sp-n", String(i + 1)), el("div", "sp-b")); const b = li.lastChild; b.append(el("h4", null, s.title), el("p", null, s.text)); const f = el("div", "sp-f"); f.append(tag(s.tag || "evidence")); (s.src || []).forEach((x) => { const a = srcLink(x); if (a) f.append(a); }); b.append(f); sp.append(li); });
    const pv = $("#prevent"); pv.replaceChildren();
    D.prevent.forEach((s) => { const li = el("li"); li.append(el("b", null, s.title), el("p", null, s.text)); pv.append(li); });
    const w = $("#watch"); w.replaceChildren();
    D.watch.forEach((g) => { const col = el("div", "w-col"); col.append(el("h4", null, g.who)); const ul = el("ul"); g.items.forEach((it) => { const li = el("li"); li.append(el("b", null, it.signal), el("span", null, it.why)); ul.append(li); }); col.append(ul); w.append(col); });
  }

  function renderSources() {
    const ul = $("#sources"); ul.replaceChildren();
    [...SRC.values()].sort((a, b) => a.name.localeCompare(b.name)).forEach((s) => { const li = el("li"); const a = el("a", null, s.name); a.href = s.url; a.target = "_blank"; a.rel = "noopener"; li.append(a); if (s.date) li.append(el("span", "s-d", " · " + s.date)); ul.append(li); });
    $("#src-count").textContent = SRC.size;
    $("#asof").textContent = D.meta.asOf;
    const lastQuote = Object.entries(M.snapshot).filter(([t]) => !t.endsWith("=X")).map(([, q]) => q.date).sort().pop(); // FX trades on weekends; use stock closes
    if (lastQuote) $("#mkt-date").textContent = lastQuote;
    $("#live-date").textContent = D.meta.liveDate;
    $("#asof2").textContent = M.fetched || D.meta.marketDate;
    const tick = $("#ticker"); tick.replaceChildren();
    D.tickerStrip.forEach(([t, label]) => {
      const q = M.snapshot[t]; if (!q) return;
      const s = el("span", "tk"); s.append(el("b", null, label));
      const d = el("span", q.drawdown_from_high_pct < -25 ? "neg" : "", fmt(q.drawdown_from_high_pct, 0) + "% from high"); s.append(d); tick.append(s);
    });
  }

  // ---------- update ----------
  function paint() { if (graph) { graph.linkDirectionalParticles(graph.linkDirectionalParticles()); graph.nodeCanvasObject(drawNode); } }
  function update() {
    run(); renderKPIs(); renderLog(); renderProfile(); renderTimeline(); renderIndia(); paint(); charts();
  }

  function init() {
    bindControls(); run();
    buildGraph();
    renderExposure(); renderLoops(); renderDotcom(); renderLists(); renderSources();
    update(); dotcomChart();
    window.addEventListener("resize", () => { chScen && chScen.resize(); chTraj && chTraj.resize(); chDot && chDot.resize(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
