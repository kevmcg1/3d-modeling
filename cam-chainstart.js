// ═══════════════════════════════════════════════════════════════════
//  Chain start points with snapping, the way Mastercam lets you move a chain's start.
//  Start… on a chain row (or "Set start points" for every chain at once) then click on the chain:
//    Vertex    a corner, or where two edges meet
//    Midpoint  the middle of an edge (an arc's midpoint is on the arc)
//    On edge   anywhere along a closed chain, when no vertex or midpoint is near the pointer
//  A closed chain starts where you click. An open chain can only start at one of its ends, so clicking the far end
//  turns it round. The direction (Reverse) is kept, and the toolpath follows the new start.
//  A start at a vertex is stored as before (c.start, an index into c.pts); anywhere else as c.sp = [x, y] in machine
//  XY, which chainTravel splits the chain at, so the picked geometry itself is never changed.
// ═══════════════════════════════════════════════════════════════════
(function () {
  const SNAP_PX = 14, EDGE_PX = 10;
  const isChainOp = op => !!op && op.type === 'chain';
  const curOp = () => (typeof CAMUI !== 'undefined' && CAMUI.view === 'op' && UIX.ws === 'cam') ? opById(CAMUI.op) : null;
  const circ = op => chainIsCircle(op);
  const ALL = 'all';
  const CS = window.CHAINSTART = { hover: null };
  const r4 = v => +v.toFixed(4);

  // ── travel order with a start anywhere along a closed chain ──
  // the segment of a closed polygon nearest a point: { i, t } with the point at lerp(p[i], p[i + 1], t)
  function nearestSeg(p, q) {
    let best = null;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length], dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
      const t = L > 0 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / L)) : 0;
      const d = Math.hypot(a.x + dx * t - q.x, a.y + dy * t - q.y);
      if (!best || d < best.d) best = { i, t, d };
    }
    return best;
  }
  const travelOrig = chainTravel;
  chainTravel = function (c) {
    if (!c.closed || !c.sp || !c.pts || c.pts.length < 2) return travelOrig.apply(this, arguments);
    let p = c.pts.map(q => P2(q[0], q[1]));
    const n = p.length, h = nearestSeg(p, P2(c.sp[0], c.sp[1])), L = dst2(p[h.i], p[(h.i + 1) % n]);
    if (h.t * L < 1e-4) p = startAt(p, h.i);
    else if ((1 - h.t) * L < 1e-4) p = startAt(p, (h.i + 1) % n);
    else p = [lerp2(p[h.i], p[(h.i + 1) % n], h.t), ...startAt(p, (h.i + 1) % n)];
    if (c.rev) p = [p[0], ...p.slice(1).reverse()];
    return p;
  };

  // ── the snap points of a chain: its vertices and edge midpoints, from the model's edges ──
  let edgeIdx = null, edgeEpoch = -1;
  function edgeIndex() {
    if (edgeIdx && edgeEpoch === camEpoch) return edgeIdx;
    edgeIdx = new Map(); edgeEpoch = camEpoch;
    for (const b of visibleBodies()) { const m = bodyMesh(b); for (const ch of edgeChains(m)) edgeIdx.set(chainEdgeKey(ch), ch); }
    return edgeIdx;
  }
  const xy = p => [p[0], -p[2]];
  const cache = new WeakMap();
  function snapsOf(c) {
    const sig = camEpoch + '|' + (c.eks || []).join(';') + '|' + c.pts.length + '|' + c.closed;
    const hit = cache.get(c); if (hit && hit.sig === sig) return hit.list;
    const out = [], seen = new Set(), poly = c.pts.map(q => P2(q[0], q[1]));
    const add = (kind, q) => {
      if (!c.closed) return;
      const k = Math.round(q[0] * 1000) + ',' + Math.round(q[1] * 1000);
      if (seen.has(k)) { if (kind === 'vertex') { const o = out.find(s => s.k === k); if (o) o.kind = 'vertex'; } return; }
      if (nearestSeg(poly, P2(q[0], q[1])).d > 0.05) return;                    // not on this chain (projected differently)
      seen.add(k); out.push({ kind, x: q[0], y: q[1], k });
    };
    if (!c.closed) {                                                       // an open chain starts at one of its ends
      const a = c.pts[0], b = c.pts[c.pts.length - 1];
      out.push({ kind: 'vertex', x: a[0], y: a[1], k: 'a' }, { kind: 'vertex', x: b[0], y: b[1], k: 'b' });
    } else {
      const idx = edgeIndex();
      let found = 0;
      for (const ek of c.eks || []) {
        const ch = idx.get(ek); if (!ch) continue;
        found++;
        add('vertex', xy(ch.pts[0]));
        if (!ch.closed) add('vertex', xy(ch.pts[ch.pts.length - 1]));
        if (ch.mid) add('mid', xy(ch.mid));
      }
      if (c.joined && c.pts.length > 1) {                                  // the joining line has no model edge
        const a = c.pts[c.pts.length - 1], b = c.pts[0];
        add('vertex', a); add('vertex', b); add('mid', [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      }
      if (!found) {                                                        // no model edges (model changed): corners of the polygon
        const n = poly.length, corner = [];
        for (let i = 0; i < n; i++) {
          const a = poly[(i - 1 + n) % n], b = poly[i], d = poly[(i + 1) % n], u = nrm2(sub2(b, a)), v = nrm2(sub2(d, b));
          if (Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y))) > 0.35) corner.push(i);
        }
        if (!corner.length) corner.push(0);
        corner.forEach((ci, j) => {
          add('vertex', c.pts[ci]);
          const cj = corner[(j + 1) % corner.length], run = [];               // midpoint by length to the next corner
          for (let i = ci; ; i = (i + 1) % n) { run.push(poly[i]); if (run.length > 1 && i === cj) break; if (run.length > n + 1) break; }
          let L = 0; for (let i = 1; i < run.length; i++) L += dst2(run[i - 1], run[i]);
          let acc = 0;
          for (let i = 1; i < run.length; i++) { const l = dst2(run[i - 1], run[i]); if (acc + l >= L / 2) { const m = lerp2(run[i - 1], run[i], l ? (L / 2 - acc) / l : 0); add('mid', [m.x, m.y]); break; } acc += l; }
        });
      }
    }
    cache.set(c, { sig, list: out });
    return out;
  }

  // ── what the pointer snaps to ──
  const targets = op => (op.chains || []).filter(c => CHAINUI.startFor === ALL || c.id === CHAINUI.startFor);
  const scr = (c, x, y) => toScreen(toW(x, y, c.z));
  function snapAt(op, x, y) {
    let best = null;
    for (const c of targets(op)) for (const s of snapsOf(c)) {
      const q = scr(c, s.x, s.y), d = Math.hypot(q.x - x, q.y - y) - (s.kind === 'vertex' ? 2 : 0);
      if (d < SNAP_PX && (!best || d < best.d)) best = { c, kind: s.kind, x: s.x, y: s.y, d };
    }
    if (best) return best;
    for (const c of targets(op)) {                                         // anywhere along a closed chain
      if (!c.closed) continue;
      const n = c.pts.length;
      for (let i = 0; i < n; i++) {
        const a = c.pts[i], b = c.pts[(i + 1) % n], A = scr(c, a[0], a[1]), B = scr(c, b[0], b[1]);
        const dx = B.x - A.x, dy = B.y - A.y, L = dx * dx + dy * dy, t = L > 0 ? Math.max(0, Math.min(1, ((x - A.x) * dx + (y - A.y) * dy) / L)) : 0;
        const d = Math.hypot(A.x + dx * t - x, A.y + dy * t - y);
        if (d < EDGE_PX && (!best || d < best.d)) best = { c, kind: 'edge', x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, d };
      }
    }
    return best;
  }
  const KIND = { vertex: 'Vertex', mid: 'Midpoint', edge: 'On edge' };
  function setStart(op, h) {
    const c = h.c, before = snap();
    if (!c.closed) {
      const p = chainTravel(c);
      if (Math.hypot(p[0].x - h.x, p[0].y - h.y) > 1e-4) c.rev = !c.rev;
    } else {
      const i = c.pts.findIndex(q => Math.hypot(q[0] - h.x, q[1] - h.y) < 1e-3);
      if (i >= 0) { c.start = i; delete c.sp; } else { c.sp = [r4(h.x), r4(h.y)]; c.start = 0; }
    }
    record(`${op.name}: start point`, before);
  }

  // ── hooking into the chain click / hover / overlay / panel ──
  const clickOrig = chainClick, moveOrig = chainMove, doOrig = chainDo, overlayOrig = chainOverlay, fieldsOrig = chainPanelFields;
  chainClick = function (op, x, y) {
    if (CHAINUI.startFor == null) return clickOrig.apply(this, arguments);
    const h = snapAt(op, x, y);
    if (!h) {
      if (CHAINUI.startFor !== ALL) { CHAINUI.startFor = null; CS.hover = null; camRefresh(); }
      else toast('Click a vertex or an edge midpoint of a chain. Esc when done.');
      return;
    }
    setStart(op, h);
    if (CHAINUI.startFor !== ALL) CHAINUI.startFor = null;
    CS.hover = null; camRefresh();
  };
  chainMove = function (op, x, y) {
    if (CHAINUI.startFor == null) { if (CS.hover) { CS.hover = null; requestDraw(); } return moveOrig.apply(this, arguments); }
    const h = snapAt(op, x, y), k = h ? h.c.id + h.kind + h.x.toFixed(3) + h.y.toFixed(3) : '', o = CS.hover;
    if (k !== (o ? o.c.id + o.kind + o.x.toFixed(3) + o.y.toFixed(3) : '')) { CS.hover = h; requestDraw(); }
    CHAINUI.hover = null; setHover3D(null); ov.className = h ? 'pointer' : 'default';
  };
  chainDo = function (op, a) {
    const [k, id] = a.split(':');
    if (k !== 'start') return doOrig.apply(this, arguments);
    const c = (op.chains || []).find(q => q.id === +id); if (!c) return;
    CHAINUI.startFor = CHAINUI.startFor === c.id ? null : c.id; CS.hover = null;
    if (CHAINUI.startFor != null) toast(c.closed ? 'Click a vertex, an edge midpoint or anywhere along the chain to start there.' : 'Click the end of the chain to start from.');
    camRefresh();
  };
  CS.setAll = op => {
    CHAINUI.startFor = CHAINUI.startFor === ALL ? null : ALL; CS.hover = null;
    if (CHAINUI.startFor != null) toast('Click a vertex or an edge midpoint on each chain to start it there. Esc when done.');
    camRefresh();
  };
  chainOverlay = function () {
    overlayOrig.apply(this, arguments);
    const op = curOp(); if (!isChainOp(op) || CHAINUI.startFor == null) return;
    og.save();
    for (const c of targets(op)) for (const s of snapsOf(c)) {
      const q = scr(c, s.x, s.y);
      og.beginPath();
      if (s.kind === 'vertex') og.rect(q.x - 3.5, q.y - 3.5, 7, 7);
      else { og.moveTo(q.x, q.y - 4.5); og.lineTo(q.x + 4.5, q.y + 3.5); og.lineTo(q.x - 4.5, q.y + 3.5); og.closePath(); }
      og.fillStyle = '#fff'; og.fill(); og.strokeStyle = COL.accent; og.lineWidth = 1.5; og.stroke();
    }
    const h = CS.hover;
    if (h && targets(op).includes(h.c)) {
      const q = scr(h.c, h.x, h.y);
      og.beginPath(); og.arc(q.x, q.y, 7, 0, TAU); og.fillStyle = '#2fa84f'; og.fill(); og.strokeStyle = '#fff'; og.lineWidth = 2; og.stroke();
      const txt = KIND[h.kind];
      og.font = '600 11px system-ui, sans-serif';
      const w = og.measureText(txt).width + 10;
      og.fillStyle = 'rgba(20,24,32,0.85)'; og.fillRect(q.x + 10, q.y - 22, w, 17);
      og.fillStyle = '#fff'; og.fillText(txt, q.x + 15, q.y - 9.5);
    }
    og.restore();
  };
  chainPanelFields = function (op) {
    let h = fieldsOrig.apply(this, arguments);
    const chains = op.chains || [];
    if (circ(op) || !chains.length) return h;
    h = h.replace(/<button class="mini[^"]*" data-chdo="start:\d+"[^>]*>Start…<\/button>/g, '');
    for (const c of chains) {
      const del = `<button class="mini" data-chdo="del:${c.id}"`;
      const btn = `<button class="mini ${CHAINUI.startFor === c.id ? 'on' : ''}" data-chdo="start:${c.id}" title="${c.closed ? 'Then click a vertex, an edge midpoint or anywhere along the chain to start there' : 'Then click the end of the chain to start from'}">Start…</button>`;
      h = h.replace(del, btn + del);
    }
    const i = h.indexOf('</ul>');
    if (i >= 0) h = h.slice(0, i + 5) + `<div class="seg" style="margin-top:6px"><button data-chstart="all" class="${CHAINUI.startFor === ALL ? 'on' : ''}" title="Snap each chain's start to a vertex, an edge midpoint or a point along it">Set start points</button></div>` + h.slice(i + 5);
    return h;
  };
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-chstart]'); if (!b) return;
    const op = curOp(); if (!isChainOp(op)) return;
    e.stopPropagation(); CS.setAll(op);
  }, true);
  // Esc leaves start picking; a double-click while picking must not chain anything
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || CHAINUI.startFor == null || UIX.ws !== 'cam') return;
    e.preventDefault(); e.stopImmediatePropagation();
    CHAINUI.startFor = null; CS.hover = null; camRefresh();
  }, true);
  window.addEventListener('dblclick', e => { if (CHAINUI.startFor != null && isChainOp(curOp())) e.stopPropagation(); }, true);

  CS.snapsOf = snapsOf; CS.snapAt = snapAt; CS.setStart = setStart;
})();
