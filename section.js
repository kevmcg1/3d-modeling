// ═══════════════════════════════════════════════════════════════════
//  Section view. Cuts the 3D view with a plane at any point along X, Y or Z, in Design and in Manufacture.
//  The renderer clips everything in the scene with one plane (the model, the stock, the toolpaths, the simulation). The cut face of every
//  solid body is drawn the way an engineering drawing draws a section: a blueprint crosshatch (45 degree lines, each body at its own
//  angle so touching parts read apart), with a bold outline round the cut. A stencil finds the cut face, so it is exact for any shape.
//    Axis X / Y / Z      the model's own axes (Z is up)
//    Position            slider and number, in the display units (inches first, metric in parentheses)
//    Flip                keep the other side of the plane
//    Hatch               draw the crosshatched cut face
//    Pick on model       click the model: the plane moves to that point along the chosen axis
//  Opening sweeps the plane in from the end of the model and closing sweeps it back out, so the model dissolves and rebuilds.
//  The scene is Y-up, the model is Z-up: user X is scene X, user Y is scene -Z, user Z is scene Y (same mapping as the stress study).
// ═══════════════════════════════════════════════════════════════════
const SECTION = (() => {
  const DIR = { x: [1, 0, 0], y: [0, 0, -1], z: [0, 1, 0] };
  const st = { on: false, axis: 'z', d: 0, shown: 0, flip: false, cap: true, picking: false, group: null, sig: '', plane: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), range: [0, 1], caps: [], ribbons: null, ribKey: '', anim: null, closing: false };
  const SWEEP_MS = 520, reduce = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const ease = u => u * u * (3 - 2 * u);
  const dirV = () => new THREE.Vector3(...DIR[st.axis]);
  const host = () => glCanvas.parentElement;
  const css = document.createElement('style');
  css.textContent = `
#secBar { position: absolute; left: 50%; top: 12px; transform: translate(-50%, 0); z-index: 7; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center; max-width: calc(100% - 24px);
  background: var(--panel); border: 1px solid var(--rule); border-radius: 10px; padding: 8px 12px; box-shadow: 0 6px 24px rgba(0,0,0,.28); font-size: 12px; color: var(--ink);
  opacity: 1; transition: opacity .28s ease, transform .28s ease; }
#secBar.sec-hidden { opacity: 0; transform: translate(-50%, -8px); pointer-events: none; }
#secBar b { font-weight: 600; }
#secBar .sec-seg { display: inline-flex; border: 1px solid var(--rule); border-radius: 7px; overflow: hidden; }
#secBar button { height: 28px; padding: 0 10px; border: 1px solid var(--rule); border-radius: 7px; background: transparent; color: var(--ink); cursor: pointer; font: inherit; transition: color .18s ease, border-color .18s ease, box-shadow .18s ease; }
#secBar .sec-seg button { border: 0; border-radius: 0; min-width: 30px; }
#secBar .sec-seg button + button { border-left: 1px solid var(--rule); }
#secBar button:hover { border-color: var(--accent); color: var(--accent); }
#secBar button.on { border-color: var(--accent); color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
#secBar .sec-seg button.on { box-shadow: inset 0 0 0 1px var(--accent); }
#secBar input[type=range] { width: 150px; accent-color: var(--accent); }
#secBar input[type=number] { width: 84px; height: 28px; border: 1px solid var(--rule); border-radius: 7px; background: transparent; color: var(--ink); padding: 0 6px; font: inherit; transition: border-color .18s ease; }
#secBar input[type=number]:focus { outline: none; border-color: var(--accent); }
#secBar label { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; }
.tb.on#btnSection { color: var(--accent); }
body.sec-picking canvas#gl, body.sec-picking #gl { cursor: crosshair !important; }`;
  document.head.appendChild(css);

  const corners = bb => { const o = []; for (let k = 0; k < 8; k++) o.push(new THREE.Vector3(bb[k & 1 ? 3 : 0], bb[k & 2 ? 4 : 1], bb[k & 4 ? 5 : 2])); return o; };
  // the model's reach along the axis, in the model's own coordinates (the stock's too in Manufacture)
  function rangeOf() {
    const dv = dirV(); let lo = Infinity, hi = -Infinity;
    for (const m of bodyMeshes) if (m.group.visible && m.body.bb) for (const p of corners(m.body.bb)) { const s = dv.dot(p); if (s < lo) lo = s; if (s > hi) hi = s; }
    try {
      const sk = typeof camStock === 'function' && UIX.ws === 'cam' ? camStock() : null;
      if (sk) { const a = st.axis === 'x' ? [sk.x0, sk.x1] : st.axis === 'y' ? [sk.y0, sk.y1] : [sk.z0, sk.z1]; lo = Math.min(lo, a[0]); hi = Math.max(hi, a[1]); }
    } catch (e) { /* no stock yet */ }
    if (!isFinite(lo)) { lo = -50; hi = 50; }
    return [lo, hi];
  }
  const diag = () => { let s = 0; for (const m of bodyMeshes) if (m.body.bb) { const b = m.body.bb; s = Math.max(s, Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2])); } return Math.max(s, st.range[1] - st.range[0], 40); };
  const tol = () => diag() * 2e-5;                                                       // the plane keeps what lies on it (a face exactly at the position stays whole)
  // the end of the model the plane starts from and returns to: past everything it keeps
  const endPos = () => st.flip ? st.range[0] : st.range[1];

  // ── the theme's section colors: a blueprint on dark, ink on paper on light ──
  const palette = () => document.documentElement.getAttribute('data-theme') === 'light'
    ? { fill: new THREE.Color(0xf6f8fb), hatch: new THREE.Color(0x27384f), edge: new THREE.Color(0x0d1622) }
    : { fill: new THREE.Color(0x17283d), hatch: new THREE.Color(0x7fb1e6), edge: new THREE.Color(0xeaf3ff) };

  const HATCH_VS = 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
  const HATCH_FS = `varying vec3 vW; uniform vec3 uU; uniform vec3 uV; uniform vec3 uFill; uniform vec3 uHatch; uniform float uSpace; uniform float uAng; uniform float uPx; uniform float uAlpha;
    void main() {
      vec2 p = vec2(dot(vW, uU), dot(vW, uV));
      float c = cos(uAng), s = sin(uAng);
      float q = (p.x * s - p.y * c) / uSpace;                       // distance across the hatch lines, in spaces
      float dist = abs(fract(q + 0.5) - 0.5) * uSpace;               // world distance to the nearest line
      float w = 0.75 * uPx;                                          // about a pixel and a half wide, whatever the zoom
      float line = 1.0 - smoothstep(w - uPx * 0.6, w + uPx * 0.6, dist);
      gl_FragColor = vec4(mix(uFill, uHatch, line), uAlpha);
    }`;
  // the angles a drawing uses for neighbouring parts
  const ANGLES = [45, 135, 0, 90, 30, 150, 60, 120].map(a => a * Math.PI / 180);

  function clearCaps() {
    if (st.group) {
      scene.remove(st.group);
      st.group.traverse(o => { if (o.material) o.material.dispose(); if (o.geometry && o.userData.own) o.geometry.dispose(); });
    }
    st.group = null; st.caps = []; st.ribbons = null; st.ribKey = '';
  }
  function basis() {                                                                    // two world axes lying in the plane: one is up wherever the plane is vertical
    const n = dirV(), up = new THREE.Vector3(0, 1, 0);
    const u = Math.abs(n.dot(up)) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3().crossVectors(up, n).normalize();
    return [u, new THREE.Vector3().crossVectors(n, u).normalize()];
  }
  function buildCaps() {
    clearCaps();
    if (!st.on || !st.cap) return;
    const g = new THREE.Group(); g.name = 'sectionCaps'; let i = 0; const size = diag() * 4, [u, v] = basis(), pal = palette();
    for (const m of bodyMeshes) {
      if (!m.group.visible) continue;
      const geo = m.me.geometry;
      const stencil = (side, op) => {
        const mat = new THREE.MeshBasicMaterial({ side, colorWrite: false, depthWrite: false, depthTest: false, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: op, stencilZFail: op, stencilZPass: op });
        const me = new THREE.Mesh(geo, mat); me.renderOrder = i * 2 + 1; me.matrixAutoUpdate = false; me.userData.src = m; return me;
      };
      const back = stencil(THREE.BackSide, THREE.IncrementWrapStencilOp), front = stencil(THREE.FrontSide, THREE.DecrementWrapStencilOp);
      const cm = new THREE.ShaderMaterial({
        vertexShader: HATCH_VS, fragmentShader: HATCH_FS, side: THREE.DoubleSide,
        uniforms: { uU: { value: u }, uV: { value: v }, uFill: { value: pal.fill.clone() }, uHatch: { value: pal.hatch.clone() }, uSpace: { value: 1 }, uAng: { value: ANGLES[i % ANGLES.length] }, uPx: { value: 0.1 }, uAlpha: { value: 1 } },
        stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp,
      });
      const cap = new THREE.Mesh(new THREE.PlaneGeometry(size, size), cm); cap.userData.own = true; cap.renderOrder = i * 2 + 2; cap.frustumCulled = false;
      cap.onAfterRender = r => r.clearStencil();
      g.add(back, front, cap); st.caps.push(cap); i++;
    }
    scene.add(g); st.group = g;
  }

  // the bold outline round the cut: every triangle the plane crosses gives one segment, drawn as a thin ribbon lying in the plane
  function outline(s) {
    if (st.ribbons) { st.group.remove(st.ribbons); st.ribbons.geometry.dispose(); st.ribbons.material.dispose(); st.ribbons = null; }
    if (!st.group) return;
    const dv = dirV(), n = dv.clone().multiplyScalar(st.flip ? 1 : -1), pos = [], px = view.viewH / Math.max(1, H), half = 1.4 * px;
    const eps = tol() * 6, a = new THREE.Vector3(), b = new THREE.Vector3(), e = new THREE.Vector3(), side = new THREE.Vector3();
    for (const m of bodyMeshes) {
      if (!m.group.visible || !m.mesh || !m.mesh.pos) continue;
      const P = m.mesh.pos, T = P.length / 9;
      for (let t = 0; t < T; t++) {
        const o = t * 9, d0 = dv.x * P[o] + dv.y * P[o + 1] + dv.z * P[o + 2] - s, d1 = dv.x * P[o + 3] + dv.y * P[o + 4] + dv.z * P[o + 5] - s, d2 = dv.x * P[o + 6] + dv.y * P[o + 7] + dv.z * P[o + 8] - s;
        if ((d0 > 0 && d1 > 0 && d2 > 0) || (d0 < 0 && d1 < 0 && d2 < 0) || (d0 === 0 && d1 === 0 && d2 === 0)) continue;
        const pts = [];
        for (let k = 0; k < 3; k++) {
          const i0 = o + k * 3, i1 = o + ((k + 1) % 3) * 3, da = [d0, d1, d2][k], db = [d0, d1, d2][(k + 1) % 3];
          if ((da < 0) !== (db < 0) || da === 0) { const f = da === db ? 0 : da / (da - db); pts.push(P[i0] + (P[i1] - P[i0]) * f, P[i0 + 1] + (P[i1 + 1] - P[i0 + 1]) * f, P[i0 + 2] + (P[i1 + 2] - P[i0 + 2]) * f); }
        }
        if (pts.length < 6) continue;
        a.set(pts[0], pts[1], pts[2]); b.set(pts[3], pts[4], pts[5]); e.subVectors(b, a); const L = e.length(); if (L < 1e-9) continue;
        side.crossVectors(n, e).multiplyScalar(half / L);
        const off = n.clone().multiplyScalar(eps), A1 = a.clone().add(side).add(off), A2 = a.clone().sub(side).add(off), B1 = b.clone().add(side).add(off), B2 = b.clone().sub(side).add(off);
        pos.push(A1.x, A1.y, A1.z, A2.x, A2.y, A2.z, B1.x, B1.y, B1.z, B1.x, B1.y, B1.z, A2.x, A2.y, A2.z, B2.x, B2.y, B2.z);
      }
    }
    if (!pos.length) return;
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = new THREE.MeshBasicMaterial({ color: palette().edge, side: THREE.DoubleSide, depthTest: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const me = new THREE.Mesh(gg, mat); me.userData.own = true; me.renderOrder = 900; me.frustumCulled = false; st.group.add(me); st.ribbons = me;
  }

  function place(s) {
    const dv = dirV(), n = dv.clone().multiplyScalar(st.flip ? 1 : -1), t = tol();
    st.plane.normal.copy(n); st.plane.constant = st.flip ? -s + t : s + t;                          // keeps s <= position (the high side is cut away); flipped keeps s >= position
    renderer.clippingPlanes = st.on ? [st.plane] : [];
    if (!st.group) return;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n), pal = palette(), px = view.viewH / Math.max(1, H), space = Math.max(diag() / 38, 7 * px);
    for (const cap of st.caps) {
      cap.position.copy(dv.clone().multiplyScalar(s)).addScaledVector(n, t * 3); cap.quaternion.copy(q);
      const U = cap.material.uniforms; U.uPx.value = px; U.uSpace.value = space; U.uFill.value.copy(pal.fill); U.uHatch.value.copy(pal.hatch);
    }
    for (const o of st.group.children) if (o.userData.src) { o.userData.src.group.updateMatrix(); o.matrix.copy(o.userData.src.group.matrix); o.visible = o.userData.src.group.visible; }
    if (st.ribbons) st.ribbons.material.color.copy(pal.edge);
    const key = [st.axis, st.flip, +s.toFixed(5), Math.round(px * 1e4)].join('|');
    if (key !== st.ribKey) { st.ribKey = key; outline(s); }
  }
  const sigOf = () => bodyMeshes.map(m => m.body.id + ':' + m.me.geometry.uuid + (m.group.visible ? '1' : '0')).join('|') + '#' + st.cap + st.on + st.axis;
  function tick() {
    const now = performance.now();
    if (!st.on) { if (renderer.clippingPlanes && renderer.clippingPlanes.length) renderer.clippingPlanes = []; return; }
    const sig = sigOf(); if (sig !== st.sig) { st.sig = sig; buildCaps(); st.ribKey = ''; }
    if (st.anim) {                                                                      // the sweep in or out
      const A = st.anim, u = Math.min(1, (now - A.t0) / A.ms);
      st.shown = A.from + (A.to - A.from) * ease(u);
      if (u >= 1) { st.anim = null; st.shown = A.to; if (st.closing) { finishClose(); return; } }
      requestDraw();
    } else st.shown = st.d;
    place(st.shown);
  }
  function sweep(from, to, ms) {
    if (reduce() || ms <= 0) { st.anim = null; st.shown = to; return; }
    st.anim = { from, to, t0: performance.now(), ms };
  }

  // ── the control bar ──
  const fmtPos = () => `${st.axis.toUpperCase()} = ${fmtLs(st.d)}`;
  function bar() { return document.getElementById('secBar'); }
  function syncBar() {
    const b = bar(); if (!b) return;
    const [lo, hi] = st.range, rg = b.querySelector('#secRange'), nm = b.querySelector('#secNum');
    rg.min = lo; rg.max = hi; rg.step = (hi - lo) / 1000 || 0.01; rg.value = st.d;
    if (document.activeElement !== nm) nm.value = +uval(st.d).toFixed(4);
    b.querySelectorAll('[data-sax]').forEach(x => x.classList.toggle('on', x.dataset.sax === st.axis));
    b.querySelector('#secFlip').classList.toggle('on', st.flip); b.querySelector('#secCapBox').checked = st.cap; b.querySelector('#secPick').classList.toggle('on', st.picking);
    rg.title = fmtPos(); b.querySelector('.sec-unit').textContent = uName();
  }
  function mountBar() {
    let el = bar();
    if (el) { el.classList.remove('sec-hidden'); return; }
    el = document.createElement('div'); el.id = 'secBar'; el.className = 'sec-hidden'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Section view');
    el.innerHTML = `<b>Section</b><span class="sec-seg" role="group" aria-label="Axis">${['x', 'y', 'z'].map(a => `<button data-sax="${a}" title="Cut along the ${a.toUpperCase()} axis">${a.toUpperCase()}</button>`).join('')}</span>
      <input id="secRange" type="range" aria-label="Section position"><input id="secNum" type="number" step="any" aria-label="Section position value"><span class="sec-unit"></span>
      <button id="secFlip" title="Keep the other side of the plane">Flip</button><label title="Draw the crosshatched cut face"><input id="secCapBox" type="checkbox"> Hatch</label>
      <button id="secPick" title="Click the model to put the plane there">Pick on model</button><button id="secClose" title="Close the section view">Close</button>`;
    host().appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('sec-hidden')));                       // fades in
    el.addEventListener('pointerdown', e => e.stopPropagation()); el.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
    el.querySelectorAll('[data-sax]').forEach(b => b.addEventListener('click', () => api.set({ axis: b.dataset.sax })));
    el.querySelector('#secRange').addEventListener('input', e => api.set({ d: parseFloat(e.target.value) }));
    el.querySelector('#secNum').addEventListener('input', e => { const v = parseFloat(e.target.value); if (isFinite(v)) api.set({ d: fromU(v) }); });
    el.querySelector('#secFlip').addEventListener('click', () => api.set({ flip: !st.flip }));
    el.querySelector('#secCapBox').addEventListener('change', e => api.set({ cap: e.target.checked }));
    el.querySelector('#secPick').addEventListener('click', () => api.pick(!st.picking));
    el.querySelector('#secClose').addEventListener('click', () => api.close());
  }

  // ── picking a point on the model ──
  const ray = new THREE.Raycaster();
  function onPick(e) {
    if (!st.picking) return;
    const r = glCanvas.getBoundingClientRect(), nd = new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1));
    ray.setFromCamera(nd, camera);
    const hits = ray.intersectObjects(bodyMeshes.filter(m => m.group.visible).map(m => m.me), false).filter(h => !st.on || st.plane.distanceToPoint(h.point) > -1e-6);
    e.stopImmediatePropagation(); e.preventDefault();
    if (hits.length) { api.set({ d: dirV().dot(hits[0].point) }); api.pick(false); }
    else toast('Click on the model to put the section plane there.');
  }
  host().addEventListener('pointerdown', onPick, true);                              // (an overlay canvas sits above the GL canvas and takes the pointer)
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && st.picking) { api.pick(false); e.stopPropagation(); } }, true);

  function finishClose() {
    st.on = false; st.closing = false; st.anim = null; st.picking = false; document.body.classList.remove('sec-picking');
    clearCaps(); renderer.clippingPlanes = []; const b = bar(); if (b) b.remove(); st.sig = ''; btn(); requestDraw();
  }
  const api = {
    get on() { return st.on && !st.closing; }, get animating() { return !!st.anim; },
    get state() { return { on: st.on && !st.closing, axis: st.axis, d: st.d, flip: st.flip, cap: st.cap, picking: st.picking, range: st.range.slice(), shown: st.shown, animating: !!st.anim }; },
    plane: st.plane,
    // open(options): options.instant skips the sweep (scripts and tests)
    open(o) {
      o = o || {}; const instant = o.instant; delete o.instant;
      st.closing = false; const was = st.on; st.on = true; Object.assign(st, o); st.range = rangeOf();
      if (o.d == null) st.d = (st.range[0] + st.range[1]) / 2; else st.d = Math.min(st.range[1], Math.max(st.range[0], o.d));
      st.sig = ''; mountBar(); syncBar();
      if (!was) { st.shown = endPos(); sweep(endPos(), st.d, instant ? 0 : SWEEP_MS); } else sweep(st.shown, st.d, instant ? 0 : SWEEP_MS / 2);
      tick(); btn(); requestDraw();
    },
    close(o) {
      if (!st.on) return;
      const b = bar(); if (b) b.classList.add('sec-hidden');
      if ((o && o.instant) || reduce()) { finishClose(); return; }
      st.closing = true; sweep(st.shown, endPos(), SWEEP_MS); requestDraw();
    },
    toggle() { if (st.on && !st.closing) api.close(); else api.open(); },
    set(o) {
      st.anim = null;
      if (o.axis && o.axis !== st.axis) { st.axis = o.axis; st.range = rangeOf(); st.d = (st.range[0] + st.range[1]) / 2; st.sig = ''; }
      if (o.d != null) st.d = Math.min(st.range[1], Math.max(st.range[0], o.d));
      if (o.flip != null) st.flip = !!o.flip;
      if (o.cap != null) { st.cap = !!o.cap; st.sig = ''; }
      st.shown = st.d; syncBar(); tick(); requestDraw();
    },
    pick(on) { st.picking = !!on; document.body.classList.toggle('sec-picking', st.picking); syncBar(); if (on) toast('Click the model to put the section plane there.'); },
    tick,
  };
  function btn() { const b = document.getElementById('btnSection'); if (b) b.classList.toggle('on', st.on && !st.closing); }
  // the toolbar button, before Theme
  const th = document.getElementById('btnTheme');
  if (th && !document.getElementById('btnSection')) {
    const b = document.createElement('button'); b.className = 'tb'; b.id = 'btnSection'; b.title = 'Section view: cut the model, the stock and the toolpaths with a plane at any point';
    b.innerHTML = '<svg viewBox="0 0 20 20"><path d="M3 6.5L10 3l7 3.5v7L10 17l-7-3.5z" opacity=".55"/><path d="M2 10.5h16" stroke-dasharray="2 1.6"/><path d="M3 10.5l7 3.5 7-3.5"/></svg><span>Section</span>';
    th.parentNode.insertBefore(b, th); b.addEventListener('click', api.toggle);
  }
  return api;
})();
window.SECTION = SECTION;
