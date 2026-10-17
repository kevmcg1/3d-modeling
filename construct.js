// ═══════════════════════════════════════════════════════════════════
//  Construction geometry (Design tab): Axis (through two points, where
//  two planes cross, or normal to a plane), Tangent Plane on a round
//  face, Plane Through Two Edges, and Point at the meeting of two edges.
//  Axes can be picked by any tool that asks for an axis. The kernel half
//  is in index.html next to the other kernel scripts.
//  Coverage list: docs/fusion-coverage.md
// ═══════════════════════════════════════════════════════════════════
(() => {
  if (typeof FEATS === 'undefined' || typeof pickKeyPoint === 'undefined') return;
  const rbAppend = (h, title, items) => {
    const key = `</div><div class="rb-title">${title}</div>`, i = h.indexOf(key);
    return i < 0 ? h : h.slice(0, i) + `<div class="rb-col">${items.map(it => rbBtn('data-act', it, 'sm')).join('')}</div>` + h.slice(i);
  };
  Object.assign(FEAT_BASE, { axis: 'Axis', planetan: 'Tangent Plane', plane2e: 'Edge Plane', pt2e: 'Edge Point' });
  Object.assign(FEAT_IC, { axis: 'axisf', planetan: 'planetan', plane2e: 'plane2e', pt2e: 'pt2e' });
  const AK = [['pts', 'Two points'], ['planes', 'Two planes'], ['normal', 'Normal to plane']];
  const planeName = r => (r ? (r.k === 'origin' ? PLANE_NAME[r.w] + ' plane' : refLabel(r) + (r.k === 'face' ? ' (flat face)' : '')) : '');
  const hlFace = (add, ref) => { if (ref && ref.k === 'face') { const r = findFace(beforeBodies(), ref.f); if (r) add.face(r.mesh, r.fid, selMat); } };
  const P3 = p => `(${userXYZ(p).map(v => fmt(toU(v), isIn() ? 2 : 1)).join(', ')})`;

  // ── Axis ──
  FEATS.axis = {
    label: 'Axis', before: true, need: 'Pick what the axis passes through.',
    init: () => ({ akind: 'pts', pts: [], p1: null, p2: null, pt: null, vis: true }),
    base: () => 'axis',
    home: 'pts',
    ready: f => (f.akind === 'pts' ? f.pts.length === 2 : f.akind === 'planes' ? !!(f.p1 && f.p2) : !!(f.p1 && f.pt)),
    onSet(k) { if (k === 'akind') { const c = CMD, f = c.f; f.pts = []; f.p1 = f.p2 = f.pt = null; c.step = f.akind === 'pts' ? 'pts' : 'p1'; } },
    move(x, y) {
      const c = CMD, f = c.f;
      if (f.akind === 'planes' || (f.akind === 'normal' && c.step !== 'pt')) { c.kp = null; hoverPlaneRef(x, y); return; }
      c.kp = pickKeyPoint(x, y, beforeBodies()); ov.className = c.kp ? 'pointer' : 'default'; requestDraw();
    },
    click() {
      const c = CMD, f = c.f;
      if (f.akind === 'pts') { if (!c.kp) return; if (f.pts.length >= 2) f.pts = []; f.pts.push(c.kp.P.map(v => +v.toFixed(6))); }
      else if (f.akind === 'planes') {
        const p = planeRefFromHover(hover3D); if (!p) return;
        f[c.step === 'p2' ? 'p2' : 'p1'] = p; c.step = !f.p1 ? 'p1' : !f.p2 ? 'p2' : c.step;
      } else if (c.step === 'pt') { if (!c.kp) return; f.pt = c.kp.P.map(v => +v.toFixed(6)); }
      else { const p = planeRefFromHover(hover3D); if (!p) return; f.p1 = p; c.step = 'pt'; }
      featSync();
    },
    hl(add) { hlFace(add, CMD.f.p1); hlFace(add, CMD.f.p2); },
    draw() { const c = CMD; for (const p of c.f.pts) kpGlyph(p, 'vertex', COL.accent, true); if (c.f.pt) kpGlyph(c.f.pt, 'vertex', COL.accent, true); if (c.kp) kpGlyph(c.kp.P, c.kp.k, COL.snap, true); },
    panel: f => pf.seg('Through', 'akind', AK, 'pts')
      + (f.akind === 'pts' ? pf.pick('Points', f.pts.length ? f.pts.map((p, i) => `P${i + 1} ${P3(p)}`).join('<br>') : 'Click vertices, edge midpoints or centers', f.pts.length + ' / 2')
        : f.akind === 'planes' ? pf.pick('First plane', f.p1 ? planeName(f.p1) : 'Click a plane or flat face', f.p1 ? '✓' : '', 'p1') + pf.pick('Second plane', f.p2 ? planeName(f.p2) : 'Click a plane or flat face', f.p2 ? '✓' : '', 'p2')
          : pf.pick('Plane', f.p1 ? planeName(f.p1) : 'Click a plane or flat face', f.p1 ? '✓' : '', 'p1') + pf.pick('Point', f.pt ? P3(f.pt) : 'Click a vertex, midpoint or center', f.pt ? '✓' : '', 'pt'))
      + pf.note({ pts: 'A line through two points. Points lock onto vertices, edge midpoints, circle centers and face centers.', planes: 'The line where two planes or flat faces cross. It follows them when they move.', normal: 'A line square to a plane, through the point you click.' }[f.akind]
        + ' Other tools can pick the axis by clicking its dashed line.'),
    hint: c => c.f.akind === 'pts' ? 'click two points' : c.step === 'pt' ? 'click the point the axis passes through' : c.step === 'p2' ? 'click the second plane or flat face' : 'click a plane or flat face',
    sub: f => AK.find(a => a[0] === f.akind)[1].toLowerCase(),
  };

  // ── Tangent Plane ──
  FEATS.planetan = {
    label: 'Tangent Plane', home: 'axis', before: true, need: 'Click a round face.',
    init: () => ({ type: 'plane', cp: 'planetan', axis: null, angle: 0, off: 0, vis: true }),
    base: () => 'planetan',
    ready: f => !!(f.axis && f.axis.k === 'face'),
    start(c) { const s = sel3D; if (s && s.kind === 'face' && Surf.list[s.fid].t === 'C') c.f.axis = { k: 'face', f: faceRef(s.mesh, s.fid, faceInfo(s.mesh, s.fid).on) }; },
    move(x, y) { hoverBeforeFace(x, y, h => Surf.list[h.fid].t === 'C'); },
    click(x, y) {
      const f = CMD.f, h = pickBefore(x, y); if (!h || Surf.list[h.fid].t !== 'C') return;
      const s = Surf.list[h.fid], dir = nrm3(s.dir), fr = cylFrame(dir), d = sub3(h.point, s.p), r = sub3(d, mul3(dir, dot3(d, dir)));
      f.axis = { k: 'face', f: faceRef(h.mesh, h.fid, h.point) };
      f.angle = +(Math.atan2(dot3(r, fr.v), dot3(r, fr.u)) * 180 / Math.PI).toFixed(2); featSync();
    },
    hl(add) { hlFace(add, CMD.f.axis); },
    panel: f => pf.pick('Round face', f.axis ? 'Face chosen' : 'Click a cylinder or hole', f.axis ? '✓' : '')
      + pf.num('Angle around the axis', 'angle', { step: 15 }) + pf.num('Offset', 'off', { len: 1, step: isIn() ? 0.05 : 1 })
      + pf.note('A plane that just touches the round face, at the spot you clicked. Change the angle to roll it around the cylinder.'),
    hint: () => 'click the round face where the plane should touch',
    sub: f => `${+(+f.angle).toFixed(1)}°`,
  };

  // ── Plane through two edges, and a point where two edges meet ──
  const edgePair = (kind, label, need, noteTxt, init) => ({
    label, home: 'p1', before: true, need, init, base: () => kind,
    ready: f => !!(f.p1 && f.p2),
    move(x, y) { hoverAxis(x, y, false); },
    click() {
      const c = CMD, f = c.f, a = axisFromHover(hover3D); if (!a || a.k === 'face') return;
      f[c.step === 'p2' ? 'p2' : 'p1'] = a; c.step = !f.p1 ? 'p1' : !f.p2 ? 'p2' : c.step; featSync();
    },
    draw() { drawAxisRef(CMD.f.p1); drawAxisRef(CMD.f.p2); },
    panel: f => pf.pick('First edge', f.p1 ? 'Edge chosen' : 'Click a straight edge or sketch line', f.p1 ? '✓' : '', 'p1') + pf.pick('Second edge', f.p2 ? 'Edge chosen' : 'Click a straight edge or sketch line', f.p2 ? '✓' : '', 'p2')
      + (kind === 'plane2e' ? pf.num('Offset', 'off', { len: 1, step: isIn() ? 0.05 : 1 }) : '') + pf.note(noteTxt),
    hint: c => c.step === 'p2' ? 'click the second straight edge or line' : 'click the first straight edge or line',
    sub: () => '2 edges',
  });
  FEATS.plane2e = edgePair('plane2e', 'Plane Through Two Edges', 'Pick two straight edges or sketch lines.', 'A plane holding two straight edges. They have to meet or run parallel. It follows the edges when they move.', () => ({ type: 'plane', cp: 'plane2e', p1: null, p2: null, off: 0, vis: true }));
  FEATS.pt2e = edgePair('pt2e', 'Point Through Two Edges', 'Pick two straight edges or sketch lines that meet.', 'A point where two straight edges or sketch lines cross. It follows them when they move.', () => ({ type: 'point', cp: 'pt2e', p1: null, p2: null, vis: true }));

  // dependencies: a construction point, or an axis, depends on the things it was made from
  const featDeps0 = featDeps;
  featDeps = function (f, ids, fromMeta) {
    featDeps0.apply(this, arguments);
    if (!(f.type === 'axis' || (f.type === 'point' && f.cp) || (f.type === 'plane' && (f.cp === 'plane2e' || f.cp === 'planetan')))) return;
    for (const r of [f.p1, f.p2, f.axis]) {
      if (!r) continue;
      if (r.k === 'feat' && r.feat) ids.add(r.feat);
      if (r.k === 'ent' && r.sk) ids.add(r.sk);
      if (r.k === 'edge' && r.e) { fromMeta(r.e.a); fromMeta(r.e.b); }
      if (r.k === 'face' && r.f) fromMeta(r.f.m);
    }
  };
  const featSub0 = featSub;
  featSub = f => (f.type === 'plane' && (f.cp === 'plane2e' || f.cp === 'planetan') ? FEATS[f.cp].sub(f) : f.type === 'point' && f.cp ? '2 edges' : featSub0(f));

  Object.assign(IC, {
    axisf: '<path d="M3 17L17 3" stroke-dasharray="4 1.6 1 1.6"/><circle cx="3.5" cy="16.5" r="1.4"/><circle cx="16.5" cy="3.5" r="1.4"/>',
    planetan: '<ellipse cx="10" cy="13" rx="6" ry="2.4" opacity=".6"/><path d="M3 7l7-3 7 3-7 3z"/><circle cx="10" cy="8.5" r="1.2"/>',
    plane2e: '<path d="M3 14l7-9 7 4-7 9z" opacity=".5"/><path d="M4 13l10-7"/><path d="M6 16l10-3"/>',
    pt2e: '<path d="M3 15L17 5"/><path d="M4 5l12 11"/><circle cx="10" cy="10" r="1.8"/>',
  });
  Object.assign(FA_MAP, { axisf: 'slash', planetan: 'circle-notch', plane2e: 'grip-lines', pt2e: 'xmark' });
  Object.assign(MENU_IC, { 'f:axis': 'axisf', 'f:planetan': 'planetan', 'f:plane2e': 'plane2e', 'f:pt2e': 'pt2e' });
  TB_MENUS.construct.splice(2, 0, ['f:axis', 'Axis', ''], ['f:planetan', 'Tangent Plane', ''], ['f:plane2e', 'Plane Through Two Edges', ''], ['f:pt2e', 'Point Through Two Edges', '']);
  const mt = modelToolbarHTML;
  modelToolbarHTML = function () {
    return rbAppend(mt.apply(this, arguments), 'Construct', [['f:axis', 'Axis', '', 'axisf', cmdIs('axis')], ['f:planetan', 'Tangent Plane', '', 'planetan', cmdIs('planetan')], ['f:plane2e', 'Plane Through Edges', '', 'plane2e', cmdIs('plane2e')], ['f:pt2e', 'Point Through Edges', '', 'pt2e', cmdIs('pt2e')]]);
  };
  Object.assign(TIP_TXT, {
    'f:axis': ['A construction line other tools can use as an axis.', ['Pick how it is defined: two points, two planes, or normal to a plane.', 'Click what it needs.', 'OK. Click its dashed line in any tool that asks for an axis.']],
    'f:planetan': ['A plane that just touches a cylinder or hole.', ['Click the round face where the plane should touch.', 'Change the angle to roll it around.', 'OK.']],
    'f:plane2e': ['A plane through two straight edges.', ['Click the first straight edge or line.', 'Click the second. They have to meet or run parallel.', 'OK.']],
    'f:pt2e': ['A point where two straight edges cross.', ['Click the first straight edge or line.', 'Click the second.', 'OK. The point can be used by other tools.']],
  });
  if (typeof TipArt !== 'undefined' && typeof TIP_ART !== 'undefined') {
    const { C, at, P, box, line, dot, poly } = TipArt, iso = (f, ox = 60, oy = 48, s = 1.55) => () => { at(ox, oy, s); return f(); };
    Object.assign(TIP_ART, {
      'f:axis': [iso(() => box(-16, -10, 0, 32, 20, 12) + dot(P(-16, -10, 12), C.warn, 3) + dot(P(16, 10, 12), C.warn, 3), 60, 56, 1.3), iso(() => box(-16, -10, 0, 32, 20, 12) + line([P(-26, -16, 12), P(26, 16, 12)], C.acc, 2.2), 60, 56, 1.3)],
      'f:planetan': [iso(() => box(-12, -12, 0, 24, 24, 14), 60, 56, 1.3), iso(() => box(-12, -12, 0, 24, 24, 14) + poly([P(14, -16, -4), P(14, 16, -4), P(14, 16, 18), P(14, -16, 18)], 'rgba(47,123,232,.35)', C.acc, 1.4), 60, 56, 1.3)],
      'f:plane2e': [iso(() => line([P(-20, -10, 0), P(20, -10, 10)], C.warn, 2.2) + line([P(-20, 10, 0), P(20, 10, 10)], C.warn, 2.2), 60, 56, 1.3), iso(() => line([P(-20, -10, 0), P(20, -10, 10)], C.warn, 2.2) + line([P(-20, 10, 0), P(20, 10, 10)], C.warn, 2.2) + poly([P(-20, -10, 0), P(20, -10, 10), P(20, 10, 10), P(-20, 10, 0)], 'rgba(47,123,232,.35)', C.acc, 1.4), 60, 56, 1.3)],
      'f:pt2e': [iso(() => line([P(-22, -14, 0), P(22, 14, 0)], C.warn, 2.2) + line([P(-22, 14, 0), P(22, -14, 0)], C.warn, 2.2), 60, 52, 1.3), iso(() => line([P(-22, -14, 0), P(22, 14, 0)], C.warn, 2.2) + line([P(-22, 14, 0), P(22, -14, 0)], C.warn, 2.2) + dot(P(0, 0, 0), C.acc, 4), 60, 52, 1.3)],
    });
  }
  const A = window.TipAnim;
  if (A && A.scene) {
    A.scene('f:axis', g => { g.view(120, 136, 3); const k = g.seg(0.25, 0.8); g.box(-16, -10, 0, 32, 20, 12, 'n'); g.dot([-16, -10, 12], 'r', 2.5); g.dot([16, 10, 12], 'r', 2.5); if (k > 0.3) g.chip('Axis', 'a'); });
    A.scene('f:planetan', g => { g.view(120, 136, 3); const k = g.seg(0.25, 0.8); g.box(-12, -12, 0, 24, 24, 14, 'n'); g.box(12 + 2 * (1 - k), -16, -4, 1, 32, 22, 'a'); });
    A.scene('f:plane2e', g => { g.view(120, 136, 3); const k = g.seg(0.25, 0.8); g.box(-22, -12, 0, 44, 1.5, 1.5, 'n'); g.box(-22, 10, 0, 44, 1.5, 1.5, 'n'); g.box(-22, -12, 0, 44, 24 * k, 0.8, 'a'); });
    A.scene('f:pt2e', g => { g.view(120, 136, 3); const k = g.seg(0.25, 0.8); g.box(-22, -1, 0, 44, 2, 2, 'n'); g.box(-1, -22, 0, 2, 44, 2, 'n'); if (k > 0.4) g.dot([0, 0, 1], 'r', 3); });
  }
  refreshUI();
})();
