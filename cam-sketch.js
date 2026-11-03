// ═══════════════════════════════════════════════════════════════════
//  Manufacture: 2D toolpaths on sketches (manual, like Mastercam chaining a wireframe), and the toolpath parameters
//  in the left sidebar.
//
//  1. Sketch chains. Click a sketch curve in a Chain operation (or press "Chain" beside a sketch in the panel) and the
//     connected lines and arcs, or a circle, become a chain: the same op.chains entry a clicked model edge makes, so every
//     Chain toolpath (contour, pocket, slot, drill…) works on it. The chain remembers its sketch (c.sk, c.ents) and
//     follows it when the sketch is edited. Sketches must lie on a horizontal plane (the Top plane or an offset of it).
//  2. A sketch alone is enough. With no body in the model, the sketches stand in for the part: stock is the sketch
//     outline plus the stock margins, and a thickness (cam().sketchThk) down from the sketch plane.
//  3. Left sidebar. The selected operation opens its parameters under its row: toolpath, tool, compensation type and
//     side, depths, stepdown, leave, lead, and its own feed, plunge and spindle speed.
//
//  Chain shape: { id, z, closed, pts: [[x, y]…] (machine XY), eks, sk, ents, rev, start }.
// ═══════════════════════════════════════════════════════════════════
(function () {
  const SK = window.CAMSK = {};
  const NODE_TOL = 1e-3, ARC_STEP = Math.PI / 36;                         // endpoints this close are one point; arcs are cut every 5°
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const planeOf = sk => (MODEL.planes && MODEL.planes[sk.id]) || sk.plane;
  const isTop = pl => !!pl && Math.abs(pl.n[1]) > 0.999;                  // machine XY is the model's X and −Z: a horizontal plane lands on it
  const skList = () => doc.features.filter(f => f.type === 'sketch' && !f.sup && f.vis !== false);
  const skById = id => doc.features.find(f => f.type === 'sketch' && f.id === id);
  const usable = e => !e.cons && (e.type === 'line' || e.type === 'arc' || e.type === 'circle');

  // ── The curves of a sketch as polylines ──
  const entPts = e => {
    if (e.type === 'line') return [e.a, e.b];
    const t0 = e.type === 'circle' ? 0 : e.a0, t1 = e.type === 'circle' ? TAU : e.a1, n = Math.max(2, Math.ceil(Math.abs(t1 - t0) / ARC_STEP)), out = [];
    for (let k = 0; k <= n; k++) out.push(polar(e.c, e.r, t0 + (t1 - t0) * k / n));
    return out;
  };
  const sigOf = sk => JSON.stringify([sk.ents.map(e => e.cons ? 0 : [e.id, e.type, e.a, e.b, e.c, e.r, e.a0, e.a1]), sk.org, sk.mv]) + JSON.stringify(planeOf(sk));
  const cache = new Map();                                                  // sketch id → { sig, chains, flat }
  // The chains of a sketch: every connected run of lines and arcs, and every circle on its own.
  function chainsOf(sk) {
    const sig = sigOf(sk), hit = cache.get(sk.id);
    if (hit && hit.sig === sig) return hit;
    const pl = planeOf(sk), out = { sig, flat: isTop(pl), chains: [], ents: new Map() };
    cache.set(sk.id, out);
    if (!out.flat) return out;
    out.polys = sk.ents.filter(usable).map(e => ({ e, w: entPts(e).map(p => planeTo3(pl, p)) }));      // the curves in model space, cut once, not on every frame
    const toM = p => { const P = planeTo3(pl, p); return [P[0], -P[2], P[1]]; };
    const mk = (seq, closed, ids) => {
      const pts = []; let z = -Infinity;
      for (const p of seq) { const m = toM(p), q = [+m[0].toFixed(4), +m[1].toFixed(4)], l = pts[pts.length - 1]; z = Math.max(z, m[2]); if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 1e-5) pts.push(q); }
      if (closed && pts.length > 1 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-5) pts.pop();
      if (pts.length < 2) return null;
      return { z: +z.toFixed(4), closed, pts, eks: ids.map(i => `sk${sk.id}:${i}`), sk: sk.id, ents: ids };
    };
    const lines = [], nodes = [];
    const nodeOf = p => { let i = nodes.findIndex(q => Math.hypot(q.x - p.x, q.y - p.y) < NODE_TOL); if (i < 0) { nodes.push(p); i = nodes.length - 1; } return i; };
    for (const e of sk.ents.filter(usable)) {
      if (e.type === 'circle') { const c = mk(entPts(e), true, [e.id]); if (c) { out.chains.push(c); } continue; }
      const [a, b] = G.ends(e), na = nodeOf(a), nb = nodeOf(b);
      lines.push({ e, na, nb, pts: entPts(e) });
    }
    const at = new Map(); lines.forEach(L => { for (const n of [L.na, L.nb]) { if (!at.has(n)) at.set(n, []); at.get(n).push(L); } });
    const used = new Set(), dir = (a, b) => nrm2(sub2(b, a));
    // start at an end that nothing else joins, so an open run is taken from its end; loops start anywhere
    const order = [...at.keys()].sort((x, y) => (at.get(x).length === 1 ? 0 : 1) - (at.get(y).length === 1 ? 0 : 1));
    for (const n0 of order) {
      while ((at.get(n0) || []).some(L => !used.has(L))) {
        let cur = n0, last = null; const seq = [], ids = [];
        for (let guard = 0; guard < 5000; guard++) {
          const cands = (at.get(cur) || []).filter(L => !used.has(L));
          if (!cands.length) break;
          let best = null;
          for (const L of cands) {
            const fwd = L.na === cur, pts = fwd ? L.pts : L.pts.slice().reverse();
            const turn = last ? Math.abs(Math.atan2(crs2(last, dir(pts[0], pts[1])), dot2(last, dir(pts[0], pts[1])))) : 0;
            if (!best || turn < best.turn) best = { L, fwd, pts, turn };
          }
          used.add(best.L); ids.push(best.L.e.id);
          seq.push(...(seq.length ? best.pts.slice(1) : best.pts));
          last = dir(best.pts[best.pts.length - 2], best.pts[best.pts.length - 1]);
          cur = best.fwd ? best.L.nb : best.L.na;
          if (cur === n0) break;
        }
        const c = mk(seq, cur === n0 && ids.length > 0, ids);
        if (c) out.chains.push(c);
      }
    }
    out.chains.forEach(c => c.ents.forEach(id => out.ents.set(id, c)));
    return out;
  }
  const chainFromEnt = (skId, entId, whole) => {
    const sk = skById(skId); if (!sk) return null;
    const R = chainsOf(sk), c = R.ents.get(entId);
    if (!c) return null;
    if (whole || c.ents.length === 1) return JSON.parse(JSON.stringify(c));
    const e = sk.ents.find(q => q.id === entId), pts = entPts(e), pl = planeOf(sk);
    const m = pts.map(p => { const P = planeTo3(pl, p); return [+P[0].toFixed(4), +(-P[2]).toFixed(4), P[1]]; });
    return { z: +m[0][2].toFixed(4), closed: false, pts: m.map(q => [q[0], q[1]]), eks: [`sk${skId}:${entId}`], sk: skId, ents: [entId], part: true };   // part: one curve of a longer run; it stays that one curve
  };
  SK.chainsOf = chainsOf; SK.chainFromEnt = chainFromEnt;
  // Every chain of one sketch, ready for op.chains.
  SK.allChains = skId => { const sk = skById(skId); return sk ? chainsOf(sk).chains.map(c => JSON.parse(JSON.stringify(c))) : []; };

  // ── A chain follows its sketch ──
  // Looks the chain's curves up again in the sketch as it is now. Returns false when none of them is left.
  function refresh(c) {
    const sk = skById(c.sk);
    if (!sk) return false;
    if (c.part) {                                                          // a single curve picked out of a run: read just that curve again
      const n = chainFromEnt(c.sk, c.ents[0], false);
      if (!n) return false;
      c.z = n.z; c.pts = n.pts.map(q => q.slice()); c.closed = false;
      return true;
    }
    const R = chainsOf(sk);
    let best = null, bn = 0;
    for (const n of R.chains) { const k = n.ents.filter(id => (c.ents || []).includes(id)).length; if (k > bn) { bn = k; best = n; } }
    if (!best) return false;
    if (best.pts.length !== c.pts.length) c.start = 0;
    c.z = best.z; c.closed = best.closed; c.pts = best.pts.map(q => q.slice()); c.ents = best.ents.slice(); c.eks = best.eks.slice();
    return true;
  }
  SK.refresh = refresh;
  const toolpath0 = toolpath;
  toolpath = function (op) {
    let lost = 0;
    if (op.chains && op.chains.some(c => c.sk)) for (const c of op.chains) if (c.sk && !refresh(c)) lost++;
    const P = toolpath0.apply(this, arguments);
    if (lost && P && P.warn && !P.warn.some(w => /sketch/.test(w))) P.warn.push(`${lost} chain${lost > 1 ? 's' : ''} lost ${lost > 1 ? 'their' : 'its'} sketch curves: the sketch was changed or deleted. Pick it again.`);
    return P;
  };

  // ── A sketch alone is a part ──
  const part0 = camPart;
  let skPart = { model: null, thk: 0, v: undefined };
  camPart = function () {
    const p = part0.apply(this, arguments);
    if (p) return p;
    const thk = cam().sketchThk > 0 ? cam().sketchThk : 12.7;
    if (skPart.model === MODEL && skPart.thk === thk && skPart.n === doc.features.length) return skPart.v;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, zt = -Infinity;
    for (const sk of skList()) for (const c of chainsOf(sk).chains) { zt = Math.max(zt, c.z); for (const q of c.pts) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); } }
    skPart = { model: MODEL, thk, n: doc.features.length, v: isFinite(x0) ? { x0, x1, y0, y1, z0: zt - thk, z1: zt, sketchOnly: true } : null };
    return skPart.v;
  };
  SK.thickness = () => (cam().sketchThk > 0 ? cam().sketchThk : 12.7);

  // ── Picking a sketch curve in the view ──
    function skPick(x, y, tol) {
    if (UIX.ws !== 'cam') return null;
    let best = null;
    for (const sk of skList()) {
      if (!chainsOf(sk).flat) continue;
      for (const { e, w } of chainsOf(sk).polys) {
        const s = w.map(P => toScreen(P));
        for (let i = 0; i + 1 < s.length; i++) {
          const a = s[i], b = s[i + 1], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L2)) : 0, d = Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
          if (d <= tol && (!best || d < best.d)) best = { d, sk: sk.id, ent: e };
        }
      }
    }
    return best ? { skHit: true, sk: best.sk, ent: best.ent } : null;
  }
  SK.pick = skPick;
  const pick0 = chainPickAt;
  chainPickAt = function (x, y) {
    const src = CHAINUI.src || 'both';
    if (src !== 'model') { const h = skPick(x, y, 8); if (h) return h; }
    return src === 'sketch' ? null : pick0.apply(this, arguments);
  };
  const add0 = chainAdd;
  chainAdd = function (op, e, whole, additive) {
    if (!e || !e.skHit) return add0.apply(this, arguments);
    const nc = chainFromEnt(e.sk, e.ent.id, whole);
    if (!nc) { toast('That sketch is not on a horizontal plane. Sketch on the Top plane to machine it.'); return; }
    SK.addChains(op, [nc], whole ? 'sketch chain' : 'sketch curve', !!additive, !whole);
  };
  // add chains (or, when toggle is set and the curve is already in, take it out again)
  SK.addChains = function (op, list, label, additive, toggle) {
    const before = snap(), cur = (op.chains || []).slice();
    let id = cur.reduce((m, c) => Math.max(m, c.id || 0), 0), added = 0, list2 = additive ? cur : [];
    for (const nc of list) {
      const hit = list2.findIndex(c => (c.eks || []).some(k => nc.eks.includes(k)));
      if (hit >= 0) { if (toggle || additive) { list2.splice(hit, 1); if (toggle) continue; } else continue; }
      list2.push({ id: ++id, rev: false, start: 0, ...nc }); added++;
    }
    op.chains = list2;
    if (typeof camAutoTool === 'function') camAutoTool(op);
    record(`${op.name}: ${label}`, before); camRefresh();
    return added;
  };
  const move0 = chainMove;
  chainMove = function (op, x, y) {
    if (CHAINUI.startFor != null) return move0.apply(this, arguments);
    const e = (CHAINUI.src || 'both') === 'model' ? null : skPick(x, y, 8);
    if (!e) return move0.apply(this, arguments);
    const whole = CHAINUI.mode === 'chain', key = 'sk' + e.sk + ':' + e.ent.id + whole;
    if (key !== CHAINUI.hoverKey) { CHAINUI.hoverKey = key; CHAINUI.hover = chainFromEnt(e.sk, e.ent.id, whole); requestDraw(); }
    setHover3D(null); ov.className = 'pointer';
  };

  // ── Drawn on the view while a chain toolpath is open: every sketch curve, so there is something to click ──
  const overlay0 = chainOverlay;
  chainOverlay = function () {
    if (UIX.ws === 'cam' && CAMUI.view === 'op') {
      const op = opById(CAMUI.op);
      if (op && op.type === 'chain' && (CHAINUI.src || 'both') !== 'model') {
        og.save(); og.strokeStyle = COL.muted || '#8a94a6'; og.lineWidth = 1.5; og.lineJoin = 'round'; og.globalAlpha = 0.85;
        for (const sk of skList()) {
          if (!chainsOf(sk).flat) continue;
          og.beginPath();
          for (const { w } of chainsOf(sk).polys) w.forEach((P, i) => { const q = toScreen(P); i ? og.lineTo(q.x, q.y) : og.moveTo(q.x, q.y); });
          og.stroke();
        }
        og.restore();
      }
    }
    return overlay0.apply(this, arguments);
  };

  // ── Panel: sketches to chain from ──
  const fields0 = chainPanelFields;
  chainPanelFields = function (op) {
    let f = fields0.apply(this, arguments);
    const sks = skList().filter(sk => sk.ents.some(usable));
    if (!sks.length) return f;
    const src = CHAINUI.src || 'both';
    const rows = sks.map(sk => {
      const R = chainsOf(sk), n = R.chains.length, on = (op.chains || []).filter(c => c.sk === sk.id).length;
      return `<li data-skrow="${sk.id}"><span class="nm">${esc(sk.name || 'Sketch')}</span><span class="sub">${R.flat ? `${n} chain${n === 1 ? '' : 's'}${on ? ` · ${on} chained` : ''}` : 'not on a horizontal plane'}</span>
        <button class="mini" data-skchain="${sk.id}" ${R.flat && n ? '' : 'disabled'} title="Chain every connected run of curves and every circle in this sketch">Chain all</button></li>`;
    }).join('');
    return f + `<div class="field"><span>Sketches</span><div class="seg" role="group" aria-label="Click picks from"><button data-chsrc="both" class="${src === 'both' ? 'on' : ''}" title="A click takes a sketch curve if one is under it, else a model edge">Sketches + part</button><button data-chsrc="sketch" class="${src === 'sketch' ? 'on' : ''}" title="Only sketch curves">Sketches</button><button data-chsrc="model" class="${src === 'model' ? 'on' : ''}" title="Only edges of the part">Part</button></div>
      <ul class="chain-list sk-list">${rows}</ul><p class="note">Click a sketch curve in the view, or chain a whole sketch. The tool path follows the sketch if you change it.</p></div>`;
  };
  const bindPanel0 = bindCamPanel;
  bindCamPanel = function () {
    bindPanel0.apply(this, arguments);
    const op = CAMUI.view === 'op' ? opById(CAMUI.op) : null;
    panel.querySelectorAll('[data-chsrc]').forEach(b => b.addEventListener('click', () => { CHAINUI.src = b.dataset.chsrc; CHAINUI.hover = null; CHAINUI.hoverKey = ''; camRefresh(); }));
    panel.querySelectorAll('[data-skchain]').forEach(b => b.addEventListener('click', () => {
      if (!op) return;
      const list = SK.allChains(+b.dataset.skchain);
      if (!list.length) { toast('Nothing to chain in that sketch.'); return; }
      const n = SK.addChains(op, list, 'sketch', true, false);
      toast(n ? `${n} chain${n === 1 ? '' : 's'} added.` : 'Already chained.');
    }));
    const thk = document.getElementById('skThk');
    if (thk) thk.addEventListener('change', () => { const v = parseFloat(thk.value); if (v > 0) { const before = snap(); cam().sketchThk = fromU(v); record('Edit sketch stock thickness', before); camRefresh(); } });
  };
  // the stock of a sketch-only part: how thick the material is under the sketch
  const panel0 = camPanel;
  camPanel = function () {
    let h = panel0.apply(this, arguments);
    const p = camPart();
    if (CAMUI.view === 'setup' && p && p.sketchOnly) {
      const field = `<div class="field"><span>Material thickness under the sketch (${uName()})</span><input type="number" id="skThk" step="any" min="0" value="${uval(SK.thickness())}"></div><p class="note">There is no 3D part: the sketches are the part. The stock is the sketch outline plus the margins below, this thick, with its top on the sketch plane.</p>`;
      h = h.replace('<div class="field"><span>Stock</span>', field + '<div class="field"><span>Stock</span>');
    }
    return h;
  };

  // ═══ Left sidebar: the parameters of the selected operation ═══
  const OPQ = { open: true };
  const seg = (k, items, cur) => `<div class="seg">${items.map(([v, l, t]) => `<button data-qset="${k}:${v}" class="${cur === v ? 'on' : ''}" ${t ? `title="${esc(t)}"` : ''}>${l}</button>`).join('')}</div>`;
  const len = (k, v, lab, ph) => `<label class="qf"><span>${lab} (${uName()})</span><input type="number" step="any" data-qn="${k}" data-qlen="1" value="${v == null || v === '' ? '' : uval(+v)}" ${ph != null ? `placeholder="${uval(ph)}"` : ''}></label>`;
  const rate = (k, v, lab, ph) => `<label class="qf"><span>${lab} (${uRate()})</span><input type="number" step="any" min="0" data-qn="${k}" data-qrate="1" value="${v > 0 ? uval(+v, 1) : ''}" placeholder="${uval(ph, 1)}"></label>`;
  const cnt = (k, v, lab, ph) => `<label class="qf"><span>${lab}</span><input type="number" step="1" min="0" data-qn="${k}" data-qint="1" value="${v > 0 ? Math.round(v) : ''}" placeholder="${Math.round(ph)}"></label>`;
  function opqHTML(op) {
    const C = cam(), t = toolOf(op.tool), isChain = op.type === 'chain', cm = op.cm || 'contour';
    const types = [['contour', 'Contour'], ['pocket', 'Pocket'], ['slot', 'Slot'], ['circle', 'Circle mill'], ['deburr', 'Deburr'], ['drill', 'Drill']];
    for (const [k, m] of Object.entries(typeof MC_CM !== 'undefined' ? MC_CM : {})) types.push([k, m.name]);
    let h = `<div class="opq-sec">Toolpath</div>`;
    if (isChain) h += `<label class="qf"><span>Type</span><select data-qs="cm">${types.map(([k, n]) => `<option value="${k}" ${cm === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
    h += `<label class="qf"><span>Tool</span><select data-qs="tool">${C.tools.map(x => `<option value="${x.n}" ${op.tool === x.n ? 'selected' : ''}>${esc(toolName(x))}</option>`).join('')}</select></label>`;
    if (isChain && cm === 'contour') {
      const comp = op.comp === 'control' || op.comp === 'wear' || op.comp === 'rwear' ? op.comp : 'computer';
      h += `<div class="opq-sec">Cutter compensation</div>
        <div class="qf"><span>Compensation</span>${seg('comp', [['computer', 'Computer', 'The path is already offset by the tool radius'], ['control', 'Control', 'G41 / G42 in the program; the control offsets it'], ['wear', 'Wear', 'Offset by the radius in the program, the control adds wear only'], ['rwear', 'Rev. wear', 'Wear, with the direction reversed']], comp)}</div>
        <div class="qf"><span>Comp side</span>${seg('side', [['auto', 'Auto', 'Finds the open side of the chain'], ['left', 'Left', 'Tool on the left of the arrow'], ['right', 'Right', 'Tool on the right of the arrow'], ['on', 'On', 'Tool center on the chain']], op.side || 'auto')}</div>
        ${comp !== 'computer' ? `<label class="qf"><span>Offset register (D)</span><input type="number" step="1" min="1" max="99" data-qn="compD" data-qint="1" value="${op.compD || t.n}"></label>` : ''}
        <div class="opq-sec">Depth</div>
        <div class="qf"><span>Cut down to</span>${seg('depthMode', [['auto', 'Auto'], ['chain', 'Chain'], ['through', 'Through'], ['below', 'Below']], op.depthMode || 'auto')}</div>
        <div class="qrow">${op.depthMode === 'below' ? len('depth', op.depth || 0, 'Depth below chain') : len('through', op.through == null ? 0.5 : op.through, 'Below bottom')}${len('stepdown', op.stepdown, 'Stepdown', C.stepdown || 1)}</div>
        <div class="qrow">${len('leave', op.leave || 0, 'Leave stock')}${len('leadR', op.leadR > 0 ? op.leadR : '', 'Lead radius', t.d * 0.5)}</div>
        <div class="qf"><span>Lead in / out</span>${seg('lead', [['arc', 'Arc'], ['none', 'None']], op.lead || 'arc')}</div>`;
    } else if (op.stepdown !== undefined || ['face', 'pocket', 'contour', 'waterline', 'clear'].includes(op.type) || (isChain && cm === 'pocket')) {
      h += `<div class="opq-sec">Cut</div><div class="qrow">${len('stepdown', op.stepdown, 'Stepdown')}${len('leave', op.leave || 0, 'Leave stock')}</div>`;
    }
    h += `<div class="opq-sec">Feeds &amp; speeds <small>blank = the tool's</small></div>
      <div class="qrow">${rate('feed', op.feed, 'Feed rate', t.feed)}${rate('plunge', op.plunge, 'Plunge', t.plunge)}</div>
      <div class="qrow">${cnt('rpm', op.rpm, 'Spindle (rpm)', t.rpm)}<div class="qf"><span>&nbsp;</span>${(op.feed > 0 || op.plunge > 0 || op.rpm > 0) ? '<button class="mini" data-qreset="1" title="Use the tool\'s own feed, plunge and spindle speed">Use tool\'s</button>' : '<small class="hint">From tool T' + t.n + '</small>'}</div></div>`;
    return `<li class="opq" data-opq="${op.id}"><div class="opq-in">${h}</div></li>`;
  }
  const tree0 = camTree;
  camTree = function () {
    const h = tree0.apply(this, arguments), op = CAMUI.view === 'op' ? opById(CAMUI.op) : null;
    if (!op || !OPQ.open) return h;
    const i = h.indexOf(`data-opm="${op.id}"`);
    if (i < 0) return h;
    const j = h.indexOf('</li>', i);
    return j < 0 ? h : h.slice(0, j + 5) + opqHTML(op) + h.slice(j + 5);
  };
  const bindTree0 = bindCamTree;
  bindCamTree = function (el) {
    bindTree0.apply(this, arguments);
    const q = el.querySelector('[data-opq]');
    if (!q) return;
    const op = opById(+q.dataset.opq);
    if (!op) return;
    q.querySelectorAll('[data-qset]').forEach(b => b.addEventListener('click', () => { const [k, v] = b.dataset.qset.split(':'); camEdit(op, k, v); }));
    q.querySelectorAll('[data-qs]').forEach(s => s.addEventListener('change', () => { const k = s.dataset.qs; camEdit(op, k, k === 'tool' ? +s.value : s.value); }));
    q.querySelectorAll('[data-qn]').forEach(i => {
      i.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') i.blur(); });
      i.addEventListener('change', () => {
        const k = i.dataset.qn, raw = i.value.trim();
        if (raw === '') { if (op[k] !== undefined) { const before = snap(); delete op[k]; record(`Edit ${op.name} ${k}`, before); camRefresh(); } return; }
        let v = parseFloat(raw);
        if (!isFinite(v)) return;
        if (i.dataset.qlen || i.dataset.qrate) v = fromU(v);
        if (i.dataset.qint) v = Math.round(v);
        camEdit(op, k, Math.max(k === 'compD' ? 1 : 0, k === 'compD' ? Math.min(99, v) : v));
      });
    });
    const r = q.querySelector('[data-qreset]');
    if (r) r.addEventListener('click', () => { const before = snap(); delete op.feed; delete op.plunge; delete op.rpm; record(`${op.name}: use the tool's feeds`, before); camRefresh(); });
  };
  SK.opq = { open: v => { OPQ.open = v !== false; camRefresh(); } };

  // ═══ Look ═══
  const css = document.createElement('style');
  css.textContent = `
.opq { list-style: none; margin: 2px 0 8px; padding: 0; }
.opq-in { display: flex; flex-direction: column; gap: 7px; padding: 8px 8px 10px; margin: 0 2px 0 14px; border-left: 2px solid var(--accent); background: var(--panel-2); border-radius: 0 8px 8px 0; animation: opqIn .18s var(--ease, ease) both; }
@keyframes opqIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
.opq-sec { font: 650 10px var(--font, Inter, system-ui, sans-serif); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin-top: 3px; }
.opq-sec small { text-transform: none; letter-spacing: 0; font-weight: 500; margin-left: 4px; }
.opq .qf { display: flex; flex-direction: column; gap: 3px; min-width: 0; font-size: 11px; color: var(--muted); }
.opq .qf > span { font-size: 11px; color: var(--muted); }
.opq .qrow { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.opq input, .opq select { width: 100%; box-sizing: border-box; padding: 4px 6px; border: 1px solid var(--rule); border-radius: 5px; background: var(--panel); color: var(--ink); font: 12px var(--mono, ui-monospace, monospace); transition: border-color .18s var(--ease, ease); }
.opq select { font-family: var(--font, Inter, system-ui, sans-serif); }
.opq input:focus, .opq select:focus { outline: 0; border-color: var(--accent); }
.opq .seg { display: flex; flex-wrap: wrap; }
.opq .seg button { flex: 1 1 auto; padding: 3px 6px; font-size: 11px; }
.opq .hint { color: var(--muted); font-size: 11px; padding-top: 4px; }
.opq .mini { align-self: flex-start; }
.sk-list li { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; align-items: center; }
.sk-list .mini[disabled] { opacity: .4; cursor: default; }
`;
  document.head.appendChild(css);
})();
