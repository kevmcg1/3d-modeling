/* ══════════════════════════════════════════════════════════════════════
   3D Print workspace — the slicer front end (uses slicer.js)
   ----------------------------------------------------------------------
   Adds a "3D Print" workspace next to Design / Manufacture:
     · pick a Creality printer and filament, place the part on the bed
     · every slicer option from the settings schema in slicer.js
     · slice, scrub a layer-by-layer preview, save Marlin G-code

   It plugs into the app by wrapping a few top-level functions
   (setWorkspace, refreshToolbar, refreshPanel, applyVis, computeSceneBounds,
   pick3D); the modeler's own code is untouched.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
if (typeof Slicer === 'undefined' || typeof THREE === 'undefined' || typeof setWorkspace !== 'function') return;

const KEY = 'datum.print.v1';
const PR = window.PRINT = { cfg: null, mesh: null, meshStale: true, result: null, gcode: null, busy: false, layer: 0, view: 'type', onlyLayer: false, showModel: true, q: '', all: false, open: { Quality: true, Walls: true, 'Top / bottom': false, Infill: true, Material: true, Speed: false, Support: true, 'Bed adhesion': true } };

/* ── settings (persisted per browser) ─────────────────────────────── */
function loadCfg() {
  let c = Slicer.defaults('ender3v2', 'pla');
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.printer) c = Object.assign(Slicer.defaults(s.printer, s.material || 'pla'), s); } catch (e) { /* defaults */ }
  c.xform = Object.assign({ scale: 100, rx: 0, ry: 0, rz: 0 }, c.xform || {});
  return c;
}
let saveT = 0;
function saveCfg() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(PR.cfg)); } catch (e) { /* storage blocked */ } }, 250); }
PR.cfg = loadCfg();

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const fmtTime = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min ${String(s % 60).padStart(2, '0')} s`; };
const isPrint = () => UIX.ws === 'print';
const W3 = (x, y, z) => [x, z, -y];                                  // bed (Z up) → scene (Y up), same as the app's toW

/* ── styles ───────────────────────────────────────────────────────── */
const css = document.createElement('style');
css.textContent = `
.pr-sec { border: 1px solid var(--rule); border-radius: 8px; margin: 8px 0; background: var(--panel-2); }
.pr-sec > summary { cursor: pointer; padding: 7px 10px; font: 600 11px var(--font, inherit); letter-spacing: .06em; text-transform: uppercase; color: var(--ink-2); list-style: none; display: flex; align-items: center; justify-content: space-between; }
.pr-sec > summary::-webkit-details-marker { display: none; }
.pr-sec > summary::after { content: '▾'; opacity: .5; transition: transform .2s; }
.pr-sec:not([open]) > summary::after { transform: rotate(-90deg); }
.pr-sec .pr-body { padding: 2px 10px 10px; display: flex; flex-direction: column; gap: 8px; }
.pr-row { display: grid; grid-template-columns: 1fr 86px; align-items: center; gap: 8px; font-size: 12px; color: var(--ink-2); }
.pr-row.wide { grid-template-columns: 1fr; }
.pr-row .u { color: var(--muted); font-size: 10.5px; margin-left: 3px; }
.pr-row input[type="number"], .pr-row select, .pr-row textarea { width: 100%; box-sizing: border-box; padding: 4px 6px; border: 1px solid var(--rule); border-radius: 5px; background: var(--panel); color: var(--ink); font-size: 12px; }
.pr-row select { grid-column: 1 / -1; }
.pr-row.sel { grid-template-columns: 1fr; gap: 4px; }
.pr-row textarea { font: 11px/1.4 ui-monospace, Consolas, monospace; resize: vertical; }
.pr-row.chk { grid-template-columns: 1fr auto; }
.pr-row.chk input { width: 16px; height: 16px; }
.pr-row .tip { cursor: help; color: var(--muted); }
.pr-top select { width: 100%; padding: 5px 6px; border: 1px solid var(--rule); border-radius: 5px; background: var(--panel); color: var(--ink); font-size: 12.5px; }
.pr-stat { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 8px 0; }
.pr-stat div { background: var(--panel-2); border: 1px solid var(--rule); border-radius: 8px; padding: 7px 9px; }
.pr-stat .wide { grid-column: 1 / -1; }
.pr-stat b { display: block; font-size: 15px; color: var(--ink); }
.pr-stat span { font-size: 10.5px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
.pr-warn { background: color-mix(in srgb, #e0782f 14%, var(--panel)); border: 1px solid color-mix(in srgb, #e0782f 45%, var(--rule)); border-radius: 8px; padding: 7px 9px; font-size: 12px; color: var(--ink); margin: 6px 0; }
.pr-bar { height: 6px; border-radius: 3px; background: var(--rule); overflow: hidden; margin: 8px 0 2px; }
.pr-bar > i { display: block; height: 100%; width: 0; background: var(--accent); transition: width .15s; }
.pr-search { width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid var(--rule); border-radius: 6px; background: var(--panel-2); color: var(--ink); font-size: 12px; }
.pr-layerbar { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 6px 10px; white-space: nowrap; padding: 8px 12px; background: color-mix(in srgb, var(--panel) 92%, transparent); border: 1px solid var(--rule); border-radius: 10px; backdrop-filter: blur(8px); font-size: 12px; z-index: 6; max-width: calc(100% - 24px); }
.pr-layerbar[hidden] { display: none; }
.pr-layerbar input[type=range] { width: min(46vw, 420px); }
.pr-layerbar b { min-width: 76px; text-align: right; font-variant-numeric: tabular-nums; }
.pr-layerbar select, .pr-layerbar label { font-size: 12px; }
.pr-layerbar button { border: 1px solid var(--rule); background: var(--panel-2); color: var(--ink); border-radius: 6px; padding: 3px 8px; cursor: pointer; }
.pr-legend { position: absolute; left: 12px; top: 54px; display: flex; flex-direction: column; gap: 3px; padding: 8px 10px; background: color-mix(in srgb, var(--panel) 90%, transparent); border: 1px solid var(--rule); border-radius: 8px; font-size: 11.5px; color: var(--ink-2); z-index: 5; pointer-events: none; }
.pr-legend[hidden] { display: none; }
.pr-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; }
body.ws-print #visGroup, body.ws-print #mouseLegend, body.ws-print #cmdbar, body.ws-print #shadeToggle, body.ws-print #timeline, body.ws-print #brSplit { display: none !important; }
`;
document.head.appendChild(css);

/* ── scene objects ────────────────────────────────────────────────── */
const printGroup = new THREE.Group(); printGroup.visible = false; scene.add(printGroup);
let bedObj = null, volObj = null, modelObj = null, previewObj = null;
const disposeObj = o => { if (!o) return; o.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach(m => m.dispose()); }); o.parent && o.parent.remove(o); };

function buildBed() {
  disposeObj(bedObj); disposeObj(volObj);
  const [bx, by, bz] = PR.cfg.bed;
  bedObj = new THREE.Group();
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(bx, by), new THREE.MeshBasicMaterial({ color: 0x8a93a3, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }));
  plane.rotation.x = -Math.PI / 2; plane.position.set(bx / 2, -0.05, -by / 2); bedObj.add(plane);
  const pts = [];
  for (let x = 0; x <= bx + 1e-6; x += 10) pts.push(...W3(x, 0, 0), ...W3(x, by, 0));
  for (let y = 0; y <= by + 1e-6; y += 10) pts.push(...W3(0, y, 0), ...W3(bx, y, 0));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  bedObj.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x8a93a3, transparent: true, opacity: 0.35 })));
  const o = [[0, 0], [bx, 0], [bx, by], [0, by]], b = [];
  for (let i = 0; i < 4; i++) { const p = o[i], q = o[(i + 1) % 4]; b.push(...W3(p[0], p[1], 0), ...W3(q[0], q[1], 0)); }
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(b, 3));
  bedObj.add(new THREE.LineSegments(bg, new THREE.LineBasicMaterial({ color: 0x4a5568 })));
  // build volume: the vertical edges and the top rectangle
  const v = [];
  for (const [x, y] of o) v.push(...W3(x, y, 0), ...W3(x, y, bz));
  for (let i = 0; i < 4; i++) { const p = o[i], q = o[(i + 1) % 4]; v.push(...W3(p[0], p[1], bz), ...W3(q[0], q[1], bz)); }
  const vg = new THREE.BufferGeometry(); vg.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  volObj = new THREE.LineSegments(vg, new THREE.LineBasicMaterial({ color: 0x2f6fe0, transparent: true, opacity: 0.45 }));
  printGroup.add(bedObj, volObj);
}

function buildModel() {
  disposeObj(modelObj); modelObj = null;
  if (!PR.mesh) { PR.bounds = null; return; }
  const M = Slicer.transformMesh(PR.mesh, PR.cfg), pos = new Float32Array(M.T.length * 3);
  for (let i = 0; i < M.T.length; i++) { const v = M.V[M.T[i]]; pos.set(W3(v[0], v[1], v[2]), i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.computeVertexNormals();
  const out = M.min[0] < -0.01 || M.min[1] < -0.01 || M.max[0] > PR.cfg.bed[0] + 0.01 || M.max[1] > PR.cfg.bed[1] + 0.01 || M.max[2] > PR.cfg.bed[2] + 0.01;
  modelObj = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: out ? 0xe5484d : 0x8fb4e8, roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide, transparent: !!PR.result, opacity: PR.result ? 0.25 : 1, depthWrite: !PR.result }));
  modelObj.visible = PR.showModel || !PR.result;
  printGroup.add(modelObj);
  PR.bounds = { min: M.min, max: M.max, out };
}

/* ── fetching the part from the modeler ───────────────────────────── */
async function fetchMesh() {
  const ctx = await Kernel.evalAsync(EXPORT_TOL.standard, activeLimit());
  const bodies = ctx.bodies.filter(b => !(doc.hidden && doc.hidden[b.id]));
  if (!bodies.length) return null;
  const V = [], T = [];
  bodies.forEach((b, i) => {
    const w = exportPart(b, 'Body ' + (i + 1)).weld, o = V.length;
    for (const v of w.V) V.push(zUp(v));
    for (const t of w.T) T.push(t + o);
  });
  return { V, T, name: (typeof EXP !== 'undefined' && EXP.name) || 'model' };
}
let fetching = null;
async function refreshMesh(force) {
  if (!force && !PR.meshStale) return PR.mesh;
  if (fetching) return fetching;
  fetching = (async () => {
    try {
      PR.mesh = await fetchMesh(); PR.meshStale = false;
      if (PR.result) { PR.result = null; PR.gcode = null; clearPreview(); }
      buildModel(); refreshPrintUI(); requestDraw();
    } catch (e) { console.error(e); toast('Could not read the model: ' + (e.message || e)); }
    finally { fetching = null; }
    return PR.mesh;
  })();
  return fetching;
}

/* ── slicing ──────────────────────────────────────────────────────── */
async function doSlice() {
  if (PR.busy) return;
  const mesh = await refreshMesh(PR.meshStale);
  if (!mesh) { toast('There is no body to print yet. Model something in Design first.'); return; }
  PR.busy = true; PR.prog = { p: 0, msg: 'Starting…' }; PR.error = null; refreshPrintUI();
  try {
    const cfg = JSON.parse(JSON.stringify(PR.cfg));
    const res = await Slicer.slice(mesh, cfg, { onProgress: (p, msg) => { PR.prog = { p, msg }; const b = document.querySelector('.pr-bar > i'), m = document.getElementById('prMsg'); if (b) b.style.width = (p * 100).toFixed(0) + '%'; if (m) m.textContent = msg; } });
    PR.prog = { p: 0.98, msg: 'Writing G-code…' }; await new Promise(r => setTimeout(r, 0));
    const g = Slicer.gcode(res, cfg);
    PR.result = res; PR.gcode = g; PR.layer = res.layers.length - 1; PR.showModel = false;
    buildModel(); buildPreview(); updateHint(); toast(`Sliced · ${res.layers.length} layers · ${fmtTime(g.time)}`);
  } catch (e) { console.error(e); PR.error = e.message || String(e); }
  PR.busy = false; refreshPrintUI(); requestDraw();
}
function invalidate() {
  if (!PR.result) return;
  PR.stale = true;
  const n = document.getElementById('prStale'); if (n) n.hidden = false;
}

/* ── layer preview (extrusion ribbons, lines for huge jobs) ───────── */
const TYPE_COL = { outer: [0.90, 0.28, 0.30], inner: [0.96, 0.65, 0.14], infill: [0.95, 0.82, 0.30], skin: [0.25, 0.70, 0.50], bridge: [0.56, 0.42, 0.95], support: [0.17, 0.71, 0.79], roof: [0.43, 0.83, 0.88], skirt: [0.62, 0.66, 0.72], brim: [0.62, 0.66, 0.72], raft: [0.62, 0.66, 0.72], iron: [0.48, 0.85, 0.56] };
const TYPE_NAME = { outer: 'Outer wall', inner: 'Inner wall', infill: 'Infill', skin: 'Top / bottom', bridge: 'Bridge', support: 'Support', roof: 'Support roof', skirt: 'Skirt / brim', raft: 'Raft', iron: 'Ironing' };
const ramp = t => { t = Math.max(0, Math.min(1, t)); const a = [0.18, 0.36, 0.88], b = [0.2, 0.8, 0.5], c = [0.95, 0.35, 0.25]; const m = t < 0.5 ? [a, b, t * 2] : [b, c, (t - 0.5) * 2]; return [0, 1, 2].map(i => m[0][i] + (m[1][i] - m[0][i]) * m[2]); };
function clearPreview() { disposeObj(previewObj); previewObj = null; const lb = document.getElementById('prLayers'); if (lb) lb.hidden = true; const lg = document.getElementById('prLegend'); if (lg) lg.hidden = true; }
function buildPreview() {
  disposeObj(previewObj); previewObj = null;
  const res = PR.result; if (!res) return;
  const cfg = res.cfg, nL = res.layers.length;
  let nSeg = 0;
  for (const L of res.layers) for (const p of L.paths) nSeg += Math.max(0, p.pts.length - 1 + (p.closed ? 1 : 0));
  const ribbons = nSeg <= 220000;
  const maxSpeed = Math.max(...['printSpeed', 'outerWallSpeed', 'innerWallSpeed', 'infillSpeed', 'topSpeed', 'supportSpeed'].map(k => cfg[k]));
  const VPS = ribbons ? 8 : 2;
  const pos = new Float32Array(nSeg * VPS * 3), col = new Float32Array(nSeg * VPS * 3), idx = ribbons ? new Uint32Array(nSeg * 18) : null;
  const layerEnd = new Array(nL), layerStart = new Array(nL);
  let s = 0, ii = 0;
  for (let li = 0; li < nL; li++) {
    const L = res.layers[li];
    layerStart[li] = ribbons ? ii : s * 2;
    for (const p of L.paths) {
      const pts = p.closed ? p.pts.concat([p.pts[0]]) : p.pts;
      let c = TYPE_COL[p.type] || [0.7, 0.7, 0.7];
      if (PR.view === 'speed') c = ramp(Slicer.pathSpeed(cfg, p.type, li === 0 && !L.raft) / maxSpeed);
      else if (PR.view === 'layer') c = ramp(li / Math.max(1, nL - 1));
      else if (PR.view === 'flow') c = ramp(Math.min(1, (p.w * p.h * Math.min(Slicer.pathSpeed(cfg, p.type, li === 0 && !L.raft), 1e3)) / (cfg.maxFlowRate || 15)));
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1], b = pts[k], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d < 1e-6) continue;
        const nx = -dy / d * p.w / 2, ny = dx / d * p.w / 2, zt = L.z, zb = L.z - p.h;
        if (ribbons) {
          const base = s * 8, v = [[a.x + nx, a.y + ny, zt], [a.x - nx, a.y - ny, zt], [b.x + nx, b.y + ny, zt], [b.x - nx, b.y - ny, zt], [a.x + nx, a.y + ny, zb], [a.x - nx, a.y - ny, zb], [b.x + nx, b.y + ny, zb], [b.x - nx, b.y - ny, zb]];
          for (let j = 0; j < 8; j++) { pos.set(W3(...v[j]), (base + j) * 3); col.set(c, (base + j) * 3); }
          // top, left side, right side
          const q = [[0, 1, 3, 2], [0, 2, 6, 4], [1, 5, 7, 3]];
          for (const f of q) { idx[ii++] = base + f[0]; idx[ii++] = base + f[1]; idx[ii++] = base + f[2]; idx[ii++] = base + f[0]; idx[ii++] = base + f[2]; idx[ii++] = base + f[3]; }
        } else {
          pos.set(W3(a.x, a.y, zt), s * 6); pos.set(W3(b.x, b.y, zt), s * 6 + 3); col.set(c, s * 6); col.set(c, s * 6 + 3);
        }
        s++;
      }
    }
    layerEnd[li] = ribbons ? ii : s * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, s * VPS * 3), 3)); g.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, s * VPS * 3), 3));
  let obj;
  if (ribbons) { g.setIndex(new THREE.BufferAttribute(idx.subarray(0, ii), 1)); obj = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.0, flatShading: true, side: THREE.DoubleSide })); }
  else obj = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true }));
  obj.frustumCulled = false; obj.userData = { layerStart, layerEnd, ribbons };
  previewObj = obj; printGroup.add(obj);
  setLayer(PR.layer, true);
  const lb = document.getElementById('prLayers'); if (lb) { lb.hidden = false; const r = lb.querySelector('input[type=range]'); r.max = nL - 1; r.value = PR.layer; }
  renderLegend();
}
function setLayer(n, quiet) {
  if (!previewObj) return;
  const u = previewObj.userData, nL = u.layerEnd.length;
  n = Math.max(0, Math.min(nL - 1, n | 0)); PR.layer = n;
  const start = PR.onlyLayer ? u.layerStart[n] : 0;
  previewObj.geometry.setDrawRange(start, u.layerEnd[n] - start);
  const lb = document.getElementById('prLayers');
  if (lb) {
    const L = PR.result.layers[n];
    lb.querySelector('b').textContent = `Layer ${n + 1} / ${nL}`;
    lb.querySelector('[data-z]').textContent = `z ${(+L.z.toFixed(2))} mm`;
    const r = lb.querySelector('input[type=range]'); if (+r.value !== n) r.value = n;
  }
  if (!quiet) requestDraw(); else requestDraw();
}
function renderLegend() {
  const el = document.getElementById('prLegend'); if (!el) return;
  if (!PR.result) { el.hidden = true; return; }
  el.hidden = false;
  if (PR.view === 'type') {
    const present = new Set(); for (const L of PR.result.layers) for (const p of L.paths) present.add(p.type);
    el.innerHTML = Object.keys(TYPE_NAME).filter(k => present.has(k)).map(k => `<div><i style="background:rgb(${TYPE_COL[k].map(v => Math.round(v * 255)).join(',')})"></i>${TYPE_NAME[k]}</div>`).join('');
  } else {
    const lab = { speed: ['slow', 'fast'], layer: ['first layer', 'last layer'], flow: ['low flow', 'at the limit'] }[PR.view];
    el.innerHTML = `<div style="width:130px;height:8px;border-radius:4px;background:linear-gradient(90deg,${[0, 0.5, 1].map(t => `rgb(${ramp(t).map(v => Math.round(v * 255)).join(',')})`).join(',')})"></div><div style="display:flex;justify-content:space-between"><span>${lab[0]}</span><span>${lab[1]}</span></div>`;
  }
}

/* ── DOM: viewport overlays ───────────────────────────────────────── */
(function mountOverlays() {
  const vp = document.getElementById('viewport'); if (!vp || document.getElementById('prLayers')) return;
  const bar = document.createElement('div'); bar.id = 'prLayers'; bar.className = 'pr-layerbar'; bar.hidden = true;
  bar.innerHTML = `<button data-l="-1" title="Layer down (↓)">−</button><input type="range" min="0" max="0" value="0" aria-label="Layer"><button data-l="1" title="Layer up (↑)">+</button><b>Layer 1 / 1</b><span data-z style="color:var(--muted)"></span>
    <label><input type="checkbox" id="prOnly"> this layer only</label>
    <select id="prView" aria-label="Colour by"><option value="type">Feature type</option><option value="speed">Speed</option><option value="flow">Flow</option><option value="layer">Layer</option></select>`;
  vp.appendChild(bar);
  const lg = document.createElement('div'); lg.id = 'prLegend'; lg.className = 'pr-legend'; lg.hidden = true; vp.appendChild(lg);
  const r = bar.querySelector('input[type=range]');
  r.addEventListener('input', () => setLayer(+r.value));
  bar.querySelectorAll('[data-l]').forEach(b => b.addEventListener('click', () => setLayer(PR.layer + +b.dataset.l)));
  bar.querySelector('#prOnly').addEventListener('change', e => { PR.onlyLayer = e.target.checked; setLayer(PR.layer); });
  bar.querySelector('#prView').addEventListener('change', e => { PR.view = e.target.value; buildPreview(); requestDraw(); });
})();

/* ── ribbon (toolbar) ─────────────────────────────────────────────── */
const IC = {
  slice: '<path d="M3 15h14M3 11h14M3 7h14M3 3h14" /><path d="M5 17l10-14" stroke-dasharray="2 2"/>',
  save: '<path d="M5 2h7l4 4v12H5z"/><path d="M12 2v4h4M8 12h6M8 15h4"/>',
  rx: '<path d="M4 10a6 6 0 1 0 2-4.5"/><path d="M3 3v4h4"/>',
  center: '<circle cx="10" cy="10" r="2"/><path d="M10 2v4M10 14v4M2 10h4M14 10h4"/>',
  flat: '<path d="M2 15h16"/><path d="M5 15V8l5-4 5 4v7"/>',
  ghost: '<path d="M3 17V8a7 7 0 0 1 14 0v9l-2-2-2.5 2L10 15l-2.5 2L5 15z"/>',
  cfg: '<path d="M3 5h8M15 5h2M3 10h2M9 10h8M3 15h10M17 15h0"/><circle cx="13" cy="5" r="2"/><circle cx="7" cy="10" r="2"/><circle cx="15" cy="15" r="2"/>',
};
const svgI = k => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${IC[k]}</svg>`;
function printRibbonHTML() {
  const b = (act, lab, ic, extra = '', title = lab) => `<button class="tb ${extra}" data-print="${act}" title="${esc(title)}" ${PR.busy ? 'disabled' : ''}>${svgI(ic)}<span>${lab}</span></button>`;
  return `<div class="rb-group" style="display:flex;gap:2px;align-items:stretch">
    ${b('slice', PR.busy ? 'Slicing…' : 'Slice', 'slice', 'primary', 'Slice the model (Ctrl+Enter)')}
    ${b('save', 'Save G-code', 'save', '', 'Download Marlin G-code for ' + Slicer.printerById(PR.cfg.printer).name)}
    <span style="width:1px;background:var(--rule);margin:4px 6px"></span>
    ${b('rotx', 'Rotate X', 'rx', '', 'Rotate the part 90° about X')}${b('roty', 'Rotate Y', 'rx', '', 'Rotate the part 90° about Y')}${b('rotz', 'Rotate Z', 'rx', '', 'Rotate the part 90° about Z')}
    ${b('flat', 'Lay flat', 'flat', '', 'Rotate the part so its largest flat face sits on the bed')}
    ${b('center', 'Center', 'center', '', 'Center the part on the bed')}
    <span style="width:1px;background:var(--rule);margin:4px 6px"></span>
    ${b('ghost', PR.showModel ? 'Hide model' : 'Show model', 'ghost', PR.showModel ? 'on' : '', 'Show or hide the solid model under the layer preview')}
  </div>`;
}
function bindRibbon(tb) {
  tb.querySelectorAll('[data-print]').forEach(btn => btn.addEventListener('click', () => printAction(btn.dataset.print)));
}
async function printAction(a) {
  const x = PR.cfg.xform;
  if (a === 'slice') return doSlice();
  if (a === 'save') return saveGcode();
  if (a === 'rotx') x.rx = (x.rx + 90) % 360;
  if (a === 'roty') x.ry = (x.ry + 90) % 360;
  if (a === 'rotz') x.rz = (x.rz + 90) % 360;
  if (a === 'center') { PR.cfg.partX = null; PR.cfg.partY = null; }
  if (a === 'flat') layFlat();
  if (a === 'ghost') { PR.showModel = !PR.showModel; if (modelObj) modelObj.visible = PR.showModel || !PR.result; refreshToolbar(); requestDraw(); return; }
  placementChanged();
}
function placementChanged() { saveCfg(); PR.result && invalidate(); buildModel(); refreshPrintUI(); requestDraw(); }
// choose the largest flat (coplanar) face and rotate it to face down
function layFlat() {
  if (!PR.mesh) return;
  const { V, T } = PR.mesh, groups = new Map();
  for (let t = 0; t < T.length; t += 3) {
    const a = V[T[t]], b = V[T[t + 1]], c = V[T[t + 2]];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const A = Math.hypot(nx, ny, nz) / 2; if (A < 1e-9) continue;
    nx /= 2 * A; ny /= 2 * A; nz /= 2 * A;
    const key = [nx, ny, nz].map(q => Math.round(q * 50)).join(',');
    const g = groups.get(key) || { n: [0, 0, 0], A: 0 }; g.A += A; g.n[0] += nx * A; g.n[1] += ny * A; g.n[2] += nz * A; groups.set(key, g);
  }
  let best = null; for (const g of groups.values()) if (!best || g.A > best.A) best = g;
  if (!best) return;
  const l = Math.hypot(...best.n), n = best.n.map(q => q / l), x = PR.cfg.xform;
  if (n[2] < -0.9999) { x.rx = x.ry = x.rz = 0; return; }
  // transformMesh turns about X, then Y: pick rx so the normal's y vanishes, then ry so it points straight down
  const h = Math.hypot(n[1], n[2]), deg = r => +(((r * 180 / Math.PI) % 360 + 360) % 360).toFixed(3);
  x.rx = deg(Math.atan2(n[1], n[2])); x.ry = deg(Math.atan2(n[0], -h)); x.rz = 0;
}

/* ── side panel ───────────────────────────────────────────────────── */
function settingRow(s) {
  const v = PR.cfg[s.key], tip = s.tip ? ` title="${esc(s.tip)}"` : '';
  if (s.type === 'b') return `<label class="pr-row chk"${tip}><span>${s.label}</span><input type="checkbox" data-k="${s.key}" ${v ? 'checked' : ''}></label>`;
  if (s.type === 's') return `<label class="pr-row sel"${tip}><span>${s.label}</span><select data-k="${s.key}">${s.options.map(([k, l]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  if (s.type === 't') return `<label class="pr-row wide"${tip}><span>${s.label}</span><textarea data-k="${s.key}" rows="${s.rows || 4}" spellcheck="false">${esc(v || '')}</textarea></label>`;
  return `<label class="pr-row"${tip}><span>${s.label}${s.unit ? `<span class="u">${s.unit}</span>` : ''}</span><input type="number" data-k="${s.key}" value="${v}" step="${s.step || 'any'}" ${s.min != null ? `min="${s.min}"` : ''} ${s.max != null ? `max="${s.max}"` : ''}></label>`;
}
function printPanelHTML() {
  const cfg = PR.cfg, pr = Slicer.printerById(cfg.printer), q = PR.q.trim().toLowerCase();
  const families = [...new Set(Slicer.PRINTERS.map(p => p.family))];
  const printerSel = `<select id="prPrinter">${families.map(f => `<optgroup label="${f === 'Ender' ? 'Ender' : f === 'CR' ? 'CR series' : f === 'K1' ? 'K1 / Hi (CoreXY)' : f}">${Slicer.PRINTERS.filter(p => p.family === f).map(p => `<option value="${p.id}" ${p.id === cfg.printer ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</optgroup>`).join('')}</select>`;
  const matSel = `<select id="prMaterial">${Slicer.MATERIALS.map(m => `<option value="${m.id}" ${m.id === cfg.material ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>`;
  const profiles = [['Draft', 0.3], ['Standard', 0.2], ['Fine', 0.12], ['Ultra', 0.08]];
  const lhBase = pr.nozzle;
  const prof = `<div class="seg" id="prProf">${profiles.map(([n, h]) => { const lh = +(h * lhBase / 0.4).toFixed(2); return `<button data-lh="${lh}" class="${Math.abs(cfg.layerHeight - lh) < 0.005 ? 'on' : ''}" title="${lh} mm layers">${n}</button>`; }).join('')}</div>`;
  const x = cfg.xform, b = PR.bounds;
  const place = `<details class="pr-sec" ${PR.open.Placement ? 'open' : ''} data-sec="Placement"><summary>Placement</summary><div class="pr-body">
      <label class="pr-row"><span>Scale<span class="u">%</span></span><input type="number" data-x="scale" value="${x.scale}" min="1" max="1000" step="1"></label>
      <div class="row3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">${['rx', 'ry', 'rz'].map(k => `<label class="field"><span>${k.toUpperCase().replace('R', 'Rot ')}°</span><input type="number" data-x="${k}" value="${x[k]}" step="15"></label>`).join('')}</div>
      <div class="row3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px"><label class="field"><span>Bed X</span><input type="number" data-px="partX" value="${cfg.partX == null ? cfg.bed[0] / 2 : cfg.partX}" step="1"></label><label class="field"><span>Bed Y</span><input type="number" data-px="partY" value="${cfg.partY == null ? cfg.bed[1] / 2 : cfg.partY}" step="1"></label><label class="field"><span>Size Z</span><input type="text" disabled value="${b ? b.max[2].toFixed(1) : '—'}"></label></div>
      ${b ? `<div style="font-size:11.5px;color:var(--muted)">Part size ${(b.max[0] - b.min[0]).toFixed(1)} × ${(b.max[1] - b.min[1]).toFixed(1)} × ${b.max[2].toFixed(1)} mm</div>` : ''}
      ${b && b.out ? `<div class="pr-warn">The part does not fit the ${cfg.bed.join(' × ')} mm build volume. It is shown red.</div>` : ''}</div></details>`;
  let groups = '';
  for (const g of Slicer.SETTINGS) {
    const items = g.items.filter(s => (PR.all || !s.adv || q) && (!q || (s.label + ' ' + (s.tip || '') + ' ' + g.group).toLowerCase().includes(q)));
    if (!items.length) continue;
    // Material: filament picker lives at the top, so skip its duplicate here
    const rows = items.filter(s => s.key !== 'material').map(settingRow).join('');
    if (!rows) continue;
    groups += `<details class="pr-sec" data-sec="${g.group}" ${(PR.open[g.group] || q) ? 'open' : ''}><summary>${g.group}</summary><div class="pr-body">${rows}</div></details>`;
  }
  const r = PR.result, gc = PR.gcode;
  const stats = r ? `<div class="pr-stat"><div class="wide"><b>${fmtTime(gc.time)}</b><span>Print time</span></div><div><b>${gc.filament.toFixed(2)} m</b><span>Filament</span></div><div><b>${gc.mass.toFixed(1)} g</b><span>Weight</span></div><div><b>${r.layers.length}</b><span>Layers</span></div>${gc.cost ? `<div><b>$${gc.cost.toFixed(2)}</b><span>Filament cost</span></div>` : ''}<div><b>${(gc.text.length / 1048576).toFixed(1)} MB</b><span>G-code</span></div></div>
    <div class="pr-warn" id="prStale" ${PR.stale ? '' : 'hidden'}>Settings changed since this slice. Slice again to update.</div>
    ${r.warnings.map(w => `<div class="pr-warn">${esc(w)}</div>`).join('')}
    <div class="btns"><button class="btn primary" data-print="save">Save G-code</button></div>` : '';
  return `<div class="pn-head"><h2>3D Print</h2><span class="tag">${esc(pr.name)} · Marlin</span></div><div class="pn-body pr-top">
    <label class="field"><span>Printer</span>${printerSel}</label>
    <div style="font-size:11.5px;color:var(--muted);margin:2px 0 8px">${pr.bed.join(' × ')} mm bed · ${pr.nozzle} mm nozzle · ${pr.dd ? 'direct drive' : 'Bowden'} · up to ${pr.maxHotend} °C / ${pr.maxBed} °C${pr.level ? ' · auto leveling' : ''}</div>
    <label class="field"><span>Filament</span>${matSel}</label>
    <div class="field" style="margin-top:8px"><span>Quality</span>${prof}</div>
    <div class="btns" style="margin:10px 0 6px"><button class="btn primary" data-print="slice" ${PR.busy ? 'disabled' : ''}>${PR.busy ? 'Slicing…' : r ? 'Slice again' : 'Slice'}</button></div>
    ${PR.busy ? `<div class="pr-bar"><i style="width:${((PR.prog && PR.prog.p) * 100 || 0).toFixed(0)}%"></i></div><div id="prMsg" style="font-size:11.5px;color:var(--muted)">${esc(PR.prog ? PR.prog.msg : '')}</div>` : ''}
    ${PR.error ? `<div class="pr-warn">${esc(PR.error)}</div>` : ''}
    ${!PR.mesh && !PR.busy ? `<p class="note">There is nothing to print yet. Model a body in <b>Design</b> (or open a sample), then come back.</p>` : ''}
    ${stats}
    ${place}
    <input class="pr-search" id="prSearch" type="search" placeholder="Search settings…" value="${esc(PR.q)}" style="margin-top:8px">
    <label class="pr-row chk" style="margin-top:6px"><span>Show all settings</span><input type="checkbox" id="prAll" ${PR.all ? 'checked' : ''}></label>
    ${groups || '<p class="note">No setting matches.</p>'}
    <div class="btns" style="margin-top:10px;flex-wrap:wrap"><button class="btn" data-print="saveprof">Export settings</button><button class="btn" data-print="loadprof">Import settings</button><button class="btn" data-print="reset">Reset</button></div>
    <p class="note" style="margin-top:8px">G-code is Marlin flavor with Creality-style start and end sequences. Edit them under <b>Machine</b> (show all settings). Copy the file to a USB stick or microSD card and print from the printer's screen.</p>
  </div>`;
}
function bindPrintPanel() {
  const root = panel;
  root.querySelectorAll('[data-print]').forEach(b => b.addEventListener('click', () => printAction2(b.dataset.print)));
  const prn = root.querySelector('#prPrinter'); prn && prn.addEventListener('change', () => { const x = PR.cfg.xform, px = PR.cfg.partX, py = PR.cfg.partY; Slicer.applyPrinter(PR.cfg, prn.value); PR.cfg.xform = x; PR.cfg.partX = px; PR.cfg.partY = py; PR.cfg.bed = Slicer.printerById(prn.value).bed.slice(); afterPrinter(); });
  const mat = root.querySelector('#prMaterial'); mat && mat.addEventListener('change', () => { Slicer.applyMaterial(PR.cfg, mat.value); settingsChanged(true); });
  root.querySelectorAll('#prProf [data-lh]').forEach(b => b.addEventListener('click', () => {
    const lh = +b.dataset.lh, c = PR.cfg; c.layerHeight = lh; c.firstLayerHeight = Math.max(lh, +(c.nozzle * 0.75).toFixed(2));
    const base = Slicer.defaults(c.printer, c.material), k = lh < 0.15 ? 0.7 : lh > 0.25 ? 1.25 : 1;
    for (const key of ['printSpeed', 'outerWallSpeed', 'innerWallSpeed', 'infillSpeed', 'topSpeed', 'supportSpeed']) c[key] = Math.round(base[key] * k);
    c.topLayers = Math.max(3, Math.round(1.0 / lh)); c.bottomLayers = Math.max(3, Math.round(0.8 / lh));
    settingsChanged(true);
  }));
  root.querySelectorAll('[data-k]').forEach(el => el.addEventListener('change', () => {
    const k = el.dataset.k, s = Slicer.SETTING_BY_KEY[k];
    PR.cfg[k] = s.type === 'b' ? el.checked : s.type === 'n' ? (isNaN(+el.value) ? PR.cfg[k] : +el.value) : el.value;
    if (k === 'support' || k === 'adhesion' || k === 'infillPattern' || k === 'vase' || k === 'supportPlacement') settingsChanged(true); else settingsChanged(false);
  }));
  root.querySelectorAll('[data-x]').forEach(el => el.addEventListener('change', () => { PR.cfg.xform[el.dataset.x] = +el.value || (el.dataset.x === 'scale' ? 100 : 0); placementChanged(); }));
  root.querySelectorAll('[data-px]').forEach(el => el.addEventListener('change', () => { PR.cfg[el.dataset.px] = +el.value; placementChanged(); }));
  root.querySelectorAll('details[data-sec]').forEach(d => d.addEventListener('toggle', () => { PR.open[d.dataset.sec] = d.open; }));
  const sr = root.querySelector('#prSearch'); sr && sr.addEventListener('input', () => { PR.q = sr.value; const pos = sr.selectionStart; refreshPrintUI(true); const n = document.getElementById('prSearch'); n && (n.focus(), n.setSelectionRange(pos, pos)); });
  const all = root.querySelector('#prAll'); all && all.addEventListener('change', () => { PR.all = all.checked; refreshPrintUI(); });
}
function settingsChanged(rerender) { saveCfg(); PR.result && invalidate(); if (rerender) refreshPrintUI(); }
function afterPrinter() {
  saveCfg(); PR.result && invalidate(); buildBed(); buildModel(); sceneBedBounds(); fitAll(true); refreshPrintUI(); requestDraw();
}
async function printAction2(a) {
  if (a === 'saveprof') {
    const blob = new Blob([JSON.stringify({ format: 'datum-print-profile', version: 1, settings: PR.cfg }, null, 2)], { type: 'application/json' });
    return dl(`print-${PR.cfg.printer}-${PR.cfg.material}.json`, blob);
  }
  if (a === 'loadprof') {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
    inp.onchange = async () => { try { const d = JSON.parse(await inp.files[0].text()); if (d.format !== 'datum-print-profile') throw new Error('Not a Datum print profile'); PR.cfg = Object.assign(Slicer.defaults(d.settings.printer, d.settings.material), d.settings); PR.cfg.xform = Object.assign({ scale: 100, rx: 0, ry: 0, rz: 0 }, PR.cfg.xform); afterPrinter(); toast('Settings loaded'); } catch (e) { toast('Could not read the profile: ' + e.message); } };
    return inp.click();
  }
  if (a === 'reset') { const x = PR.cfg.xform; PR.cfg = Slicer.defaults(PR.cfg.printer, PR.cfg.material); PR.cfg.xform = x; saveCfg(); PR.result && invalidate(); return refreshPrintUI(); }
  return printAction(a);
}

/* ── export ───────────────────────────────────────────────────────── */
function dl(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
async function saveGcode() {
  if (!PR.result) { await doSlice(); if (!PR.result) return; }
  if (PR.stale) { toast('Settings changed since the last slice. Slice again first.'); return; }
  // short, plain file names: older Creality firmware dislikes long or non-ASCII names
  const base = String((PR.mesh && PR.mesh.name) || 'model').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'model';
  dl(`${base}.gcode`, new Blob([PR.gcode.text], { type: 'text/plain' }));
  toast(`Saved ${base}.gcode · ${fmtTime(PR.gcode.time)} · ${PR.gcode.filament.toFixed(2)} m of filament`);
}

/* ── hooks into the app ───────────────────────────────────────────── */
let panelEl = null;
function refreshPrintUI(keepFocus) {
  if (!isPrint()) return;
  panel.innerHTML = printPanelHTML(); panel.hidden = false; panel.dataset.mode = 'print'; bindPrintPanel();
  const tb = document.getElementById('toolbar'); tb.innerHTML = printRibbonHTML(); bindRibbon(tb);
  document.querySelectorAll('[data-ws]').forEach(b => b.classList.toggle('on', b.dataset.ws === UIX.ws));
  const chip = document.getElementById('modeChip'); if (chip) chip.textContent = '3D Print';
}
// What "Fit" frames: the part when there is one (the bed stays in the clip range), else the whole bed
function sceneBedBounds() {
  const [bx, by, bz] = PR.cfg.bed, b = PR.bounds;
  const bed = new THREE.Box3(new THREE.Vector3(0, 0, -by), new THREE.Vector3(bx, Math.min(bz, Math.max(bx, by) * 0.6), 0));
  let box = bed;
  if (b) {
    const lo = W3(b.min[0], b.max[1], 0), hi = W3(b.max[0], b.min[1], b.max[2]);       // scene-space corners of the part's bounds
    const pad = Math.max(8, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) * 0.1);
    box = new THREE.Box3(new THREE.Vector3(lo[0] - pad, lo[1] - pad, lo[2] - pad), new THREE.Vector3(hi[0] + pad, hi[1] + pad, hi[2] + pad));
  }
  box.getCenter(sceneCenter);
  let far = 0; for (const x of [0, bx]) for (const y of [-by, 0]) for (const z of [0, bz]) far = Math.max(far, sceneCenter.distanceTo(new THREE.Vector3(x, z, y)));
  sceneR = Math.max(box.getSize(new THREE.Vector3()).length() / 2, far, 20);
  return box;
}
const wrap = (name, fn) => { const orig = window[name]; if (typeof orig !== 'function') return; window[name] = function () { return fn(orig, this, arguments); }; };

wrap('setWorkspace', (orig, self, args) => {
  const ws = args[0], was = UIX.ws;
  if (ws === 'print' && was !== 'print') { PR.stale = false; }
  const r = orig.apply(self, args);
  if (ws === 'print') enterPrint(); else if (was === 'print') leavePrint();
  return r;
});
wrap('refreshToolbar', (orig, self, args) => {
  if (!isPrint()) return orig.apply(self, args);
  const tb = document.getElementById('toolbar'); tb.innerHTML = printRibbonHTML(); bindRibbon(tb);
  document.querySelectorAll('[data-ws]').forEach(b => b.classList.toggle('on', b.dataset.ws === UIX.ws));
  const chip = document.getElementById('modeChip'); if (chip) { chip.textContent = '3D Print'; chip.classList.remove('sketch'); }
  document.getElementById('btnUndo').disabled = hist.cur <= 0; document.getElementById('btnRedo').disabled = hist.cur >= hist.states.length - 1;
});
wrap('refreshPanel', (orig, self, args) => {
  if (!isPrint()) return orig.apply(self, args);
  const ae = document.activeElement;
  if (ae && panel.contains(ae) && ae.tagName !== 'BUTTON' && panel.dataset.mode === 'print') return;      // don't rebuild under a field being edited
  panel.innerHTML = printPanelHTML(); panel.hidden = false; panel.dataset.mode = 'print'; bindPrintPanel();
});
wrap('applyVis', (orig, self, args) => {
  const r = orig.apply(self, args);
  if (isPrint()) { bodyGroup.visible = false; planeGroup.visible = false; sketchGroup.visible = false; hlGroup.visible = false; }
  else { planeGroup.visible = true; hlGroup.visible = true; }
  return r;
});
wrap('guideKey', (orig, self, args) => isPrint() ? 'print' : orig.apply(self, args));      // no modeling step guide here
wrap('computeSceneBounds', (orig, self, args) => isPrint() ? sceneBedBounds() : orig.apply(self, args));
wrap('pick3D', (orig, self, args) => isPrint() ? null : orig.apply(self, args));
wrap('updateHint', (orig, self, args) => {
  if (!isPrint()) return orig.apply(self, args);
  const h = document.getElementById('hint'); if (h) h.innerHTML = PR.result ? '<b>3D Print:</b> drag the layer slider to see how it will be built, then save the G-code.' : '<b>3D Print:</b> pick your printer and filament, then press <b>Slice</b>.';
});
// the model changed in Design: re-read it next time (or now, if we are looking at it)
wrap('modelChanged', (orig, self, args) => {
  const r = orig.apply(self, args);
  PR.meshStale = true;
  if (isPrint()) setTimeout(() => refreshMesh(true), 400);
  return r;
});

function enterPrint() {
  printGroup.visible = true; buildBed();
  document.body.classList.add('ws-print');
  applyVis();
  buildModel(); previewObj && (previewObj.visible = true);
  const lb = document.getElementById('prLayers'); if (lb) lb.hidden = !PR.result;
  renderLegend();
  refreshPrintUI(); updateHint();
  fitAll(false);
  if (PR.meshStale || !PR.mesh) refreshMesh(true).then(() => { fitAll(false); });
  requestDraw();
}
function leavePrint() {
  printGroup.visible = false;
  document.body.classList.remove('ws-print');
  const lb = document.getElementById('prLayers'); if (lb) lb.hidden = true;
  const lg = document.getElementById('prLegend'); if (lg) lg.hidden = true;
  applyVis(); computeSceneBounds(); fitAll(false);
}

// keys: Ctrl+Enter slices; arrows step layers; modeling shortcuts stay out of this workspace
document.addEventListener('keydown', e => {
  if (!isPrint()) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '');
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); doSlice(); return; }
  if (typing) return;
  if (previewObj && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopImmediatePropagation(); setLayer(PR.layer + (e.key === 'ArrowUp' ? (e.shiftKey ? 10 : 1) : (e.shiftKey ? -10 : -1))); return; }
  if (!e.ctrlKey && !e.metaKey && !e.altKey && /^[a-zA-Z]$/.test(e.key) && !'fFhHvV'.includes(e.key)) e.stopImmediatePropagation();
}, true);

// the workspace button (index.html carries it; add it here for older pages)
(function ensureButton() {
  const ws = document.querySelector('.ws'); if (!ws || ws.querySelector('[data-ws="print"]')) return;
  const b = document.createElement('button'); b.dataset.ws = 'print'; b.textContent = '3D Print';
  b.addEventListener('click', () => setWorkspace('print')); ws.appendChild(b);
})();
})();
