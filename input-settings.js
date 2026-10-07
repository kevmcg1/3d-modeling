// ═══════════════════════════════════════════════════════════════════
//  Top-right "Export log" and the settings cog.
//
//  Export log: downloads a .txt with the recorded history (the ring buffer kept by the
//  debug trace from page load), console warnings and errors, uncaught exceptions, the app,
//  browser and screen details, the settings, and a snapshot of the model state.
//
//  Settings: what the left, middle and right mouse buttons and the wheel do, and every
//  shortcut, with "Change keyboard layout to" templates (Blender, SolidWorks, Fusion,
//  Mastercam, AutoCAD, Inventor, Onshape, FreeCAD, Rhino). Everything is saved between visits.
//  The mouse side lives in index.html (MOUSE); the keyboard side is a capture-phase listener
//  here that stays out of the way (one early return) until a shortcut has been changed.
// ═══════════════════════════════════════════════════════════════════
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } },
  };
  const log = (kind, what, data) => { try { Trace.log(kind, what, data); } catch (e) { /* trace not available */ } };

  // ───────────────────────── Shortcut table ─────────────────────────
  // scope: all (everywhere), sketch (while sketching), model (3D view). cam: also works in Manufacture.
  const A = (id, scope, label, def, run, extra) => ({ id, scope, label, def, run, ...extra });
  const hlp = () => { $('help').hidden = false; };
  const ACTIONS = [
    A('undo', 'all', 'Undo', 'ctrl+z', () => undo(), { cam: 1, mod: 1 }),
    A('redo', 'all', 'Redo', 'ctrl+y', () => redo(), { cam: 1, mod: 1, def2: 'ctrl+shift+z' }),
    A('save', 'all', 'Save', 'ctrl+s', () => saveFile(), { cam: 1, mod: 1 }),
    A('open', 'all', 'Open or import', 'ctrl+o', () => $('fileIn').click(), { cam: 1, mod: 1 }),
    A('export', 'all', 'Export', 'ctrl+e', () => openExport(), { cam: 1, mod: 1 }),
    A('help', 'all', 'Show shortcuts', '?', hlp, { cam: 1 }),
    A('view2d', 'all', 'Switch 2D / 3D view', 'v', () => set2D(!is2D()), { cam: 1 }),
    A('home', 'all', 'Home view (isometric, fit)', 'h', () => { animateView({ quat: ISO() }); setTimeout(() => fitAll(), 0); }, { cam: 1 }),
    A('fit', 'all', 'Fit everything in view', 'shift+f', () => fitAll(), { cam: 1 }),
    A('extrude', 'all', 'Extrude', 'e', () => action('extrude'), { cam: 1 }),
    A('exportlog', 'all', 'Export log', '', () => window.DatumLog.export(), { cam: 1 }),
    A('settings', 'all', 'Open settings', '', () => openSettings(), { cam: 1 }),
  ];
  const SK = [['st_select', 'Select', 's', 'select'], ['st_line', 'Line', 'l', 'line'], ['st_polyline', 'Polyline', 'y', 'polyline'], ['st_rect', 'Rectangle', 'r', 'rect'],
    ['st_circle', 'Circle', 'c', 'circle'], ['st_arc3', '3-point arc', 'a', 'arc3'], ['st_poly', 'Polygon', 'g', 'poly'], ['st_fillet', 'Sketch fillet', 'i', 'fillet'],
    ['st_trim', 'Trim', 't', 'trim'], ['st_extend', 'Extend', 'w', 'extend'], ['st_offset', 'Offset', 'o', 'offset'], ['st_mirror', 'Mirror', 'm', 'mirror'],
    ['st_project', 'Project', 'j', 'project'], ['st_origin', 'Origin point', 'z', 'origin'], ['st_array', 'Pattern', 'p', 'array'], ['st_dim', 'Dimension', 'd', 'dim'], ['st_text', 'Text', 'n', 'text']];
  ACTIONS.push(
    A('sk_dim', 'sketch', 'Update dimensions', 'ctrl+b', () => dimUpdate(), { mod: 1 }),
    A('sk_copy', 'sketch', 'Copy', 'ctrl+c', () => skCopy(false), { mod: 1 }),
    A('sk_cut', 'sketch', 'Cut', 'ctrl+x', () => skCopy(true), { mod: 1 }),
    A('sk_paste', 'sketch', 'Paste', 'ctrl+v', () => setTool('spaste'), { mod: 1 }));
  for (const [id, label, def, tool] of SK) ACTIONS.push(A(id, 'sketch', label, def, () => setTool(tool)));
  ACTIONS.push(A('sk_cons', 'sketch', 'Construction on / off', 'x', () => action('cons')));
  for (const [id, label, def, act] of [['m_sketch', 'New sketch', 'k', 'sketch'], ['m_plane', 'Construction plane', 'p', 'plane'], ['m_fillet', 'Fillet edges', 'f', 'fillet3'],
    ['m_chamfer', 'Chamfer edges', 'c', 'chamfer3'], ['m_thread', 'Thread', 't', 'thread'], ['m_point', 'Point', 'o', 'point'], ['m_measure', 'Measure', 'm', 'measure'],
    ['m_revolve', 'Revolve', 'r', 'f:revolve'], ['m_sweep', 'Sweep', 's', 'f:sweep'], ['m_loft', 'Loft', 'l', 'f:loft'], ['m_move', 'Move / copy', 'g', 'f:move']])
    ACTIONS.push(A(id, 'model', label, def, () => action(act)));
  const BY_ID = Object.fromEntries(ACTIONS.map(a => [a.id, a]));
  const GROUPS = [['all', 'Everywhere'], ['sketch', 'While sketching'], ['model', 'Modeling']];
  const RESERVED = ['escape', 'enter', 'delete', 'backspace', 'tab'];

  // combo strings: "ctrl+alt+shift+key", lower case ("ctrl+shift+z", "shift+f", "?", "f6", "home")
  function comboOf(e) {
    let k = e.key;
    if (!k || ['Shift', 'Control', 'Alt', 'Meta', 'Dead', 'Unidentified'].includes(k)) return '';
    k = k === ' ' ? 'space' : k.length === 1 ? k.toLowerCase() : k.toLowerCase();
    const letter = /^[a-z]$/.test(k);
    return (e.ctrlKey || e.metaKey ? 'ctrl+' : '') + (e.altKey ? 'alt+' : '') + (e.shiftKey && (letter || k.length > 1) ? 'shift+' : '') + k;
  }
  const NAMES = { arrowleft: '←', arrowright: '→', arrowup: '↑', arrowdown: '↓', space: 'Space', pageup: 'Page Up', pagedown: 'Page Down' };
  const pretty = c => !c ? '' : c.split('+').map(p => NAMES[p] || (p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1))).join(' + ');
  const overlap = (a, b) => a === 'all' || b === 'all' || a === b;

  // current bindings
  let KEYS = {};
  const defaults = () => Object.fromEntries(ACTIONS.map(a => [a.id, a.def]));
  const DEFAULTS = defaults();
  function loadKeys() {
    KEYS = defaults();
    try { Object.assign(KEYS, JSON.parse(store.get('datum.keys') || '{}')); } catch (e) { /* ignore bad data */ }
    for (const id of Object.keys(KEYS)) if (!BY_ID[id]) delete KEYS[id];
  }
  const changed = () => ACTIONS.some(a => KEYS[a.id] !== a.def);
  function saveKeys() {
    const d = {}; for (const a of ACTIONS) if (KEYS[a.id] !== a.def) d[a.id] = KEYS[a.id];
    if (Object.keys(d).length) store.set('datum.keys', JSON.stringify(d)); else store.del('datum.keys');
    rebuild();
  }
  // lookup tables, rebuilt on change: combo → action, per scope, for the current and the default bindings
  let LK = null, DLK = null, ACTIVE = false;
  function table(get, scope, onlyChanged) {
    const m = new Map();
    for (const a of ACTIONS) {
      if (!overlap(a.scope, scope) || (onlyChanged && KEYS[a.id] === a.def)) continue;
      for (const c of get(a)) if (c && !m.has(c)) m.set(c, a);
    }
    return m;
  }
  function rebuild() {
    ACTIVE = changed();
    LK = { sketch: table(a => [KEYS[a.id]], 'sketch'), model: table(a => [KEYS[a.id]], 'model') };
    DLK = { sketch: table(a => [a.def, a.def2], 'sketch', true), model: table(a => [a.def, a.def2], 'model', true) };
  }
  function conflictsOf(id) {
    const a = BY_ID[id], c = KEYS[id];
    if (!c) return [];
    return ACTIONS.filter(b => b.id !== id && KEYS[b.id] === c && overlap(a.scope, b.scope));
  }

  // ───────────────────────── Shortcut dispatch ─────────────────────────
  let cap = null;   // the action whose key is being recorded
  const isTyping = () => { const ae = document.activeElement; return ae && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable); };
  window.addEventListener('keydown', e => {
    if (cap) { capture(e); return; }
    if (!ACTIVE) return;   // nothing changed: the app's own handler does everything
    const combo = comboOf(e);
    if (!combo || isTyping()) return;
    const hasMod = combo.startsWith('ctrl+');
    if (!hasMod && (!$('modal').hidden || !$('help').hidden)) return;
    if (UIX.ws === 'cam' && SIM.on && !hasMod) return;
    if (S.sk && typeof dimSpec === 'function' && dimSpec() && /^[0-9.\-]$/.test(e.key)) return;
    const scope = S.sk ? 'sketch' : 'model';
    const hit = LK[scope].get(combo);
    if (hit) {
      if (KEYS[hit.id] === hit.def && combo === hit.def) return;   // untouched: leave it to the app
      if (UIX.ws === 'cam' && !hit.cam) return;
      e.preventDefault(); e.stopImmediatePropagation();
      hit.run();
      return;
    }
    if (DLK[scope].has(combo)) {   // the key's old meaning was moved or cleared: don't fire it
      if (hasMod) e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  // ───────────────────────── Mouse templates ─────────────────────────
  const M = (o) => o;
  const TEMPLATES = [
    { id: 'datum', name: 'Datum (default)', mouse: M({}), keys: {} },
    { id: 'blender', name: 'Blender', mouse: M({ left: 'none', middle: 'orbit', midShift: 'pan', midCtrl: 'zoom', right: 'none', rightShift: 'same', wheelAt: 'center', pivot: 'center' }),
      keys: { redo: 'ctrl+shift+z', view2d: '5', fit: 'home', m_move: 'g', m_fillet: 'ctrl+b', st_mirror: 'ctrl+m', extrude: 'e' } },
    { id: 'solidworks', name: 'SolidWorks', mouse: M({ left: 'none', middle: 'orbit', midShift: 'zoom', midCtrl: 'pan', right: 'none', rightShift: 'same' }),
      keys: { fit: 'f', home: 'ctrl+7', view2d: 'ctrl+8', st_line: 'l', st_dim: 'd', m_sketch: 's', m_sweep: 'w' } },
    { id: 'fusion', name: 'Fusion', mouse: M({ left: 'none', middle: 'pan', midShift: 'orbit', midCtrl: 'zoom', right: 'none', rightShift: 'same' }),
      keys: { fit: 'f6', home: 'home', st_line: 'l', st_rect: 'r', st_circle: 'c', st_arc3: 'a', st_trim: 't', st_offset: 'o', st_project: 'p', st_dim: 'd', st_fillet: 'ctrl+f', st_mirror: 'ctrl+m', m_fillet: 'f', m_move: 'm', m_measure: 'i', m_sketch: 's' } },
    { id: 'mastercam', name: 'Mastercam', mouse: M({ left: 'none', middle: 'orbit', midShift: 'pan', midCtrl: 'zoom', right: 'none', rightShift: 'same' }),
      keys: { fit: 'alt+f1', home: 'alt+7', view2d: 'alt+1', redo: 'ctrl+y' } },
    { id: 'autocad', name: 'AutoCAD', mouse: M({ left: 'none', middle: 'pan', midShift: 'orbit', right: 'none', rightShift: 'same', midClick: 'none' }),
      keys: { redo: 'ctrl+y', st_line: 'l', st_circle: 'c', st_arc3: 'a', st_offset: 'o', st_text: 't', st_trim: 'ctrl+t', st_fillet: 'f', st_mirror: 'ctrl+m', m_move: 'm', m_measure: 'ctrl+m', fit: 'f2' } },
    { id: 'inventor', name: 'Inventor', mouse: M({ left: 'none', middle: 'pan', midShift: 'orbit', midCtrl: 'zoom', right: 'none', rightShift: 'same' }),
      keys: { home: 'f6', fit: 'f5', st_line: 'l', st_circle: 'c', st_dim: 'd', st_trim: 't', st_offset: 'o', st_project: 'p', m_sketch: 's', m_fillet: 'f', m_revolve: 'r', m_sweep: 'ctrl+w' } },
    { id: 'onshape', name: 'Onshape', mouse: M({ left: 'none', middle: 'pan', midShift: 'same', right: 'orbit', rightShift: 'pan', rightCtrl: 'zoom' }),
      keys: { st_line: 'l', st_circle: 'c', st_rect: 'r', st_arc3: 'a', st_dim: 'd', st_trim: 't', st_offset: 'o', st_mirror: 'ctrl+m', m_sketch: 's', m_sweep: 'ctrl+w', m_fillet: 'f' } },
    { id: 'freecad', name: 'FreeCAD', mouse: M({ left: 'none', middle: 'pan', midShift: 'orbit', midCtrl: 'zoom', right: 'none', rightShift: 'same' }),
      keys: { home: '0', view2d: '2', redo: 'ctrl+y', fit: 'v' } },
    { id: 'rhino', name: 'Rhino', mouse: M({ left: 'none', middle: 'none', midShift: 'same', right: 'orbit', rightShift: 'pan', rightCtrl: 'zoom', rightClick: 'none' }),
      keys: { fit: 'ctrl+shift+e', redo: 'ctrl+y', m_move: 'g' } },
  ];
  const TBY = Object.fromEntries(TEMPLATES.map(t => [t.id, t]));
  const MOUSE_KEYS = ['left', 'middle', 'right', 'midShift', 'midCtrl', 'rightShift', 'rightCtrl', 'rightClick', 'midClick', 'wheel', 'wheelAt', 'wheelSpeed', 'pivot', 'sens', 'invertOrbit', 'invertWheel'];
  // what a template sets: its mouse on top of the defaults; its keys on top of the defaults, where a default key that the template
  // took for something else is left unassigned instead of doing two things
  function resolve(t) {
    const mouse = { ...MOUSE_DEF, ...t.mouse };
    const keys = defaults();
    for (const [id, c] of Object.entries(t.keys)) keys[id] = c;
    for (const a of ACTIONS) {
      if (a.id in t.keys) continue;
      const taken = ACTIONS.some(b => b !== a && b.id in t.keys && keys[b.id] === keys[a.id] && overlap(a.scope, b.scope));
      if (taken) keys[a.id] = '';
    }
    return { mouse, keys };
  }
  const same = (x, y) => MOUSE_KEYS.every(k => x[k] === y[k]);
  function currentLayout() {
    for (const t of TEMPLATES) { const r = resolve(t); if (same(r.mouse, MOUSE) && ACTIONS.every(a => r.keys[a.id] === KEYS[a.id])) return t.id; }
    return 'custom';
  }
  function applyTemplate(id) {
    const t = TBY[id]; if (!t) return;
    const r = resolve(t);
    for (const k of MOUSE_KEYS) MOUSE[k] = r.mouse[k];
    mouseSave();
    KEYS = r.keys; saveKeys();
    log('settings', 'layout → ' + t.name);
    if (typeof toast === 'function') toast('Layout: ' + t.name);
  }

  // ───────────────────────── Settings panel ─────────────────────────
  const css = document.createElement('style');
  css.textContent = `
#btnExportLog { color: var(--accent); background: var(--accent-soft, rgba(36,96,200,.1)); border-color: color-mix(in srgb, var(--accent) 35%, transparent); margin-left: 6px; font-weight: 600; transition: background .18s var(--ease), border-color .18s var(--ease), transform .12s; }
#btnExportLog:hover { background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--accent); }
#btnExportLog span { display: inline !important; }
#btnSettings svg { transition: transform .5s var(--ease); }
#btnSettings:hover svg { transform: rotate(60deg); }
/* keep Settings and Export log on screen: the workspace tabs give way (and scroll) before the right-hand buttons do */
#topbar .brand { min-width: 0; flex: 1 1 auto; }
#topbar .ws { min-width: 0; flex: 0 1 auto; overflow-x: auto; scrollbar-width: none; }
#topbar .ws::-webkit-scrollbar { display: none; }
#topbar .tb-right { flex: none; }
#topbar .tb-right .tb { white-space: nowrap; }
#topbar #gsearch { width: clamp(110px, 12vw, 250px); }
@media (max-width: 1700px) { #topbar .tb-right .tb:not(#btnExportLog) span { display: none; } #topbar .tb-right .tb:not(#btnExportLog) { min-width: 34px; } }
#modalCard.st-wide { width: min(760px, 94vw); }
.st .st-layout { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 10px 12px; border: 1px solid var(--rule); border-radius: 10px; background: var(--panel-2); margin: 8px 0 4px; }
.st .st-layout b { font-weight: 600; }
.st .st-layout select { min-width: 190px; }
.st .st-note, .st .st-hint { color: var(--muted); font-size: 11.5px; }
.st .st-tabs { position: relative; display: flex; gap: 4px; border-bottom: 1px solid var(--rule); margin: 12px 0 8px; }
.st .st-tabs button { background: none; border: 0; padding: 8px 14px; cursor: pointer; font-weight: 600; color: var(--muted); transition: color .15s; }
.st .st-tabs button.on { color: var(--accent); }
.st .st-tabs i { position: absolute; bottom: -1px; height: 2px; background: var(--accent); border-radius: 2px; transition: left .25s var(--ease), width .25s var(--ease); }
.st .st-pane { animation: st-in .22s var(--ease) both; }
@keyframes st-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
html.calm .st .st-pane { animation: none; }
.st table { width: 100%; border-collapse: collapse; font-size: 13px; }
.st th { text-align: left; font-weight: 600; color: var(--muted); font-size: 11.5px; padding: 4px 6px; }
.st td { padding: 5px 6px; border-top: 1px solid var(--rule); vertical-align: middle; }
.st td select, .st .st-row select { width: 100%; }
.st .st-row { display: grid; grid-template-columns: 1fr minmax(150px, 230px); gap: 8px 14px; align-items: center; padding: 6px 0; border-top: 1px solid var(--rule); }
.st .st-row small { display: block; color: var(--muted); font-size: 11px; }
.st .st-sec { margin: 14px 0 2px; font-weight: 650; font-size: 12px; letter-spacing: .02em; text-transform: uppercase; color: var(--ink-2); }
.st input[type=search] { width: 100%; padding: 7px 10px; border: 1px solid var(--rule); border-radius: 8px; background: var(--panel); margin-bottom: 4px; }
.st .st-keys { max-height: min(48vh, 440px); overflow-y: auto; padding-right: 4px; }
.st .kr { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; align-items: center; padding: 4px 0; border-top: 1px solid var(--rule); transition: background .2s; }
.st .kr.bad { background: color-mix(in srgb, var(--danger) 7%, transparent); }
.st .kr small { grid-column: 1 / -1; color: var(--danger); font-size: 11px; margin-top: -2px; }
.st .kc { min-width: 120px; padding: 5px 10px; border: 1px solid var(--rule); border-radius: 7px; background: var(--panel); cursor: pointer; font-weight: 600; transition: border-color .15s, background .15s, color .15s; font-variant-numeric: normal; }
.st .kc:hover { border-color: var(--accent); }
.st .kc.empty { color: var(--muted); font-weight: 400; }
.st .kc.mod { border-color: color-mix(in srgb, var(--accent) 60%, var(--rule)); }
.st .kc.bad { border-color: var(--danger); color: var(--danger); }
.st .kc.rec { border-color: var(--accent); background: var(--accent-soft, rgba(36,96,200,.1)); color: var(--accent); animation: st-pulse 1s ease-in-out infinite; }
@keyframes st-pulse { 50% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent); } }
html.calm .st .kc.rec { animation: none; }
.st .kx { width: 26px; height: 26px; border: 0; border-radius: 6px; background: none; color: var(--muted); cursor: pointer; opacity: 0; pointer-events: none; transition: opacity .15s, background .15s; }
.st .kx.show { opacity: 1; pointer-events: auto; }
.st .kx:hover { background: var(--panel-2); color: var(--ink); }
`;
  document.head.appendChild(css);

  const ACT_OPTS = [['none', 'Nothing'], ['orbit', 'Orbit'], ['pan', 'Pan'], ['zoom', 'Zoom']];
  const SAME_OPTS = [['same', 'Same as without a key']].concat(ACT_OPTS);
  const opt = (list, cur) => list.map(([v, l]) => `<option value="${v}" ${String(cur) === v ? 'selected' : ''}>${l}</option>`).join('');
  const sel = (k, list) => `<select data-ms="${k}">${opt(list, MOUSE[k])}</select>`;

  function mousePane() {
    return `<div class="st-pane" data-pane="mouse">
      <table><thead><tr><th>Drag with</th><th>Alone</th><th>Holding Shift</th><th>Holding Ctrl</th></tr></thead><tbody>
        <tr><td>Left button</td><td>${sel('left', ACT_OPTS)}</td><td class="st-hint" colspan="2">Clicking always selects. Alt + left drag always orbits (with Shift: pan).</td></tr>
        <tr><td>Middle button</td><td>${sel('middle', ACT_OPTS)}</td><td>${sel('midShift', SAME_OPTS)}</td><td>${sel('midCtrl', SAME_OPTS)}</td></tr>
        <tr><td>Right button</td><td>${sel('right', ACT_OPTS)}</td><td>${sel('rightShift', SAME_OPTS)}</td><td>${sel('rightCtrl', SAME_OPTS)}</td></tr>
      </tbody></table>
      <div class="st-sec">Clicks</div>
      <div class="st-row"><div>Right click</div>${sel('rightClick', [['menu', 'Opens the context menu'], ['none', 'Does nothing']])}</div>
      <div class="st-row"><div>Middle click</div>${sel('midClick', [['none', 'Does nothing'], ['fit', 'Fits the model in view'], ['home', 'Goes to the home view']])}</div>
      <div class="st-sec">Mouse wheel</div>
      <div class="st-row"><div>Scrolling</div>${sel('wheel', [['zoom', 'Zooms'], ['orbit', 'Orbits'], ['pan', 'Pans'], ['none', 'Does nothing']])}</div>
      <div class="st-row"><div>Zoom toward</div>${sel('wheelAt', [['cursor', 'The point under the cursor'], ['center', 'The center of the view']])}</div>
      <div class="st-row"><div>Wheel speed</div><input type="range" data-ms="wheelSpeed" min="0.3" max="3" step="0.1" value="${MOUSE.wheelSpeed}"></div>
      <div class="st-row"><div>Reverse the wheel</div><input type="checkbox" data-ms="invertWheel" ${MOUSE.invertWheel ? 'checked' : ''}></div>
      <div class="st-sec">Orbit</div>
      <div class="st-row"><div>Orbit around</div>${sel('pivot', [['cursor', 'The point under the cursor'], ['center', 'The center of the view']])}</div>
      <div class="st-row"><div>Orbit speed</div><input type="range" data-ms="sens" min="0.3" max="3" step="0.1" value="${MOUSE.sens}"></div>
      <div class="st-row"><div>Invert orbit</div><input type="checkbox" data-ms="invertOrbit" ${MOUSE.invertOrbit ? 'checked' : ''}></div>
    </div>`;
  }
  function keyRow(a) {
    const c = KEYS[a.id], bad = conflictsOf(a.id), modified = c !== a.def;
    return `<div class="kr${bad.length ? ' bad' : ''}" data-id="${a.id}" data-label="${a.label.toLowerCase()}">
      <div>${a.label}</div>
      <button class="kc${c ? '' : ' empty'}${modified ? ' mod' : ''}${bad.length ? ' bad' : ''}" data-rec="${a.id}">${c ? pretty(c) : 'Not set'}</button>
      <button class="kx${modified ? ' show' : ''}" data-kreset="${a.id}" title="Back to ${a.def ? pretty(a.def) : 'not set'}">↺</button>
      ${bad.length ? `<small>Also used by ${bad.map(b => b.label).join(', ')}. The first one in the list wins.</small>` : ''}
    </div>`;
  }
  function keysPane(filter) {
    const f = (filter || '').toLowerCase();
    return GROUPS.map(([sc, name]) => {
      const rows = ACTIONS.filter(a => a.scope === sc && (!f || a.label.toLowerCase().includes(f) || pretty(KEYS[a.id]).toLowerCase().includes(f)));
      return rows.length ? `<div class="st-sec">${name}</div>${rows.map(keyRow).join('')}` : '';
    }).join('') || '<p class="st-hint">No shortcut matches.</p>';
  }

  let tab = 'mouse', filterText = '';
  function render() {
    const card = $('modalCard');
    const cur = currentLayout();
    card.classList.add('st-wide');
    card.innerHTML = `<div class="st"><div class="m-head"><h3>Settings</h3><button class="x" data-mx title="Close">×</button></div>
      <div class="st-layout"><b>Change keyboard layout to</b>
        <select id="stLayout">${TEMPLATES.map(t => `<option value="${t.id}" ${cur === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}<option value="custom" ${cur === 'custom' ? 'selected' : ''} disabled>Custom (your changes)</option></select>
        <span class="st-note">Sets the mouse and the shortcuts to that program's usual defaults, closest equivalents where Datum has no matching command. Change any of them below.</span></div>
      <div class="st-tabs"><button data-tab="mouse" class="${tab === 'mouse' ? 'on' : ''}">Mouse</button><button data-tab="keys" class="${tab === 'keys' ? 'on' : ''}">Keyboard</button><i></i></div>
      <div id="stBody">${tab === 'mouse' ? mousePane() : `<div class="st-pane" data-pane="keys"><input type="search" id="stFilter" placeholder="Search shortcuts" value="${filterText.replace(/"/g, '&quot;')}"><div class="st-keys" id="stKeys">${keysPane(filterText)}</div><p class="st-hint">Click a key, then press the new combination. Backspace clears it, Esc cancels. Esc, Enter, Delete and Tab are reserved.</p></div>`}</div>
      <div class="btns"><button class="btn" id="stResetAll">Reset everything to defaults</button><button class="btn primary" data-mx>Done</button></div></div>`;
    placeInk();
    card.querySelectorAll('[data-mx]').forEach(b => b.addEventListener('click', closeModal));
  }
  function placeInk() {
    const tabs = $('modalCard').querySelector('.st-tabs'), on = tabs && tabs.querySelector('button.on'), ink = tabs && tabs.querySelector('i');
    if (on && ink) { ink.style.left = on.offsetLeft + 'px'; ink.style.width = on.offsetWidth + 'px'; }
  }
  function refreshLayoutSelect() {
    const s = $('stLayout'); if (!s) return;
    s.value = currentLayout(); if (s.value !== currentLayout()) s.value = 'custom';
  }
  function openSettings() {
    tab = tab || 'mouse';
    render();
    $('modal').hidden = false;
    placeInk();
  }
  window.openMouseSettings = openSettings;   // File → Mouse & navigation opens the same panel

  const card = () => $('modalCard');
  document.addEventListener('click', e => {
    const c = card(); if (!c || !c.contains(e.target) || !c.querySelector('.st')) return;
    const t = e.target.closest('[data-tab]');
    if (t && t.dataset.tab !== tab) { tab = t.dataset.tab; render(); return; }
    const rec = e.target.closest('[data-rec]');
    if (rec) { startCapture(rec); return; }
    const kr = e.target.closest('[data-kreset]');
    if (kr) { KEYS[kr.dataset.kreset] = BY_ID[kr.dataset.kreset].def; saveKeys(); log('settings', 'shortcut reset: ' + kr.dataset.kreset); refreshKeys(); return; }
    if (e.target.closest('#stResetAll')) {
      applyTemplate('datum'); render(); return;
    }
  });
  document.addEventListener('change', e => {
    const c = card(); if (!c || !c.contains(e.target) || !c.querySelector('.st')) return;
    if (e.target.id === 'stLayout') { applyTemplate(e.target.value); render(); return; }
    const t = e.target.closest('[data-ms]');
    if (t) {
      MOUSE[t.dataset.ms] = t.type === 'checkbox' ? t.checked : t.type === 'range' ? +t.value : t.value;
      mouseSave(); refreshLayoutSelect();
      log('settings', 'mouse ' + t.dataset.ms + ' = ' + MOUSE[t.dataset.ms]);
    }
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'stFilter') { filterText = e.target.value; $('stKeys').innerHTML = keysPane(filterText); }
  });
  const refreshKeys = () => { const k = $('stKeys'); if (k) k.innerHTML = keysPane(filterText); refreshLayoutSelect(); };

  // recording a key
  function startCapture(btn) {
    stopCapture();
    cap = BY_ID[btn.dataset.rec]; cap.btn = btn;
    btn.classList.add('rec'); btn.textContent = 'Press keys…';
  }
  function stopCapture() {
    if (!cap) return;
    const b = cap.btn; cap = null;
    if (b && b.isConnected) refreshKeys();
  }
  function capture(e) {
    e.preventDefault(); e.stopImmediatePropagation();
    const combo = comboOf(e);
    if (!combo) return;   // just a modifier so far
    if (combo === 'escape') { stopCapture(); return; }
    if (combo === 'backspace') { KEYS[cap.id] = ''; log('settings', 'shortcut cleared: ' + cap.id); saveKeys(); stopCapture(); return; }
    if (RESERVED.includes(combo.split('+').pop())) { if (typeof toast === 'function') toast('That key is reserved.'); return; }
    KEYS[cap.id] = combo; log('settings', 'shortcut ' + cap.id + ' = ' + combo);
    saveKeys(); stopCapture();
  }
  // clicking away from the panel while recording ends the recording
  document.addEventListener('pointerdown', e => { if (cap && !e.target.closest('[data-rec]')) stopCapture(); }, true);

  // keep the panel's modal width from leaking into other dialogs
  new MutationObserver(() => { const m = $('modal'); if (m.hidden) { cap = null; $('modalCard').classList.remove('st-wide'); } }).observe($('modal'), { attributes: true, attributeFilter: ['hidden'] });
  window.addEventListener('resize', () => { if (!$('modal').hidden) placeInk(); });

  // ───────────────────────── Export log ─────────────────────────
  const SECRET = /(pass(word|wd)?|secret|token|api[_-]?key|authorization|bearer|cookie|session[_-]?id|credential|private[_-]?key)/i;
  const scrub = t => t
    .replace(/(bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, '$1[redacted]')
    .replace(/((?:pass(?:word|wd)?|secret|token|api[_-]?key|authorization|cookie|credential|private[_-]?key)["']?\s*[:=]\s*["']?)[^\s"',;&}]+/gi, '$1[redacted]');
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const iso = ts => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`; };
  function webgl() {
    try {
      const c = document.createElement('canvas'), g = c.getContext('webgl2') || c.getContext('webgl'); if (!g) return 'not available';
      const x = g.getExtension('WEBGL_debug_renderer_info');
      const out = `${g.getParameter(x ? x.UNMASKED_RENDERER_WEBGL : g.RENDERER)} (${g.getParameter(x ? x.UNMASKED_VENDOR_WEBGL : g.VENDOR)}), max texture ${g.getParameter(g.MAX_TEXTURE_SIZE)}`;
      const l = g.getExtension('WEBGL_lose_context'); if (l) l.loseContext();
      return out;
    } catch (e) { return 'unknown (' + e.message + ')'; }
  }
  const safe = (f, d = '?') => { try { const v = f(); return v === undefined ? d : v; } catch (e) { return d; } };
  const mm = q => safe(() => matchMedia(q).matches);
  function section(title, lines) { return `\n== ${title} ${'='.repeat(Math.max(2, 70 - title.length))}\n${lines.join('\n')}\n`; }

  function environment() {
    const n = navigator, nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    return section('APP, BROWSER AND SCREEN', [
      `App: Datum (3D modeling / CAM), file format version ${safe(() => VERSION)}`,
      `Page: ${location.origin === 'null' ? location.protocol + '//' : location.origin}${location.pathname}   (query and hash left out)`,
      `Page loaded: ${iso(Trace.t0w)}   Exported: ${iso(Date.now())}   Session length: ${((Date.now() - Trace.t0w) / 60000).toFixed(1)} min`,
      `Page load time: ${nav ? Math.round(nav.domContentLoadedEventEnd) + ' ms to DOMContentLoaded' : '?'}`,
      `User agent: ${n.userAgent}`,
      `Platform: ${safe(() => n.userAgentData.platform, n.platform)}   Language: ${n.languages ? n.languages.join(', ') : n.language}   Time zone: ${safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone)}`,
      `CPU threads: ${n.hardwareConcurrency || '?'}   Device memory: ${n.deviceMemory ? n.deviceMemory + ' GB' : '?'}   Touch points: ${n.maxTouchPoints || 0}   Online: ${n.onLine}`,
      `Screen: ${screen.width}×${screen.height} (available ${screen.availWidth}×${screen.availHeight}), ${screen.colorDepth}-bit, pixel ratio ${devicePixelRatio}`,
      `Window: ${innerWidth}×${innerHeight}   Orientation: ${safe(() => screen.orientation.type)}   Fullscreen: ${!!document.fullscreenElement}`,
      `Dark scheme: ${mm('(prefers-color-scheme: dark)')}   Reduced motion: ${mm('(prefers-reduced-motion: reduce)')}   Fine pointer: ${mm('(pointer: fine)')}`,
      `Graphics: ${webgl()}`,
      `JS heap: ${safe(() => (performance.memory.usedJSHeapSize / 1048576).toFixed(0) + ' MB used of ' + (performance.memory.totalJSHeapSize / 1048576).toFixed(0) + ' MB')}`,
    ]);
  }
  function settingsInfo() {
    const keys = ACTIONS.filter(a => KEYS[a.id] !== a.def).map(a => `${a.label}: ${pretty(KEYS[a.id]) || 'not set'} (default ${pretty(a.def) || 'not set'})`);
    const stored = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i); if (!/^datum\./.test(k)) continue;
        const v = localStorage.getItem(k) || '';
        stored.push(`${k} = ${SECRET.test(k) ? '[redacted]' : v.length > 240 ? `(${v.length} characters)` : v}`);
      }
    } catch (e) { stored.push('(storage unavailable)'); }
    return section('SETTINGS', [
      `Layout: ${(TBY[currentLayout()] || { name: 'Custom' }).name}`,
      `Mouse: ${JSON.stringify(MOUSE)}`,
      `Changed shortcuts: ${keys.length ? '\n  ' + keys.join('\n  ') : 'none'}`,
      `Console echo of the log: ${Trace.on ? 'on' : 'off'}`,
      `Saved in this browser:\n  ${stored.join('\n  ') || '(nothing)'}`,
    ]);
  }
  function stateInfo() {
    const L = [], ctx = Trace.ctx();
    L.push(`Workspace: ${ctx.ws}   Tab: ${safe(() => UIX.tab)}   Mode: ${safe(() => $('modeChip').textContent)}`);
    L.push(`Sketch: ${ctx.sketch ? ctx.sketch + ' (tool ' + ctx.tool + ')' : 'none'}   Command: ${ctx.cmd || 'none'}   Simulation: ${ctx.sim || 'off'}`);
    L.push(`Units: ${safe(() => isIn() ? 'inches' : 'millimeters')}   Selection mode: ${safe(() => SELMODE)}   Selected: ${safe(() => (sel3D ? sel3D.kind : 'nothing') + ', ' + selProfiles.length + ' profile(s), ' + selEdges.length + ' edge(s)')}`);
    L.push(`View: target ${safe(() => view.target.toArray().map(v => +v.toFixed(3)).join(', '))}, height ${safe(() => +view.viewH.toFixed(3))}, 2D ${safe(() => is2D())}, shading ${safe(() => SHADE)}`);
    L.push(`Visibility: ${safe(() => JSON.stringify(VIS))}`);
    L.push(`Undo steps: ${safe(() => undoStack.length, '?')}   Redo steps: ${safe(() => redoStack.length, '?')}`);
    try {
      const feats = doc.features || [];
      L.push(`Model: ${feats.length} feature(s), ${(doc.cam && doc.cam.ops ? doc.cam.ops.length : 0)} machining operation(s)`);
      L.push(...feats.map(f => `  #${f.id} ${f.type} "${f.name || ''}"${f.suppressed ? ' (suppressed)' : ''}`));
      let j = safe(() => snap(), '');
      if (j.length > 250000) j = j.slice(0, 250000) + `\n… (cut: ${j.length} characters in all)`;
      L.push('Model data (JSON):', j);
    } catch (e) { L.push('Model: unavailable (' + e.message + ')'); }
    return section('CURRENT STATE', L);
  }
  function history() {
    const b = Trace.buf, total = Trace.n || b.length;
    const lines = b.map(e => {
      const ctx = [e.sketch && 'sketch=' + e.sketch, e.tool && 'tool=' + e.tool, e.cmd && 'cmd=' + e.cmd, e.sim && 'sim=' + e.sim].filter(Boolean);
      const what = String(e.what).replace(/\n/g, '\n      ');
      return `${iso(e.ts || Trace.t0w + e.t * 1000)}  +${String(e.t).padStart(8)}s  ${(e.level === 'error' ? 'ERROR ' : e.level === 'warn' ? 'WARN  ' : '      ') + e.kind.padEnd(9)} ${e.ws}  ${what}${e.data !== undefined ? '  ' + e.data : ''}${ctx.length ? '   [' + ctx.join(' ') + ']' : ''}`;
    });
    const errs = b.filter(e => e.level === 'error').length, warns = b.filter(e => e.level === 'warn').length;
    return section('SUMMARY', [`${b.length} events kept${total > b.length ? ` (the oldest ${total - b.length} of ${total} were dropped; the log keeps the latest ${Trace.cap})` : ''}, ${errs} error(s), ${warns} warning(s)`])
      + section('EVENT LOG (time, seconds since page load, level, kind, workspace, what happened)', lines.length ? lines : ['(nothing yet)']);
  }
  function buildLog() {
    log('export', 'log exported');
    const head = ['DATUM DEBUG LOG', 'Everything recorded since the page loaded: clicks, tool and tab changes, parameter edits, keys, mouse, undo/redo,', 'operations, simulation, imports and exports, console warnings and errors, uncaught exceptions. Passwords and tokens are left out.'];
    return scrub(head.join('\n') + '\n' + environment() + settingsInfo() + stateInfo() + history());
  }
  function exportLog() {
    let text;
    try { text = buildLog(); } catch (e) { text = 'DATUM DEBUG LOG\nThe log could not be fully built: ' + e.message + '\n' + (e.stack || '') + '\n' + safe(() => history(), ''); }
    const d = new Date(), name = `datum-log-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.txt`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    if (typeof toast === 'function') toast(`Log exported (${Trace.buf.length} events)`);
    return text;
  }
  window.DatumLog = { export: exportLog, build: buildLog };

  // ───────────────────────── Extra things worth recording ─────────────────────────
  const wrap = (name, fmt) => {
    const f = window[name];
    if (typeof f !== 'function' || f._logged) return;
    const w = function (...a) { let d = ''; try { d = fmt ? fmt(...a) : ''; } catch (e) { /* ignore */ } log('call', name + (d ? ' ' + d : '')); return f.apply(this, a); };
    w._logged = true; window[name] = w;
  };
  wrap('camEdit', (op, k, v) => `${op && op.name || ''} ${k} = ${typeof v === 'object' ? JSON.stringify(v) : v}`);
  wrap('camToggleFace'); wrap('camOptimizeAll');
  wrap('download', n => n);
  wrap('runExport', k => k);
  wrap('mouseSave');
  // wheel bursts in the viewport: one line per burst, not one per tick
  const ov = $('ov');
  if (ov) {
    let burst = null;
    ov.addEventListener('wheel', e => {
      if (!burst) { burst = { n: 0, sum: 0, t: setTimeout(() => { log('view', `wheel ×${burst.n}`, { deltaY: Math.round(burst.sum) }); burst = null; }, 400) }; }
      burst.n++; burst.sum += e.deltaY;
    }, { passive: true, capture: true });
  }
  let rs = 0;
  addEventListener('resize', () => { clearTimeout(rs); rs = setTimeout(() => log('window', `resized to ${innerWidth}×${innerHeight}`), 400); });
  document.addEventListener('visibilitychange', () => log('window', document.hidden ? 'tab hidden' : 'tab visible'));
  addEventListener('online', () => log('window', 'online')); addEventListener('offline', () => log('window', 'offline'));
  addEventListener('pagehide', () => log('window', 'page closed or reloaded'));
  log('session', 'page loaded', { ua: navigator.userAgent.slice(0, 80), screen: `${screen.width}x${screen.height}@${devicePixelRatio}` });

  // ───────────────────────── Top-bar buttons ─────────────────────────
  const right = document.querySelector('#topbar .tb-right');
  if (right && !$('btnSettings')) {
    right.insertAdjacentHTML('beforeend',
      `<button class="tb" id="btnSettings" title="Settings: mouse buttons, wheel and keyboard layout"><svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="2.6"/><path d="M10 2.2l1.1 2 2.3-.5.9 2.2 2.2.9-.5 2.3 2 1.1-2 1.1.5 2.3-2.2.9-.9 2.2-2.3-.5-1.1 2-1.1-2-2.3.5-.9-2.2-2.2-.9.5-2.3-2-1.1 2-1.1-.5-2.3 2.2-.9.9-2.2 2.3.5z"/></svg><span>Settings</span></button>` +
      `<button class="tb" id="btnExportLog" title="Export log: downloads a .txt of everything you did, plus errors and the app state, for debugging"><svg viewBox="0 0 20 20"><path d="M5 2h7l4 4v12H5z"/><path d="M12 2v4h4"/><path d="M10 9v5M7.8 12L10 14.3 12.2 12"/></svg><span>Export log</span></button>`);
    $('btnSettings').addEventListener('click', openSettings);
    $('btnExportLog').addEventListener('click', exportLog);
  }
  loadKeys(); rebuild();
  window.DatumKeys = { get: () => ({ ...KEYS }), combo: comboOf, actions: ACTIONS.map(a => a.id) };
})();
