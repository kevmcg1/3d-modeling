// ═══════════════════════════════════════════════════════════════════
//  Fusion-style modeling, batch 1 (Design tab). The kernel half (the
//  construction-plane evaluator) lives in index.html next to the other
//  kernel scripts; this file is the panels, picking, Inspect tools and
//  help cards. Coverage list: docs/fusion-coverage.md
//
//    Construct:  Midplane · Plane at Angle · Plane Through 3 Points
//    Inspect:    Physical Properties · Interference · Section Analysis
// ═══════════════════════════════════════════════════════════════════
(() => {
  // ── Construction planes ────────────────────────────────────────────
  Object.assign(FEAT_BASE, { midplane: 'Midplane', planeang: 'Angle Plane', plane3: '3-Point Plane' });
  const CP_SUB = { midplane: () => 'mid', planeang: f => `${+(+f.angle).toFixed(2)}°`, plane3: () => '3 pts' };
  const featSub0 = featSub;
  featSub = f => (f.type === 'plane' && f.cp && CP_SUB[f.cp] ? CP_SUB[f.cp](f) : featSub0(f));

  // highlight a picked plane reference (a flat face lights up; origin and construction planes show themselves)
  const hlRef = (add, ref) => { if (ref && ref.k === 'face') { const r = findFace(beforeBodies(), ref.f); if (r) add.face(r.mesh, r.fid, selMat); } };
  const refName = r => (r ? (r.k === 'origin' ? PLANE_NAME[r.w] + ' plane' : refLabel(r) + (r.k === 'face' ? ' (flat face)' : '')) : '');
  const planePick = (label, key, step) => pf.pick(label, CMD.f[key] ? refName(CMD.f[key]) : 'Click a plane or flat face', CMD.f[key] ? '✓' : '', step);

  FEATS.midplane = {
    label: 'Midplane', home: 'p1', before: true, need: 'Pick two parallel planes or flat faces.',
    init: () => ({ type: 'plane', cp: 'midplane', p1: null, p2: null, off: 0, vis: true }),
    base: () => 'midplane',
    ready: f => !!f.p1 && !!f.p2,
    start(c) { const s = sel3D; if (s && s.kind === 'face' && Surf.list[s.fid].t === 'P') { c.f.p1 = { k: 'face', f: faceRef(s.mesh, s.fid, faceInfo(s.mesh, s.fid).on) }; c.step = 'p2'; } },
    move(x, y) { hoverPlaneRef(x, y); },
    click() {
      const c = CMD, f = c.f, p = planeRefFromHover(hover3D);
      if (!p) return;
      f[c.step === 'p2' ? 'p2' : 'p1'] = p;
      c.step = !f.p1 ? 'p1' : !f.p2 ? 'p2' : c.step;
      featSync();
    },
    hl(add) { hlRef(add, CMD.f.p1); hlRef(add, CMD.f.p2); },
    panel: f => planePick('First plane', 'p1', 'p1') + planePick('Second plane', 'p2', 'p2')
      + pf.note('The new plane sits exactly halfway between two parallel planes or flat faces, and follows them when they move.'),
    hint: c => c.step === 'p2' ? 'click the second plane or flat face' : 'click the first plane or flat face',
    sub: () => 'mid',
  };

  FEATS.planeang = {
    label: 'Plane at Angle', home: 'axis', before: true, need: 'Pick an axis to turn the plane about.',
    init: () => ({ type: 'plane', cp: 'planeang', axis: null, ref: null, angle: 45, off: 0, vis: true }),
    base: () => 'planeang',
    ready: f => !!f.axis,
    start(c) { const s = sel3D; if (s && s.kind === 'face' && Surf.list[s.fid].t === 'C') { c.f.axis = { k: 'face', f: faceRef(s.mesh, s.fid, faceInfo(s.mesh, s.fid).on) }; c.step = null; } },
    move(x, y) { if (CMD.step === 'ref') hoverPlaneRef(x, y); else hoverAxis(x, y, true); },
    click() {
      const c = CMD, f = c.f;
      if (c.step === 'ref') { const p = planeRefFromHover(hover3D); if (!p) return; f.ref = p; c.step = null; featSync(); return; }
      const a = axisFromHover(hover3D);
      if (!a) return;
      f.axis = a; c.step = null; featSync();
    },
    hl(add) { hlRef(add, CMD.f.ref); },
    draw() { if (CMD.f.axis) drawAxisRef(CMD.f.axis); },
    panel: f => pf.axis('Axis', 'axis', 'axis', 'Click a straight or circular edge, a cylindrical face or a sketch line.', true)
      + pf.pick('Starts from', f.ref ? refName(f.ref) : 'The plane the axis lies in (first side)', f.ref ? '✓' : '', 'ref')
      + (f.ref ? '<div class="btns"><button class="btn" data-fdo="noref">Use the default start</button></div>' : '')
      + `<div class="field"><span>Angle (°)</span><div class="row2"><input type="number" data-fv="angle" data-live="1" step="15" value="${+(+f.angle).toFixed(4)}"><button class="btn" data-fdo="flip" title="Reverse direction">Flip ⇅</button></div></div>`
      + pf.note('The plane passes through the axis. At 0° it lies along the starting plane (or face); the angle then turns it about the axis.'),
    act: { flip() { CMD.f.angle = -CMD.f.angle; featSync(); }, noref() { CMD.f.ref = null; featSync(); } },
    hint: c => c.step === 'ref' ? 'click the plane or flat face the angle starts from' : 'click an edge, cylindrical face or sketch line for the axis',
    sub: f => `${+(+f.angle).toFixed(2)}°`,
  };

  FEATS.plane3 = {
    label: 'Plane Through 3 Points', before: true, need: 'Pick three points that are not in a line.',
    init: () => ({ type: 'plane', cp: 'plane3', pts: [], off: 0, vis: true }),
    base: () => 'plane3',
    ready: f => f.pts.length === 3,
    move(x, y) { CMD.kp = pickKeyPoint(x, y, beforeBodies()); ov.className = CMD.kp ? 'pointer' : 'default'; requestDraw(); },
    click() {
      const c = CMD, f = c.f;
      if (!c.kp) return;
      const P = c.kp.P.map(v => +v.toFixed(6));
      if (f.pts.length >= 3) f.pts = [];
      f.pts.push(P); featSync();
    },
    draw() { for (const p of CMD.f.pts) kpGlyph(p, 'vertex', COL.accent, true); if (CMD.kp) kpGlyph(CMD.kp.P, CMD.kp.k, COL.snap, true); },
    panel: f => pf.pick('Points', f.pts.length ? f.pts.map((p, i) => `P${i + 1} (${userXYZ(p).map(v => fmt(toU(v), isIn() ? 2 : 1)).join(', ')})`).join('<br>') : 'Click vertices, edge midpoints or centers', f.pts.length + ' / 3')
      + (f.pts.length ? '<div class="btns"><button class="btn" data-fdo="clear">Start over</button></div>' : '')
      + pf.note('Points lock onto vertices, edge midpoints, circle centers and face centers. The plane is fixed where you put it: it does not follow the part afterwards.'),
    act: { clear() { CMD.f.pts = []; featSync(); } },
    hint: () => 'click three points: vertices, edge midpoints, circle centers or face centers',
    sub: () => '3 pts',
  };

  // a plane feature's picked faces, edges and planes count as its dependencies
  const featDeps0 = featDeps;
  featDeps = function (f, ids, fromMeta) {
    featDeps0.apply(this, arguments);
    if (f.type !== 'plane' || !f.cp) return;
    for (const r of [f.p1, f.p2, f.ref, f.axis]) {
      if (!r) continue;
      if (r.k === 'feat' && r.feat) ids.add(r.feat);
      if (r.k === 'ent' && r.sk) ids.add(r.sk);
      if (r.k === 'edge' && r.e) { fromMeta(r.e.a); fromMeta(r.e.b); }
      if (r.k === 'face' && r.f) fromMeta(r.f.m);
    }
  };

  // ── Inspect: Physical Properties, Interference, Section Analysis ───
  const MATS = [['Steel (1018)', 7.87], ['Stainless 304', 8.0], ['Aluminum 6061', 2.7], ['Brass', 8.5], ['Copper', 8.96], ['Titanium Gr 5', 4.43], ['Cast iron', 7.2], ['ABS', 1.04], ['PLA', 1.24], ['Nylon', 1.15], ['Delrin (acetal)', 1.41]];
  const INSP = { mat: 0, sec: { w: 'XZ', pos: null, flip: false }, props: null, interf: null, secData: null, planeArr: null, clipOn: false, grp: new THREE.Group(), key: '' };
  scene.add(INSP.grp);
  window.FUSION1 = INSP;                                           // handle for the tests
  const SEC_PLANES = [['XZ', 'Top'], ['XY', 'Front'], ['YZ', 'Side']];
  const num = (v, d = 3) => (isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 }) : '—');

  // the polygons of a body: the kernel keeps them on its own side, so the page rebuilds them from the mesh when it has to
  const POLYS = new WeakMap();
  const bodyPolys = b => {
    if (b.polys) return b.polys;
    let r = POLYS.get(b);
    if (!r) { const m = bodyMesh(b), VP = m.VP; r = m.PL.map(p => CSG.poly(p.ids.map(i => VP[i]), 0)); POLYS.set(b, r); }
    return r;
  };
  // volume, area, centroid of a closed polygon solid (signed tetrahedra against the origin)
  function polyStats(ps) {
    let V = 0, A = 0, cx = 0, cy = 0, cz = 0;
    for (const p of ps) for (let q = 1; q + 1 < p.v.length; q++) {
      const a = p.v[0], b = p.v[q], c = p.v[q + 1], t = dot3(a, crs3(b, c)) / 6;
      V += t; cx += t * (a[0] + b[0] + c[0]) / 4; cy += t * (a[1] + b[1] + c[1]) / 4; cz += t * (a[2] + b[2] + c[2]) / 4;
      A += len3(crs3(sub3(b, a), sub3(c, a))) / 2;
    }
    const s = V < 0 ? -1 : 1;
    return { vol: Math.abs(V), area: A, com: Math.abs(V) > 1e-12 ? [cx / V, cy / V, cz / V] : [0, 0, 0], s };
  }
  function computeProps() {
    const bodies = visibleBodies(), names = bodyNames(), rows = bodies.map(b => ({ id: b.id, name: names[b.id] || 'Body', ...polyStats(bodyPolys(b)), bb: b.bb }));
    let V = 0, A = 0, c = [0, 0, 0];
    for (const r of rows) { V += r.vol; A += r.area; c = add3(c, mul3(r.com, r.vol)); }
    const bb = rows.length ? rows.map(r => r.bb).reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[3], b[3]), Math.max(a[4], b[4]), Math.max(a[5], b[5])]) : null;
    return { rows, vol: V, area: A, com: V > 0 ? mul3(c, 1 / V) : null, bb, model: MODEL };
  }
  function computeInterf() {
    const bodies = visibleBodies(), names = bodyNames(), hits = [];
    let t0 = performance.now();
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j];
      if (!bbOverlap(a.bb, b.bb)) continue;
      let polys = [];
      try { polys = CSG.intersect(bodyPolys(a), bodyPolys(b)); } catch (e) { polys = []; }
      const v = polys.length ? Math.abs(polyVolume(polys)) : 0;
      if (v > 1e-6) hits.push({ a: a.id, b: b.id, na: names[a.id] || 'Body', nb: names[b.id] || 'Body', vol: v, polys });
    }
    return { hits, n: bodies.length, ms: Math.round(performance.now() - t0), model: MODEL };
  }
  function secRange() {
    const bb = (INSP.props && INSP.props.model === MODEL ? INSP.props : (INSP.props = computeProps())).bb, ax = ORIGIN_PLANES[INSP.sec.w].n.findIndex(v => v !== 0);
    return bb ? [bb[ax], bb[ax + 3]] : [-50, 50];
  }
  // where the plane cuts every body: outline segments and the area of the cut
  function computeSection() {
    const n0 = ORIGIN_PLANES[INSP.sec.w].n, w = INSP.sec.pos, segs = [], per = [], names = bodyNames();
    for (const b of visibleBodies()) {
      let area = 0;
      for (const p of bodyPolys(b)) {
        const pts = [], d = p.v.map(v => { const x = dot3(n0, v) - w; return Math.abs(x) < 1e-9 ? 1e-9 : x; });
        for (let i = 0; i < p.v.length; i++) {
          const j = (i + 1) % p.v.length;
          if (d[i] * d[j] < 0) { const t = d[i] / (d[i] - d[j]); pts.push(add3(p.v[i], mul3(sub3(p.v[j], p.v[i]), t))); }
        }
        if (pts.length < 2) continue;
        let [a, c] = [pts[0], pts[pts.length - 1]];
        if (dot3(sub3(c, a), crs3(n0, p.n)) < 0) [a, c] = [c, a];
        segs.push(a, c); area += dot3(n0, crs3(a, c)) / 2;
      }
      per.push({ id: b.id, name: names[b.id] || 'Body', area: Math.abs(area) });
    }
    return { segs, per, total: per.reduce((s, r) => s + r.area, 0), model: MODEL, w, plane: INSP.sec.w };
  }

  // the 3D extras of an inspect command (overlap volumes in red, the cut outline in orange)
  function clearGrp() { for (const o of [...INSP.grp.children]) { INSP.grp.remove(o); o.geometry && o.geometry.dispose(); o.material && o.material.dispose(); } INSP.key = ''; }
  function buildInterfGrp(r) {
    clearGrp();
    for (const h of r.hits) {
      const pos = [];
      for (const p of h.polys) for (let q = 1; q + 1 < p.v.length; q++) pos.push(...p.v[0], ...p.v[q], ...p.v[q + 1]);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xe5484d, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthTest: false }));
      m.renderOrder = 20; INSP.grp.add(m);
    }
  }
  function buildSecGrp(s) {
    clearGrp();
    if (!s.segs.length) return;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(s.segs.flat(), 3));
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xf08a24, depthTest: false }));
    l.renderOrder = 20; INSP.grp.add(l);
  }
  const bodyMats = () => { const set = new Set(); for (const m of bodyMeshes) { set.add(m.me.material); set.add(m.group.children[1].material); } return set; };
  function setClip(on) {
    if (on) {
      // keep the side the normal points away from: n·x <= pos (flipped: n·x >= pos); three.js keeps what has a positive distance
      const nn = ORIGIN_PLANES[INSP.sec.w].n, sgn = INSP.sec.flip ? 1 : -1, pl = new THREE.Plane(new THREE.Vector3(nn[0] * sgn, nn[1] * sgn, nn[2] * sgn), -sgn * INSP.sec.pos);
      INSP.planeArr = [pl]; renderer.localClippingEnabled = true; INSP.clipOn = true;
    } else { INSP.planeArr = null; INSP.clipOn = false; }
    for (const m of bodyMats()) { m.clippingPlanes = INSP.planeArr; m.needsUpdate = true; }
  }
  // new body meshes (after any model change) pick the clipping plane up on the next frame
  function syncClip() {
    const want = CMD && CMD.type === 'inspect' && CMD.kind === 'section';
    if (!want) { if (INSP.clipOn) { setClip(false); clearGrp(); } return; }
    for (const m of bodyMats()) if (m.clippingPlanes !== INSP.planeArr) { m.clippingPlanes = INSP.planeArr; m.needsUpdate = true; }
  }

  function cmdInspect(kind) {
    if (CMD && CMD.type === 'inspect' && CMD.kind === kind) { cancelCmd(); return; }
    if (S.sk) finishSketch();
    if (CMD) cancelCmd();
    CMD = { type: 'inspect', kind };
    if (kind === 'props') INSP.props = computeProps();
    if (kind === 'interf') { INSP.interf = computeInterf(); buildInterfGrp(INSP.interf); }
    if (kind === 'section') { const [lo, hi] = secRange(); INSP.sec.pos = (lo + hi) / 2; updateSection(); }
    refreshUI(); requestDraw();
  }
  function updateSection() { setClip(true); INSP.secData = computeSection(); buildSecGrp(INSP.secData); requestDraw(); }
  CMD_HANDLERS.inspect = { move() { ov.className = 'default'; }, click() {} };

  const titleOf = { props: 'Physical Properties', interf: 'Interference', section: 'Section Analysis' };
  const tagOf = { props: 'mass · volume', interf: 'overlaps', section: 'cut plane' };
  function inspectBody() {
    const k = CMD.kind;
    if (k === 'props') {
      const P = INSP.props && INSP.props.model === MODEL ? INSP.props : (INSP.props = computeProps()), mat = MATS[INSP.mat];
      if (!P.rows.length) return '<p class="note">There are no visible bodies to measure.</p>';
      const dens = mat[1], g = P.vol / 1000 * dens;
      const mass = v => (isIn() ? `${num(v / 453.592, 4)} lb (${num(v, 1)} g)` : `${num(v, 2)} g`);
      const vol = v => (isIn() ? `${num(v / 16387.064, 4)} in³ (${num(v / 1000, 3)} cm³)` : `${num(v / 1000, 3)} cm³`);
      const area = v => (isIn() ? `${num(v / 645.16, 3)} in² (${num(v / 100, 2)} cm²)` : `${num(v / 100, 2)} cm²`);
      const sel = `<label class="field"><span>Material</span><select data-insp="mat">${MATS.map((m, i) => `<option value="${i}" ${i === INSP.mat ? 'selected' : ''}>${m[0]} · ${m[1]} g/cm³</option>`).join('')}</select></label>`;
      const com = userXYZ(P.com), sz = P.bb ? [P.bb[3] - P.bb[0], P.bb[5] - P.bb[2], P.bb[4] - P.bb[1]] : [0, 0, 0];
      const rows = P.rows.map(r => `<tr><td>${r.name}</td><td>${vol(r.vol)}</td><td>${mass(r.vol / 1000 * dens)}</td></tr>`).join('');
      return sel + `<div class="measure-big"><span>${isIn() ? num(g / 453.592, 4) : num(g, 2)}</span> ${isIn() ? 'lb' : 'g'}</div>`
        + `<dl class="kv"><dt>Volume</dt><dd>${vol(P.vol)}</dd><dt>Surface area</dt><dd>${area(P.area)}</dd><dt>Mass</dt><dd>${mass(g)}</dd>`
        + `<dt>Center of mass X</dt><dd>${fmtLs(com[0], 3)}</dd><dt>Center of mass Y</dt><dd>${fmtLs(com[1], 3)}</dd><dt>Center of mass Z (up)</dt><dd>${fmtLs(com[2], 3)}</dd>`
        + `<dt>Bounding box</dt><dd>${sz.map(v => fmt(toU(v), isIn() ? 3 : 2)).join(' × ')} ${uName()}</dd></dl>`
        + (P.rows.length > 1 ? `<div class="divider"></div><div class="field"><span>Per body</span></div><table class="insp-tbl"><tr><th>Body</th><th>Volume</th><th>Mass</th></tr>${rows}</table>` : '')
        + '<p class="note">Computed from the exact faces of every visible body. The marker in the view is the center of mass. Hidden bodies and Hole-mode bodies are left out.</p>';
    }
    if (k === 'interf') {
      const R = INSP.interf && INSP.interf.model === MODEL ? INSP.interf : (INSP.interf = computeInterf(), buildInterfGrp(INSP.interf), INSP.interf);
      const vol = v => (isIn() ? `${num(v / 16387.064, 4)} in³` : `${num(v / 1000, 3)} cm³`);
      if (R.n < 2) return '<p class="note">Interference compares bodies with each other. Make a second body (an Extrude set to New body, or a Primitive) and it will be checked here.</p>';
      return (R.hits.length
        ? `<div class="pick"><span>${R.hits.length} overlap${R.hits.length > 1 ? 's' : ''} found</span><span class="n">${vol(R.hits.reduce((s, h) => s + h.vol, 0))}</span></div><table class="insp-tbl"><tr><th>Bodies</th><th>Overlap</th></tr>${R.hits.map(h => `<tr><td>${h.na} ∩ ${h.nb}</td><td>${vol(h.vol)}</td></tr>`).join('')}</table>`
        : `<div class="pick empty"><span>No interference</span><span class="n">${R.n} bodies</span></div>`)
        + `<div class="btns"><button class="btn" data-insp-do="recheck">Check again</button></div><p class="note">Every pair of visible bodies is intersected; overlaps show in red. Bodies that only touch face to face do not count. Checked in ${R.ms} ms.</p>`;
    }
    const [lo, hi] = secRange(), S2 = INSP.sec, D = INSP.secData, st = (hi - lo) / 400 || 1;
    const area = v => (isIn() ? `${num(v / 645.16, 4)} in² (${num(v / 100, 3)} cm²)` : `${num(v / 100, 3)} cm²`);
    return `<div class="field"><span>Cut plane</span><div class="seg">${SEC_PLANES.map(([w, l]) => `<button data-insp-set="w" data-v="${w}" class="${S2.w === w ? 'on' : ''}">${l}</button>`).join('')}</div></div>`
      + `<div class="field"><span>Position (${uName()})</span><input type="range" data-insp-live="pos" min="${lo}" max="${hi}" step="${st}" value="${S2.pos}"><input type="number" data-insp-live="posn" step="${isIn() ? 0.05 : 1}" value="${uval(S2.pos)}"></div>`
      + `<label class="chk"><input type="checkbox" data-insp-chk="flip" ${S2.flip ? 'checked' : ''}> Keep the other side</label>`
      + `<div class="measure-big" id="secArea"><span>${D ? area(D.total).split(' ')[0] : '—'}</span> ${isIn() ? 'in²' : 'cm²'}</div>`
      + `<p class="note" id="secNote">${D && D.total > 0 ? 'Area of the cut' + (isIn() ? ` (${num(D.total / 100, 3)} cm²)` : '') + (D.per.length > 1 ? ' across all visible bodies.' : '.') : 'The plane does not cut any body here.'}</p>`
      + '<p class="note">Everything on the far side of the plane is hidden; the orange outline is where it cuts. Nothing in the model changes.</p>';
  }
  function inspectPanel() {
    return `<div class="pn-head"><h2>${titleOf[CMD.kind]}</h2><span class="tag">${tagOf[CMD.kind]}</span></div><div class="pn-body">${inspectBody()}<div class="btns"><button class="btn primary" data-do="cancel">Done</button></div></div>`;
  }
  function bindInspect() {
    panel.querySelectorAll('[data-insp="mat"]').forEach(s => s.addEventListener('change', () => { INSP.mat = +s.value; refreshPanel(); }));
    panel.querySelectorAll('[data-insp-do="recheck"]').forEach(b => b.addEventListener('click', () => { INSP.interf = null; refreshPanel(); requestDraw(); }));
    panel.querySelectorAll('[data-insp-set]').forEach(b => b.addEventListener('click', () => { INSP.sec[b.dataset.inspSet] = b.dataset.v; const [lo, hi] = secRange(); INSP.sec.pos = (lo + hi) / 2; updateSection(); refreshPanel(); }));
    panel.querySelectorAll('[data-insp-chk="flip"]').forEach(c => c.addEventListener('change', () => { INSP.sec.flip = c.checked; updateSection(); refreshPanel(); }));
    panel.querySelectorAll('[data-insp-live]').forEach(inp => inp.addEventListener('input', () => {
      let v = parseFloat(inp.value);
      if (!isFinite(v)) return;
      if (inp.dataset.inspLive === 'posn') v = fromU(v);
      INSP.sec.pos = v; updateSection();
      const other = panel.querySelector(inp.dataset.inspLive === 'pos' ? '[data-insp-live="posn"]' : '[data-insp-live="pos"]');
      if (other) other.value = inp.dataset.inspLive === 'pos' ? uval(v) : v;
      const D = INSP.secData, a = panel.querySelector('#secArea'), nt = panel.querySelector('#secNote');
      if (a) a.firstElementChild.textContent = D ? (isIn() ? num(D.total / 645.16, 4) : num(D.total / 100, 3)) : '—';
      if (nt) nt.textContent = D && D.total > 0 ? 'Area of the cut' + (isIn() ? ` (${num(D.total / 100, 3)} cm²)` : '') + '.' : 'The plane does not cut any body here.';
    }));
  }

  // the panel, hint and overlay hooks for the inspect command
  const refreshPanel0 = refreshPanel;
  refreshPanel = function () {
    if (!(CMD && CMD.type === 'inspect')) return refreshPanel0.apply(this, arguments);
    const ae = document.activeElement, key = 'inspect' + CMD.kind;
    if (ae && panel.contains(ae) && ae.dataset.inspLive && panel.dataset.mode === key) return;
    catRailRender();
    panel.classList.toggle('pn-enter', panel.dataset.enter !== key);
    panel.dataset.enter = key; panel.dataset.mode = key;
    if (CMD.kind === 'section' && INSP.secData && INSP.secData.model !== MODEL) updateSection();
    panel.innerHTML = inspectPanel(); panel.hidden = false; bindPanel(); bindInspect();
  };
  const updateHint0 = updateHint;
  updateHint = function () {
    if (!(CMD && CMD.type === 'inspect')) return updateHint0.apply(this, arguments);
    const k = s => `<span class="kbd">${s}</span>`;
    hintEl.innerHTML = { props: `<b>Physical Properties:</b> pick a material to see the mass. The marker is the center of mass. ${k('Esc')} closes.`,
      interf: `<b>Interference:</b> overlaps between bodies show in red. ${k('Esc')} closes.`,
      section: `<b>Section Analysis:</b> drag the slider to move the cut plane. Nothing in the model changes. ${k('Esc')} closes.` }[CMD.kind];
  };
  const drawMeasurements0 = drawMeasurements;
  drawMeasurements = function () {
    drawMeasurements0.apply(this, arguments);
    syncClip();
    if (!(CMD && CMD.type === 'inspect')) { if (INSP.grp.children.length) clearGrp(); return; }
    if (CMD.kind === 'props' && INSP.props && INSP.props.com && INSP.props.model === MODEL) {
      const s = toScreen(INSP.props.com);
      og.strokeStyle = COL.accent; og.fillStyle = COL.accent; og.lineWidth = 1.8;
      og.beginPath(); og.arc(s.x, s.y, 7, 0, TAU); og.moveTo(s.x - 11, s.y); og.lineTo(s.x + 11, s.y); og.moveTo(s.x, s.y - 11); og.lineTo(s.x, s.y + 11); og.stroke();
      label('Center of mass', s.x + 12, s.y - 8, COL.accent);
    }
  };
  // a model change refreshes whatever the inspect panel is showing
  const applyModel0 = applyModel;
  applyModel = function () {
    const r = applyModel0.apply(this, arguments);
    if (CMD && CMD.type === 'inspect') { if (CMD.kind === 'interf') INSP.interf = null; if (CMD.kind === 'props') INSP.props = null; }
    return r;
  };
  const action0 = action;
  action = function (a) { if (typeof a === 'string' && a.startsWith('i:')) { cmdInspect(a.slice(2)); return; } return action0.apply(this, arguments); };

  // ── Toolbar, icons, help ───────────────────────────────────────────
  Object.assign(IC, {
    midplane: '<path d="M3 5l7-2 7 2-7 2z" opacity=".5"/><path d="M3 10l7-2 7 2-7 2z"/><path d="M3 15l7-2 7 2-7 2z" opacity=".5"/>',
    planeang: '<path d="M3 16h14" opacity=".55"/><path d="M4 16l10-9 3 1-8 8z"/><path d="M9 16a5 5 0 0 0-1.6-3.2" />',
    plane3: '<path d="M3 13l7-3 7 3-7 4z" opacity=".55"/><circle cx="4" cy="12.5" r="1.4"/><circle cx="16" cy="12.5" r="1.4"/><circle cx="10" cy="5" r="1.4"/><path d="M5 11.6l4-5M15 11.6l-4-5M5.4 12.5h9.2" opacity=".6"/>',
    props: '<path d="M4 17h12l-1.6-9H5.6z"/><circle cx="10" cy="5.5" r="1.8"/><path d="M8 11.5h4" />',
    interf: '<rect x="3" y="4" width="9" height="9" rx="1"/><rect x="8" y="8" width="9" height="9" rx="1" opacity=".6"/><path d="M8 8h4v5H8z"/>',
    section: '<path d="M4 6l6-3 6 3v7l-6 3-6-3z" opacity=".55"/><path d="M2.5 11l7.5-3.5 7.5 3.5-7.5 3.5z"/>',
  });
  Object.assign(FA_MAP, { midplane: 'bars', planeang: 'angle-left', plane3: 'braille', props: 'weight-hanging', interf: 'circles-overlap', section: 'scissors' });
  Object.assign(MENU_IC, { 'f:midplane': 'midplane', 'f:planeang': 'planeang', 'f:plane3': 'plane3', 'i:props': 'props', 'i:interf': 'interf', 'i:section': 'section' });
  TB_MENUS.construct.splice(2, 0, ['f:midplane', 'Midplane', ''], ['f:planeang', 'Plane at Angle', ''], ['f:plane3', 'Plane Through 3 Points', '']);
  TB_MENUS.construct.push(null, ['i:props', 'Physical Properties', ''], ['i:interf', 'Interference', ''], ['i:section', 'Section Analysis', '']);

  const ins = k => CMD && CMD.type === 'inspect' && CMD.kind === k;
  const modelToolbar0 = modelToolbarHTML;
  modelToolbarHTML = function () {
    let h = modelToolbar0.apply(this, arguments);
    // Construct: the three new planes join Offset Plane and Point
    const cn = rbPanel('Construct', [['plane', 'Offset Plane', 'P', 'plane', CMD && CMD.type === 'offset'], ['point', 'Point', 'O', 'point', CMD && CMD.type === 'point'],
      ['f:midplane', 'Midplane', '', 'midplane', cmdIs('midplane')], ['f:planeang', 'Plane at Angle', '', 'planeang', cmdIs('planeang')], ['f:plane3', '3-Point Plane', '', 'plane3', cmdIs('plane3')]], 1);
    const a = h.indexOf('<section class="rb-panel" style="--h:' + rbHue('Construct') + '" aria-label="Construct">');
    if (a >= 0) { const b = h.indexOf('</section>', a) + 10; h = h.slice(0, a) + cn + h.slice(b); }
    // Inspect: the three new tools join Measure, Stress and Blueprint
    const a2 = h.indexOf('aria-label="Inspect"');
    if (a2 >= 0) {
      const s0 = h.lastIndexOf('<section', a2), e0 = h.indexOf('</section>', a2) + 10;
      const old = h.slice(s0, e0);
      const ni = rbPanel('Inspect', [['measure', 'Measure', 'M', 'measure', CMD && CMD.type === 'measure'], ['i:props', 'Properties', '', 'props', ins('props')], ['i:interf', 'Interference', '', 'interf', ins('interf')], ['i:section', 'Section', '', 'section', ins('section')], ['stress', 'Stress', '', 'stress', CMD && CMD.type === 'stress'], ['blueprint', 'Blueprint Drawing', '', 'blueprint']], 2);
      h = h.slice(0, s0) + ni + h.slice(e0); void old;
    }
    return h;
  };

  Object.assign(TIP_TXT, {
    'f:midplane': ['A plane exactly halfway between two parallel planes or flat faces.', ['Click the first plane or flat face.', 'Click the second one.', 'OK. The plane stays centered if either moves.']],
    'f:planeang': ['A plane through an axis, turned by an angle.', ['Click an edge, cylinder or sketch line as the axis.', 'Optionally pick the plane or face the angle starts from.', 'Type the angle, then OK.']],
    'f:plane3': ['A plane through three points you click.', ['Click three vertices, edge midpoints or centers.', 'OK. The points must not be in a line.']],
    'i:props': ['Volume, surface area, mass and center of mass of the visible bodies.', ['Click it.', 'Pick the material to get the mass.', 'Read the numbers; the marker shows the center of mass.']],
    'i:interf': ['Find where bodies overlap each other, and by how much.', ['Click it.', 'Overlaps show in red with their volume.', 'Fix the model and Check again.']],
    'i:section': ['Slice the model with a plane to look inside it, and read the cut area.', ['Pick Top, Front or Side.', 'Drag the slider to move the plane.', 'Read the area of the cut. Nothing changes in the model.']],
  });
  Object.assign(GD, { inspect: ['Inspect steps', () => {
    const k = CMD && CMD.kind;
    if (k === 'props') return [gS('Open Physical Properties', 'Volume, area and center of mass appear straight away.', () => true), gS('Pick the material', 'The mass follows from its density.', null, true)];
    if (k === 'interf') return [gS('Overlaps are checked', 'Every pair of visible bodies is intersected.', () => true), gS('Fix any overlap', 'Move, cut or combine the bodies, then Check again.', null, true)];
    return [gS('Pick the cut plane', 'Top, Front or Side.', () => true), gS('Drag the slider', 'The far side is hidden, the cut outline is orange.', () => true), gS('Read the cut area', 'Shown in the panel. Esc to close.', null, true)];
  }] });

  // little pictures for the hover cards
  if (typeof TipArt !== 'undefined' && typeof TIP_ART !== 'undefined') {
    const { C, at, P, poly, line, box, arrow, dot, plane } = TipArt;
    const iso = (f, ox = 60, oy = 48, s = 1.55) => () => { at(ox, oy, s); return f(); };
    const slab = z => poly([P(-20, -14, z), P(20, -14, z), P(20, 14, z), P(-20, 14, z)], 'rgba(47,123,232,.18)', C.sk, 1.2);
    Object.assign(TIP_ART, {
      'f:midplane': [iso(() => slab(0) + slab(24), 60, 58, 1.2), iso(() => slab(0) + slab(24) + poly([P(-20, -14, 12), P(20, -14, 12), P(20, 14, 12), P(-20, 14, 12)], 'rgba(47,123,232,.4)', C.acc, 1.6), 60, 58, 1.2)],
      'f:planeang': [iso(() => line([P(-22, 0, 0), P(22, 0, 0)], C.warn, 2.2) + slab(0), 60, 52, 1.3), iso(() => line([P(-22, 0, 0), P(22, 0, 0)], C.warn, 2.2) + slab(0) + poly([P(-20, 0, 0), P(20, 0, 0), P(20, -12, 20), P(-20, -12, 20)], 'rgba(47,123,232,.4)', C.acc, 1.6), 60, 52, 1.3)],
      'f:plane3': [iso(() => dot(P(-16, -10, 6), C.warn, 3) + dot(P(16, -6, 14), C.warn, 3) + dot(P(0, 12, 0), C.warn, 3), 60, 52, 1.3), iso(() => poly([P(-16, -10, 6), P(16, -6, 14), P(0, 12, 0)], 'rgba(47,123,232,.4)', C.acc, 1.6) + dot(P(-16, -10, 6), C.warn, 3) + dot(P(16, -6, 14), C.warn, 3) + dot(P(0, 12, 0), C.warn, 3), 60, 52, 1.3)],
      'i:props': [iso(() => box(-14, -10, 0, 28, 20, 14), 60, 52, 1.4), iso(() => box(-14, -10, 0, 28, 20, 14) + dot(P(0, 0, 7), C.acc, 4), 60, 52, 1.4)],
      'i:interf': [iso(() => box(-20, -10, 0, 22, 20, 14) + box(-4, -10, 0, 22, 20, 14, 'a'), 60, 52, 1.3), iso(() => box(-20, -10, 0, 22, 20, 14) + box(-4, -10, 0, 22, 20, 14, 'a') + line([P(-4, -10, 14), P(2, -10, 14), P(2, 10, 14), P(-4, 10, 14), P(-4, -10, 14)], C.warn, 2.2), 60, 52, 1.3)],
      'i:section': [iso(() => box(-16, -12, 0, 32, 24, 18), 60, 52, 1.35), iso(() => box(-16, -12, 0, 32, 24, 9) + line([P(-16, -12, 9), P(16, -12, 9), P(16, 12, 9), P(-16, 12, 9), P(-16, -12, 9)], C.warn, 2), 60, 52, 1.35)],
    });
  }
  refreshUI();                                                    // the ribbon was drawn before this file ran
})();
