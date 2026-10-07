// ═══════════════════════════════════════════════════════════════════
//  Chaining modes, the way Mastercam offers them: Chain, Window, Area, Single, Partial and Last, plus Undo and Clear.
//  They all end in the same op.chains list as a click does (buildChain in index.html); this file only decides which
//  edges a gesture takes and groups them into chains.
//    Chain    click an edge: the whole connected run it belongs to
//    Window   drag a rectangle: every edge inside it, grouped into chains
//    Area     click a face: its outline and any inner loops
//    Single   click an edge: that one edge (double-click takes its whole chain)
//    Partial  click the first edge, then the last: the run of edges between them
//    Last     the chains of the most recent chain toolpath that has any
// ═══════════════════════════════════════════════════════════════════
(function () {
  const MODES = [['chain', 'Chain', 'Click an edge: the whole connected run it belongs to is picked.'],
    ['window', 'Window', 'Drag a rectangle: every edge inside it is picked and joined into chains.'],
    ['area', 'Area', 'Click a face: its outline and inner loops are picked.'],
    ['single', 'Single', 'Click an edge: just that edge. Double-click takes its whole chain.'],
    ['partial', 'Partial', 'Click the first edge, then the last: the edges between them are picked.']];
  const CX = window.CHAINX = { WIN: null, partial: null };
  const isChainOp = op => !!op && op.type === 'chain';
  const curOp = () => (typeof CAMUI !== 'undefined' && CAMUI.view === 'op' && UIX.ws === 'cam') ? opById(CAMUI.op) : null;
  const circ = op => chainIsCircle(op);

  // ── picking helpers ──
  const lvl = ch => chainFlat(ch);
  function candidates(mesh, seed) {
    const z = seed.pts[0][1], level = lvl(seed);
    return edgeChains(mesh).filter(c => !level || (lvl(c) && Math.abs(c.pts[0][1] - z) < CHAIN_Z_TOL));
  }
  // group a set of edge chains into connected chains
  function groupChains(mesh, list) {
    const only = new Set(list), used = new Set(), out = [];
    for (const ch of list) {
      const k = chainEdgeKey(ch); if (used.has(k)) continue;
      const nc = buildChain(mesh, ch, true, null, only);
      if (!nc) { used.add(k); continue; }
      (nc.eks || []).forEach(x => used.add(x)); used.add(k);
      out.push(nc);
    }
    return out;
  }
  const vkey = p => chainKey(p);
  // the run of edges from edge A to edge B along connected edges (shortest), or null
  function partialChain(mesh, A, B) {
    if (A === B) return buildChain(mesh, A, false);
    const all = candidates(mesh, A).filter(c => c !== A && c !== B);
    const ends = c => [vkey(c.pts[0]), vkey(c.pts[c.pts.length - 1])];
    const adj = new Map();
    for (const c of all) { const [a, b] = ends(c); for (const [u, v] of [[a, b], [b, a]]) { if (!adj.has(u)) adj.set(u, []); adj.get(u).push({ c, to: v, fwd: u === a }); } }
    const bfs = (s, t) => {
      if (s === t) return [];
      const prev = new Map([[s, null]]), q = [s];
      while (q.length) { const u = q.shift(); for (const e of adj.get(u) || []) if (!prev.has(e.to)) { prev.set(e.to, { from: u, e }); if (e.to === t) { const path = []; let k = t; while (prev.get(k)) { path.unshift(prev.get(k).e); k = prev.get(k).from; } return path; } q.push(e.to); } }
      return null;
    };
    let best = null;
    for (const sA of ends(A)) for (const tB of ends(B)) {
      const p = bfs(sA, tB); if (!p) continue;
      if (!best || p.length < best.p.length) best = { p, sA, tB };
    }
    if (!best) return null;
    const orient = (c, from) => (vkey(c.pts[0]) === from ? c.pts : c.pts.slice().reverse());
    const aEnd = best.sA, aPts = vkey(A.pts[A.pts.length - 1]) === aEnd ? A.pts : A.pts.slice().reverse();
    let seq = aPts.slice(), cur = aEnd; const eks = [chainEdgeKey(A)];
    for (const e of best.p) { seq = seq.concat(orient(e.c, cur).slice(1)); cur = e.fwd ? vkey(e.c.pts[e.c.pts.length - 1]) : vkey(e.c.pts[0]); eks.push(chainEdgeKey(e.c)); }
    seq = seq.concat(orient(B, best.tB).slice(vkey(seq[seq.length - 1]) === best.tB ? 1 : 0)); eks.push(chainEdgeKey(B));
    const out = [];
    for (const p of seq) { const q = [+p[0].toFixed(4), +(-p[2]).toFixed(4)], l = out[out.length - 1]; if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 1e-5) out.push(q); }
    if (out.length < 2) return null;
    return { z: +Math.max(...seq.map(p => p[1])).toFixed(4), closed: false, pts: out, eks };
  }
  const faceHit = (x, y) => { const h = pick3D(x, y, { faces: true }); return h && h.kind === 'face' ? h : null; };
  function areaChains(h) {
    const list = edgeChains(h.mesh).filter(c => c.fa === h.fid || c.fb === h.fid);
    return list.length ? groupChains(h.mesh, list) : [];
  }
  function windowChains(r) {
    const x0 = Math.min(r.x0, r.x1), x1 = Math.max(r.x0, r.x1), y0 = Math.min(r.y0, r.y1), y1 = Math.max(r.y0, r.y1), out = [];
    for (const b of visibleBodies()) {
      const m = bodyMesh(b), inside = edgeChains(m).filter(c => c.pts.every(p => { const s = toScreen(p); return s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1; }));
      out.push(...groupChains(m, inside));
    }
    return out;
  }

  // ── writing chains into the toolpath ──
  function addChains(op, list, label, additive = true) {
    if (!list.length) { toast('Nothing to chain there.'); return false; }
    const before = snap(), cur = additive ? (op.chains || []).slice() : [];
    let id = cur.reduce((m, c) => Math.max(m, c.id || 0), 0), added = 0;
    for (const nc of list) {
      if ((nc.eks || []).length && cur.some(c => (c.eks || []).some(k => nc.eks.includes(k)))) continue;       // already chained
      cur.push({ id: ++id, rev: false, start: 0, ...nc }); added++;
    }
    if (!added) { toast('Already chained.'); return false; }
    op.chains = cur;
    if (typeof camAutoTool === 'function') camAutoTool(op);
    record(`${op.name}: ${label}`, before); camRefresh();
    return true;
  }
  function undoLast(op) {
    if (!op.chains || !op.chains.length) return;
    const before = snap(); op.chains = op.chains.slice(0, -1);
    camAutoTool(op); record(`${op.name}: remove last chain`, before); camRefresh();
  }
  function clearAll(op) {
    if (!op.chains || !op.chains.length) return;
    const before = snap(); op.chains = []; CX.partial = null;
    camAutoTool(op); record(`${op.name}: clear chains`, before); camRefresh();
  }
  function useLast(op) {
    const ops = cam().ops, i = ops.indexOf(op);
    const src = ops.slice(0, i < 0 ? ops.length : i).reverse().concat(ops.slice(i + 1)).find(o => o !== op && o.type === 'chain' && (o.chains || []).length);
    if (!src) { toast('No earlier chain toolpath to copy chains from.'); return; }
    addChains(op, JSON.parse(JSON.stringify(src.chains)).map(c => { delete c.id; return c; }), 'last chains', false);
  }

  // ── hooking into the existing click / hover / panel ──
  const clickOrig = chainClick, moveOrig = chainMove;
  chainClick = function (op, x, y, ev) {
    const mode = CHAINUI.mode;
    if (CHAINUI.startFor != null || circ(op) || !MODES.some(m => m[0] === mode) || mode === 'chain' || mode === 'single') return clickOrig.apply(this, arguments);
    const add = ev && (ev.shiftKey || ev.ctrlKey || ev.metaKey);
    if (mode === 'area') {
      const h = faceHit(x, y); if (!h) { toast('Click a face of the part.'); return; }
      addChains(op, areaChains(h), 'area', true); return;
    }
    if (mode === 'partial') {
      const e = pickEdge(x, y, visibleBodies(), 8);
      if (!e) { toast('Click an edge.'); return; }
      if (!CX.partial) { CX.partial = e; CHAINUI.hover = null; toast('Now click the last edge.'); camRefresh(); return; }
      const first = CX.partial; CX.partial = null;
      if (first.mesh !== e.mesh) { toast('Both edges must be on the same body.'); return; }
      const nc = partialChain(first.mesh, first.ch, e.ch);
      if (!nc) { toast('Those two edges are not connected.'); camRefresh(); return; }
      addChains(op, [nc], 'partial chain', true); return;
    }
    // window: a plain click (no drag) takes the whole chain under it
    return clickOrig.apply(this, arguments);
  };
  chainMove = function (op, x, y) {
    const mode = CHAINUI.mode;
    if (CHAINUI.startFor != null || circ(op) || (mode !== 'area' && mode !== 'partial')) return moveOrig.apply(this, arguments);
    let key = '', hov = null;
    if (mode === 'area') {
      const h = faceHit(x, y); key = h ? 'a' + h.fid : '';
      if (key !== CHAINUI.hoverKey) { CHAINUI.hoverKey = key; CHAINUI.hoverList = h ? areaChains(h) : []; CHAINUI.hover = null; requestDraw(); }
      setHover3D(h); ov.className = h ? 'pointer' : 'default'; return;
    }
    const e = pickEdge(x, y, visibleBodies(), 8); key = e ? 'p' + chainEdgeKey(e.ch) + (CX.partial ? 1 : 0) : '';
    if (key !== CHAINUI.hoverKey) {
      CHAINUI.hoverKey = key;
      hov = !e ? null : CX.partial && CX.partial.mesh === e.mesh ? partialChain(e.mesh, CX.partial.ch, e.ch) : buildChain(e.mesh, e.ch, false);
      CHAINUI.hover = hov; CHAINUI.hoverList = null; requestDraw();
    }
    setHover3D(null); ov.className = e ? 'pointer' : 'default';
  };
  const overlayOrig = chainOverlay;
  chainOverlay = function () {
    overlayOrig.apply(this, arguments);
    const op = curOp(); if (!isChainOp(op)) return;
    if (CHAINUI.mode === 'area' && CHAINUI.hoverList) for (const c of CHAINUI.hoverList) chainStroke(c, COL['face-hot'], 3, true);
    if (CX.partial && CHAINUI.mode === 'partial') { const c = buildChain(CX.partial.mesh, CX.partial.ch, false); if (c) chainStroke(c, COL.accent, 3.4, true); }
    const w = CX.WIN;
    if (w && w.moved) {
      og.save(); og.strokeStyle = COL.accent; og.fillStyle = 'rgba(59,110,230,0.10)'; og.lineWidth = 1.5; og.setLineDash([5, 3]);
      og.fillRect(Math.min(w.x0, w.x1), Math.min(w.y0, w.y1), Math.abs(w.x1 - w.x0), Math.abs(w.y1 - w.y0));
      og.strokeRect(Math.min(w.x0, w.x1), Math.min(w.y0, w.y1), Math.abs(w.x1 - w.x0), Math.abs(w.y1 - w.y0)); og.restore();
    }
  };
  // window: a left-drag draws the rectangle instead of orbiting
  const windowOn = e => { const op = curOp(); return isChainOp(op) && !circ(op) && CHAINUI.mode === 'window' && CHAINUI.startFor == null && !CMD && !S.sk && !e.altKey && e.button === 0; };
  ov.addEventListener('pointerdown', e => {
    if (!windowOn(e) || cubePick(local(e).x, local(e).y)) return;
    const { x, y } = local(e); CX.WIN = { x0: x, y0: y, x1: x, y1: y, moved: false, id: e.pointerId };
    try { ov.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
    e.stopImmediatePropagation();
  }, true);
  ov.addEventListener('pointermove', e => {
    if (!CX.WIN) return;
    const { x, y } = local(e); CX.WIN.x1 = x; CX.WIN.y1 = y;
    if (Math.hypot(x - CX.WIN.x0, y - CX.WIN.y0) > 4) CX.WIN.moved = true;
    requestDraw(); e.stopImmediatePropagation();
  }, true);
  ov.addEventListener('pointerup', e => {
    const w = CX.WIN; if (!w) return;
    CX.WIN = null; e.stopImmediatePropagation(); requestDraw();
    const op = curOp(); if (!isChainOp(op)) return;
    const { x, y } = local(e);
    if (!w.moved) { clickOrig(op, x, y, e); return; }
    addChains(op, windowChains({ ...w, x1: x, y1: y }), 'window', true);
  }, true);
  ov.addEventListener('dblclick', e => { if (CX.WIN) e.stopImmediatePropagation(); }, true);

  // ── the panel: the mode grid replaces "Click selects" ──
  const fieldsOrig = chainPanelFields;
  chainPanelFields = function (op) {
    let h = fieldsOrig.apply(this, arguments);
    if (circ(op)) return h;
    const i = h.indexOf('<div class="field"><span>Click selects</span>');
    if (i < 0) return h;
    const j = h.indexOf('</div></div>', i) + '</div></div>'.length;
    const on = CHAINUI.mode;
    const grid = `<div class="field"><span>Chaining</span><div class="seg cx-modes" style="flex-wrap:wrap">${MODES.map(([k, n, t]) => `<button data-chmode="${k}" data-cxtip="${t}" class="${on === k ? 'on' : ''}" title="${t}">${n}</button>`).join('')}<button data-cx="last" title="Use the chains of the last chain toolpath">Last</button></div>
      <div class="seg" style="margin-top:6px"><button data-cx="undo" title="Remove the last chain (Backspace)">Undo last</button><button data-cx="clear" title="Remove every chain">Clear all</button></div></div>`;
    return h.slice(0, i) + grid + h.slice(j);
  };
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-cx]'); if (!b) return;
    const op = curOp(); if (!isChainOp(op)) return;
    e.stopPropagation(); const k = b.dataset.cx;
    if (k === 'undo') undoLast(op); else if (k === 'clear') clearAll(op); else if (k === 'last') useLast(op);
  }, true);
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-chmode]')) CX.partial = null; }, true);
  document.addEventListener('keydown', e => {
    if (e.key !== 'Backspace') return;
    const t = e.target, op = curOp();
    if (!isChainOp(op) || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable))) return;
    e.preventDefault(); if (CX.partial) { CX.partial = null; camRefresh(); } else undoLast(op);
  }, true);

  CX.prompt = (op, n) => {
    const m = CHAINUI.mode, c = n ? `${n} chain${n > 1 ? 's' : ''} selected. ` : '';
    if (m === 'window') return c + 'Drag a rectangle round the geometry to chain it. Backspace undoes the last chain.';
    if (m === 'area') return c + 'Click a face: its outline is chained.';
    if (m === 'partial') return c + (CX.partial ? 'Click the last edge of the run.' : 'Click the first edge of the run.');
    return null;
  };
  CX.windowChains = windowChains; CX.areaChains = areaChains; CX.partialChain = partialChain; CX.addChains = addChains; CX.undoLast = undoLast; CX.useLast = useLast; CX.MODES = MODES;
})();
