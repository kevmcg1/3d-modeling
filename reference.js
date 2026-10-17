// ═══════════════════════════════════════════════════════════════════
//  Reference geometry and model checks: Plane Along Path, Point Through
//  Three Planes, Separate (split a body into its pieces) and Check (is
//  each body a sound closed solid?). The kernel half is in 3d-modeler.html
//  next to the other kernel scripts. Coverage list: docs/fusion-coverage.md
// ═══════════════════════════════════════════════════════════════════
(() => {
  if (typeof FEATS === 'undefined' || !window.FUSION1 || typeof bodyTool === 'undefined') return;
  const INSP = window.FUSION1;
  const rbAppend = (h, title, items) => {
    const key = `</div><div class="rb-title">${title}</div>`, i = h.indexOf(key);
    return i < 0 ? h : h.slice(0, i) + `<div class="rb-col">${items.map(it => rbBtn('data-act', it, 'sm')).join('')}</div>` + h.slice(i);
  };
  const num = (v, d = 2) => (isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 }) : '—');
  Object.assign(FEAT_BASE, { planepath: 'Path Plane', pt3pl: '3-Plane Point', separate: 'Separate' });
  Object.assign(FEAT_IC, { planepath: 'planepath', pt3pl: 'pt3pl', separate: 'separate' });
  const planeName = r => (r ? (r.k === 'origin' ? PLANE_NAME[r.w] + ' plane' : refLabel(r) + (r.k === 'face' ? ' (flat face)' : '')) : '');
  const hlFace = (add, ref) => { if (ref && ref.k === 'face') { const r = findFace(beforeBodies(), ref.f); if (r) add.face(r.mesh, r.fid, selMat); } };

  const featDeps0 = featDeps;
  featDeps = function (f, ids, fromMeta) {
    featDeps0.apply(this, arguments);
    if (f.type === 'plane' && f.cp === 'planepath' && f.path) ids.add(f.path.sketch);
    if (f.type === 'point' && f.cp === 'pt3pl') for (const r of [f.p1, f.p2, f.p3]) {
      if (!r) continue;
      if (r.k === 'feat' && r.feat) ids.add(r.feat);
      if (r.k === 'face' && r.f) fromMeta(r.f.m);
    }
  };
  const featSub0 = featSub;
  featSub = f => (f.type === 'plane' && f.cp === 'planepath' ? `${+(+f.pos).toFixed(1)}%` : f.type === 'point' && f.cp === 'pt3pl' ? '3 planes' : featSub0(f));

  // ── Plane Along Path ──
  FEATS.planepath = {
    label: 'Plane Along Path', home: 'path', need: 'Click a curve in a sketch for the path.',
    init: () => ({ type: 'plane', cp: 'planepath', path: null, pos: 50, rev: false, off: 0, vis: true }),
    base: () => 'planepath',
    ready: f => !!f.path,
    showSketch: (f, id) => { const sk = byId(id); return !!sk && (sk.vis !== false || (f.path && f.path.sketch === id) || CMD.step === 'path'); },
    start() { CMD.step = 'path'; },
    move(x, y) {
      const e = hoverSkEnt(x, y);
      CMD.pathPrev = e ? { sketch: e.sketch, ents: curveChain(byId(e.sketch), byId(e.sketch).ents.find(q => q.id === e.ent)).map(q => q.id) } : null; requestDraw();
    },
    click() {
      const h = hover3D; if (!h || h.kind !== 'skent') return;
      const sk = byId(h.sketch); CMD.f.path = { sketch: sk.id, ents: curveChain(sk, sk.ents.find(q => q.id === h.ent)).map(e => e.id) }; CMD.pathPrev = null; featSync();
    },
    draw() { const p = CMD.f.path; if (p) strokeSkEnts(p.sketch, p.ents, COL.accent, 3.2); if (CMD.pathPrev) strokeSkEnts(CMD.pathPrev.sketch, CMD.pathPrev.ents, COL['face-hot'], 2.6); },
    panel: f => pf.pick('Path', f.path ? (byId(f.path.sketch) || {}).name + ' · ' + f.path.ents.length + ' curve' + (f.path.ents.length > 1 ? 's' : '') : 'Click a curve in a sketch', f.path ? '✓' : '', 'path')
      + `<div class="field"><span>Position along the path (%)</span><input type="range" min="0" max="100" step="1" data-fv="pos" data-live="1" value="${+f.pos}"></div>`
      + pf.num('Position (%)', 'pos', { step: 5, min: 0 }) + pf.chk('Measure from the other end', 'rev') + pf.num('Offset', 'off', { len: 1, step: isIn() ? 0.05 : 1 })
      + pf.note('A plane square to the path at the chosen spot, ready to sketch on. 0 is the start of the path, 100 its end.'),
    hint: () => 'click the sketch curve that is the path',
    hideSketch: undefined,
    sub: f => `${+(+f.pos).toFixed(1)}%`,
  };

  // ── Point Through Three Planes ──
  FEATS.pt3pl = {
    label: 'Point Through Three Planes', home: 'p1', before: true, need: 'Pick three planes or flat faces.',
    init: () => ({ type: 'point', cp: 'pt3pl', p1: null, p2: null, p3: null, vis: true }),
    base: () => 'pt3pl',
    ready: f => !!(f.p1 && f.p2 && f.p3),
    move(x, y) { hoverPlaneRef(x, y); },
    click() {
      const c = CMD, f = c.f, p = planeRefFromHover(hover3D); if (!p) return;
      f[c.step === 'p3' ? 'p3' : c.step === 'p2' ? 'p2' : 'p1'] = p;
      c.step = !f.p1 ? 'p1' : !f.p2 ? 'p2' : !f.p3 ? 'p3' : c.step; featSync();
    },
    hl(add) { for (const k of ['p1', 'p2', 'p3']) hlFace(add, CMD.f[k]); },
    panel: f => ['p1', 'p2', 'p3'].map((k, i) => pf.pick(['First', 'Second', 'Third'][i] + ' plane', f[k] ? planeName(f[k]) : 'Click a plane or flat face', f[k] ? '✓' : '', k)).join('')
      + pf.note('A point where three planes meet. They must cross at one place: no two parallel, and not all three through one line.'),
    hint: c => `click the ${c.step === 'p3' ? 'third' : c.step === 'p2' ? 'second' : 'first'} plane or flat face`,
    sub: () => '3 planes',
  };

  // ── Separate ──
  FEATS.separate = bodyTool({
    label: 'Separate', home: 'bodies', need: 'Pick the body to separate.',
    init: () => ({ bodies: [] }),
    panel: f => bodyPickPanel(f, 'bodies', 'Body') + pf.note('Splits a body made of several unconnected pieces into separate bodies, one for each piece. The biggest piece keeps the original name.'),
    hint: () => 'click the body that has several pieces',
    sub: f => `${f.bodies.length} body`,
  });

  // ── Check: is each body a sound closed solid? ──
  function checkBody(b) {
    const polys = INSP.bodyPolys(b);
    let A = 0, vol = 0, bad = 0, sx = 0, sy = 0, sz = 0;
    for (const p of polys) {
      let a = 0, nx = 0, ny = 0, nz = 0;
      for (let q = 1; q + 1 < p.v.length; q++) {
        const c = crs3(sub3(p.v[q], p.v[0]), sub3(p.v[q + 1], p.v[0])); nx += c[0] / 2; ny += c[1] / 2; nz += c[2] / 2;
        a += len3(c) / 2; vol += dot3(p.v[0], crs3(p.v[q], p.v[q + 1])) / 6;
      }
      A += a; sx += nx; sy += ny; sz += nz;
      if (a < 1e-9) bad++;
    }
    const open = A > 0 ? Math.hypot(sx, sy, sz) / A : 0;                 // a closed surface has its area vectors cancel
    return { polys: polys.length, area: A, vol, bad, open, shells: shellsOf(polys).length, closed: open < 1e-4, outward: vol > 0 };
  }
  INSP.checkBody = checkBody;
  INSP.titleOf.check = 'Check'; INSP.tagOf.check = 'is it sound?';
  INSP.body.check = () => {
    const names = bodyNames(), bs = visibleBodies();
    if (!bs.length) return '<p class="note">There are no visible bodies to check.</p>';
    const rows = bs.map(b => ({ name: names[b.id] || 'Body', ...checkBody(b) }));
    const mark = ok => (ok ? '<b style="color:var(--ok,#2fa84f)">✓</b>' : '<b style="color:var(--bad,#e5484d)">✗</b>');
    const allOk = rows.every(r => r.closed && r.outward && !r.bad);
    return `<div class="pick ${allOk ? '' : 'empty'}"><span>${allOk ? 'Every body is a closed solid' : 'Some bodies need attention'}</span><span class="n">${rows.length}</span></div>`
      + `<table class="insp-tbl"><tr><th>Body</th><th>Closed</th><th>Outward</th><th>Pieces</th><th>Bad faces</th></tr>${rows.map(r => `<tr><td>${r.name}</td><td>${mark(r.closed)}</td><td>${mark(r.outward)}</td><td>${r.shells}</td><td>${r.bad}</td></tr>`).join('')}</table>`
      + '<p class="note">Closed means the faces seal the body with no gaps. Outward means the faces point out of the material, so the volume is positive. A body with more than one piece can be split with Separate. Bad faces are slivers with almost no area.</p>';
  };
  INSP.hint.check = k => `<b>Check:</b> ticks mean the body is a sound closed solid. ${k('Esc')} closes.`;
  window.REFERENCE = { checkBody };

  Object.assign(IC, {
    planepath: '<path d="M2.5 15c4-8 9-8 15-9" opacity=".55"/><path d="M9 4l5 1.2-1 8-5-1.2z"/>',
    pt3pl: '<path d="M2.5 13l7-3 7 3-7 4z" opacity=".45"/><path d="M5 6l10 2M5 8l10 5" opacity=".35"/><circle cx="10" cy="10" r="1.8"/>',
    separate: '<rect x="2.5" y="6" width="6" height="8" rx="1"/><rect x="11.5" y="6" width="6" height="8" rx="1"/><path d="M10 3v14" stroke-dasharray="2 1.6" opacity=".6"/>',
    check: '<path d="M4 10.5l4 4 8-9"/><path d="M3 4h14v12H3z" opacity=".4"/>',
  });
  Object.assign(FA_MAP, { planepath: 'route', pt3pl: 'crosshairs', separate: 'scissors', check: 'circle-check' });
  Object.assign(MENU_IC, { 'f:planepath': 'planepath', 'f:pt3pl': 'pt3pl', 'f:separate': 'separate', 'i:check': 'check' });
  TB_MENUS.construct.splice(2, 0, ['f:planepath', 'Plane Along Path', ''], ['f:pt3pl', 'Point Through Three Planes', ''], ['i:check', 'Check', '']);
  TB_MENUS.modify.push(['f:separate', 'Separate', '']);
  const ins = k => CMD && CMD.type === 'inspect' && CMD.kind === k;
  const mt = modelToolbarHTML;
  modelToolbarHTML = function () {
    let h = rbAppend(mt.apply(this, arguments), 'Construct', [['f:planepath', 'Plane Along Path', '', 'planepath', cmdIs('planepath')], ['f:pt3pl', 'Point, 3 Planes', '', 'pt3pl', cmdIs('pt3pl')]]);
    h = rbAppend(h, 'Modify', [['f:separate', 'Separate', '', 'separate', cmdIs('separate')]]);
    return rbAppend(h, 'Inspect', [['i:check', 'Check', '', 'check', ins('check')]]);
  };
  Object.assign(TIP_TXT, {
    'f:planepath': ['A plane square to a curve, anywhere along it.', ['Click the path curve in a sketch.', 'Slide to where along the path it sits.', 'OK. Sketch on it, for sweeps and lofts.']],
    'f:pt3pl': ['A point where three planes meet.', ['Click the first plane or flat face.', 'Click the second, then the third.', 'OK. They must cross at a single place.']],
    'f:separate': ['Split a body into its separate pieces.', ['Click the body.', 'OK. Each unconnected piece becomes its own body.']],
    'i:check': ['Test that every body is a sound closed solid.', ['Click it.', 'Ticks mean sound; crosses show gaps, inside-out faces or slivers.']],
  });
  if (typeof TipArt !== 'undefined' && typeof TIP_ART !== 'undefined') {
    const { C, at, P, box, line, dot, poly } = TipArt, iso = (f, ox = 60, oy = 48, s = 1.55) => () => { at(ox, oy, s); return f(); };
    const path = () => line([P(-24, 0, 0), P(-8, 0, 10), P(8, 0, 10), P(24, 0, 0)], C.sk, 2.2);
    Object.assign(TIP_ART, {
      'f:planepath': [iso(path, 60, 56, 1.3), iso(() => path() + poly([P(0, -12, -2), P(0, 12, -2), P(0, 12, 22), P(0, -12, 22)], 'rgba(47,123,232,.35)', C.acc, 1.4), 60, 56, 1.3)],
      'f:pt3pl': [iso(() => poly([P(-20, -14, 0), P(20, -14, 0), P(20, 14, 0), P(-20, 14, 0)], 'rgba(47,123,232,.25)', C.acc, 1.2) + poly([P(0, -14, -4), P(0, 14, -4), P(0, 14, 20), P(0, -14, 20)], 'rgba(47,123,232,.25)', C.acc, 1.2), 60, 56, 1.3), iso(() => poly([P(-20, -14, 0), P(20, -14, 0), P(20, 14, 0), P(-20, 14, 0)], 'rgba(47,123,232,.25)', C.acc, 1.2) + poly([P(0, -14, -4), P(0, 14, -4), P(0, 14, 20), P(0, -14, 20)], 'rgba(47,123,232,.25)', C.acc, 1.2) + dot(P(0, 0, 0), C.warn, 4), 60, 56, 1.3)],
      'f:separate': [iso(() => box(-20, -8, 0, 16, 16, 10, 'a') + box(4, -8, 0, 16, 16, 10, 'a'), 60, 56, 1.3), iso(() => box(-24, -8, 0, 16, 16, 10, 'a') + box(8, -8, 0, 16, 16, 10, 'a'), 60, 56, 1.3)],
      'i:check': [iso(() => box(-16, -10, 0, 32, 20, 12), 60, 54, 1.4), iso(() => box(-16, -10, 0, 32, 20, 12) + dot(P(0, 0, 12), C.warn, 4), 60, 54, 1.4)],
    });
  }
  const A = window.TipAnim;
  if (A && A.scene) {
    A.scene('f:planepath', g => { g.view(120, 136, 3); const k = g.seg(0.25, 0.8); g.box(-24, -1, 0, 48, 2, 2, 'n'); g.box(-24 + 48 * k, -10, -2, 1.5, 20, 16, 'a'); });
    A.scene('f:pt3pl', g => { g.view(120, 136, 3); const k = g.seg(0.25, 0.8); g.box(-20, -14, -1, 40, 28, 1, 'n'); g.box(-1, -14, -1, 1, 28, 20 * k, 'n'); g.box(-20, -1, -1, 40, 1, 20 * k, 'n'); if (k > 0.8) g.dot([0, 0, 0], 'r', 3); });
    A.scene('f:separate', g => { g.view(120, 136, 3); const k = g.seg(0.25, 0.8); g.box(-20 - 6 * k, -8, 0, 16, 16, 10, 'a'); g.box(4 + 6 * k, -8, 0, 16, 16, 10, 'a'); });
    A.scene('i:check', g => { g.view(120, 136, 3); const k = g.seg(0.25, 0.8); g.box(-16, -10, 0, 32, 20, 12, k > 0.5 ? 'a' : 'n'); g.box(-16, -10, 12, 32 * k, 20, 2, 'n'); if (k > 0.5) g.chip('Closed ✓', 'a'); });
  }
  refreshUI();
})();
