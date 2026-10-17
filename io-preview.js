// Preview and mesh check for importing and exporting 3D files (OBJ, STL, STEP and the rest).
//
//   Export: the dialog shows the very triangles that will be written, in Shaded, Wireframe or Solid, and says whether the mesh is closed. Open edges are drawn in red.
//   Import: the panel that opens after a file is read has the same three views for the model in the 3D view (put back when the panel closes) and the same check.
//
// The check counts, on the welded triangles: edges used once (open: a hole or a gap), edges used by more than two triangles (non-manifold), edges whose two
// triangles run the same way (flipped: inconsistent winding) and triangles with no area. A closed mesh has none of these.
(function () {
  'use strict';
  const MODES = [['shaded', 'Shaded'], ['wire', 'Wireframe'], ['solid', 'Solid']];

  /* ---------------- mesh check ---------------- */
  // P: flat xyz numbers, I: flat triangle corners (indices into P)
  function check(P, I) {
    const nv = P.length / 3, n = I.length / 3, uses = new Map(); let degenerate = 0;
    const note = (a, b) => { const lo = a < b ? a : b, hi = a < b ? b : a, k = lo * nv + hi, e = uses.get(k) || { n: 0, dir: 0, a: lo, b: hi, fa: a, fb: b }; e.n++; e.dir += a < b ? 1 : -1; uses.set(k, e); };
    for (let t = 0; t < n; t++) {
      const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
      if (a === b || b === c || a === c) { degenerate++; continue; }
      const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], wx = P[c * 3] - P[a * 3], wy = P[c * 3 + 1] - P[a * 3 + 1], wz = P[c * 3 + 2] - P[a * 3 + 2];
      if (Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) < 1e-12) { degenerate++; continue; }
      note(a, b); note(b, c); note(c, a);
    }
    let open = 0, nonManifold = 0, flipped = 0, openPairs = []; const single = [];
    for (const e of uses.values()) {
      if (e.n === 1) single.push(e);
      else if (e.n > 2) nonManifold++;
      else if (e.dir !== 0) flipped++;
    }
    // A flat face merged into one polygon next to a curved face of many facets leaves a long edge facing several short ones (a T-junction). The surface is whole,
    // so such an edge is split at the vertices lying on it before it is called open.
    const r = single.length ? weld(P, single, nv) : { open: 0, nonManifold: 0, flipped: 0, pairs: [] };
    open = r.open; nonManifold += r.nonManifold; flipped += r.flipped; openPairs = r.pairs;
    const closed = open === 0 && nonManifold === 0 && flipped === 0 && n > 0;
    return { tris: n, verts: nv, open, nonManifold, flipped, degenerate, closed, openPairs };
  }
  // the once-used edges, split where other once-used vertices lie on them, matched again
  function weld(P, single, nv) {
    const bv = new Set(); for (const e of single) { bv.add(e.a); bv.add(e.b); }
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const v of bv) for (let k = 0; k < 3; k++) { const x = P[v * 3 + k]; if (x < lo[k]) lo[k] = x; if (x > hi[k]) hi[k] = x; }
    const diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1, tol = diag * 1e-6, cell = Math.max(diag / 64, 1e-9), inv = 1 / cell;
    const cellKey = (x, y, z) => Math.floor(x * inv) + ',' + Math.floor(y * inv) + ',' + Math.floor(z * inv), grid = new Map();
    const big = single.length > 20000;   // too many to search one by one: they are counted as they stand
    if (!big) for (const v of bv) { const k = cellKey(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); const l = grid.get(k); if (l) l.push(v); else grid.set(k, [v]); }
    const subs = new Map(); let nm = 0;
    const put = (u, w, dir) => { const a = u < w ? u : w, b = u < w ? w : u, k = a * nv + b, e = subs.get(k) || { n: 0, dir: 0, a, b }; e.n++; e.dir += dir * (u < w ? 1 : -1); subs.set(k, e); };
    for (const e of single) {
      const A = e.fa, B = e.fb; let chain = [A, B];
      if (!big) {
        const ax = P[A * 3], ay = P[A * 3 + 1], az = P[A * 3 + 2], dx = P[B * 3] - ax, dy = P[B * 3 + 1] - ay, dz = P[B * 3 + 2] - az, L2 = dx * dx + dy * dy + dz * dz;
        if (L2 > 0) {
          const L = Math.sqrt(L2), steps = Math.min(400, Math.ceil(L / cell * 2) + 1), cand = new Set();
          for (let s = 0; s <= steps; s++) {
            const t = s / steps, x = ax + dx * t, y = ay + dy * t, z = az + dz * t, cx = Math.floor(x * inv), cy = Math.floor(y * inv), cz = Math.floor(z * inv);
            for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) { const l = grid.get((cx + i) + ',' + (cy + j) + ',' + (cz + k)); if (l) for (const v of l) cand.add(v); }
          }
          const on = [];
          for (const v of cand) {
            if (v === A || v === B) continue;
            const px = P[v * 3] - ax, py = P[v * 3 + 1] - ay, pz = P[v * 3 + 2] - az, t = (px * dx + py * dy + pz * dz) / L2;
            if (t <= 1e-9 || t >= 1 - 1e-9) continue;
            if (Math.hypot(px - dx * t, py - dy * t, pz - dz * t) <= tol) on.push([t, v]);
          }
          if (on.length) { on.sort((p, q) => p[0] - q[0]); chain = [A, ...on.map(o => o[1]), B]; }
        }
      }
      for (let i = 0; i + 1 < chain.length; i++) put(chain[i], chain[i + 1], 1);
    }
    let open = 0, flipped = 0; const pairs = [];
    for (const e of subs.values()) {
      if (e.n === 1) { open++; if (pairs.length < 20000) pairs.push(e.a, e.b); }
      else if (e.n > 2) nm++;
      else if (e.dir !== 0) flipped++;
    }
    return { open, nonManifold: nm, flipped, pairs };
  }
  function words(r) {
    if (!r.tris) return 'Nothing to check: there are no triangles.';
    if (r.closed) return 'Closed: every edge joins exactly two triangles, no gaps. ' + r.tris.toLocaleString() + ' triangles' + (r.degenerate ? ' (' + r.degenerate + ' with no area skipped)' : '') + '.';
    const bad = [];
    if (r.open) bad.push(r.open.toLocaleString() + ' open edge' + (r.open > 1 ? 's' : '') + ' (holes or gaps, drawn in red)');
    if (r.nonManifold) bad.push(r.nonManifold.toLocaleString() + ' edge' + (r.nonManifold > 1 ? 's' : '') + ' shared by more than two triangles');
    if (r.flipped) bad.push(r.flipped.toLocaleString() + ' edge' + (r.flipped > 1 ? 's' : '') + ' where neighbouring triangles face opposite ways');
    return 'Not closed: ' + bad.join(', ') + '. ' + r.tris.toLocaleString() + ' triangles.' + (r.degenerate ? ' ' + r.degenerate + ' with no area skipped.' : '');
  }
  // parts as the exporter holds them ({ weld: { V: [[x,y,z]…], T } }) joined into one indexed mesh per part, then checked one by one and summed
  function checkParts(parts) {
    const sum = { tris: 0, verts: 0, open: 0, nonManifold: 0, flipped: 0, degenerate: 0, closed: true, parts: [] };
    for (const p of parts) {
      const w = p.weld, P = new Float32Array(w.V.length * 3); w.V.forEach((v, i) => { P[i * 3] = v[0]; P[i * 3 + 1] = v[1]; P[i * 3 + 2] = v[2]; });
      const r = check(P, Uint32Array.from(w.T)); r.name = p.name; sum.parts.push(r);
      for (const k of ['tris', 'verts', 'open', 'nonManifold', 'flipped', 'degenerate']) sum[k] += r[k];
      sum.closed = sum.closed && r.closed;
    }
    sum.closed = sum.closed && sum.tris > 0;
    return sum;
  }

  /* ---------------- the small viewer ---------------- */
  // items: [{ P: Float32Array, I: Uint32Array, color, openPairs }] in the modeler's own axes (Y up)
  function viewer(host, height) {
    const w = Math.max(240, host.clientWidth || 420), h = height || 240;
    const canvas = document.createElement('canvas'); canvas.className = 'io-cv'; canvas.style.cssText = 'display:block;width:100%;height:' + h + 'px;border-radius:8px;background:var(--panel2,#1c1f24);touch-action:none;cursor:grab';
    host.appendChild(canvas);
    const gl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); gl.setSize(w, h, false);
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(35, w / h, 0.01, 1e6), group = new THREE.Group(); scene.add(group);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 0.85)); const sun = new THREE.DirectionalLight(0xffffff, 0.8); sun.position.set(0.6, 1, 0.8); scene.add(sun);
    const st = { yaw: 0.7, pitch: 0.5, dist: 1, c: new THREE.Vector3(), r: 1, mode: 'shaded', items: [], dead: false, dirty: true, drew: 0 };
    const place = () => { const cp = Math.cos(st.pitch); cam.position.set(st.c.x + st.dist * cp * Math.sin(st.yaw), st.c.y + st.dist * Math.sin(st.pitch), st.c.z + st.dist * cp * Math.cos(st.yaw)); cam.lookAt(st.c); };
    const rebuild = () => {
      while (group.children.length) { const o = group.children.pop(); if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }
      const box = new THREE.Box3();
      for (const it of st.items) {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(it.P, 3)); g.setIndex(new THREE.BufferAttribute(it.I, 1));
        const col = new THREE.Color(it.color || '#b4bec9');
        if (st.mode === 'wire') {
          group.add(new THREE.LineSegments(new THREE.WireframeGeometry(g), new THREE.LineBasicMaterial({ color: col.clone().lerp(new THREE.Color('#ffffff'), 0.35) })));
        } else if (st.mode === 'solid') {
          group.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: col, flatShading: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })));
          group.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), new THREE.LineBasicMaterial({ color: 0x1a1d21 })));
        } else {
          const sg = g.clone(); sg.computeVertexNormals();
          group.add(new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: col, metalness: 0.45, roughness: 0.38, side: THREE.DoubleSide })));
        }
        if (it.openPairs && it.openPairs.length) {   // the gaps, always on top
          const seg = new Float32Array(it.openPairs.length * 3); for (let i = 0; i < it.openPairs.length; i++) { seg[i * 3] = it.P[it.openPairs[i] * 3]; seg[i * 3 + 1] = it.P[it.openPairs[i] * 3 + 1]; seg[i * 3 + 2] = it.P[it.openPairs[i] * 3 + 2]; }
          const og = new THREE.BufferGeometry(); og.setAttribute('position', new THREE.BufferAttribute(seg, 3));
          const ol = new THREE.LineSegments(og, new THREE.LineBasicMaterial({ color: 0xff3b30, depthTest: false })); ol.renderOrder = 10; group.add(ol);
        }
        g.computeBoundingBox(); box.union(g.boundingBox);
      }
      if (!box.isEmpty()) { box.getCenter(st.c); st.r = Math.max(1e-6, box.getSize(new THREE.Vector3()).length() / 2); st.dist = st.r / Math.sin(cam.fov * Math.PI / 360) * 1.05; cam.near = st.r / 100; cam.far = st.r * 100; cam.updateProjectionMatrix(); }
      place(); st.dirty = true;
    };
    const draw = () => { if (st.dead) return; if (!canvas.isConnected) { api.dispose(); return; } if (st.dirty) { st.dirty = false; gl.render(scene, cam); st.drew++; } requestAnimationFrame(draw); };
    let drag = null;
    canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
    canvas.addEventListener('pointermove', e => { if (!drag) return; st.yaw -= (e.clientX - drag.x) * 0.01; st.pitch = Math.max(-1.45, Math.min(1.45, st.pitch + (e.clientY - drag.y) * 0.01)); drag = { x: e.clientX, y: e.clientY }; place(); st.dirty = true; });
    const up = () => { drag = null; canvas.style.cursor = 'grab'; }; canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', e => { e.preventDefault(); st.dist = Math.max(st.r * 0.3, Math.min(st.r * 20, st.dist * Math.exp(e.deltaY * 0.0015))); place(); st.dirty = true; }, { passive: false });
    const api = {
      canvas, state: st,
      set(items) { st.items = items; rebuild(); },
      mode(m) { if (m === st.mode) return; st.mode = m; rebuild(); },
      dispose() { if (st.dead) return; st.dead = true; while (group.children.length) { const o = group.children.pop(); if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); } try { gl.dispose(); gl.forceContextLoss(); } catch (e) { /* gone */ } canvas.remove(); },
    };
    place(); requestAnimationFrame(draw);
    return api;
  }

  const segHTML = cur => '<div class="seg io-seg">' + MODES.map(([k, l]) => '<button type="button" data-ioview="' + k + '" class="' + (k === cur ? 'on' : '') + '">' + l + '</button>').join('') + '</div>';
  const css = document.createElement('style');
  css.textContent = '.io-prev{margin:8px 0 6px}.io-prev .io-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}.io-prev .io-head b{font-size:12.5px}' +
    '.io-prev .io-line{font-size:12px;line-height:1.4;margin:6px 0 0;color:var(--ink2,#8a8f97)}.io-prev .io-line.ok{color:#2e9d57}.io-prev .io-line.bad{color:#d8480f}.io-prev .io-wait{padding:30px 0;text-align:center;font-size:12px;color:var(--ink2,#8a8f97)}' +
    '.io-imp{margin:8px 0}.io-imp .io-line{font-size:12px;line-height:1.4;margin:6px 0 0}.io-imp .io-line.ok{color:#2e9d57}.io-imp .io-line.bad{color:#d8480f}';
  document.head.appendChild(css);

  /* ---------------- export dialog ---------------- */
  async function exportParts(only) {
    const ctx = await Kernel.evalAsync(EXPORT_TOL[EXP.q], activeLimit()), names = bodyNames();
    const bodies = ctx.bodies.filter(b => only ? only.includes(b.id) : !(doc.hidden && doc.hidden[b.id]) && !EXP.skip.has(b.id));
    return bodies.map((b, i) => exportPart(b, names[b.id] || 'Body ' + (i + 1)));
  }
  function itemsOf(parts) {
    return parts.map(p => { const w = p.weld, P = new Float32Array(w.V.length * 3); w.V.forEach((v, i) => { P[i * 3] = v[0]; P[i * 3 + 1] = v[1]; P[i * 3 + 2] = v[2]; }); const I = Uint32Array.from(w.T), r = check(P, I); return { P, I, color: p.color, openPairs: r.openPairs, r }; });
  }
  function attachExport(only) {
    const card = document.getElementById('modalCard'); if (!card || !card.querySelector('[data-exp]')) return;
    const box = document.createElement('div'); box.className = 'io-prev'; box.id = 'ioPrev';
    box.innerHTML = '<div class="io-head"><b>Preview</b>' + segHTML(window.__ioMode || 'shaded') + '</div><div class="io-host"><div class="io-wait">Preparing the preview…</div></div><p class="io-line" id="ioLine"></p>';
    const anchor = card.querySelector('.m-opts') || card.querySelector('.note'); (anchor ? anchor.parentNode : card).insertBefore(box, anchor || null);
    const host = box.querySelector('.io-host'); let v = null, serial = 0, last = null;
    const show = async () => {
      const mine = ++serial; box.querySelector('.io-line').textContent = '';
      try {
        const parts = await exportParts(only); if (mine !== serial || !box.isConnected) return;
        host.innerHTML = '';
        if (!parts.length) { host.innerHTML = '<div class="io-wait">There are no visible bodies to export.</div>'; if (v) { v.dispose(); v = null; } return; }
        if (v) v.dispose(); const items = itemsOf(parts); v = viewer(host, 240); v.mode(window.__ioMode || 'shaded'); v.set(items);
        const sum = checkParts(parts); last = sum; window.__ioLast = { kind: 'export', sum, mode: v.state.mode };
        const line = box.querySelector('.io-line'); line.textContent = words(sum); line.className = 'io-line ' + (sum.closed ? 'ok' : 'bad');
      } catch (e) { if (mine === serial) { host.innerHTML = '<div class="io-wait">Could not make the preview: ' + String(e.message || e).replace(/</g, '&lt;') + '</div>'; } }
    };
    box.querySelectorAll('[data-ioview]').forEach(b => b.addEventListener('click', () => { window.__ioMode = b.dataset.ioview; box.querySelectorAll('[data-ioview]').forEach(x => x.classList.toggle('on', x === b)); if (v) v.mode(window.__ioMode); if (window.__ioLast) window.__ioLast.mode = window.__ioMode; }));
    card.querySelectorAll('[data-expq], [data-expb]').forEach(b => b.addEventListener(b.dataset.expq ? 'click' : 'change', () => setTimeout(show, 0)));
    // the viewer lives only while the dialog is open
    const modal = document.getElementById('modal'), mo = new MutationObserver(() => { if (modal.hidden) { serial++; if (v) { v.dispose(); v = null; } mo.disconnect(); } }); mo.observe(modal, { attributes: true, attributeFilter: ['hidden'] });
    show();
  }
  if (typeof openExport === 'function') {
    const open0 = window.openExport;
    window.openExport = function (only) { const r = open0.apply(this, arguments); try { attachExport(only || null); } catch (e) { console.error(e); } return r; };
  }

  /* ---------------- import panel ---------------- */
  let shade0 = null, checked = {};
  const restoreShade = () => { if (shade0 !== null) { const m = shade0; shade0 = null; try { SHADE = m; applyShade(); } catch (e) { /* none */ } } };
  function attachImport() {
    const f = CMD && CMD.type === 'import' && CMD.f; if (!f) return;
    const btns = panel.querySelector('.btns'); if (!btns || panel.querySelector('.io-imp')) return;
    if (shade0 === null) shade0 = SHADE;
    const box = document.createElement('div'); box.className = 'io-imp';
    box.innerHTML = '<div class="field"><span>Preview in the 3D view</span>' + segHTML(SHADE === 'wire' || SHADE === 'solid' || SHADE === 'shaded' ? SHADE : 'solid') + '</div><p class="io-line"></p>';
    btns.parentNode.insertBefore(box, btns);
    box.querySelectorAll('[data-ioview]').forEach(b => b.addEventListener('click', () => { try { SHADE = b.dataset.ioview; applyShade(); } catch (e) { /* none */ } box.querySelectorAll('[data-ioview]').forEach(x => x.classList.toggle('on', x === b)); window.__ioMode = b.dataset.ioview; }));
    const M = MESHES[f.mesh], line = box.querySelector('.io-line');
    if (!M) { line.textContent = 'The mesh data is not in memory, so it cannot be checked.'; return; }
    const r = checked[f.mesh] || (checked[f.mesh] = check(M.P, M.I));
    line.textContent = words(r); line.className = 'io-line ' + (r.closed ? 'ok' : 'bad'); window.__ioLast = { kind: 'import', sum: r, mode: SHADE };
  }
  if (typeof bindImportPanel === 'function') {
    const bind0 = window.bindImportPanel;
    window.bindImportPanel = function () { const r = bind0.apply(this, arguments); try { attachImport(); } catch (e) { console.error(e); } return r; };
    const ok0 = window.importOK;
    window.importOK = function () { restoreShade(); return ok0.apply(this, arguments); };
    const cancel0 = window.cancelCmd;
    window.cancelCmd = function () { if (CMD && CMD.type === 'import') restoreShade(); return cancel0.apply(this, arguments); };
  }

  window.__io = { check, checkParts, words, viewer };
})();
