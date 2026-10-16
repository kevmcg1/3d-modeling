// ═══════════════════════════════════════════════════════════════════
//  More modeling tools (Design tab), the SolidWorks-style batch. Loads
//  after fusion-tools.js and uses its Inspect command. Coverage list:
//  docs/fusion-coverage.md
//
//    Create:   Bounding Box   Cavity
//    Pattern:  Sketch Driven Pattern
//    Inspect:  Draft Analysis · Wall Thickness · Undercut Analysis
// ═══════════════════════════════════════════════════════════════════
(() => {
  if (typeof FEATS === 'undefined' || !window.FUSION1) return;
  const INSP = window.FUSION1;
  const st = document.createElement('style');
  st.textContent = '.an-key{display:flex;align-items:center;gap:8px;font-size:12px;padding:3px 0}.an-key i{width:12px;height:12px;border-radius:3px;flex:none;box-shadow:inset 0 0 0 1px rgba(0,0,0,.25)}'
    + '.an-key b{margin-left:auto;font-weight:500;color:var(--muted);font-variant-numeric:tabular-nums}.an-bar{display:flex;height:8px;border-radius:4px;overflow:hidden;margin:4px 0 8px;background:var(--rule)}.an-bar span{display:block;height:100%}';
  document.head.appendChild(st);

  const rbAppend = (h, title, items) => {
    const key = `</div><div class="rb-title">${title}</div>`, i = h.indexOf(key);
    return i < 0 ? h : h.slice(0, i) + `<div class="rb-col">${items.map(it => rbBtn('data-act', it, 'sm')).join('')}</div>` + h.slice(i);
  };
  const num = (v, d = 2) => (isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 }) : '—');

  // ── Bounding Box: a box body that exactly encloses the picked bodies ──
  function evalBoundingBox(f, ctx, tol) {
    const src = bodiesById(f.bodies, ctx);
    if (!src.length) throw new Error('Pick the bodies to enclose');
    const pad = Math.max(0, +f.pad || 0), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const b of src) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], b.bb[k]); hi[k] = Math.max(hi[k], b.bb[k + 3]); }
    const w = hi[0] - lo[0] + 2 * pad, d = hi[1] - lo[1] + 2 * pad, h = hi[2] - lo[2] + 2 * pad;
    if (!(w > 1e-9 && d > 1e-9 && h > 1e-9)) throw new Error('The bodies have no volume to enclose');
    const pl = { o: [lo[0] - pad, lo[1] - pad, lo[2] - pad], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] };
    const box = prism({ outer: loopOf([P2(0, 0), P2(w, 0), P2(w, d), P2(0, d)], 1), holes: [] }, pl, 0, h, tol, f.id);
    ctx.bodies = [...ctx.bodies, mkBody(f.id, box)];
    ctx.hl[f.id] = [f.id];
  }
  FEATX.bbox = evalBoundingBox;
  FEATS.bbox = bodyTool({
    label: 'Bounding Box', home: 'bodies', need: 'Pick the bodies to enclose.',
    init: () => ({ bodies: [], pad: 0 }),
    panel: f => bodyPickPanel(f, 'bodies', 'Bodies') + pf.num('Extra room on every side', 'pad', { len: 1, min: 0 })
      + pf.note('A new box body, square to the X, Y and Z axes, that just encloses the picked bodies: stock size, packaging, a mold block or a clearance check. Hide or Combine it like any body.'),
    hint: () => 'click the bodies to enclose (the tree rows work too)',
    sub: f => (+f.pad ? '+ ' + fmtLs(f.pad) : ''),
  });

  // ── Cavity: the picked tool bodies are cut out of the target, optionally scaled (shrink allowance) ──
  function evalCavity(f, ctx) {
    const T = ctx.bodies.find(b => b.id === f.target);
    if (!T) throw new Error('Pick the body to cut the cavity in');
    const tools = bodiesById(f.tools, ctx).filter(b => b !== T);
    if (!tools.length) throw new Error('Pick the tool bodies that make the cavity');
    const k = (+f.pct) / 100;
    if (!(k > 0)) throw new Error('The scale has to be positive');
    let polys = T.polys;
    tools.forEach((t, j) => {
      const sc = Math.abs(k - 1) < 1e-9 ? t.polys : xformPolys(t.polys, XF.scale(bbCenter([t]), k), f.id + ':' + j, { feat: f.id });
      polys = CSG.subtract(polys, sc);
    });
    if (!polys.length) throw new Error('The tools remove the whole body');
    ctx.bodies = ctx.bodies.filter(b => b === T || f.keep !== false || !tools.includes(b)).map(b => b === T ? mkBody(T.id, polys) : b);
    ctx.hl[f.id] = [T.id];
  }
  FEATX.cavity = evalCavity;
  FEATS.cavity = {
    label: 'Cavity', home: 'target', before: true, need: 'Pick the body to cut into, then the tool bodies.',
    init: () => ({ target: null, tools: [], pct: 100, keep: true }),
    ready: f => f.target != null && f.tools.length > 0,
    start(c) { const s = sel3D; if (s && s.kind === 'face') { c.f.target = s.body; c.step = 'tools'; } },
    move: hoverBody,
    click() { const h = hover3D; if (h && h.kind === 'bbody') FEATS.cavity.bodyClick(h.body); },
    bodyClick(id) {
      const c = CMD, f = c.f;
      if (c.step === 'target') { f.target = id; f.tools = f.tools.filter(x => x !== id); c.step = 'tools'; }
      else if (id !== f.target) toggleIn(f.tools, id);
      featSync();
    },
    hl(add) { const f = CMD.f; if (f.target != null) add.body(f.target, selMat); for (const id of f.tools) add.body(id, hotMat); },
    panel: f => pf.pick('Body to cut into', f.target != null ? bodyNames()[f.target] || 'Body' : 'Click a body', '', 'target')
      + pf.pick('Tool bodies', f.tools.length ? f.tools.map(id => bodyNames()[id] || 'Body').join(', ') : 'Click bodies', f.tools.length || '', 'tools')
      + pf.num('Scale of the cavity (%)', 'pct', { step: 0.5, min: 1 }) + pf.chk('Keep the tool bodies', 'keep')
      + pf.note('The tools are pressed into the body and leave their shape behind: a mold cavity, a pocket for a part, a recess for a magnet. Scale above 100% leaves clearance around the tool; below 100% gives a snug fit. Scaling is about each tool’s center.'),
    hint: c => c.step === 'target' ? 'click the body to cut into' : 'click the tool bodies',
    sub: f => (+f.pct === 100 ? '' : f.pct + '%'),
  };

  // ── Sketch Driven Pattern: copies of the bodies at the circle centers (or corners) of a sketch ──
  // The body counts as sitting on the nearest point; every other point gets a copy.
  const skPoints = (sk, ctx) => {
    const pl = (ctx && ctx.planes[sk.id]) || planeOf(sk), circles = sk.ents.filter(e => e.type === 'circle');
    const pts2 = circles.map(e => e.c);
    if (!pts2.length) for (const e of sk.ents) for (const p of G.ends(e)) if (!pts2.some(q => dst2(p, q) < 1e-6)) pts2.push(p);
    return pts2.map(p => planeTo3(pl, p));
  };
  function evalSketchPattern(f, ctx) {
    const src = bodiesById(f.bodies, ctx), sk = f.sk != null && byId(f.sk);
    if (!src.length) throw new Error('Pick bodies to copy');
    if (!sk) throw new Error('Pick the sketch that holds the points');
    const pts = skPoints(sk, ctx);
    if (pts.length < 2) throw new Error('The sketch needs at least two circles (or corners)');
    const c0 = bbCenter(src);
    let seed = 0;
    pts.forEach((p, i) => { if (dist3(p, c0) < dist3(pts[seed], c0)) seed = i; });
    const made = [];
    let k = 0;
    pts.forEach((p, i) => {
      if (i === seed) return;
      const M = XF.trans(sub3(p, pts[seed]));
      k++;
      src.forEach((b, j) => {
        const id = f.id + (k * src.length + j) / 1000, polys = xformPolys(b.polys, M, f.id + ':' + k + ':' + j, { feat: f.id, inst: k });
        if (f.join) combineTool({ id, op: 'join' }, ctx, polys); else { ctx.bodies = [...ctx.bodies, mkBody(id, polys)]; made.push(id); }
      });
    });
    if (f.join) made.push(...src.map(b => b.id));
    ctx.hl[f.id] = made;
  }
  FEATX.skpat = evalSketchPattern;
  const skEntIds = id => { const sk = byId(id); return sk ? sk.ents.map(e => e.id) : []; };
  FEATS.skpat = bodyTool({
    label: 'Sketch Driven Pattern', home: 'bodies', need: 'Pick the bodies and a sketch of points.',
    init: () => ({ bodies: [], sk: null, join: false }),
    ready: f => f.bodies.length > 0 && f.sk != null,
    showSketch: (f, id) => { const sk = byId(id); return !!sk && (sk.vis !== false || f.sk === id || CMD.step === 'sk'); },
    move(x, y) { if (CMD.step === 'sk') hoverSkEnt(x, y); else hoverBody(x, y); },
    click() {
      const c = CMD, h = hover3D;
      if (c.step === 'sk') { if (h && h.kind === 'skent') { c.f.sk = h.sketch; if (!c.f.bodies.length) c.step = 'bodies'; featSync(); } return; }
      if (h && h.kind === 'bbody') { toggleIn(c.f.bodies, h.body); if (c.f.sk == null) c.step = 'sk'; featSync(); }
    },
    bodyClick(id) { if (CMD.step === 'sk') return; toggleIn(CMD.f.bodies, id); if (CMD.f.sk == null) CMD.step = 'sk'; featSync(); },
    draw() { const f = CMD.f; if (f.sk != null) strokeSkEnts(f.sk, skEntIds(f.sk), COL.accent, 3); },
    panel: f => pf.pick('Bodies', f.bodies.length ? f.bodies.map(id => bodyNames()[id] || 'Body').join(', ') : 'Click bodies', f.bodies.length || '', 'bodies')
      + pf.pick('Sketch', f.sk != null ? (byId(f.sk) || {}).name || 'Sketch' : 'Click any curve of the sketch', f.sk != null && byId(f.sk) ? skPoints(byId(f.sk), MODEL).length + ' points' : '', 'sk')
      + pf.chk('Join copies to the originals', 'join')
      + pf.note('A copy goes to the center of every circle in the sketch, or to every corner when there are no circles. The picked bodies count as sitting on the point nearest to them, so the others get the copies.'),
    hint: c => c.step === 'sk' ? 'click a curve of the sketch that marks the points' : 'click the bodies to copy',
    sub: f => { const sk = f.sk != null && byId(f.sk); return sk ? '× ' + skPoints(sk, MODEL).length : ''; },
  });
  const featDeps2 = featDeps;
  featDeps = function (f, ids) { featDeps2.apply(this, arguments); if (f.type === 'skpat' && f.sk != null) ids.add(f.sk); };

  Object.assign(FEAT_BASE, { bbox: 'Bounding Box', cavity: 'Cavity', skpat: 'Sketch Pattern' });
  Object.assign(FEAT_IC, { bbox: 'bbox', cavity: 'cavity', skpat: 'skpat' });

  // ── Inspect: Draft Analysis and Wall Thickness ──────────────────────
  const AX = { X: [1, 0, 0], Y: [0, 0, -1], Z: [0, 1, 0] };          // the pull axis as the user names it (X right, Y back, Z up) in kernel coordinates
  const COLS = { pos: [0.18, 0.66, 0.31], neg: [0.9, 0.28, 0.3], need: [0.96, 0.7, 0.05], thin: [0.9, 0.28, 0.3], ok: [0.18, 0.66, 0.31] };
  const HEX = { pos: '#2fa84f', neg: '#e5484d', need: '#f5b30d', thin: '#e5484d', ok: '#2fa84f' };
  const polyArea = p => { let a = 0; for (let q = 1; q + 1 < p.v.length; q++) a += len3(crs3(sub3(p.v[q], p.v[0]), sub3(p.v[q + 1], p.v[0]))) / 2; return a; };
  const DR = { ax: 'Z', angle: 3, flip: false, both: false, res: null };
  const TH = { min: 2, res: null, paintKey: null };
  const UC = { ax: 'Z', res: null };

  function paintGrp(items) {                                           // items: [{p, c:[r,g,b]}]
    INSP.clearGrp();
    if (!items.length) return;
    const pos = [], col = [], bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const it of items) for (const v of it.p.v) for (let k = 0; k < 3; k++) { bb[k] = Math.min(bb[k], v[k]); bb[k + 3] = Math.max(bb[k + 3], v[k]); }
    const eps = 0.0008 * Math.hypot(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]) + 0.005;
    for (const { p, c } of items) {
      const o = mul3(p.n, eps), V = p.v.map(v => add3(v, o));
      for (let q = 1; q + 1 < V.length; q++) { pos.push(...V[0], ...V[q], ...V[q + 1]); col.push(...c, ...c, ...c); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.renderOrder = 19; INSP.grp.add(m);
  }

  // faces by draft: the angle between a face and the pull direction, 0° being a wall parallel to the pull
  function classifyDraft(a) {
    const d = mul3(AX[a.ax], a.flip ? -1 : 1), s = Math.sin(a.angle * Math.PI / 180), items = [], area = { pos: 0, neg: 0, need: 0 }, rows = [], names = bodyNames();
    for (const b of visibleBodies()) {
      const r = { name: names[b.id] || 'Body', pos: 0, neg: 0, need: 0 };
      for (const p of INSP.bodyPolys(b)) {
        const x = dot3(p.n, d), A = polyArea(p);
        const k = a.both ? (Math.abs(x) >= s - 1e-9 ? 'pos' : 'need') : x >= s - 1e-9 ? 'pos' : x <= -s + 1e-9 ? 'neg' : 'need';
        area[k] += A; r[k] += A; items.push({ p, c: COLS[k], k });
      }
      rows.push(r);
    }
    return { ...area, total: area.pos + area.neg + area.need, items, rows, model: MODEL, key: JSON.stringify([a.ax, a.angle, a.flip, a.both]) };
  }
  INSP.classifyDraft = classifyDraft;

  // wall thickness: from the middle of each face, a ray runs into the body until it leaves through the far side
  function rayThickness(maxRays = 2500) {
    const items = [], names = bodyNames(), rows = [];
    for (const b of visibleBodies()) {
      const polys = INSP.bodyPolys(b), tris = [];
      polys.forEach(p => { for (let q = 1; q + 1 < p.v.length; q++) tris.push({ a: p.v[0], e1: sub3(p.v[q], p.v[0]), e2: sub3(p.v[q + 1], p.v[0]), n: p.n }); });
      const step = Math.max(1, Math.ceil(polys.length / maxRays));
      let min = Infinity;
      for (let i = 0; i < polys.length; i += step) {
        const p = polys[i], c = mul3(p.v.reduce((s, v) => add3(s, v), [0, 0, 0]), 1 / p.v.length), dir = mul3(p.n, -1), o = add3(c, mul3(dir, 1e-4));
        let best = Infinity;
        for (const t of tris) {
          if (dot3(t.n, dir) <= 1e-9) continue;                        // only surfaces the ray passes out through
          const h = crs3(dir, t.e2), det = dot3(t.e1, h);
          if (Math.abs(det) < 1e-12) continue;
          const inv = 1 / det, s = sub3(o, t.a), u = dot3(s, h) * inv;
          if (u < -1e-9 || u > 1 + 1e-9) continue;
          const qv = crs3(s, t.e1), v = dot3(dir, qv) * inv;
          if (v < -1e-9 || u + v > 1 + 1e-9) continue;
          const d = dot3(t.e2, qv) * inv;
          if (d > 1e-6 && d < best) best = d;
        }
        if (best < Infinity) { best += 1e-4; items.push({ p, th: best }); if (best < min) min = best; }
      }
      rows.push({ name: names[b.id] || 'Body', min, sampled: Math.ceil(polys.length / step), faces: polys.length });
    }
    return { items, rows, min: items.length ? Math.min(...items.map(i => i.th)) : null, model: MODEL };
  }
  INSP.rayThickness = rayThickness;

  // undercuts: a face that can be seen from neither end of the pull line cannot be formed by a two-part mold
  function classifyUndercut(a) {
    const d = AX[a.ax], items = [], area = { ok: 0, under: 0 };
    for (const b of visibleBodies()) {
      const polys = INSP.bodyPolys(b), tris = [];
      polys.forEach(p => { for (let q = 1; q + 1 < p.v.length; q++) tris.push({ a: p.v[0], e1: sub3(p.v[q], p.v[0]), e2: sub3(p.v[q + 1], p.v[0]), p }); });
      const blocked = (o, dir, self) => {
        for (const t of tris) {
          if (t.p === self) continue;
          const h = crs3(dir, t.e2), det = dot3(t.e1, h);
          if (Math.abs(det) < 1e-12) continue;
          const inv = 1 / det, s0 = sub3(o, t.a), u = dot3(s0, h) * inv;
          if (u < -1e-9 || u > 1 + 1e-9) continue;
          const qv = crs3(s0, t.e1), v = dot3(dir, qv) * inv;
          if (v < -1e-9 || u + v > 1 + 1e-9) continue;
          if (dot3(t.e2, qv) * inv > 1e-6) return true;
        }
        return false;
      };
      for (const p of polys) {
        const c = mul3(p.v.reduce((s, v) => add3(s, v), [0, 0, 0]), 1 / p.v.length), o = add3(c, mul3(p.n, 1e-3)), A = polyArea(p);
        const k = blocked(o, d, p) && blocked(o, mul3(d, -1), p) ? 'under' : 'ok';
        area[k] += A; items.push({ p, c: k === 'under' ? COLS.neg : COLS.pos, k });
      }
    }
    return { ...area, total: area.ok + area.under, items, model: MODEL, key: a.ax };
  }
  INSP.classifyUndercut = classifyUndercut;
  function undercutData() {
    if (!(UC.res && UC.res.model === MODEL && UC.res.key === UC.ax)) { UC.res = classifyUndercut(UC); paintGrp(UC.res.items); }
    return UC.res;
  }
  INSP.titleOf.under = 'Undercut Analysis'; INSP.tagOf.under = 'mold release';
  INSP.open.under = () => { UC.res = null; };
  INSP.body.under = () => {
    const R = undercutData();
    if (!R.items.length) return '<p class="note">There are no visible bodies to analyze.</p>';
    return `<div class="field"><span>Pull direction</span><div class="seg">${[['X', 'X'], ['Y', 'Y'], ['Z', 'Z (up)']].map(([v, l]) => `<button data-an-set="ax" data-v="${v}" class="${UC.ax === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>`
      + `<div class="an-bar">${['ok', 'under'].map(k => `<span style="width:${100 * R[k] / (R.total || 1)}%;background:${k === 'ok' ? HEX.pos : HEX.neg}"></span>`).join('')}</div>`
      + `<div class="an-key"><i style="background:${HEX.pos}"></i>Can be formed<b>${num(R.total ? 100 * R.ok / R.total : 0, 1)}%</b></div><div class="an-key"><i style="background:${HEX.neg}"></i>Undercut<b>${num(R.total ? 100 * R.under / R.total : 0, 1)}%</b></div>`
      + '<p class="note">A face is an undercut when something blocks the view of it from both ends of the pull line, so a two-part mold cannot form it. Red faces need a side action, a split, or a change of shape. Nothing in the model changes.</p>';
  };
  INSP.bind.under = pn => pn.querySelectorAll('[data-an-set]').forEach(b => b.addEventListener('click', () => { UC[b.dataset.anSet] = b.dataset.v; refreshPanel(); requestDraw(); }));
  INSP.hint.under = k => `<b>Undercut Analysis:</b> red faces cannot be seen from either end of the pull line. ${k('Esc')} closes.`;

  const unitIn = () => (isIn() ? 'in' : 'mm');
  const keyRow = (k, label, a, tot) => `<div class="an-key"><i style="background:${HEX[k]}"></i>${label}<b>${num(tot ? 100 * a / tot : 0, 1)}% · ${isIn() ? num(a / 645.16, 2) + ' in²' : num(a / 100, 2) + ' cm²'}</b></div>`;
  function draftData() {
    const key = JSON.stringify([DR.ax, DR.angle, DR.flip, DR.both]);
    if (!(DR.res && DR.res.model === MODEL && DR.res.key === key)) { DR.res = classifyDraft(DR); paintGrp(DR.res.items); }
    return DR.res;
  }
  function thickData() {
    if (!(TH.res && TH.res.model === MODEL)) { TH.res = rayThickness(); TH.paintKey = null; }
    if (TH.paintKey !== TH.min) { paintGrp(TH.res.items.map(i => ({ p: i.p, c: i.th < TH.min ? COLS.thin : COLS.ok }))); TH.paintKey = TH.min; }
    return TH.res;
  }
  INSP.titleOf.draft = 'Draft Analysis'; INSP.tagOf.draft = 'mold pull';
  INSP.titleOf.thick = 'Wall Thickness'; INSP.tagOf.thick = 'thin walls';
  INSP.open.draft = () => { DR.res = null; };
  INSP.open.thick = () => { TH.res = null; };
  INSP.body.draft = () => {
    const R = draftData();
    if (!R.items.length) return '<p class="note">There are no visible bodies to analyze.</p>';
    const seg = (key, opts) => `<div class="seg">${opts.map(([v, l]) => `<button data-an-set="${key}" data-v="${v}" class="${String(DR[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    return `<div class="field"><span>Pull direction</span>${seg('ax', [['X', 'X'], ['Y', 'Y'], ['Z', 'Z (up)']])}</div>`
      + `<label class="chk"><input type="checkbox" data-an-chk="flip" ${DR.flip ? 'checked' : ''}> Pull the other way</label>`
      + `<label class="chk"><input type="checkbox" data-an-chk="both" ${DR.both ? 'checked' : ''}> Two-part mold (pulled both ways)</label>`
      + `<label class="field"><span>Required draft (°)</span><input type="number" data-an-num="angle" min="0" max="45" step="0.5" value="${DR.angle}"></label>`
      + `<div class="an-bar">${['pos', 'neg', 'need'].map(k => `<span style="width:${100 * R[k] / (R.total || 1)}%;background:${HEX[k]}"></span>`).join('')}</div>`
      + keyRow('pos', 'Positive draft', R.pos, R.total) + (DR.both ? '' : keyRow('neg', 'Negative draft (undercut)', R.neg, R.total)) + keyRow('need', 'Needs draft', R.need, R.total)
      + '<p class="note">Faces turn green where they lean away from the pull enough to release, yellow where they are closer to parallel than the required draft, and red where they face against the pull. Add draft with the Draft tool until the yellow is gone. Nothing in the model changes.</p>';
  };
  INSP.bind.draft = pn => {
    pn.querySelectorAll('[data-an-set]').forEach(b => b.addEventListener('click', () => { DR[b.dataset.anSet] = b.dataset.v; refreshPanel(); requestDraw(); }));
    pn.querySelectorAll('[data-an-chk]').forEach(c => c.addEventListener('change', () => { DR[c.dataset.anChk] = c.checked; refreshPanel(); requestDraw(); }));
    pn.querySelectorAll('[data-an-num="angle"]').forEach(i => i.addEventListener('change', () => { const v = parseFloat(i.value); if (isFinite(v)) DR.angle = clamp(v, 0, 45); refreshPanel(); requestDraw(); }));
  };
  INSP.hint.draft = k => `<b>Draft Analysis:</b> green faces release from the mold, yellow need more draft, red are undercuts. ${k('Esc')} closes.`;
  INSP.body.thick = () => {
    const R = thickData();
    if (!R.items.length) return '<p class="note">There are no visible solid bodies to measure.</p>';
    const thin = R.items.filter(i => i.th < TH.min), area = thin.reduce((s, i) => s + polyArea(i.p), 0), all = R.items.reduce((s, i) => s + polyArea(i.p), 0);
    const th = v => (v == null ? '—' : `${num(toU(v), isIn() ? 4 : 3)} ${unitIn()}`);
    return `<div class="measure-big"><span>${num(toU(R.min), isIn() ? 4 : 3)}</span> ${unitIn()}</div><p class="note" style="margin-top:-6px">Thinnest wall found</p>`
      + `<label class="field"><span>Flag walls thinner than (${unitIn()})</span><input type="number" data-an-num="min" min="0" step="${isIn() ? 0.01 : 0.5}" value="${uval(TH.min)}"></label>`
      + keyRow('thin', 'Thinner than that', area, all) + keyRow('ok', 'Thick enough', all - area, all)
      + (R.rows.length > 1 ? `<div class="divider"></div><table class="insp-tbl"><tr><th>Body</th><th>Thinnest</th></tr>${R.rows.map(r => `<tr><td>${r.name}</td><td>${th(r.min < Infinity ? r.min : null)}</td></tr>`).join('')}</table>` : '')
      + `<p class="note">From the middle of each face a ray runs straight into the body until it leaves through the far side; that distance is the wall there. Faces under the limit show in red.${R.rows.some(r => r.sampled < r.faces) ? ' Very detailed bodies are sampled.' : ''} Nothing in the model changes.</p>`;
  };
  INSP.bind.thick = pn => {
    pn.querySelectorAll('[data-an-num="min"]').forEach(i => i.addEventListener('change', () => { const v = parseFloat(i.value); if (isFinite(v) && v >= 0) TH.min = fromU(v); refreshPanel(); requestDraw(); }));
  };
  INSP.hint.thick = k => `<b>Wall Thickness:</b> red faces are thinner than your limit. Type a new limit in the panel. ${k('Esc')} closes.`;
  INSP.stale = kind => { if (kind === 'draft') DR.res = null; if (kind === 'thick') TH.res = null; if (kind === 'under') UC.res = null; };
  window.MORE_TOOLS = { DR, TH, UC, skPoints };                         // handle for the tests

  // ── Toolbar, icons, help ───────────────────────────────────────────
  Object.assign(IC, {
    bbox: '<rect x="3" y="4" width="14" height="12" rx="1" stroke-dasharray="2.4 1.6"/><rect x="6.5" y="7.5" width="7" height="5" rx=".6" opacity=".7"/>',
    cavity: '<rect x="2.5" y="3.5" width="15" height="13" rx="1.2" opacity=".6"/><path d="M6.5 8.5h7v7h-7z"/><path d="M6.5 8.5l2-2h7M13.5 8.5l2-2" opacity=".7"/>',
    skpat: '<circle cx="5" cy="5" r="1.7"/><circle cx="14" cy="5" r="1.7"/><circle cx="5" cy="14" r="1.7"/><circle cx="14" cy="14" r="1.7" opacity=".5"/><path d="M8 5h3M5 8v3M8 14h3" opacity=".5" stroke-dasharray="1.5 1.5"/>',
    draft: '<path d="M4 17V8l6-5 6 5v9z" opacity=".5"/><path d="M4 17h12"/><path d="M10 3v14" stroke-dasharray="2 1.6"/><path d="M10 3l6 5"/>',
    under: '<path d="M4 4h12v4H9v4h7v4H4z" opacity=".7"/><path d="M13 10h5" stroke-dasharray="2 1.5"/>',
    thick: '<path d="M3 5h14v10H3z" opacity=".5"/><path d="M3 9h14v2H3z"/><path d="M10 5v4M10 11v4" opacity=".7"/>',
  });
  Object.assign(FA_MAP, { bbox: 'border-all', cavity: 'cubes', skpat: 'grip', draft: 'arrows-up-to-line', thick: 'ruler-vertical', under: 'magnifying-glass-minus' });
  Object.assign(MENU_IC, { 'f:bbox': 'bbox', 'f:cavity': 'cavity', 'f:skpat': 'skpat', 'i:draft': 'draft', 'i:thick': 'thick', 'i:under': 'under' });
  TB_MENUS.create.push(['f:bbox', 'Bounding Box', ''], ['f:cavity', 'Cavity', '']);
  TB_MENUS.pattern.push(['f:skpat', 'Sketch Driven Pattern', '']);
  TB_MENUS.construct.push(['i:draft', 'Draft Analysis', ''], ['i:thick', 'Wall Thickness', ''], ['i:under', 'Undercut Analysis', '']);

  const ins = k => CMD && CMD.type === 'inspect' && CMD.kind === k;
  const modelToolbar2 = modelToolbarHTML;
  modelToolbarHTML = function () {
    let h = modelToolbar2.apply(this, arguments);
    h = rbAppend(h, 'Create', [['f:bbox', 'Bounding Box', '', 'bbox', cmdIs('bbox')], ['f:cavity', 'Cavity', '', 'cavity', cmdIs('cavity')]]);
    h = rbAppend(h, 'Pattern', [['f:skpat', 'Sketch Driven', '', 'skpat', cmdIs('skpat')]]);
    return rbAppend(h, 'Inspect', [['i:draft', 'Draft Analysis', '', 'draft', ins('draft')], ['i:thick', 'Wall Thickness', '', 'thick', ins('thick')], ['i:under', 'Undercut', '', 'under', ins('under')]]);
  };

  Object.assign(TIP_TXT, {
    'f:bbox': ['A box body that just encloses the bodies you pick.', ['Click the bodies to enclose.', 'Add extra room if you want some.', 'OK. Use it for stock size, packaging or a mold block.']],
    'f:cavity': ['Press a body into another and leave its shape behind, like a mold cavity.', ['Click the body to cut into.', 'Click the tool bodies.', 'Scale the cavity for clearance or shrink, then OK.']],
    'f:skpat': ['Copy bodies to every circle center (or corner) of a sketch.', ['Click the bodies to copy.', 'Click any curve of the sketch that marks the points.', 'OK. The body sitting on the nearest point is the original.']],
    'i:draft': ['See which faces will release from a mold and which need draft.', ['Pick the pull direction.', 'Set the draft the part needs.', 'Green releases, yellow needs draft, red is an undercut.']],
    'i:under': ['Find faces a two-part mold cannot form.', ['Click it.', 'Pick the pull direction.', 'Red faces are hidden from both ends: they are undercuts.']],
    'i:thick': ['Find walls that are too thin to mold, print or machine.', ['Click it.', 'Type the thinnest wall you allow.', 'Red faces are thinner than that.']],
  });
  const gi = GD.inspect;
  if (gi) {
    GD.inspect = [gi[0], () => {
      const k = CMD && CMD.kind;
      if (k === 'draft') return [gS('Pick the pull direction', 'The way the two halves of the mold part.', () => true), gS('Set the required draft', 'Faces closer to parallel than this need draft.', () => true), gS('Read the colors', 'Green releases, yellow needs draft, red is an undercut. Esc to close.', null, true)];
      if (k === 'under') return [gS('Pick the pull direction', 'The line the two mold halves move along.', () => true), gS('Look for red faces', 'They are hidden from both ends. Esc to close.', null, true)];
      if (k === 'thick') return [gS('Type the thinnest wall allowed', 'Walls under it turn red.', () => true), gS('Look for red faces', 'Thicken them or change the design. Esc to close.', null, true)];
      return gi[1]();
    }];
  }

  // little pictures for the hover cards
  if (typeof TipArt !== 'undefined' && typeof TIP_ART !== 'undefined') {
    const { C, at, P, poly, line, box, dot } = TipArt;
    const iso = (f, ox = 60, oy = 48, s = 1.55) => () => { at(ox, oy, s); return f(); };
    const wire = (x, y, z, w, d, h) => {
      const c = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([i, j]) => [P(x + i * w, y + j * d, z), P(x + i * w, y + j * d, z + h)]), dash = 'stroke-dasharray="3 2"';
      return [0, 1].map(k => line(c.map(q => q[k]).concat([c[0][k]]), C.warn, 1.4, dash)).join('') + c.map(q => line(q, C.warn, 1.4, dash)).join('');
    };
    Object.assign(TIP_ART, {
      'f:bbox': [iso(() => box(-8, -6, 0, 16, 12, 12, 'a'), 60, 54, 1.5), iso(() => box(-8, -6, 0, 16, 12, 12, 'a') + wire(-14, -10, -3, 28, 20, 18), 60, 54, 1.5)],
      'f:cavity': [iso(() => box(-20, -12, 0, 40, 24, 16) + box(-6, -5, 20, 12, 10, 8, 'a'), 60, 56, 1.3), iso(() => box(-20, -12, 0, 40, 24, 16) + box(-6, -5, 12, 12, 10, 8, 'a') + dot(P(0, 0, 16), C.warn, 3), 60, 56, 1.3)],
      'f:skpat': [iso(() => box(-24, -8, 0, 8, 8, 8, 'a') + dot(P(0, 6, 0), C.warn, 2.5) + dot(P(20, -4, 0), C.warn, 2.5), 60, 54, 1.4), iso(() => box(-24, -8, 0, 8, 8, 8, 'a') + box(-4, 2, 0, 8, 8, 8, 'a') + box(16, -8, 0, 8, 8, 8, 'a'), 60, 54, 1.4)],
      'i:draft': [iso(() => box(-14, -10, 0, 28, 20, 16), 60, 54, 1.4), iso(() => box(-14, -10, 0, 28, 20, 16) + poly([P(-14, -10, 16), P(14, -10, 16), P(14, 10, 16), P(-14, 10, 16)], 'rgba(47,168,79,.55)', C.sk, 1.2), 60, 54, 1.4)],
      'i:under': [iso(() => box(-14, -10, 0, 28, 20, 6) + box(-14, -10, 6, 8, 20, 10) + box(-4, -10, 12, 18, 20, 4), 60, 54, 1.4), iso(() => box(-14, -10, 0, 28, 20, 6) + box(-14, -10, 6, 8, 20, 10) + box(-4, -10, 12, 18, 20, 4) + poly([P(-4, -10, 12), P(14, -10, 12), P(14, 10, 12), P(-4, 10, 12)], 'rgba(229,72,77,.6)', C.sk, 1.2), 60, 54, 1.4)],
      'i:thick': [iso(() => box(-16, -10, 0, 32, 20, 12), 60, 54, 1.4), iso(() => box(-16, -10, 0, 32, 20, 12) + poly([P(-16, -10, 12), P(16, -10, 12), P(16, -6, 12), P(-16, -6, 12)], 'rgba(229,72,77,.6)', C.sk, 1.2), 60, 54, 1.4)],
    });
  }

  // animated action scenes for the hover cards
  const A = window.TipAnim;
  if (A && A.scene) {
    const S = A.scene, { lerp } = A.util;
    const R = (w, d) => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
    const bigView = (g, oy = 128, s = 3) => g.view(120, oy, s);
    const label = (g, p, s, c = 'r') => { const q = g.P(...p); g.text(q[0], q[1], s, c, 9); };
    S('f:bbox', g => {
      bigView(g, 136, 3); g.cyl(-5, 2, 0, 5, 12, 'a'); g.box(2, -6, 0, 9, 7, 5, 'a');
      const k = g.seg(0.3, 0.8), lo = [-10, -8, 0], hi = [13, 10, 12], m = lo.map((v, i) => lerp((v + hi[i]) / 2, v, k)), n = hi.map((v, i) => lerp((v + lo[i]) / 2, v, k));
      if (k > 0.02) g.box(m[0], m[1], m[2], n[0] - m[0], n[1] - m[1], n[2] - m[2], 'm');
      g.cursorAt(hi, 0); if (k > 0.9) g.chip('Encloses both', 'a');
    });
    S('f:cavity', g => {
      bigView(g, 134, 3); const p = g.seg(0.2, 0.6), k = g.seg(0.6, 0.85), z = lerp(26, 9, p);
      g.box(-16, -11, 0, 32, 22, 12, 'n');
      if (k < 0.1) g.box(-5, -5, z, 10, 10, 8, 'a'); else g.prism(R(10, 10), 12 - 8 * k, 12, 'm');
      if (p < 1) g.arrow([0, 0, z + 12], [0, 0, z + 4], 'r', 1.5); g.cursorAt([0, 0, z + 9], 0);
      if (k > 0.6) label(g, [0, 0, 24], 'Cavity');
    });
    S('f:skpat', g => {
      bigView(g, 138, 2.8); g.box(-24, -14, -2, 48, 28, 2, 'n'); const pts = [[-14, -6], [2, 8], [16, -4]], k = g.seg(0.25, 0.8);
      pts.forEach((p, i) => { g.ring(p[0], p[1], 0, 2.2, 'k', 1.2); const h = i === 0 ? 6 : 6 * Math.min(1, Math.max(0, (k - (i - 1) / 2) * 2)); if (h > 0.05) g.box(p[0] - 3, p[1] - 3, 0, 6, 6, h, 'a'); });
      g.cursorAt([...pts[Math.min(2, Math.floor(k * 3))], 6], 0);
    });
    S('i:draft', g => {
      bigView(g, 134, 3); const k = g.seg(0.3, 0.8);
      g.prism(R(24, 18), 0, 14, 'n'); g.fill([[-12, -9, 14], [12, -9, 14], [12, 9, 14], [-12, 9, 14]], 'g', { a: 0.55 * k, stroke: 'g', w: 1.4 });
      g.fill([[12, -9, 0], [12, 9, 0], [12, 9, 14], [12, -9, 14]], 'y', { a: 0.55 * k, stroke: 'y', w: 1.4 });
      g.arrow([0, 0, 18], [0, 0, 26], 'r', 1.5); if (k > 0.6) label(g, [14, 0, 7], 'needs draft', 'a');
    });
    S('i:under', g => {
      bigView(g, 134, 3); const k = g.seg(0.3, 0.8);
      g.box(-14, -9, 0, 28, 18, 5, 'n'); g.box(-14, -9, 5, 7, 18, 11, 'n'); g.box(-7, -9, 11, 21, 18, 5, 'n');
      g.fill([[-7, -9, 11], [14, -9, 11], [14, 9, 11], [-7, 9, 11]], 'r', { a: 0.6 * k, stroke: 'r', w: 1.4 }); if (k > 0.5) g.chip('Undercut', 'r');
    });
    S('i:thick', g => {
      bigView(g, 134, 3); const k = g.seg(0.25, 0.75);
      g.prism(R(30, 20), 0, 12, 'n', { holes: [{ pts: R(24, 14), depth: 9 }] });
      g.fill([[-15, -10, 12], [15, -10, 12], [15, -7, 12], [-15, -7, 12]], 'r', { a: 0.6 * k, stroke: 'r', w: 1.4 });
      if (k > 0.5) g.chip('Wall 1.5 mm', 'r');
    });
  }

  refreshUI();                                                    // the ribbon was drawn before this file ran
})();
