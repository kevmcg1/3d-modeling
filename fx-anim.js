// ═══════════════════════════════════════════════════════════════════
//  Feature animation. When an operation changes the model, the change plays instead of popping in or out:
//    Extrude, Hole, Sweep, Loft, Coil   the new material grows along its direction (a clipping plane sweeps; the old shape is ahead of it)
//    Revolve                            the profile turns: a wedge sweeps round the axis and the new material fills in behind it
//    everything else (fillet, chamfer, shell, pattern, mirror, combine, move ...)   the old shape dissolves into the new one
//    a body hidden, deleted, shown or restored  dissolves out or builds back in
//  It hooks the one place every change passes through (applyModel), compares the bodies before and after, and plays the difference on
//  copies while the real meshes wait, so the model itself is never in a half state. Off for reduced motion; window.DATUM_NOFX = true
//  turns it off for scripts and tests.
// ═══════════════════════════════════════════════════════════════════
const FEATFX = (() => {
  const st = { docRef: null, feats: null, run: null, count: 0 };
  const ease = u => u * u * (3 - 2 * u);
  const off = () => window.DATUM_NOFX === true || (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
  const sigOf = (b, mesh) => { let faces = 0; try { faces = new Set(mesh.triF).size; } catch (e) { /* no face ids */ } return b.id + '|' + b.bb.map(v => v.toFixed(3)).join(',') + '|' + faces + '|' + mesh.pos.length; };
  // the same shape retessellated for the zoom keeps its box and its faces; a real change does not
  const shapeSig = (b, mesh) => { let faces = 0; try { faces = new Set(mesh.triF).size; } catch (e) { /* no face ids */ } return b.id + '|' + b.bb.map(v => v.toFixed(3)).join(',') + '|' + faces; };
  const featSnap = () => new Map(doc.features.map((f, i) => [f.id, { i, j: JSON.stringify(f), type: f.type, f }]));

  function finish() {
    const R = st.run; if (!R) return; st.run = null;
    scene.remove(R.group); R.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    for (const g of R.hidden) g.visible = true;
    requestDraw();
  }
  // which feature the change belongs to: the last one added or edited
  function changedFeature(now) {
    let best = null;
    for (const [id, e] of now) { const was = st.feats.get(id); if (!was || was.j !== e.j) if (!best || e.i > best.i) best = e; }
    return best;
  }
  const wrapMats = (grp, f) => grp.traverse(o => { if (o.material) f(o.material, o); });
  const asB = e => ({ id: e.body.id, mesh: e.mesh, bb: e.body.bb });                 // what buildBodyMesh reads

  function start(prev, next, feat, ctx) {
    finish();
    const pm = new Map(prev.map(p => [p.body.id, p])), nm = new Map(next.map(n => [n.body.id, n]));
    const added = next.filter(n => !pm.has(n.body.id)), gone = prev.filter(p => !nm.has(p.body.id));
    const changed = next.filter(n => pm.has(n.body.id) && shapeSig(n.body, n.mesh) !== shapeSig(pm.get(n.body.id).body, pm.get(n.body.id).mesh));
    const newOnes = [...added, ...changed], oldOnes = [...gone, ...changed.map(c => pm.get(c.body.id))];
    if (!newOnes.length && !oldOnes.length) return;
    const type = feat ? feat.type : null, group = new THREE.Group(); group.name = 'fx';
    const hidden = []; for (const n of newOnes) { if (n.group.visible) { n.group.visible = false; hidden.push(n.group); } }
    renderer.localClippingEnabled = true;
    const R = { group, hidden, t0: performance.now(), mode: 'fade', dur: 650, glows: [], planes: null };
    let mode = 'fade';
    if (feat && (type === 'extrude' || type === 'hole' || type === 'sweep' || type === 'loft' || type === 'coil') && (added.length || changed.length)) mode = 'linear';
    if (feat && type === 'revolve' && (added.length || changed.length)) mode = 'angular';
    R.mode = mode;
    const oldFaces = e => e && e.mesh && e.mesh.triF ? new Set(e.mesh.triF) : null;
    if (mode === 'linear') {
      let d = [0, 1, 0], s0, s1; const ex = ctx && ctx.ext && ctx.ext[feat.f.id];
      if (type === 'extrude' && ex && ex.plane) {
        const base = dot3(ex.plane.o, ex.plane.n);
        if ((feat.f.dist || 0) < 0 && feat.f.mode !== 'sym') { d = neg3(ex.plane.n); s0 = -(base + ex.z1); s1 = -(base + ex.z0); } else { d = ex.plane.n; s0 = base + ex.z0; s1 = base + ex.z1; }
      } else {
        if (type === 'hole') d = [0, -1, 0];
        else {                                                                           // along the longest side of what changed
          let lo3 = [Infinity, Infinity, Infinity], hi3 = [-Infinity, -Infinity, -Infinity];
          for (const n of newOnes) for (let k = 0; k < 3; k++) { lo3[k] = Math.min(lo3[k], n.body.bb[k]); hi3[k] = Math.max(hi3[k], n.body.bb[k + 3]); }
          const ext3 = hi3.map((v, k) => v - lo3[k]), ax = ext3.indexOf(Math.max(...ext3)); d = [0, 0, 0]; d[ax] = 1;
        }
        let lo = Infinity, hi = -Infinity;
        for (const m of [...newOnes, ...oldOnes]) { const bb = m.body.bb; for (let k = 0; k < 8; k++) { const p = [bb[k & 1 ? 3 : 0], bb[k & 2 ? 4 : 1], bb[k & 4 ? 5 : 2]], s = dot3(p, d); lo = Math.min(lo, s); hi = Math.max(hi, s); } }
        s0 = lo; s1 = hi;
      }
      const pad = Math.max(0.05, (s1 - s0) * 0.01); s0 -= pad; s1 += pad;
      const D = new THREE.Vector3(d[0], d[1], d[2]).normalize(), behind = new THREE.Plane(D.clone().negate(), s0), ahead = new THREE.Plane(D.clone(), -s0);
      for (const n of newOnes) { const o = pm.get(n.body.id), g = buildBodyMesh(asB(n), [behind], true, o ? oldFaces(o) : null); R.glows.push(g.userData.mat); group.add(g); }
      for (const o of oldOnes) group.add(buildBodyMesh(asB(o), [ahead]));
      R.s0 = s0; R.s1 = s1; R.behind = behind; R.ahead = ahead; R.dur = Math.min(1500, Math.max(650, 420 + Math.abs(s1 - s0) * 6));
    } else if (mode === 'angular') {
      const ax = resolveAxis(feat.f.axis, ctx), p = new THREE.Vector3(...ax.p), a = new THREE.Vector3(...ax.dir).normalize();
      const r0 = Math.abs(a.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0); r0.sub(a.clone().multiplyScalar(r0.dot(a))).normalize();
      const t0v = new THREE.Vector3().crossVectors(a, r0);
      // where the new material lies round the axis: sort the angles of its vertices and start after the widest empty gap
      const angs = []; const step = 3;
      for (const n of newOnes) { const P = n.mesh.pos; for (let i = 0; i < P.length; i += 9 * step) { const v = new THREE.Vector3(P[i] - p.x, P[i + 1] - p.y, P[i + 2] - p.z); v.sub(a.clone().multiplyScalar(v.dot(a))); if (v.length() > 1e-6) angs.push(Math.atan2(v.dot(t0v), v.dot(r0))); } }
      angs.sort((x, y) => x - y);
      let gap = -1, gi = 0; for (let i = 0; i < angs.length; i++) { const nx = i + 1 < angs.length ? angs[i + 1] : angs[0] + 2 * Math.PI, g = nx - angs[i]; if (g > gap) { gap = g; gi = i; } }
      const full = gap < 0.35, start = angs.length ? (full ? angs[0] : angs[(gi + 1) % angs.length]) : 0, span = full ? 2 * Math.PI : 2 * Math.PI - gap;
      R.axis = { p, a, r0, t0v, start, span, full };
      R.angPlanes = { P0: new THREE.Plane(), Pt: new THREE.Plane(), N0: new THREE.Plane(), Nt: new THREE.Plane() };
      const { P0, Pt, N0, Nt } = R.angPlanes;
      for (const n of newOnes) { const o = pm.get(n.body.id), g = buildBodyMesh(asB(n), [P0, Pt], true, o ? oldFaces(o) : null); R.glows.push(g.userData.mat); group.add(g); R.newGroups = (R.newGroups || []).concat(g); }
      for (const o of oldOnes) { const g = buildBodyMesh(asB(o), [N0, Nt]); group.add(g); R.oldGroups = (R.oldGroups || []).concat(g); }
      R.dur = 1100;
    } else {                                                                              // fade: the old shape dissolves into the new
      for (const n of newOnes) { const g = buildBodyMesh(asB(n), null, false, null); wrapMats(g, m => { m.transparent = true; m.opacity = 0; m.depthWrite = false; }); group.add(g); R.fadeIn = (R.fadeIn || []).concat(g); }
      for (const o of oldOnes) { const g = buildBodyMesh(asB(o), null); wrapMats(g, m => { m.transparent = true; m.opacity = 1; m.depthWrite = false; }); group.add(g); R.fadeOut = (R.fadeOut || []).concat(g); }
      R.dur = 600;
    }
    scene.add(group); st.run = R; st.count++; tick(R.t0); requestDraw();                        // the planes are set before anything can be drawn
  }

  function tick(now) {
    const R = st.run; if (!R) return;
    const u = Math.min(1, Math.max(0, (now - R.t0) / R.dur)), e = ease(u);
    if (R.mode === 'linear') { const s = R.s0 + (R.s1 - R.s0) * e; R.behind.constant = s; R.ahead.constant = -s; }
    else if (R.mode === 'angular') {
      const A = R.axis, th = Math.min(A.span, A.span * e + 1e-4), rot = ang => { const q = new THREE.Quaternion().setFromAxisAngle(A.a, ang); return A.r0.clone().applyQuaternion(q); };
      const r0 = rot(A.start), rt = rot(A.start + th), n0 = new THREE.Vector3().crossVectors(A.a, r0), nt = new THREE.Vector3().crossVectors(A.a, rt), p = A.p;
      const { P0, Pt, N0, Nt } = R.angPlanes;
      P0.set(n0, -n0.dot(p)); Pt.set(nt.clone().negate(), nt.dot(p)); N0.set(n0.clone().negate(), n0.dot(p)); Nt.set(nt, -nt.dot(p));
      const wide = th > Math.PI;                                                       // a wedge wider than half a turn is the union of two half spaces, narrower the intersection
      for (const g of R.newGroups || []) g.traverse(o => { if (o.material) o.material.clipIntersection = wide; });
      for (const g of R.oldGroups || []) g.traverse(o => { if (o.material) o.material.clipIntersection = !wide; });
    } else {
      for (const g of R.fadeIn || []) wrapMats(g, m => { m.opacity = e; });
      for (const g of R.fadeOut || []) wrapMats(g, m => { m.opacity = 1 - e; });
    }
    const gl = u < 0.85 ? 0.55 : 0.55 * (1 - (u - 0.85) / 0.15);
    for (const m of R.glows) if (m) m.emissiveIntensity = gl * (0.6 + 0.4 * Math.sin(u * Math.PI));
    if (u >= 1) finish(); else requestDraw();
  }

  // the hook: every change of the model passes through applyModel
  const applyModel0 = applyModel;
  applyModel = function (ctx, req) {
    const prev = bodyMeshes.map(m => ({ body: m.body, mesh: m.mesh }));
    const was = st.docRef === doc && !!st.feats, fresh = st.docRef !== doc;
    const ret = applyModel0.apply(this, arguments);
    try {
      const now = featSnap();
      if (fresh) { st.docRef = doc; st.feats = now; return ret; }
      const feat = was ? changedFeature(now) : null;
      st.feats = now;
      if (req && req.coarse) return ret;                                               // a drag in progress is drawn coarse: nothing to play yet
      if (off() || UIX.ws !== 'design' || (typeof BUILD !== 'undefined' && BUILD.on) || (typeof STRESS !== 'undefined' && STRESS.group) || document.hidden) { finish(); return ret; }
      start(prev, bodyMeshes, feat, ctx);
    } catch (e) { console.error('feature animation', e); finish(); }
    return ret;
  };
  return { get active() { return !!st.run; }, get mode() { return st.run ? st.run.mode : null; }, get count() { return st.count; }, tick, finish, state: st };
})();
window.FEATFX = FEATFX;
