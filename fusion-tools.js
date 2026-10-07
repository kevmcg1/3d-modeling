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
  const st = document.createElement('style');
  st.textContent = '.insp-tbl{width:100%;border-collapse:collapse;font-size:12px;margin:2px 0 8px}.insp-tbl th{font-weight:500;color:var(--muted);text-align:left;padding:3px 0;border-bottom:1px solid var(--rule)}'
    + '.insp-tbl td{padding:4px 0;border-bottom:1px solid var(--rule)}.insp-tbl th:last-child,.insp-tbl td:last-child{text-align:right}';
  document.head.appendChild(st);

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
    if (!(CMD && CMD.type === 'inspect')) {
      updateHint0.apply(this, arguments);
      if (S.sk && !CMD && typeof mineTool === 'function' && mineTool(S.tool)) {
        const n = S.pts.length, kb = s => `<span class="kbd">${s}</span>`;
        hintEl.innerHTML = isSlot(S.tool)
          ? `<b>${SLOT_NAME[S.tool]}:</b> ${n === 0 ? SLOT_FIRST[S.tool] : n === 1 ? `click the second end center · type ${kb('123')} for length, ${kb('Tab')} angle` : `click to set the width · or type it`}`
          : `<b>Ellipse:</b> ${n === 0 ? 'click the center' : n === 1 ? `click the end of the major axis · type ${kb('123')} for the radius` : 'click to set the minor radius · or type it'}`;
      }
      return;
    }
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
  // ═══ Batch 2: Pipe, Pattern on Path, and the Slot and Ellipse sketch tools ═══
  Object.assign(FEAT_BASE, { pipe: 'Pipe', pathpat: 'Path Pattern' });
  Object.assign(FEAT_IC, { pipe: 'pipe', pathpat: 'pathpat' });
  TOOL_FEATS.add('pipe'); BODY_MAKERS.add('pipe');
  const featDeps1 = featDeps;
  featDeps = function (f, ids) { featDeps1.apply(this, arguments); if ((f.type === 'pipe' || f.type === 'pathpat') && f.path) ids.add(f.path.sketch); };

  // picking a path: the chain of sketch curves joined to the one clicked (as Sweep does)
  const pathMove = (x, y) => {
    const e = hoverSkEnt(x, y);
    if (e) { const sk = byId(e.sketch); CMD.chainPrev = { sketch: e.sketch, ents: curveChain(sk, sk.ents.find(q => q.id === e.ent)).map(q => q.id) }; } else CMD.chainPrev = null;
    requestDraw();
  };
  const pathClick = () => {
    const h = hover3D;
    if (!h || h.kind !== 'skent') return false;
    const sk = byId(h.sketch), chain = curveChain(sk, sk.ents.find(q => q.id === h.ent));
    CMD.f.path = { sketch: sk.id, ents: chain.map(e => e.id) }; CMD.chainPrev = null;
    return true;
  };
  const pathDraw = () => {
    const f = CMD.f;
    if (f.path) strokeSkEnts(f.path.sketch, f.path.ents, COL.accent, 3.2);
    if (CMD.step === 'path' && CMD.chainPrev) strokeSkEnts(CMD.chainPrev.sketch, CMD.chainPrev.ents, COL['face-hot'], 2.6);
  };
  const pathShow = (f, id) => { const sk = byId(id); return !!sk && (sk.vis !== false || (f.path && f.path.sketch === id) || CMD.step === 'path'); };
  const pathPick = f => pf.pick('Path', f.path ? (byId(f.path.sketch) || {}).name : 'Click a sketch curve', f.path ? f.path.ents.length + ' curve' + (f.path.ents.length === 1 ? '' : 's') : '', 'path');

  FEATS.pipe = {
    label: 'Pipe', home: 'path', need: 'Pick a path.',
    init: () => ({ path: null, d: 10, shape: 'round', hollow: false, wall: 1.5, op: opDefault() }),
    ready: f => !!(f.path && f.path.ents.length),
    showSketch: pathShow,
    move(x, y) { pathMove(x, y); },
    click() { if (pathClick()) featSync(); },
    draw: pathDraw,
    panel: f => pathPick(f) + pf.seg('Section', 'shape', [['round', 'Round'], ['square', 'Square']])
      + pf.num(f.shape === 'square' ? 'Width' : 'Diameter', 'd', { len: 1, min: 0, step: isIn() ? 0.05 : 1 })
      + pf.chk('Hollow', 'hollow') + (f.hollow ? pf.num('Wall thickness', 'wall', { len: 1, min: 0, step: isIn() ? 0.01 : 0.5 }) : '') + pf.op(f)
      + pf.note('The pipe starts at the end of the path and follows it; corners are mitered. A closed path (a circle or loop) makes a ring.'),
    hint: () => 'click a curve of the path (joined curves come along), then set the size',
    sub: f => `${OP_SIGN[f.op] || ''} ${f.shape === 'square' ? '▢' : 'Ø'}${fmtLs(f.d)}${f.hollow ? ' hollow' : ''}`.trim(),
    hideSketch: f => { const sk = f.path && byId(f.path.sketch); if (sk) sk.vis = false; },
  };

  FEATS.pathpat = bodyTool({
    label: 'Pattern on Path', home: 'bodies', need: 'Pick the bodies and a path.',
    init: () => ({ bodies: [], path: null, n: 5, mode: 'even', s: 20, follow: false, flip: false, join: false }),
    ready: f => f.bodies.length > 0 && !!(f.path && f.path.ents.length),
    showSketch: pathShow,
    move(x, y) { if (CMD.step === 'path') pathMove(x, y); else hoverBody(x, y); },
    click() {
      const c = CMD;
      if (c.step === 'path') { if (pathClick()) { if (!c.f.bodies.length) c.step = 'bodies'; featSync(); } return; }
      const h = hover3D;
      if (h && h.kind === 'bbody') { toggleIn(c.f.bodies, h.body); if (!c.f.path) c.step = 'path'; featSync(); }
    },
    bodyClick(id) { if (CMD.step === 'path') return; toggleIn(CMD.f.bodies, id); if (!CMD.f.path) CMD.step = 'path'; featSync(); },
    draw: pathDraw,
    panel: f => pf.pick('Bodies', f.bodies.length ? f.bodies.map(id => bodyNames()[id] || 'Body').join(', ') : 'Click bodies', f.bodies.length || '', 'bodies') + pathPick(f)
      + pf.seg('Spacing', 'mode', [['even', 'Evenly along the path'], ['space', 'Fixed distance']])
      + (f.mode === 'space' ? `<div class="row2">${pf.num('Count', 'n', { int: 1, min: 2 })}${pf.num('Distance', 's', { len: 1, min: 0 })}</div>` : pf.num('Count (with the original)', 'n', { int: 1, min: 2 }))
      + pf.chk('Turn the copies to follow the path', 'follow') + pf.chk('Start from the other end', 'flip') + pf.chk('Join copies to the originals', 'join')
      + pf.note('Copies move from where the path starts. The bodies do not have to sit on the path: they keep their offset from it.'),
    hint: c => c.step === 'path' ? 'click a curve of the path' : 'click the bodies to copy',
    sub: f => '× ' + f.n,
  });

  // little icons, help and the ribbon
  Object.assign(IC, {
    pipe: '<path d="M3 14c3 0 3-8 7-8s4 8 7 8" opacity=".55"/><path d="M3 12c3 0 3-8 7-8s4 8 7 8M3 16c3 0 3-8 7-8s4 8 7 8"/>',
    pathpat: '<path d="M2.5 15c3-8 12-8 15 0" opacity=".5" stroke-dasharray="2 1.6"/><rect x="2.5" y="12.5" width="3" height="3" rx=".5"/><rect x="8.5" y="7.5" width="3" height="3" rx=".5"/><rect x="14.5" y="12.5" width="3" height="3" rx=".5"/>',
    slot: '<rect x="2.5" y="6.5" width="15" height="7" rx="3.5"/><path d="M6 10h.01M14 10h.01"/>',
    ellipse: '<ellipse cx="10" cy="10" rx="7.5" ry="4.6"/><path d="M10 10h.01"/>',
  });
  Object.assign(FA_MAP, { pipe: 'water', pathpat: 'route', slot: 'capsules', ellipse: 'regular/circle' });
  Object.assign(MENU_IC, { 'f:pipe': 'pipe', 'f:pathpat': 'pathpat' });
  TB_MENUS.create.push(['f:pipe', 'Pipe', '']);
  TB_MENUS.pattern.push(['f:pathpat', 'Pattern on Path', '']);
  const rbAppend = (h, title, items) => {
    const key = `</div><div class="rb-title">${title}</div>`, i = h.indexOf(key);
    return i < 0 ? h : h.slice(0, i) + `<div class="rb-col">${items.map(it => rbBtn('data-act', it, 'sm')).join('')}</div>` + h.slice(i);
  };
  const modelToolbar1 = modelToolbarHTML;
  modelToolbarHTML = function () {
    let h = modelToolbar1.apply(this, arguments);
    h = rbAppend(h, 'Create', [['f:pipe', 'Pipe', '', 'pipe', cmdIs('pipe')]]);
    return rbAppend(h, 'Pattern', [['f:pathpat', 'On Path', '', 'pathpat', cmdIs('pathpat')]]);
  };
  const SLOT_NAME = { slot: 'Slot', slotov: 'Overall Slot', slotcp: 'Center Point Slot' }, SLOT_FIRST = { slot: 'click the first end center', slotov: 'click one outer end', slotcp: 'click the center of the slot' };
  Object.assign(IC, { slotov: '<rect x="2.5" y="6.5" width="15" height="7" rx="3.5"/><path d="M2.5 3.5v3M17.5 3.5v3M2.5 5h15" opacity=".6"/>', slotcp: '<rect x="2.5" y="6.5" width="15" height="7" rx="3.5"/><path d="M10 8v4M8 10h4" opacity=".8"/>' });
  Object.assign(FA_MAP, { slotov: 'grip-lines', slotcp: 'bullseye' });
  Object.assign(TIP_TXT, {
    slotov: ['A slot measured by its outer ends.', ['Click one outer end.', 'Click the other outer end.', 'Click to set the width (or type it).']],
    slotcp: ['A slot from its center.', ['Click the center of the slot.', 'Click the center of one end.', 'Click to set the width (or type it).']],
    'f:pipe': ['A round or square tube along a sketch path, solid or hollow.', ['Click a sketch curve; joined curves come along.', 'Pick round or square, the size, and a wall if hollow.', 'Choose New body, Join or Cut, then OK.']],
    'f:pathpat': ['Repeat bodies along a sketch path.', ['Click the bodies to copy.', 'Click the path.', 'Set the count (or a fixed distance) and OK.']],
    slot: ['A slot: two round ends joined by straight sides.', ['Click the first end center.', 'Click the second end center (or type the length).', 'Click to set the width (or type it).']],
    ellipse: ['An ellipse from its center and two radii.', ['Click the center.', 'Click the end of the long axis (or type the radius).', 'Click to set the short radius.']],
  });
  Object.assign(TOOL_HELP, {
    slot: 'Click the two end centers, then the width. Type a length and angle, then the width.',
    slotov: 'Click the two outer ends, then the width.', slotcp: 'Click the center of the slot, then the center of one end, then the width.',
    ellipse: 'Click the center, the end of the major axis, then a point for the minor radius. Drawn as exact-fit arcs, so it extrudes and machines like any other profile.',
  });
  if (typeof TipArt !== 'undefined' && typeof TIP_ART !== 'undefined') {
    const { C, at, P, poly, line, box, arrow, dot, ell, cyl, sk, grid } = TipArt;
    const iso = (f, ox = 60, oy = 48, s = 1.55) => () => { at(ox, oy, s); return f(); };
    const k2 = f => () => grid() + f();
    const wave = z => [P(-24, -6, z), P(-12, 8, z), P(0, -6, z), P(12, 8, z), P(24, -6, z)];
    Object.assign(TIP_ART, {
      'f:pipe': [iso(() => line(wave(4), C.path, 1.6, 'stroke-dasharray="3 2"'), 60, 52, 1.3), iso(() => line(wave(4), C.acc, 7) + line(wave(4), '#dfe9fb', 3.2), 60, 52, 1.3)],
      'f:pathpat': [iso(() => line([P(-24, 6, 0), P(-8, -8, 0), P(8, -8, 0), P(24, 6, 0)], C.path, 1.4, 'stroke-dasharray="3 2"') + box(-28, 2, 0, 8, 8, 8, 'a'), 60, 52, 1.3), iso(() => line([P(-24, 6, 0), P(-8, -8, 0), P(8, -8, 0), P(24, 6, 0)], C.path, 1.4, 'stroke-dasharray="3 2"') + box(-28, 2, 0, 8, 8, 8, 'a') + box(-12, -12, 0, 8, 8, 8, 'a') + box(4, -12, 0, 8, 8, 8, 'a') + box(20, 2, 0, 8, 8, 8, 'a'), 60, 52, 1.3)],
      slotov: [k2(() => dot([30, 45]) + dot([90, 45])), k2(() => sk('M39,36 H81 A9,9 0 0 1 81,54 H39 A9,9 0 0 1 39,36 Z') + dot([30, 45], C.dim) + dot([90, 45], C.dim))],
      slotcp: [k2(() => dot([60, 45]) + dot([88, 45])), k2(() => sk('M32,36 H88 A9,9 0 0 1 88,54 H32 A9,9 0 0 1 32,36 Z') + dot([60, 45], C.dim) + dot([88, 45], C.dim))],
      slot: [k2(() => dot([36, 45]) + dot([84, 45])), k2(() => sk('M36,36 H84 A9,9 0 0 1 84,54 H36 A9,9 0 0 1 36,36 Z') + dot([36, 45], C.dim) + dot([84, 45], C.dim))],
      ellipse: [k2(() => dot([60, 45]) + dot([88, 45])), k2(() => sk('M60,45 m-28,0 a28,17 0 1,0 56,0 a28,17 0 1,0 -56,0') + dot([60, 45], C.dim) + dot([88, 45], C.dim))],
    });
  }

  // ── Sketch: Slot and Ellipse (made of lines and arcs, so everything downstream works on them) ──
  const arcEnt = (c, r, a0, a1) => ({ type: 'arc', c: cp2(c), r, a0, a1 });
  function slotEnts(c1, c2, w) {
    const L = dst2(c1, c2), r = w / 2;
    if (L < 1e-9 || !(r > 1e-9)) return null;
    const th = ang2(c1, c2), nx = -Math.sin(th) * r, ny = Math.cos(th) * r;
    return [{ type: 'line', a: P2(c1.x + nx, c1.y + ny), b: P2(c2.x + nx, c2.y + ny) }, arcEnt(c2, r, th - Math.PI / 2, th + Math.PI / 2),
      { type: 'line', a: P2(c2.x - nx, c2.y - ny), b: P2(c1.x - nx, c1.y - ny) }, arcEnt(c1, r, th + Math.PI / 2, th + 3 * Math.PI / 2)];
  }
  // an ellipse as 16 arcs, each through three points of the true curve;
  // within 0.3% of the exact curve and 0.05% of its area for axis ratios up to 3:1
  function ellipseEnts(c, m, p) {
    const a = dst2(c, m), th = ang2(c, m);
    if (a < 1e-9) return null;
    const u = nrm2(sub2(m, c)), q = sub2(p, c), b = Math.abs(u.x * q.y - u.y * q.x);
    if (b < 1e-9) return null;
    if (Math.abs(a - b) < 1e-9 * a) return [{ type: 'circle', c: cp2(c), r: a }];
    const at = t => P2(c.x + a * Math.cos(t) * Math.cos(th) - b * Math.sin(t) * Math.sin(th), c.y + a * Math.cos(t) * Math.sin(th) + b * Math.sin(t) * Math.cos(th));
    const out = [], cuts = [0, 0.25, 0.5, 0.75, 1];
    for (let k = 0; k < 4; k++) for (let i = 0; i < 4; i++) {
      const t0 = (k + cuts[i]) * Math.PI / 2, t1 = (k + cuts[i + 1]) * Math.PI / 2, g = arcThrough(at(t0), at((t0 + t1) / 2), at(t1));
      if (!g) return null;
      out.push({ type: 'arc', c: cp2(g.c), r: g.r, a0: g.a0, a1: g.a1 });
    }
    return out;
  }
  const slotWidth = p => { const c1 = S.pts[0], u = nrm2(sub2(S.pts[1], c1)), q = sub2(p, c1); return 2 * Math.abs(u.x * q.y - u.y * q.x); };
  const isSlot = t => t === 'slot' || t === 'slotov' || t === 'slotcp';
  const mineTool = t => isSlot(t) || t === 'ellipse';
  // the three slot flavors differ only in what the first two clicks mean
  function slotFor(t, pts, w) {
    const [p, q] = pts, r = w / 2;
    if (t === 'slotcp') return slotEnts(sub2(mul2(p, 2), q), q, w);                         // slot center, then an end center
    if (t === 'slotov') { const L = dst2(p, q); if (L <= w + 1e-9) return null; const u = nrm2(sub2(q, p)); return slotEnts(add2(p, mul2(u, r)), sub2(q, mul2(u, r)), w); }   // the two outer ends
    return slotEnts(p, q, w);
  }
  const sideOf = (a, b, p) => { const u = sub2(b, a), q = sub2(p, a); return (u.x * q.y - u.y * q.x) < 0 ? -1 : 1; };
  const toolClick0 = toolClick;
  toolClick = function (p) {
    const t = S.tool;
    if (!mineTool(t)) return toolClick0.apply(this, arguments);
    if (S.pts.length < 2) { if (S.pts.length === 1 && dst2(S.pts[0], p) < 1e-9) return; S.pts.push(p); resetDim(); return; }
    const ents = isSlot(t) ? slotFor(t, S.pts, slotWidth(p)) : ellipseEnts(S.pts[0], S.pts[1], p);
    if (!ents) return;
    pushUndo(isSlot(t) ? 'Slot' : 'Ellipse'); addEnts(ents); S.pts = []; resetDim();
  };
  const dimSpec0 = dimSpec;
  dimSpec = function () {
    const t = S.tool, n = S.pts.length;
    if (!mineTool(t)) return dimSpec0.apply(this, arguments);
    if (n === 1) return isSlot(t) ? ['Length', 'Angle°'] : ['Major radius', 'Angle°'];
    return n === 2 ? [isSlot(t) ? 'Width' : 'Minor radius'] : null;
  };
  const applyDims0 = applyDims;
  applyDims = function (p) {
    const t = S.tool;
    if (!mineTool(t) || !S.dim || !S.pts.length) return applyDims0.apply(this, arguments);
    const a = S.pts[0], v0 = dimVal(0), v1 = dimVal(1);
    if (S.pts.length === 1) {
      const d = sub2(p, a); let L = len2(d), th = Math.atan2(d.y, d.x);
      if (v1 !== null) { th = v1 * Math.PI / 180; L = Math.max(0, dot2(d, P2(Math.cos(th), Math.sin(th)))); }
      if (v0 !== null) L = Math.abs(v0);
      return add2(a, P2(Math.cos(th) * L, Math.sin(th) * L));
    }
    if (v0 === null) return p;
    const u = nrm2(sub2(S.pts[1], a)), sd = sideOf(a, S.pts[1], p), h = (isSlot(t) ? Math.abs(v0) / 2 : Math.abs(v0)) * sd;
    return add2(a, P2(-u.y * h, u.x * h));
  };
  const drawToolPreview0 = drawToolPreview;
  drawToolPreview = function () {
    drawToolPreview0.apply(this, arguments);
    const t = S.tool, c = S.cur;
    if (!mineTool(t) || !c || !S.pts.length) return;
    const m = planeXf(planeOf(S.sk)), mouse = S.mouse || P2(0, 0), pv = e => strokeEnt(m, e, COL.accent, 1.6, [5, 4]);
    const p0 = S.pts[0];
    if (S.pts.length === 1) { pv({ type: 'line', a: p0, b: c }); label((isSlot(t) ? 'Length ' : 'R ') + fmtLs(dst2(p0, c)), mouse.x + 16, mouse.y - 12); }
    else {
      const ents = isSlot(t) ? slotFor(t, [p0, S.pts[1]], slotWidth(c)) : ellipseEnts(p0, S.pts[1], c);
      if (ents) ents.forEach(pv);
      pv({ type: 'line', a: p0, b: S.pts[1] });
      label(isSlot(t) ? 'Width ' + fmtLs(slotWidth(c)) : `${fmtLs(dst2(p0, S.pts[1]))} × ${fmtLs(2 * Math.abs((() => { const u = nrm2(sub2(S.pts[1], p0)), q = sub2(c, p0); return u.x * q.y - u.y * q.x; })()))}`, mouse.x + 16, mouse.y - 12);
    }
    og.fillStyle = COL.accent;
    for (const p of S.pts) { const s = xfPt(m, p); og.beginPath(); og.arc(s.x, s.y, 3, 0, TAU); og.fill(); }
  };
  SKETCH_TOOLS[0].push(['slot', 'Slot', ''], ['slotov', 'Overall Slot', ''], ['slotcp', 'Center Slot', ''], ['ellipse', 'Ellipse', '']);
  const sketchRibbon0 = sketchRibbonHTML;
  sketchRibbonHTML = function () {
    const T = (a, l, k) => [a, l, k, a, S.tool === a];
    return rbAppend(sketchRibbon0.apply(this, arguments), 'Create', [T('slot', 'Slot', ''), T('slotov', 'Overall Slot', ''), T('slotcp', 'Center Slot', ''), T('ellipse', 'Ellipse', '')]);
  };

  // ═══ Batch 3: Rib / Web and the Spline sketch tool ═══
  Object.assign(FEAT_BASE, { rib: 'Rib' });
  Object.assign(FEAT_IC, { rib: 'rib' });
  TOOL_FEATS.add('rib'); BODY_MAKERS.add('rib');
  const featDeps2 = featDeps;
  featDeps = function (f, ids) { featDeps2.apply(this, arguments); if (f.type === 'rib') for (const c of f.chains || []) ids.add(c.sketch); };

  // Rib: click sketch curves one after another; each click takes the chain of curves joined to it (click again to drop it)
  FEATS.rib = {
    label: 'Rib / Web', home: 'chains', need: 'Pick the sketch curves for the rib.',
    init: () => ({ chains: [], t: 3, dist: 15, mode: 'one', extent: 'dist', op: opDefault() }),
    ready: f => f.chains.length > 0,
    showSketch: (f, id) => { const sk = byId(id); return !!sk && (sk.vis !== false || f.chains.some(c => c.sketch === id) || CMD.step === 'chains'); },
    start() { CMD.step = 'chains'; },
    move(x, y) {
      const e = hoverSkEnt(x, y);
      if (e) { const sk = byId(e.sketch); CMD.chainPrev = { sketch: e.sketch, ents: curveChain(sk, sk.ents.find(q => q.id === e.ent)).map(q => q.id) }; } else CMD.chainPrev = null;
      requestDraw();
    },
    click() {
      const h = hover3D, f = CMD.f;
      if (!h || h.kind !== 'skent') return;
      const sk = byId(h.sketch), chain = curveChain(sk, sk.ents.find(q => q.id === h.ent)).map(e => e.id), i = f.chains.findIndex(c => c.sketch === sk.id && c.ents.includes(h.ent));
      if (i >= 0) f.chains.splice(i, 1); else f.chains.push({ sketch: sk.id, ents: chain });
      featSync();
    },
    draw() {
      for (const c of CMD.f.chains) strokeSkEnts(c.sketch, c.ents, COL.accent, 3.2);
      if (CMD.chainPrev) strokeSkEnts(CMD.chainPrev.sketch, CMD.chainPrev.ents, COL['face-hot'], 2.6);
    },
    panel: f => pf.pick('Curves', f.chains.length ? f.chains.length + ' chain' + (f.chains.length > 1 ? 's' : '') + ' picked' : 'Click open or closed sketch curves', f.chains.length || '', 'chains')
      + (f.chains.length ? '<div class="btns"><button class="btn" data-fdo="clear">Clear curves</button></div>' : '')
      + pf.num('Thickness', 't', { len: 1, min: 0, step: isIn() ? 0.01 : 0.5 })
      + pf.seg('Height', 'extent', [['dist', 'Distance'], ['all', 'Through all']])
      + (f.extent === 'all' ? '' : pf.num('Distance', 'dist', { len: 1, step: isIn() ? 0.05 : 1 }) + pf.seg('Direction', 'mode', [['one', 'One side'], ['sym', 'Symmetric']]))
      + pf.op(f)
      + pf.note('Each curve becomes a thin wall standing square to the sketch plane. Pick several curves for a web. The ends are flat and the wall does not fit itself to the part, so set the height to reach the walls it should join.'),
    act: { clear() { CMD.f.chains = []; featSync(); } },
    hint: () => 'click the sketch curves for the rib (joined curves come along); click again to drop one',
    sub: f => `${OP_SIGN[f.op] || ''} ${fmtLs(f.t)} × ${f.extent === 'all' ? 'all' : fmtLs(Math.abs(f.dist))}`.trim(),
    hideSketch: f => { for (const c of f.chains) { const sk = byId(c.sketch); if (sk) sk.vis = false; } },
  };
  Object.assign(IC, {
    rib: '<path d="M3 16h14" opacity=".5"/><path d="M5 16V8l10 8V8" /><path d="M5 8h2M13 8h2" opacity=".6"/>',
    spline: '<path d="M2.5 14C5 6 8 6 10 10s5 4 7.5-4"/><circle cx="2.5" cy="14" r="1.2"/><circle cx="10" cy="10" r="1.2"/><circle cx="17.5" cy="6" r="1.2"/>',
  });
  Object.assign(FA_MAP, { rib: 'grip-lines-vertical', spline: 'bezier-curve' });
  Object.assign(MENU_IC, { 'f:rib': 'rib' });
  TB_MENUS.create.push(['f:rib', 'Rib / Web', '']);
  const modelToolbar2 = modelToolbarHTML;
  modelToolbarHTML = function () { return rbAppend(modelToolbar2.apply(this, arguments), 'Create', [['f:rib', 'Rib / Web', '', 'rib', cmdIs('rib')]]); };
  Object.assign(TIP_TXT, {
    'f:rib': ['A thin wall from open sketch curves: a stiffening rib, or several for a web.', ['Click the sketch curves (joined curves come along).', 'Set the thickness and the height.', 'Choose Join, then OK.']],
    spline: ['A smooth curve through the points you click.', ['Click the points it passes through.', 'Click the first point again to close it; Enter or right-click to finish.']],
  });
  Object.assign(TOOL_HELP, { spline: 'Click the points the curve passes through. Click the first point to close it, or press Enter or right-click to finish. The curve is stored as a chain of arcs, so it extrudes, trims and machines like any other profile; it cannot be reshaped by dragging points afterward.' });
  if (typeof TipArt !== 'undefined' && typeof TIP_ART !== 'undefined') {
    const { C, at, P, poly, line, box, dot, sk, grid } = TipArt;
    const iso = (f, ox = 60, oy = 48, s = 1.55) => () => { at(ox, oy, s); return f(); };
    const k2 = f => () => grid() + f();
    Object.assign(TIP_ART, {
      'f:rib': [iso(() => box(-24, -14, 0, 48, 28, 6) + line([P(-20, 0, 6), P(20, 0, 6)], C.sk, 2.4), 60, 56, 1.3), iso(() => box(-24, -14, 0, 48, 28, 6) + box(-20, -1.5, 6, 40, 3, 16, 'a'), 60, 56, 1.3)],
      spline: [k2(() => dot([22, 62]) + dot([52, 30]) + dot([80, 56]) + dot([100, 30])), k2(() => sk('M22,62 C34,22 44,20 52,30 S70,66 80,56 S92,24 100,30') + dot([22, 62], C.dim) + dot([52, 30], C.dim) + dot([80, 56], C.dim) + dot([100, 30], C.dim))],
    });
  }

  // ═══ Batch 4: Boundary Fill ═══
  Object.assign(FEAT_BASE, { bfill: 'Boundary Fill' });
  Object.assign(FEAT_IC, { bfill: 'bfill' });
  FEATS.bfill = bodyTool({
    label: 'Boundary Fill', need: 'Pick the bodies that surround the space.',
    init: () => ({ bodies: [], remove: false }),
    panel: f => bodyPickPanel(f, 'bodies', 'Bodies around the space') + pf.chk('Remove the picked bodies', 'remove')
      + pf.note('Every closed space the bodies leave between them, or inside one of them, becomes a new body: a mold cavity, a core, the air in a housing. Bodies that only touch need to overlap a little to seal the space. An open space is not filled.'),
    hint: () => 'click the bodies that surround the space (the tree rows work too)',
    sub: f => f.remove ? 'removes tools' : '',
  });
  Object.assign(IC, { bfill: '<rect x="2.5" y="3.5" width="15" height="13" rx="1"/><rect x="6.5" y="7.5" width="7" height="5" rx=".5" opacity=".6"/>' });
  Object.assign(FA_MAP, { bfill: 'fill-drip' });
  Object.assign(MENU_IC, { 'f:bfill': 'bfill' });
  TB_MENUS.create.push(['f:bfill', 'Boundary Fill', '']);
  const modelToolbar3 = modelToolbarHTML;
  modelToolbarHTML = function () { return rbAppend(modelToolbar3.apply(this, arguments), 'Create', [['f:bfill', 'Boundary Fill', '', 'bfill', cmdIs('bfill')]]); };
  Object.assign(TIP_TXT, {
    'f:bfill': ['Turn the closed space between bodies into a body of its own.', ['Click the bodies that surround the space.', 'Tick Remove the picked bodies to keep only the new body.', 'Click OK.']],
  });
  if (typeof TipArt !== 'undefined' && typeof TIP_ART !== 'undefined') {
    const { C, at, P, box } = TipArt;
    const iso = (f, ox = 60, oy = 48, s = 1.55) => () => { at(ox, oy, s); return f(); };
    const shell = () => box(-22, -14, 0, 44, 28, 4) + box(-22, -14, 20, 44, 28, 4) + box(-22, -14, 4, 6, 28, 16) + box(16, -14, 4, 6, 28, 16);
    Object.assign(TIP_ART, { 'f:bfill': [iso(shell, 60, 54, 1.25), iso(() => shell() + box(-16, -14, 4, 32, 28, 16, 'a'), 60, 54, 1.25)] });
  }

  // ── Sketch: Spline (fit points; stored as a chain of arcs through points of a Catmull-Rom curve) ──
  const SPLINE_SUB = 2;                                              // arcs per span between two fit points
  function splineEnts(pts, closed) {
    const n = pts.length, ents = [];
    if (n < 2) return ents;
    const P = i => pts[closed ? (i + n) % n : clamp(i, 0, n - 1)];
    const tan = i => (closed || (i > 0 && i < n - 1)) ? mul2(sub2(P(i + 1), P(i - 1)), 0.5) : (i === 0 ? sub2(P(1), P(0)) : sub2(P(n - 1), P(n - 2)));
    const spans = closed ? n : n - 1;
    for (let i = 0; i < spans; i++) {
      const p0 = P(i), p1 = P(i + 1), m0 = tan(i), m1 = tan(i + 1), span = dst2(p0, p1);
      const h = t => { const t2 = t * t, t3 = t2 * t; return add2(add2(mul2(p0, 2 * t3 - 3 * t2 + 1), mul2(m0, t3 - 2 * t2 + t)), add2(mul2(p1, -2 * t3 + 3 * t2), mul2(m1, t3 - t2))); };
      for (let k = 0; k < SPLINE_SUB; k++) {
        const t0 = k / SPLINE_SUB, t1 = (k + 1) / SPLINE_SUB, a = k === 0 ? p0 : h(t0), b = k === SPLINE_SUB - 1 ? p1 : h(t1), mid = h((t0 + t1) / 2), g = arcThrough(a, mid, b);
        if (!g || g.r > span * 1e4) ents.push({ type: 'line', a: cp2(a), b: cp2(b) });
        else ents.push({ type: 'arc', c: cp2(g.c), r: g.r, a0: g.a0, a1: g.a1 });
      }
    }
    return ents;
  }
  // the spline rides on the polyline tool's clicking and finishing (Enter, double-click, right-click, Esc), flagged by S.spline
  const setTool0 = setTool;
  setTool = function (t) {
    if (t === 'spline') { setTool0('polyline'); S.spline = true; refreshToolbar(); updateHint(); requestDraw(); return; }
    const r = setTool0.apply(this, arguments);                      // (leaving the tool finishes a spline in progress first)
    S.spline = false;
    return r;
  };
  const polyFinish0 = polyFinish;
  polyFinish = function () {
    if (!(S.spline && S.tool === 'polyline')) return polyFinish0.apply(this, arguments);
    const pts = (S.poly || []).filter((p, i, a) => !i || dst2(p, a[i - 1]) > 1e-9);
    S.poly = null; S.pts = []; S.chainStart = null;
    const closed = pts.length >= 4 && dst2(pts[0], pts[pts.length - 1]) < 1e-9;
    if (closed) pts.pop();
    if (pts.length >= 2) { pushUndo('Spline'); addEnts(splineEnts(pts, closed)); }
    resetDim(); updateHint(); requestDraw();
  };
  const drawToolPreview1 = drawToolPreview;
  drawToolPreview = function () {
    if (!(S.spline && S.tool === 'polyline')) return drawToolPreview1.apply(this, arguments);
    const t = S.tool;
    S.tool = 'spline';                                               // so the plain polyline preview stays out of the way
    try { drawToolPreview1.apply(this, arguments); } finally { S.tool = t; }
    if (!S.poly || !S.poly.length) return;
    const m = planeXf(planeOf(S.sk)), pts = S.poly.concat(S.cur && dst2(S.cur, S.poly[S.poly.length - 1]) > 1e-9 ? [S.cur] : []);
    for (const e of splineEnts(pts, false)) strokeEnt(m, e, COL.accent, 1.6, [5, 4]);
    og.fillStyle = COL.accent;
    for (const p of S.poly) { const s = xfPt(m, p); og.beginPath(); og.arc(s.x, s.y, 3, 0, TAU); og.fill(); }
  };
  const updateHint2 = updateHint;
  updateHint = function () {
    updateHint2.apply(this, arguments);
    if (S.sk && !CMD && S.spline && S.tool === 'polyline') {
      const kb = s => `<span class="kbd">${s}</span>`;
      hintEl.innerHTML = `<b>Spline:</b> ${S.poly && S.poly.length ? `click the next point · click the first point to close · ${kb('Enter')} or right-click to finish` : 'click the first point'}`;
    }
  };
  SKETCH_TOOLS[0].push(['spline', 'Spline', '']);
  const sketchRibbon1 = sketchRibbonHTML;
  sketchRibbonHTML = function () {
    let h = sketchRibbon1.apply(this, arguments);
    if (S.spline && S.tool === 'polyline') {                         // the Polyline button is not the active one in spline mode
      const i = h.indexOf('data-act="polyline"'), j = h.lastIndexOf('<button', i);
      if (i > 0 && j >= 0) h = h.slice(0, j) + h.slice(j, i).replace(/\bon\b/, '') + h.slice(i);
    }
    return rbAppend(h, 'Create', [['spline', 'Spline', '', 'spline', !!(S.spline && S.tool === 'polyline')]]);
  };

  refreshUI();                                                    // the ribbon was drawn before this file ran
})();
