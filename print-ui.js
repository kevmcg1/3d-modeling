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
if (typeof Slicer === 'undefined' || typeof Costing === 'undefined' || typeof THREE === 'undefined' || typeof setWorkspace !== 'function') return;

const KEY = 'datum.print.v1';
const PR = window.PRINT = { cfg: null, mesh: null, meshStale: true, result: null, gcode: null, busy: false, layer: 0, view: 'type', onlyLayer: false, showModel: true, q: '', all: false, open: { Quality: true, Walls: true, 'Top / bottom': false, Infill: true, Material: true, Speed: false, Support: true, 'Bed adhesion': true } };

/* ── settings (persisted per browser) ─────────────────────────────── */
function loadCfg() {
  let c = Slicer.defaults('ender3v2', 'pla');
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.printer) c = Object.assign(Slicer.defaults(s.printer, s.material || 'pla'), s); } catch (e) { /* defaults */ }
  c.xform = Object.assign({ scale: 100, rx: 0, ry: 0, rz: 0 }, c.xform || {});
  c.cost = Object.assign({}, Costing.DEFAULTS, c.cost || {});
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
.pr-sec { border: 1px solid var(--rule); border-radius: 10px; margin: 8px 0; background: var(--panel-2); transition: border-color .2s; }
.pr-sec[open] { border-color: color-mix(in srgb, var(--accent) 22%, var(--rule)); }
.pr-sec > summary { cursor: pointer; padding: 8px 12px; font: 650 10.5px var(--font, inherit); letter-spacing: .07em; text-transform: uppercase; color: var(--ink-2); list-style: none; display: flex; align-items: center; justify-content: space-between; border-radius: 10px; transition: color .15s, background .15s; }
.pr-sec > summary:hover { color: var(--ink); background: color-mix(in srgb, var(--accent) 6%, transparent); }
.pr-sec > summary::-webkit-details-marker { display: none; }
.pr-sec > summary::after { content: ''; width: 6px; height: 6px; border-right: 2px solid var(--muted); border-bottom: 2px solid var(--muted); transform: rotate(45deg) translate(-2px, -2px); transition: transform .22s cubic-bezier(.2,.7,.2,1); }
.pr-sec:not([open]) > summary::after { transform: rotate(-45deg) translate(-1px, -1px); }
.pr-sec .pr-body { padding: 4px 12px 12px; display: flex; flex-direction: column; gap: 8px; }
.pr-sec[open] .pr-body { animation: pr-open .26s cubic-bezier(.2,.7,.2,1) both; }
@keyframes pr-open { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
html.calm .pr-sec[open] .pr-body { animation: none; }
.pr-row { display: grid; grid-template-columns: minmax(0, 1fr) 96px; align-items: center; gap: 10px; font-size: 12px; color: var(--ink-2); line-height: 1.3; border-radius: 6px; transition: color .15s; }
.pr-row:hover { color: var(--ink); }
.pr-row.wide { grid-template-columns: 1fr; gap: 4px; }
.pr-row .u { color: var(--muted); font-size: 10.5px; margin-left: 4px; }
.pr-row input[type="number"], .pr-row select, .pr-row textarea, .pr-search, .pr-top select, .pr-layerbar select, .pr-cost .field input, .pr-sec .field input[type="number"], .pr-sec .field input[type="text"] {
  width: 100%; box-sizing: border-box; padding: 6px 9px; border: 1px solid var(--rule); border-radius: 7px; background: var(--panel); color: var(--ink); font: 12.5px var(--mono);
  transition: border-color .15s, box-shadow .18s, background .15s; }
.pr-row input[type="number"]:hover, .pr-row select:hover, .pr-row textarea:hover, .pr-search:hover, .pr-top select:hover, .pr-layerbar select:hover, .pr-sec .field input:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--rule)); }
.pr-row input:focus, .pr-row select:focus, .pr-row textarea:focus, .pr-search:focus, .pr-top select:focus, .pr-layerbar select:focus, .pr-sec .field input:focus { outline: 0; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.pr-sec .field input:disabled { opacity: .6; cursor: default; background: var(--panel-2); }
input[type="number"] { -moz-appearance: textfield; appearance: textfield; }
.pr-row input[type="number"]::-webkit-inner-spin-button, .pr-row input[type="number"]::-webkit-outer-spin-button, .pr-sec .field input[type="number"]::-webkit-inner-spin-button, .pr-sec .field input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.pr-row select, .pr-top select, .pr-layerbar select { appearance: none; -webkit-appearance: none; cursor: pointer; padding-right: 26px; font-family: var(--font, inherit); font-size: 12.5px;
  background-image: linear-gradient(45deg, transparent 50%, var(--muted) 50%), linear-gradient(135deg, var(--muted) 50%, transparent 50%); background-position: calc(100% - 15px) 52%, calc(100% - 10px) 52%; background-size: 5px 5px, 5px 5px; background-repeat: no-repeat; }
.pr-row select { grid-column: 1 / -1; }
.pr-row.sel { grid-template-columns: 1fr; gap: 4px; }
.pr-row textarea { font: 11px/1.45 var(--mono); resize: vertical; min-height: 64px; }
.pr-row.chk { grid-template-columns: minmax(0, 1fr) auto; cursor: pointer; }
.pr-sw { appearance: none; -webkit-appearance: none; flex: none; position: relative; width: 30px; height: 18px; margin: 0; border-radius: 99px; background: var(--rule); cursor: pointer; transition: background .2s, box-shadow .2s; }
.pr-sw::after { content: ''; position: absolute; left: 2px; top: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.3); transition: transform .22s cubic-bezier(.2,.7,.2,1); }
.pr-sw:checked { background: var(--accent); }
.pr-sw:checked::after { transform: translateX(12px); }
.pr-sw:hover { box-shadow: 0 0 0 3px var(--accent-soft); }
.pr-sw:focus-visible { outline: 0; box-shadow: 0 0 0 3px var(--accent-soft), 0 0 0 1.5px var(--accent); }
.pr-search { padding-left: 30px; background: var(--panel) no-repeat 10px 50% / 13px url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%23778291' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='9' cy='9' r='5.5'/%3E%3Cpath d='M13.5 13.5L17 17'/%3E%3C/svg%3E"); }
.pr-search::-webkit-search-cancel-button { cursor: pointer; }
.pr-seg-note { font-size: 11.5px; color: var(--muted); }
#prProf button { transition: background .15s, color .15s, box-shadow .2s; }
#prProf button:hover:not(.on) { background: var(--accent-soft); color: var(--ink); }
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
.pr-layerbar input[type=range] { -webkit-appearance: none; appearance: none; width: min(46vw, 420px); height: 18px; background: transparent; margin: 0; cursor: pointer; --p: 0%; }
.pr-layerbar input[type=range]::-webkit-slider-runnable-track { height: 4px; border-radius: 3px; background: linear-gradient(90deg, var(--accent) var(--p), var(--rule) var(--p)); }
.pr-layerbar input[type=range]::-moz-range-track { height: 4px; border-radius: 3px; background: var(--rule); }
.pr-layerbar input[type=range]::-moz-range-progress { height: 4px; border-radius: 3px; background: var(--accent); }
.pr-layerbar input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; margin-top: -5px; border-radius: 50%; background: var(--accent); border: 2px solid var(--panel); box-shadow: 0 1px 4px rgba(0,0,0,.35); transition: transform .15s; }
.pr-layerbar input[type=range]::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; background: var(--accent); border: 2px solid var(--panel); box-shadow: 0 1px 4px rgba(0,0,0,.35); }
.pr-layerbar input[type=range]:hover::-webkit-slider-thumb { transform: scale(1.18); }
.pr-layerbar input[type=range]:focus-visible { outline: 0; }
.pr-layerbar input[type=range]:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 4px var(--accent-soft), 0 1px 4px rgba(0,0,0,.35); }
.pr-layerbar b { min-width: 76px; text-align: right; font-variant-numeric: tabular-nums; }
.pr-layerbar select { width: auto; padding-top: 4px; padding-bottom: 4px; }
.pr-layerbar label { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; cursor: pointer; }
.pr-layerbar button { width: 28px; height: 26px; padding: 0; border: 1px solid var(--rule); background: var(--panel-2); color: var(--ink); border-radius: 8px; cursor: pointer; font-size: 15px; line-height: 1; transition: background .15s, border-color .15s, transform .12s; }
.pr-layerbar button:hover { background: var(--accent-soft); border-color: color-mix(in srgb, var(--accent) 50%, var(--rule)); }
.pr-layerbar button:active { transform: scale(.94); }
.pr-legend { position: absolute; left: 12px; top: 54px; display: flex; flex-direction: column; gap: 3px; padding: 8px 10px; background: color-mix(in srgb, var(--panel) 90%, transparent); border: 1px solid var(--rule); border-radius: 8px; font-size: 11.5px; color: var(--ink-2); z-index: 5; pointer-events: none; }
.pr-legend[hidden] { display: none; }
.pr-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; }
.pr-cost table { width: 100%; border-collapse: collapse; font-size: 12px; }
.pr-cost td { padding: 3px 0; color: var(--ink-2); } .pr-cost td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
.pr-cost tr.sum td { border-top: 1px solid var(--rule); font-weight: 600; color: var(--ink); padding-top: 5px; }
.pr-cost .price { background: color-mix(in srgb, var(--accent) 12%, var(--panel)); border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--rule)); border-radius: 8px; padding: 8px 10px; margin-top: 6px; }
.pr-cost .price b { font-size: 18px; color: var(--ink); } .pr-cost .price span { display: block; font-size: 11.5px; color: var(--muted); }
.pr-cost .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 8px; }
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
    PR.result = res; PR.gcode = g; PR.stale = false; PR.layer = res.layers.length - 1; PR.showModel = false;
    buildModel(); buildPreview(); updateHint(); toast(`Sliced · ${res.layers.length} layers · ${fmtTime(g.time)}`);
  } catch (e) { console.error(e); PR.error = e.message || String(e); }
  PR.busy = false; refreshPrintUI(); requestDraw();
}
function invalidate() {
  if (!PR.result) return;
  PR.stale = true;
  const n = document.getElementById('prStale'); if (n) n.hidden = false;
}

/* ── layer preview (rounded extrusion beads, lines for huge jobs) ──── */
const TYPE_COL = { outer: [0.90, 0.28, 0.30], inner: [0.96, 0.65, 0.14], infill: [0.95, 0.82, 0.30], skin: [0.25, 0.70, 0.50], bridge: [0.56, 0.42, 0.95], support: [0.17, 0.71, 0.79], roof: [0.43, 0.83, 0.88], skirt: [0.62, 0.66, 0.72], brim: [0.62, 0.66, 0.72], raft: [0.62, 0.66, 0.72], iron: [0.48, 0.85, 0.56] };
const TYPE_NAME = { outer: 'Outer wall', inner: 'Inner wall', infill: 'Infill', skin: 'Top / bottom', bridge: 'Bridge', support: 'Support', roof: 'Support roof', skirt: 'Skirt / brim', raft: 'Raft', iron: 'Ironing' };
const ramp = t => { t = Math.max(0, Math.min(1, t)); const a = [0.18, 0.36, 0.88], b = [0.2, 0.8, 0.5], c = [0.95, 0.35, 0.25]; const m = t < 0.5 ? [a, b, t * 2] : [b, c, (t - 0.5) * 2]; return [0, 1, 2].map(i => m[0][i] + (m[1][i] - m[0][i]) * m[2]); };
function clearPreview() { disposeObj(previewObj); previewObj = null; const lb = document.getElementById('prLayers'); if (lb) lb.hidden = true; const lg = document.getElementById('prLegend'); if (lg) lg.hidden = true; }
// Each toolpath becomes one smooth rounded bead (an elliptical tube, shared vertices along the path, rounded ends),
// so it reads as extruded filament. Very large jobs fall back to plain lines.
const BEAD_STEPS = [[8, 160000], [6, 600000], [4, 900000]];       // [points per cross-section, ring budget]: rounder when the job is small
function buildPreview() {
  disposeObj(previewObj); previewObj = null;
  const res = PR.result; if (!res) return;
  const cfg = res.cfg, nL = res.layers.length;
  // drop points that sit on top of each other so every direction is well defined
  const clean = p => { const o = []; for (const q of p.pts) { const l = o[o.length - 1]; if (!l || Math.hypot(q.x - l.x, q.y - l.y) > 0.02) o.push(q); } if (p.closed && o.length > 2 && Math.hypot(o[0].x - o[o.length - 1].x, o[0].y - o[o.length - 1].y) <= 0.02) o.pop(); return o; };
  let nRing = 0, nSeg = 0;
  const cleaned = res.layers.map(L => L.paths.map(p => { const o = clean(p); nRing += o.length + 3; nSeg += Math.max(0, o.length - 1 + (p.closed ? 1 : 0)); return o; }));
  const step = BEAD_STEPS.find(([, max]) => nRing <= max), tubes = !!step, K = step ? step[0] : 0;
  const maxSpeed = Math.max(...['printSpeed', 'outerWallSpeed', 'innerWallSpeed', 'infillSpeed', 'topSpeed', 'supportSpeed'].map(k => cfg[k]));
  const nV = tubes ? nRing * K : nSeg * 2;
  const pos = new Float32Array(nV * 3), col = new Uint8Array(nV * 3), nor = tubes ? new Int8Array(nV * 3) : null, idx = tubes ? new Uint32Array(nRing * K * 6) : null;
  const layerEnd = new Array(nL), layerStart = new Array(nL), CS = [], SN = [];
  for (let k = 0; k < K; k++) { CS.push(Math.cos(k / K * Math.PI * 2)); SN.push(Math.sin(k / K * Math.PI * 2)); }
  let v = 0, ii = 0;
  const ring = (px, py, zc, nx, ny, hw, hh, c) => {              // one cross-section of K points, centre (px,py,zc), side vector (nx,ny)
    for (let k = 0; k < K; k++) {
      const X = px + nx * CS[k] * hw, Y = py + ny * CS[k] * hw, Z = zc + SN[k] * hh;
      let ax = nx * CS[k] / Math.max(hw, 1e-6), ay = ny * CS[k] / Math.max(hw, 1e-6), az = SN[k] / Math.max(hh, 1e-6); const l = Math.hypot(ax, ay, az) || 1;
      pos.set(W3(X, Y, Z), (v + k) * 3); const nn = W3(ax / l * 127, ay / l * 127, az / l * 127); nor[(v + k) * 3] = nn[0]; nor[(v + k) * 3 + 1] = nn[1]; nor[(v + k) * 3 + 2] = nn[2]; col.set(c, (v + k) * 3);
    }
    v += K;
  };
  const link = r0 => { const r1 = r0 + K; for (let k = 0; k < K; k++) { const a = r0 + k, b = r0 + (k + 1) % K, c = r1 + k, d = r1 + (k + 1) % K; idx[ii++] = a; idx[ii++] = b; idx[ii++] = d; idx[ii++] = a; idx[ii++] = d; idx[ii++] = c; } };
  let s = 0;
  for (let li = 0; li < nL; li++) {
    const L = res.layers[li];
    layerStart[li] = tubes ? ii : s * 2;
    L.paths.forEach((p, pi) => {
      const pts = cleaned[li][pi], n = pts.length; if (n < 2) return;
      let c = TYPE_COL[p.type] || [0.7, 0.7, 0.7];
      if (PR.view === 'speed') c = ramp(Slicer.pathSpeed(cfg, p.type, li === 0 && !L.raft) / maxSpeed);
      else if (PR.view === 'layer') c = ramp(li / Math.max(1, nL - 1));
      else if (PR.view === 'flow') c = ramp(Math.min(1, (p.w * p.h * Math.min(Slicer.pathSpeed(cfg, p.type, li === 0 && !L.raft), 1e3)) / (cfg.maxFlowRate || 15)));
      c = c.map(x => Math.round(x * 255));
      if (!tubes) {
        for (let k = 1; k < n + (p.closed ? 1 : 0); k++) { const a = pts[k - 1], b = pts[k % n]; pos.set(W3(a.x, a.y, L.z), s * 6); pos.set(W3(b.x, b.y, L.z), s * 6 + 3); col.set(c, s * 6); col.set(c, s * 6 + 3); s++; }
        return;
      }
      const hw = p.w / 2, hh = p.h / 2, zc = L.z - hh, closed = p.closed && n > 2, r0 = v / K;
      const dirAt = i => {                                        // unit direction in and out of point i
        const a = pts[closed ? (i + n - 1) % n : Math.max(0, i - 1)], b = pts[i], c2 = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
        let ix = b.x - a.x, iy = b.y - a.y, ox = c2.x - b.x, oy = c2.y - b.y; const li2 = Math.hypot(ix, iy), lo = Math.hypot(ox, oy);
        if (li2 < 1e-9) { ix = ox; iy = oy; } else { ix /= li2; iy /= li2; } if (lo < 1e-9) { ox = ix; oy = iy; } else { ox /= lo; oy /= lo; }
        let mx = ix + ox, my = iy + oy; const lm = Math.hypot(mx, my); if (lm < 1e-6) { mx = ox; my = oy; } else { mx /= lm; my /= lm; }
        return { dx: mx, dy: my, miter: Math.min(1.8, 1 / Math.max(0.55, mx * ix + my * iy)) };
      };
      let first = null, last = null;
      for (let i = 0; i < n; i++) {
        const d = dirAt(i), P = pts[i];
        if (i === 0) first = d; if (i === n - 1) last = d;
        if (i === 0 && !closed) ring(P.x - d.dx * hw * 0.55, P.y - d.dy * hw * 0.55, zc, -d.dy, d.dx, hw * 0.55, hh * 0.55, c);      // rounded start cap
        ring(P.x, P.y, zc, -d.dy * d.miter, d.dx * d.miter, hw, hh, c);
      }
      if (closed) { const d = first, P = pts[0]; ring(P.x, P.y, zc, -d.dy * d.miter, d.dx * d.miter, hw, hh, c); }
      else { const d = last, P = pts[n - 1]; ring(P.x + d.dx * hw * 0.55, P.y + d.dy * hw * 0.55, zc, -d.dy, d.dx, hw * 0.55, hh * 0.55, c); }
      const rings = (v / K) - r0;
      for (let i = 0; i < rings - 1; i++) link((r0 + i) * K);
    });
    layerEnd[li] = tubes ? ii : s * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, (tubes ? v : s * 2) * 3), 3)); g.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, (tubes ? v : s * 2) * 3), 3, true));
  let obj;
  if (tubes) {
    g.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, v * 3), 3, true)); g.setIndex(new THREE.BufferAttribute(idx.subarray(0, ii), 1));
    obj = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.0, side: THREE.DoubleSide }));
  } else obj = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true }));
  obj.frustumCulled = false; obj.userData = { layerStart, layerEnd, tubes };
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
    const rg = lb.querySelector('input[type=range]'); if (rg) rg.style.setProperty('--p', (nL > 1 ? n / (nL - 1) * 100 : 100) + '%');
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
  bar.innerHTML = `<button data-l="-1" aria-label="Layer down">−</button><input type="range" min="0" max="0" value="0" aria-label="Layer"><button data-l="1" aria-label="Layer up">+</button><b>Layer 1 / 1</b><span data-z style="color:var(--muted)"></span>
    <label><input type="checkbox" id="prOnly" class="pr-sw"> this layer only</label>
    <select id="prView" aria-label="Colour by"><option value="type">Feature type</option><option value="speed">Speed</option><option value="flow">Flow</option><option value="layer">Layer</option></select>`;
  vp.appendChild(bar); tagTips(bar);
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
  const b = (act, lab, ic, extra = '') => `<button class="tb ${extra}" data-print="${act}" data-tipkey="print:${act}" ${PR.busy ? 'disabled' : ''}>${svgI(ic)}<span>${lab}</span></button>`;
  return `<div class="rb-group" style="display:flex;gap:2px;align-items:stretch">
    ${b('slice', PR.busy ? 'Slicing…' : 'Slice', 'slice', 'primary')}
    ${b('save', 'Save G-code', 'save', '')}
    <span style="width:1px;background:var(--rule);margin:4px 6px"></span>
    ${b('rotx', 'Rotate X', 'rx', '')}${b('roty', 'Rotate Y', 'rx', '')}${b('rotz', 'Rotate Z', 'rx', '')}
    ${b('flat', 'Lay flat', 'flat', '')}
    ${b('center', 'Center', 'center', '')}
    <span style="width:1px;background:var(--rule);margin:4px 6px"></span>
    ${b('ghost', PR.showModel ? 'Hide model' : 'Show model', 'ghost', PR.showModel ? 'on' : '')}
  </div>`;
}
function bindRibbon(tb) {
  tagTips(tb);
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
  const v = PR.cfg[s.key], tip = ` data-tipkey="set:${s.key}" data-tipname="${esc(s.label)}"`;
  if (s.type === 'b') return `<label class="pr-row chk"${tip}><span>${s.label}</span><input type="checkbox" class="pr-sw" data-k="${s.key}" ${v ? 'checked' : ''}></label>`;
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
  const prof = `<div class="seg" id="prProf">${profiles.map(([n, h]) => { const lh = +(h * lhBase / 0.4).toFixed(2); return `<button data-lh="${lh}" class="${Math.abs(cfg.layerHeight - lh) < 0.005 ? 'on' : ''}" data-tipkey="print:prof-${n.toLowerCase()}" data-tipname="${n}: ${lh} mm layers">${n}</button>`; }).join('')}</div>`;
  const x = cfg.xform, b = PR.bounds;
  const place = `<details class="pr-sec" ${PR.open.Placement ? 'open' : ''} data-sec="Placement"><summary>Placement</summary><div class="pr-body">
      <label class="pr-row" data-tipkey="place:scale" data-tipname="Scale"><span>Scale<span class="u">%</span></span><input type="number" data-x="scale" value="${x.scale}" min="1" max="1000" step="1"></label>
      <div class="row3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">${['rx', 'ry', 'rz'].map(k => `<label class="field" data-tipkey="place:${k}" data-tipname="Rotate about ${k[1].toUpperCase()}"><span>${k.toUpperCase().replace('R', 'Rot ')}°</span><input type="number" data-x="${k}" value="${x[k]}" step="15"></label>`).join('')}</div>
      <div class="row3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px"><label class="field" data-tipkey="place:partX" data-tipname="Position on the bed, X"><span>Bed X</span><input type="number" data-px="partX" value="${cfg.partX == null ? cfg.bed[0] / 2 : cfg.partX}" step="1"></label><label class="field" data-tipkey="place:partY" data-tipname="Position on the bed, Y"><span>Bed Y</span><input type="number" data-px="partY" value="${cfg.partY == null ? cfg.bed[1] / 2 : cfg.partY}" step="1"></label><label class="field" data-tipkey="place:sizeZ" data-tipname="Part height"><span>Size Z</span><input type="text" disabled value="${b ? b.max[2].toFixed(1) : '—'}"></label></div>
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
    <label class="field" data-tipkey="print:printer"><span>Printer</span>${printerSel}</label>
    <div style="font-size:11.5px;color:var(--muted);margin:2px 0 8px">${pr.bed.join(' × ')} mm bed · ${pr.nozzle} mm nozzle · ${pr.dd ? 'direct drive' : 'Bowden'} · up to ${pr.maxHotend} °C / ${pr.maxBed} °C${pr.level ? ' · auto leveling' : ''}</div>
    <label class="field" data-tipkey="print:material"><span>Filament</span>${matSel}</label>
    <div class="field" style="margin-top:8px"><span>Quality</span>${prof}</div>
    <div class="btns" style="margin:10px 0 6px"><button class="btn primary" data-print="slice" ${PR.busy ? 'disabled' : ''}>${PR.busy ? 'Slicing…' : r ? 'Slice again' : 'Slice'}</button></div>
    ${PR.busy ? `<div class="pr-bar"><i style="width:${((PR.prog && PR.prog.p) * 100 || 0).toFixed(0)}%"></i></div><div id="prMsg" style="font-size:11.5px;color:var(--muted)">${esc(PR.prog ? PR.prog.msg : '')}</div>` : ''}
    ${PR.error ? `<div class="pr-warn">${esc(PR.error)}</div>` : ''}
    ${!PR.mesh && !PR.busy ? `<p class="note">There is nothing to print yet. Model a body in <b>Design</b> (or open a sample), then come back.</p>` : ''}
    ${stats}
    ${costSection()}
    ${place}
    <input class="pr-search" id="prSearch" data-tipkey="print:search" data-tipname="Search settings" type="search" placeholder="Search settings…" value="${esc(PR.q)}" style="margin-top:8px">
    <label class="pr-row chk" style="margin-top:6px" data-tipkey="print:all"><span>Show all settings</span><input type="checkbox" class="pr-sw" id="prAll" ${PR.all ? 'checked' : ''}></label>
    ${groups || '<p class="note">No setting matches.</p>'}
    <div class="btns" style="margin-top:10px;flex-wrap:wrap"><button class="btn" data-print="saveprof">Export settings</button><button class="btn" data-print="loadprof">Import settings</button><button class="btn" data-print="reset">Reset</button></div>
    <p class="note" style="margin-top:8px">G-code is Marlin flavor with Creality-style start and end sequences. Edit them under <b>Machine</b> (show all settings). Copy the file to a USB stick or microSD card and print from the printer's screen.</p>
  </div>`;
}
// Production cost: material + machine hours + labor + overhead, and the price that leaves the chosen margin
const COST_FIELDS = [
  ['shopRate', 'Shop cost per hour', '$/h', 0.5, 'What an hour of the shop costs you: rent, utilities, insurance, machine wear. Charged for every machine hour.'],
  ['laborRate', 'Labor rate', '$/h', 0.5, 'Hourly cost of whoever sets up and finishes the part.'],
  ['setupMin', 'Setup time', 'min', 1, 'Once per batch: slicing, loading filament, bed prep. Spread over the quantity.'],
  ['handMin', 'Hands-on time', 'min/part', 1, 'Per part: removing it, support cleanup, finishing, packing.'],
  ['qty', 'Quantity', 'parts', 1, 'Parts in the batch.'],
  ['powerW', 'Printer power', 'W', 10, 'Average draw while printing.'],
  ['kwh', 'Electricity', '$/kWh', 0.01, 'What a kilowatt-hour costs you. It is multiplied by the printer power and the print time.'],
  ['overheadPct', 'Overhead', '%', 1, 'Admin, software, marketing, as a percent of direct costs.'],
  ['failurePct', 'Failed prints', '%', 1, 'Allowance for prints that fail and have to be redone.'],
  ['marginPct', 'Profit margin', '%', 1, 'Share of the sale price you keep as profit.'],
];
const money = x => '$' + (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(2));
function costJob() { const g = PR.gcode, c = PR.cfg; return { materialCost: g.mass / 1000 * (c.filamentCost || 0), machineHours: g.time / 3600, setupMin: c.cost.setupMin, handMin: c.cost.handMin, qty: c.cost.qty }; }
function costResultHTML() {
  const q = Costing.quote(costJob(), PR.cfg.cost), many = q.qty > 1;
  return `<table>${q.lines.map(([k, v]) => `<tr><td>${k}</td><td>${money(v)}</td></tr>`).join('')}<tr class="sum"><td>Cost per part</td><td>${money(q.total)}</td></tr>${many ? `<tr><td>Whole batch of ${q.qty}</td><td>${money(q.batchTotal)}</td></tr>` : ''}</table>
    <div class="price"><span>Sell for at least</span><b>${money(q.price)}</b> <span style="display:inline">per part · ${PR.cfg.cost.marginPct}% margin</span>
      <span>Profit ${money(q.profit)} per part${many ? `, ${money(q.batchProfit)} on the batch` : ''} · ${(q.markup * 100).toFixed(0)}% markup · ${money(q.profitPerMachineHour)} per machine hour</span>
      <span>Below ${money(q.breakEven)} you lose money.</span></div>`;
}
function costSection() {
  if (!PR.result || !PR.gcode) return '';
  const c = PR.cfg.cost, inp = ([k, lab, unit, step]) => `<label class="pr-row" data-tipkey="cost:${k}" data-tipname="${esc(lab)}"><span>${lab}<span class="u">${unit}</span></span><input type="number" data-cost="${k}" value="${c[k]}" step="${step}" min="0"></label>`;
  return `<details class="pr-sec pr-cost" data-sec="Production cost" ${PR.open['Production cost'] !== false ? 'open' : ''}><summary>Production cost</summary><div class="pr-body">
    ${COST_FIELDS.map(inp).join('')}<label class="pr-row" data-tipkey="cost:filamentCost" data-tipname="Filament price"><span>Filament<span class="u">$/kg</span></span><input type="number" data-k="filamentCost" value="${PR.cfg.filamentCost}" step="1" min="0"></label>
    <div id="prCostOut">${costResultHTML()}</div></div></details>`;
}
function bindPrintPanel() {
  const root = panel;
  tagTips(root);
  root.querySelectorAll('[data-cost]').forEach(el => el.addEventListener('input', () => { PR.cfg.cost[el.dataset.cost] = el.value === '' ? 0 : +el.value; saveCfg(); const o = document.getElementById('prCostOut'); if (o) o.innerHTML = costResultHTML(); }));
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
    if (k === 'filamentCost') { const o = document.getElementById('prCostOut'); if (o && PR.gcode) o.innerHTML = costResultHTML(); }
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
    inp.onchange = async () => { try { const d = JSON.parse(await inp.files[0].text()); if (d.format !== 'datum-print-profile') throw new Error('Not a Datum print profile'); PR.cfg = Object.assign(Slicer.defaults(d.settings.printer, d.settings.material), d.settings); PR.cfg.xform = Object.assign({ scale: 100, rx: 0, ry: 0, rz: 0 }, PR.cfg.xform); PR.cfg.cost = Object.assign({}, Costing.DEFAULTS, PR.cfg.cost); afterPrinter(); toast('Settings loaded'); } catch (e) { toast('Could not read the profile: ' + e.message); } };
    return inp.click();
  }
  if (a === 'reset') { const x = PR.cfg.xform, cost = PR.cfg.cost; PR.cfg = Slicer.defaults(PR.cfg.printer, PR.cfg.material); PR.cfg.xform = x; PR.cfg.cost = cost; saveCfg(); PR.result && invalidate(); return refreshPrintUI(); }
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

/* ── hover cards: the same card Design uses, with before / after pictures and steps ── */
(function registerTips() {
  if (typeof TIP_ART === 'undefined' || typeof TIP_TXT === 'undefined' || typeof TipArt === 'undefined') return;
  const A = TipArt, { C, at, P, poly, line, box, txt, grid, sk, fillP, arrow } = A;
  const I = f => () => { at(60, 52, 1.5); return f(); };
  const layers = (n, h = 14, w = 30, d = 22) => { let g = ''; for (let i = 1; i < n; i++) { const z = h * i / n; g += line([P(-w / 2, d / 2, z), P(w / 2, d / 2, z), P(w / 2, -d / 2, z)], C.accL, 0.7); } return g; };
  const block = (n = 0) => box(-15, -11, 0, 30, 22, 14) + (n ? layers(n) : '');
  const path = () => line([P(-10, -7, 14), P(10, -7, 14), P(10, -3, 14), P(-10, -3, 14), P(-10, 1, 14), P(10, 1, 14), P(10, 5, 14), P(-10, 5, 14)], C.ok, 1.3);
  const loops = n => { let g = ''; for (let i = 1; i <= n; i++) { const z = 14 * i / n; g += line([P(-15, -11, z), P(15, -11, z), P(15, 11, z), P(-15, 11, z), P(-15, -11, z)], C.ok, 0.9); } return g; };
  // an L-shaped part turned 90° about an axis
  const L0 = [[-14, -8, 0, 28, 16, 5], [-14, -8, 5, 8, 16, 16]];
  const turn = ax => {
    const rot = ([x, y, z]) => ax === 'x' ? [x, -z, y] : ax === 'y' ? [z, y, -x] : [-y, x, z];
    const bs = L0.map(([x, y, z, w, d, h]) => { const a = rot([x, y, z]), b = rot([x + w, y + d, z + h]); return [0, 1, 2].map(i => [Math.min(a[i], b[i]), Math.max(a[i], b[i])]); });
    const z0 = Math.min(...bs.map(b => b[2][0])); return bs.map(b => [b[0][0], b[1][0], b[2][0] - z0, b[0][1] - b[0][0], b[1][1] - b[1][0], b[2][1] - b[2][0]]);
  };
  const draw = bs => bs.slice().sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2])).map(b => box(...b)).join('');
  const rotArt = ax => [I(() => draw(L0) + txt([100, 16], ax.toUpperCase(), C.dim, 9)), I(() => draw(turn(ax)) + txt([100, 16], '90°', C.dim, 9))];
  const sliders = (pos, col = C.acc) => [26, 42, 58].map((y, i) => sk(`M24,${y}H96`, '#c8d0da', 3) + `<circle cx="${24 + 72 * pos[i]}" cy="${y}" r="4.5" fill="${col}" stroke="#fff" stroke-width="1.2"/>`).join('');
  const sheet = (lab, col = C.acc) => fillP('M40,12h28l12,12v52h-40z', '#fff') + sk('M40,12h28l12,12v52h-40zM68,12v12h12', C.line, 1.2) + [34, 44, 54].map(y => sk(`M46,${y}h${y === 44 ? 20 : 28}`, '#b9c2cd', 2)).join('') + txt([60, 70], lab, col, 8.5);
  const stack = (n, tot = 7) => { let g = ''; for (let i = 0; i < tot; i++) { const on = i < n; g += box(-15, -11, i * 3.2, 30, 22, 3, on ? (i === n - 1 ? 'a' : 'n') : 'n').replace(/fill="[^"]+"/g, m => on ? m : 'fill="#eef1f5" fill-opacity=".7"'); } return g; };
  const flat = tilt => { const w = 34, h = 22, a = tilt * Math.PI / 180, cx = 60, by = 70; const pts = [[-w / 2, 0], [w / 2, 0], [w / 2, -h], [-w / 2, -h]].map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]); const lo = Math.max(...pts.map(p => p[1])); const q = pts.map(p => [cx + p[0], by + p[1] - lo].map(v => v.toFixed(1)).join(',')).join(' ');
    return sk('M10,70H110', C.line, 1.4) + `<polygon points="${q}" fill="#cfd8e3" stroke="${C.line}" stroke-width="1" stroke-linejoin="round"/>` + (tilt ? '' : sk(`M${cx - w / 2},70H${cx + w / 2}`, C.acc, 2.4)); };
  const top = (px, py) => `<rect x="18" y="10" width="84" height="70" rx="3" fill="#eef1f5" stroke="${C.line}" stroke-width="1"/>` + [34, 50, 66, 82].map(x => `<line x1="${x}" y1="10" x2="${x}" y2="80" stroke="#dde3ea"/>`).join('') + `<rect x="${px - 13}" y="${py - 10}" width="26" height="20" rx="2" fill="${C.accT}" stroke="${C.acc}" stroke-width="1.2"/>`;
  const walls = n => { let g = `<rect x="30" y="16" width="60" height="58" rx="3" fill="#eef1f5"/>`; for (let i = 0; i < n; i++) g += `<rect x="${30 + i * 4.5}" y="${16 + i * 4.5}" width="${60 - i * 9}" height="${58 - i * 9}" rx="2" fill="none" stroke="${i ? C.acc : C.line}" stroke-width="1.6"/>`; return g; };
  const infill = gap => { let g = `<rect x="30" y="16" width="60" height="58" rx="3" fill="#fff" stroke="${C.line}" stroke-width="1.6"/>`; for (let x = 30 + gap; x < 90; x += gap) g += `<line x1="${x}" y1="17" x2="${x}" y2="73" stroke="${C.acc}" stroke-width="1.1"/>`; for (let y = 16 + gap; y < 74; y += gap) g += `<line x1="31" y1="${y}" x2="89" y2="${y}" stroke="${C.acc}" stroke-width="1.1"/>`; return g; };
  const wave = () => { let g = `<rect x="30" y="16" width="60" height="58" rx="3" fill="#fff" stroke="${C.line}" stroke-width="1.6"/>`; for (let k = 0; k < 4; k++) { let d = ''; for (let x = 32; x <= 88; x += 4) d += `${x === 32 ? 'M' : 'L'}${x},${(26 + k * 14 + 5 * Math.sin((x + k * 14) / 6)).toFixed(1)}`; g += sk(d, C.acc, 1.2); } return g; };
  const lines = () => { let g = `<rect x="30" y="16" width="60" height="58" rx="3" fill="#fff" stroke="${C.line}" stroke-width="1.6"/>`; for (let y = 24; y < 74; y += 8) g += `<line x1="31" y1="${y}" x2="89" y2="${y}" stroke="${C.acc}" stroke-width="1.2"/>`; return g; };
  const overhang = sup => sk('M14,76H106', C.line, 1.4) + fillP('M50,76V30H86V44H62V76Z', '#cfd8e3') + sk('M50,76V30H86V44H62V76', C.line, 1.2) + (sup ? [66, 72, 78, 84].map(x => sk(`M${x},44V76`, C.warn, 1.4, 'stroke-dasharray="2 2"')).join('') : '') + (sup ? '' : txt([84, 62], '?', C.dim, 11));
  const adh = kind => { const r = (m, c, w, dash = '') => `<rect x="${42 - m}" y="${30 - m}" width="${36 + 2 * m}" height="${28 + 2 * m}" rx="${2 + m / 2}" fill="none" stroke="${c}" stroke-width="${w}" ${dash}/>`; let g = '<rect x="14" y="8" width="92" height="74" rx="3" fill="#eef1f5" stroke="#9aa6b4"/>'; if (kind === 'skirt') g += r(8, C.ok, 1.3) + r(10, C.ok, 1.3); if (kind === 'brim') for (let i = 1; i <= 5; i++) g += r(i * 1.8, C.ok, 1.2); if (kind === 'raft') g += `<rect x="30" y="18" width="60" height="52" rx="3" fill="${C.accT}" stroke="${C.acc}"/>`; g += `<rect x="42" y="30" width="36" height="28" rx="2" fill="#cfd8e3" stroke="${C.line}"/>`; return g; };
  const art = (k, a, b) => { TIP_ART[k] = [a, b]; };
  art('print:slice', I(() => block()), I(() => block(7) + path()));
  art('print:save', I(() => block(7) + path()), () => sheet('.gcode'));
  for (const ax of ['x', 'y', 'z']) art('print:rot' + ax, ...rotArt(ax));
  art('print:flat', () => flat(32), () => flat(0));
  art('print:center', () => top(38, 26), () => top(60, 45) + sk('M60,38v14M53,45h14', C.dim, 1));
  art('print:ghost', I(() => block(7) + path()), I(() => loops(8)));
  art('print:saveprof', () => sliders([0.7, 0.3, 0.55]), () => sheet('.json'));
  art('print:loadprof', () => sheet('.json'), () => sliders([0.7, 0.3, 0.55]));
  art('print:reset', () => sliders([0.9, 0.15, 0.8], C.warn), () => sliders([0.5, 0.5, 0.5]));
  art('print:layerdn', I(() => stack(5)), I(() => stack(4)));
  art('print:layerup', I(() => stack(4)), I(() => stack(5)));
  art('print:prof-draft', I(() => block(5)), I(() => block(3)));
  art('print:prof-standard', I(() => block(3)), I(() => block(5)));
  art('print:prof-fine', I(() => block(5)), I(() => block(8)));
  art('print:prof-ultra', I(() => block(5)), I(() => block(12)));
  art('set:layerHeight', I(() => block(4)), I(() => block(9)));
  art('set:wallCount', () => walls(1), () => walls(4));
  art('set:infillDensity', () => infill(26), () => infill(9));
  art('set:infillPattern', lines, wave);
  art('set:support', () => overhang(false), () => overhang(true));
  art('set:adhesion', () => adh('skirt'), () => adh('raft'));
  art('set:vase', I(() => block(7) + path()), I(() => cyl0()));
  function cyl0() { return A.cyl(0, 0, 0, 12, 14) + line([P(-12, 0, 5), P(12, 0, 5)], C.ok, 0.8); }

  const T = (k, d, steps) => { TIP_TXT[k] = [d, steps]; };
  T('print:slice', 'Cut the model into layers and plan every move of the nozzle.', ['Pick your printer, filament and quality.', 'Press Slice (Ctrl+Enter).', 'Scrub the layer slider, then save the G-code.']);
  T('print:save', 'Download the G-code file for your printer.', ['Slice first (it slices for you if you have not).', 'Press Save G-code.', 'Copy the file to a USB stick or microSD card and print it from the printer.']);
  for (const [ax, w] of [['x', 'side to side'], ['y', 'front to back'], ['z', 'flat on the bed, like a turntable']]) T('print:rot' + ax, `Turn the part 90° about the ${ax.toUpperCase()} axis (${w}).`, ['Click it again for another 90°.', 'Type any angle under Placement.', 'The slice goes out of date: slice again.']);
  T('print:flat', 'Put the largest flat face of the part on the bed.', ['Click it. The biggest flat face turns face down.', 'Check the overhangs; turn the part if another side is better.']);
  T('print:center', 'Move the part to the middle of the bed.', ['Click it.', 'Or type a position under Placement.']);
  T('print:ghost', 'Show or hide the solid model under the layer preview.', ['Hide it to see only the printed lines.', 'Show it to compare with the original shape.']);
  T('print:saveprof', 'Save every setting to a .json file.', ['Click it.', 'Keep the file, or share it.', 'Bring it back with Import settings.']);
  T('print:loadprof', 'Load settings you saved earlier.', ['Click it and choose a settings .json file.', 'The printer, filament and every option are restored.']);
  T('print:reset', 'Put every setting back to the standard values for this printer and filament.', ['Click it.', 'Placement and cost rates are kept.']);
  T('print:layerdn', 'Show one layer fewer in the preview.', ['Click, or press ↓ (Shift+↓ jumps 10).', 'Or drag the slider.']);
  T('print:layerup', 'Show one more layer in the preview.', ['Click, or press ↑ (Shift+↑ jumps 10).', 'Or drag the slider.']);
  T('print:prof-draft', 'Thick layers: fastest, rougher surface.', ['Click it.', 'Layer height, speeds and top / bottom layers change together.', 'Then slice.']);
  T('print:prof-standard', 'The everyday balance of speed and surface.', ['Click it.', 'Layer height, speeds and top / bottom layers change together.', 'Then slice.']);
  T('print:prof-fine', 'Thin layers: smoother curves, a longer print.', ['Click it.', 'Layer height, speeds and top / bottom layers change together.', 'Then slice.']);
  T('print:prof-ultra', 'The thinnest layers: the smoothest part, the longest print.', ['Click it.', 'Layer height, speeds and top / bottom layers change together.', 'Then slice.']);
  T('print:printer', 'The machine you will print on. It sets the bed size, nozzle, speed limits and start and end G-code.', ['Pick your Creality printer.', 'Temperatures and speeds are set to its limits.']);
  T('print:material', 'The filament. It sets temperatures, fan, retraction and the flow.', ['Pick the filament on your spool.', 'You can still change each value below.']);
  T('print:search', 'Find a setting by name or by what it does.', ['Type a word such as "seam" or "fan".', 'Matches from every group appear, including advanced ones.']);
  T('print:all', 'Show the advanced settings too.', ['Turn it on to see every option.', 'Turn it off for the short list.']);
  T('place:scale', 'Make the part bigger or smaller before printing.', ['Type a percent: 100 is the original size.', 'The part size shows under the boxes.']);
  for (const a of ['x', 'y', 'z']) T('place:r' + a, `Turn the part about the ${a.toUpperCase()} axis, in degrees.`, ['Type an angle, or press ↑ ↓ for 15° steps.', 'The part on the bed turns to match.']);
  T('place:partX', 'Where the middle of the part sits on the bed, left to right (mm).', ['Type a value, or use Center.']);
  T('place:partY', 'Where the middle of the part sits on the bed, front to back (mm).', ['Type a value, or use Center.']);
  T('place:sizeZ', 'The height of the part after turning and scaling (mm). It cannot be edited.', ['Change it with Scale or by turning the part.']);
  for (const [k, lab, , , tip] of COST_FIELDS) T('cost:' + k, tip || lab + '.', ['Type a value; the price updates as you type.']);
  T('cost:filamentCost', 'The price of a kilogram of filament. It is also under Material.', ['Type a value; the cost updates as you type.']);

  // every slicer option: what it does, its range, its standard value
  for (const g of Slicer.SETTINGS) for (const s of g.items) {
    Object.defineProperty(TIP_TXT, 'set:' + s.key, { enumerable: false, configurable: true, get() {
      const def = Slicer.defaults(PR.cfg.printer, PR.cfg.material)[s.key], u = s.unit ? ' ' + s.unit : '';
      const fmt = v => s.type === 'b' ? (v ? 'on' : 'off') : s.type === 's' ? ((s.options.find(o => o[0] === v) || [0, v])[1]) : v + u;
      const st = s.type === 'b' ? ['Click to turn it on or off.'] : s.type === 's' ? ['Pick one: ' + s.options.map(o => o[1]).join(', ') + '.'] : s.type === 't' ? ['Type G-code, one command per line.'] : ['Type a value or press ↑ ↓.' + (s.min != null ? ` Allowed: ${s.min} to ${s.max}${u}.` : '')];
      if (def != null && s.type !== 't') st.push('Standard for this printer and filament: ' + fmt(def) + '.');
      st.push('Slice again after changing it.');
      return [s.tip || s.label + '.', st];
    } });
  }
})();
// attach hover keys to controls that are built without one
function tagTips(root) {
  const set = (el, key, name, kbd) => { if (!el || el.dataset.tipkey) return; el.dataset.tipkey = key; if (name) el.dataset.tipname = name; if (kbd) el.dataset.tipkbd = kbd; };
  root.querySelectorAll('[data-print]').forEach(b => { const a = b.dataset.print; set(b, 'print:' + a, '', a === 'slice' ? 'Ctrl+Enter' : ''); });
  root.querySelectorAll('[data-l]').forEach(b => set(b, +b.dataset.l < 0 ? 'print:layerdn' : 'print:layerup', +b.dataset.l < 0 ? 'Layer down' : 'Layer up', +b.dataset.l < 0 ? '↓' : '↑'));
}

// the workspace button (index.html carries it; add it here for older pages)
(function ensureButton() {
  const ws = document.querySelector('.ws'); if (!ws || ws.querySelector('[data-ws="print"]')) return;
  const b = document.createElement('button'); b.dataset.ws = 'print'; b.textContent = '3D Print';
  b.addEventListener('click', () => setWorkspace('print')); ws.appendChild(b);
})();
})();
