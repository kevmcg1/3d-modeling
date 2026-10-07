// Manufacture: the guided Manual flow, Mastercam style. One toolpath picker (grouped, searchable) starts a guided flow:
//   1 select geometry (click or chain, auto-chain, direction, start point, select-by-feature)  2 tool  3 parameters (tabs, live preview)  OK.
// The flow is built on the shared operation definition: the catalog below is read from OP_INFO, DRILL_KINDS and MC_CM every time the picker
// opens, so every toolpath another batch adds to MC_CM (cam-mc.js) shows up in the picker and in the flow with no extra work here.
// Everything here is a layer over index.html: the panel HTML the operations already build is re-arranged (never rebuilt), so their
// fields, bindings and generators keep working unchanged.
(function () {
  'use strict';
  if (typeof camAddOp !== 'function' || typeof MC_CM === 'undefined' || typeof camPanel !== 'function') return;

  const CF = window.CAMFLOW = { last: {}, FLOW: { id: null, step: 'params', tab: 'cut' }, autoChain: true };
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const FLOW = () => CF.FLOW;
  const curOp = () => (UIX.ws === 'cam' && CAMUI.view === 'op' ? opById(CAMUI.op) : null);

  // ═══ The operation definition: one catalog entry per toolpath the picker can start ═══
  // { id, name, group (2D | 3D | Drilling | Other), type (op type), cm (chain mode), kind (drill kind), geom (chain | faces | holes | none),
  //   tipkey (hover card), icon, kw (search words), note }
  const groupOf = g => { g = String(g || ''); return /^2d/i.test(g) ? '2D' : /3d|surface/i.test(g) ? '3D' : /drill|hole/i.test(g) ? 'Drilling' : 'Other'; };
  function catalog() {
    const L = [], A = o => L.push(Object.assign({ kw: '', note: '' }, o));
    A({ id: 'chain:contour', name: 'Contour', group: '2D', type: 'chain', cm: 'contour', geom: 'chain', tipkey: 'add:chain', icon: 'camcontour', kw: 'profile outline wall chain inside outside lead tabs', note: 'Cut along a chain' });
    A({ id: 'chain:pocket', name: 'Pocket', group: '2D', type: 'chain', cm: 'pocket', geom: 'chain', tipkey: 'add:pocket', icon: 'campocket', kw: 'clear area island rough chain', note: 'Clear inside a chain' });
    A({ id: 'chain:slot', name: 'Slot Mill', group: '2D', type: 'chain', cm: 'slot', geom: 'chain', tipkey: 'add:chain', icon: 'camcontour', kw: 'groove trochoidal', note: 'Along a chain, any width' });
    A({ id: 'chain:circle', name: 'Circle Mill', group: '2D', type: 'chain', cm: 'circle', geom: 'chain', tipkey: 'add:chain', icon: 'camdrill', kw: 'helix bore hole boss helical', note: 'Hole or boss to size' });
    A({ id: 'chain:deburr', name: 'Chamfer / Deburr', group: '2D', type: 'chain', cm: 'deburr', geom: 'chain', tipkey: 'add:chamfer', icon: 'camchamfer', kw: 'break edge chamfer', note: 'Break an edge' });
    for (const [k, m] of Object.entries(MC_CM)) {
      if (L.some(x => x.cm === k)) continue;
      A({ id: 'chain:' + k, name: m.name, group: groupOf(m.group), type: 'chain', cm: k, geom: 'chain', tipkey: TIP_TXT && TIP_TXT['mc:' + k] ? 'mc:' + k : 'add:chain', icon: m.icon || 'camcontour', kw: (m.kw || '') + ' ' + (m.group || ''), note: m.group || '' });
    }
    if (OP_INFO.face) A({ id: 'face', name: 'Face', group: '2D', type: 'face', geom: 'none', tipkey: 'add:face', icon: OP_INFO.face.icon, kw: 'flatten top surface stock', note: 'Flatten the top' });
    if (OP_INFO.contour) A({ id: 'contour', name: 'Contour from faces', group: '2D', type: 'contour', geom: 'faces', tipkey: 'add:contour', icon: OP_INFO.contour.icon, kw: 'outline boundary faces', note: 'Pick faces, not edges' });
    if (OP_INFO.pocket) A({ id: 'pocket', name: 'Pocket from floors', group: '2D', type: 'pocket', geom: 'faces', tipkey: 'add:pocket', icon: OP_INFO.pocket.icon, kw: 'floor faces', note: 'Pick floor faces' });
    A({ id: 'chain:drill', name: 'Drill by clicking holes', group: 'Drilling', type: 'chain', cm: 'drill', geom: 'chain', tipkey: 'add:drill', icon: 'camdrill', kw: 'drill holes circles points', note: 'Click hole edges' });
    if (typeof DRILL_KINDS === 'object') for (const [k, d] of Object.entries(DRILL_KINDS)) A({ id: 'drill:' + k, name: d.name, group: 'Drilling', type: 'drill', kind: k, geom: 'holes', tipkey: 'add:drill:' + k, icon: (typeof DRILL_ICON === 'object' && DRILL_ICON[k]) || 'camdrill', kw: 'hole cycle ' + d.mode, note: 'By hole size' });
    if (OP_INFO.parallel) A({ id: 'parallel', name: '3D Parallel Finish', group: '3D', type: 'parallel', geom: 'none', tipkey: 'add:parallel', icon: OP_INFO.parallel.icon, kw: 'surface finish raster ball', note: 'Raster over the surface' });
    if (OP_INFO.waterline) A({ id: 'waterline', name: 'Waterline Finish', group: '3D', type: 'waterline', geom: 'none', tipkey: TIP_TXT && TIP_TXT['add:waterline'] ? 'add:waterline' : 'add:parallel', icon: OP_INFO.waterline.icon, kw: 'constant z level steep walls', note: 'Level by level' });
    if (OP_INFO.zrough) A({ id: 'zrough', name: '3D Rough Pocket', group: '3D', type: 'zrough', geom: 'none', tipkey: 'add:zrough', icon: OP_INFO.zrough.icon, kw: 'rough z level stock', note: 'Rough the whole part' });
    if (OP_INFO.chamfer) A({ id: 'chamfer', name: OP_INFO.chamfer.name, group: '3D', type: 'chamfer', geom: 'faces', tipkey: 'add:chamfer', icon: OP_INFO.chamfer.icon, kw: 'swarf cone chamfer sloped', note: 'Pick sloped faces' });
    const known = new Set(['face', 'contour', 'pocket', 'drill', 'parallel', 'waterline', 'zrough', 'chamfer', 'wire', 'dtrough', 'dovetail', 'chain', 'clear']);
    for (const k of Object.keys(OP_INFO)) if (!known.has(k)) A({ id: k, name: OP_INFO[k].name, group: 'Other', type: k, geom: 'none', tipkey: 'add:' + k, icon: OP_INFO[k].icon, kw: '', note: '' });
    return L;
  }
  CF.catalog = catalog;
  const camAddOp0 = camAddOp;                                    // a new toolpath never inherits the flow of an earlier one: op ids start again at 1 in every part
  camAddOp = function (...a) { CF.FLOW.id = null; return camAddOp0.apply(this, a); };
  const keyOf = op => op.type === 'chain' ? 'chain:' + (op.cm || 'contour') : op.type === 'drill' ? 'drill:' + (op.kind || 'peck') : op.type;
  const geomKind = op => op.type === 'chain' ? 'chain' : (op.type === 'pocket' || op.type === 'contour' || op.type === 'chamfer') ? 'faces' : op.type === 'drill' ? 'holes' : 'none';
  const geomCount = op => op.type === 'chain' ? (op.chains || []).length : op.type === 'drill' ? (op.diams || []).length : (op.faces || []).length;

  // ═══ Tools: which cutters suit a toolpath, which one to start with ═══
  function compat(op) {
    if (op.type === 'chain') {
      const m = MC_CM[op.cm];
      return m ? m.tools : op.cm === 'drill' ? ['drill', 'spot', 'tap'] : op.cm === 'deburr' ? ['chamfer'] : ['flat', 'bull'];
    }
    if (op.type === 'drill') { const k = typeof DRILL_KINDS === 'object' && DRILL_KINDS[op.kind]; return k ? (k.tool === 'drill' ? ['drill', 'reamer'] : [k.tool]) : ['drill']; }
    return { face: ['face', 'flat'], contour: ['flat', 'bull'], pocket: ['flat', 'bull'], parallel: ['ball', 'bull'], waterline: ['flat', 'ball', 'bull'], zrough: ['flat', 'bull'], chamfer: ['chamfer'], engrave: ['chamfer', 'ball', 'flat'] }[op.type] || ['flat', 'ball', 'bull'];
  }
  // the size a closed chain leaves room for: a tool for a pocket must be smaller than the pocket
  function fitDiameter(op) {
    if (op.type !== 'chain') return 0;
    const pocketish = op.cm === 'pocket' || op.cm === 'circle' || (MC_CM[op.cm] && MC_CM[op.cm].floorMode);
    if (!pocketish) return 0;
    let fit = Infinity;
    for (const c of op.chains || []) {
      if (!c.closed) continue;
      const xs = c.pts.map(p => p[0]), ys = c.pts.map(p => p[1]), w = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      fit = Math.min(fit, op.cm === 'circle' ? w * 0.7 : w * 0.8);
    }
    return isFinite(fit) ? fit : 0;
  }
  function recommend(op) {
    const types = compat(op), lib = cam().tools.filter(t => types.includes(t.type));
    if (!lib.length) return null;
    if (op.autoTool) {                                                // cam-autotool.js chose it from the geometry: the largest tool that fits
      const t = lib.find(x => x.n === op.tool);
      return !op.toolMan && t ? { tool: t, why: op.autoTool.reason || 'Largest tool that fits', auto: true } : null;
    }
    const fit = fitDiameter(op), last = CF.last[keyOf(op)], lt = last && lib.find(t => t.n === last.tool);
    if (lt && (!fit || lt.d <= fit + 1e-6)) return { tool: lt, why: 'You used it last time' };
    if (fit) { const ok = lib.filter(t => t.d <= fit + 1e-6).sort((a, b) => b.d - a.d); if (ok.length) return { tool: ok[0], why: `Largest that fits the ${fmtLs(fit)} feature` }; }
    const cur = lib.find(t => t.n === op.tool);
    return { tool: cur || lib[0], why: cur ? '' : 'First of its kind in the library' };
  }
  CF.recommend = recommend;

  // ═══ Smart defaults: from the material, the stock, the tool and what was used last ═══
  const AP = { aluminum: 0.5, brass: 0.4, stainless: 0.2 };               // axial depth of cut, × tool diameter
  const KEEP = ['stepdown', 'stepover', 'leave', 'leaveWall', 'leaveFloor', 'finishStock', 'through', 'lead', 'pattern', 'ramp', 'peck', 'side', 'depthMode'];
  function smartDefaults(op) {
    if (op.type === 'drill' || op.cm === 'drill' || (op.type === 'chain' && MC_CM[op.cm]) || op.type === 'parallel' || op.type === 'chamfer') return;
    const t = toolOf(op.tool), st = camStock(), M = cam().material || 'aluminum';
    if (!t || !st || !(t.d > 0)) return;
    if ('stepdown' in op) op.stepdown = +Math.max(0.1, Math.min((st.z1 - st.z0), (AP[M] || 0.4) * t.d, op.type === 'face' ? 1.5 : 12)).toFixed(2);
  }
  function applyLast(op) {
    const l = CF.last[keyOf(op)];
    if (!l) return;
    if (l.tool != null && cam().tools.some(t => t.n === l.tool && compat(op).includes(t.type))) op.tool = l.tool;
    for (const k of KEEP) if (k in l.vals && (k in op || k === 'lead' || k === 'side')) op[k] = l.vals[k];
  }
  const camEdit0 = camEdit;
  camEdit = function (op, key, val) {
    camEdit0(op, key, val);
    try {
      const k = keyOf(op), l = CF.last[k] || (CF.last[k] = { tool: null, vals: {} });
      if (key === 'tool') { l.tool = val; if (FLOW().id === op.id) FLOW().autoTool = false; }
      else if (KEEP.includes(key)) { l.vals[key] = val; if (FLOW().id === op.id && key !== 'side' && key !== 'faces') FLOW().touched = true; }
    } catch (e) { /* the last-used memory is a convenience */ }
  };

  if (typeof camSetToolManual === 'function') {
    const csm = camSetToolManual;
    camSetToolManual = function (op, n) { csm(op, n); try { const l = CF.last[keyOf(op)] || (CF.last[keyOf(op)] = { tool: null, vals: {} }); l.tool = n; if (FLOW().id === op.id) FLOW().autoTool = false; } catch (e) { /* convenience only */ } };
  }

  // ═══ Starting a toolpath ═══
  function collapse(n0, label) {                                       // several records, one undo step
    let k = hist.cur - n0;
    if (k < 1) return;
    while (k > 1) { hist.states.splice(hist.cur - 1, 1); hist.labels.splice(hist.cur - 1, 1); hist.times.splice(hist.cur - 1, 1); hist.cur--; k--; }
    hist.labels[hist.cur] = label;
    if (typeof refreshHistory === 'function') refreshHistory();
  }
  function uniqueName(base) {
    const names = new Set(cam().ops.map(o => o.name));
    if (!names.has(base)) return base;
    let n = 2; while (names.has(base + ' ' + n)) n++;
    return base + ' ' + n;
  }
  function start(item) {
    if (!camStock()) { toast('Open or build a part first.'); return; }
    if (SIM.on) simStop();
    const n0 = hist.cur;
    camAddOp(item.type, item.kind);
    const op = opById(CAMUI.op);
    if (!op) return;
    if (item.cm) chainSetMode(op, item.cm);
    op.name = uniqueName(item.name);
    const had = !!(CF.last[keyOf(op)] && 'stepdown' in CF.last[keyOf(op)].vals);
    applyLast(op); if (!had) smartDefaults(op);
    collapse(n0, 'Add ' + op.name);
    CHAINUI.mode = CF.autoChain ? 'chain' : 'single'; CHAINUI.hoverKey = ''; CHAINUI.startFor = null;
    Object.assign(CF.FLOW, { id: op.id, step: geomKind(op) === 'none' ? 'tool' : 'geo', tab: geomKind(op) === 'none' ? 'tool' : 'cut', fresh: true, autoTool: true, touched: had, histCur: hist.cur });
    camRefresh();
    updateHint();
  }
  CF.start = start;
  // swap the kind of a chain toolpath in place; the geometry already picked stays
  function change(op, item) {
    if (op.type !== 'chain' || !item.cm || item.cm === op.cm) return;
    const n0 = hist.cur, old = catalog().find(i => i.cm === op.cm), wasDefault = !!old && (op.name === old.name || op.name.startsWith(old.name + ' '));
    chainSetMode(op, item.cm);
    if (wasDefault) op.name = uniqueName(item.name);
    applyLast(op);
    Object.assign(CF.FLOW, { autoTool: true, touched: false });
    collapse(n0, `${op.name}: ${item.name}`);
    camRefresh();
  }

  // ═══ The picker ═══
  let pk = null;
  function pickerOpen(opts) {
    if (pk || UIX.ws !== 'cam') return;
    if (!camStock()) { toast('Open or build a part first.'); return; }
    if (SIM.on) simStop();
    const swap = opts && opts.swap, items = catalog().filter(i => !swap || i.type === 'chain'), recent = (CF.recent || []).map(id => items.find(x => x.id === id)).filter(Boolean).slice(0, 3);
    const el = document.createElement('div');
    el.id = 'cfPicker'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'New toolpath');
    el.innerHTML = `<div class="cf-card"><div class="cf-search"><svg viewBox="0 0 20 20"><circle cx="9" cy="9" r="5.5"/><path d="M13.2 13.2L17 17"/></svg><input type="text" placeholder="${swap ? 'Change the toolpath type…' : 'Search toolpaths: pocket, drill, dynamic…'}" spellcheck="false" autocomplete="off" aria-label="Search toolpaths"><span class="kbd">N</span></div><div class="cf-list" role="listbox"></div><div class="cf-foot"><span><span class="kbd">↑</span><span class="kbd">↓</span> move</span><span><span class="kbd">Enter</span> start</span><span><span class="kbd">Esc</span> close</span></div></div>`;
    document.body.appendChild(el);
    const input = el.querySelector('input'), list = el.querySelector('.cf-list');
    pk = { el, sel: 0, flat: [] };
    const draw = () => {
      const q = input.value.trim().toLowerCase(), terms = q.split(/\s+/).filter(Boolean);
      const match = it => !terms.length || terms.every(t => (it.name + ' ' + it.kw + ' ' + it.group + ' ' + it.note).toLowerCase().includes(t));
      const groups = [];
      if (!terms.length && recent.length) groups.push(['Recent', recent]);
      for (const g of ['2D', '3D', 'Drilling', 'Other']) { const l = items.filter(i => i.group === g && match(i)); if (l.length) groups.push([g, l]); }
      pk.flat = []; let h = '';
      for (const [g, l] of groups) {
        h += `<div class="cf-grp">${g}</div>`;
        for (const it of l) { h += `<button class="cf-item" role="option" data-i="${pk.flat.length}" data-tipkey="${esc(it.tipkey)}" data-tipname="${esc(it.name)}">${svg(it.icon || 'camcontour')}<span class="nm">${esc(it.name)}</span><span class="sub">${esc(it.note)}</span></button>`; pk.flat.push(it); }
      }
      list.innerHTML = h || '<div class="cf-empty">No toolpath matches. Try “pocket”, “drill” or “slot”.</div>';
      pk.sel = Math.min(pk.sel, Math.max(0, pk.flat.length - 1));
      mark(false);
    };
    const mark = scroll => {
      list.querySelectorAll('.cf-item').forEach(b => b.classList.toggle('sel', +b.dataset.i === pk.sel));
      const b = list.querySelector('.cf-item.sel'); if (b && scroll) b.scrollIntoView({ block: 'nearest' });
    };
    const choose = i => { const it = pk.flat[i]; if (!it) return; pickerClose(); CF.recent = [it.id, ...(CF.recent || []).filter(x => x !== it.id)].slice(0, 6); if (swap) change(swap, it); else start(it); };
    input.addEventListener('input', () => { pk.sel = 0; draw(); });
    list.addEventListener('click', e => { const b = e.target.closest('.cf-item'); if (b) choose(+b.dataset.i); });
    list.addEventListener('pointermove', e => { const b = e.target.closest('.cf-item'); if (b && +b.dataset.i !== pk.sel) { pk.sel = +b.dataset.i; mark(false); } });
    el.addEventListener('pointerdown', e => { if (e.target === el) pickerClose(); });
    pk.key = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); pickerClose(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); e.stopImmediatePropagation(); pk.sel = Math.min(pk.flat.length - 1, pk.sel + 1); mark(true); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); pk.sel = Math.max(0, pk.sel - 1); mark(true); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); choose(pk.sel); }
      else if (e.key === 'Tab') { e.preventDefault(); input.focus(); }
    };
    window.addEventListener('keydown', pk.key, true);
    draw();
    requestAnimationFrame(() => { el.classList.add('in'); input.focus(); });
  }
  function pickerClose() {
    if (!pk) return;
    const p = pk; pk = null;
    window.removeEventListener('keydown', p.key, true);
    p.el.classList.remove('in');
    setTimeout(() => p.el.remove(), 180);
  }
  CF.open = pickerOpen; CF.close = pickerClose;

  // ═══ Select by feature ═══
  let chainCache = { key: null, list: [] };
  function allChains() {
    const key = camEpoch + '|' + (typeof camModelKey === 'function' ? camModelKey() : '');
    if (chainCache.key === key) return chainCache.list;
    const out = [], used = new Set();
    for (const b of visibleBodies()) {
      const m = bodyMesh(b);
      for (const ch of edgeChains(m)) {
        if (!chainFlat(ch)) continue;
        const k = chainEdgeKey(ch);
        if (used.has(k)) continue;
        const c = buildChain(m, ch, true);
        if (!c) continue;
        (c.eks || [k]).forEach(x => used.add(x)); used.add(k);
        if (c.closed) out.push(c);
      }
    }
    chainCache = { key, list: out };
    return out;
  }
  const centroid = c => { let x = 0, y = 0; c.pts.forEach(p => { x += p[0]; y += p[1]; }); return [x / c.pts.length, y / c.pts.length]; };
  function circleOf(c) {
    if (!c.closed || c.pts.length < 8) return null;
    const [cx, cy] = centroid(c), rs = c.pts.map(p => Math.hypot(p[0] - cx, p[1] - cy)), r = rs.reduce((a, b) => a + b, 0) / rs.length;
    return rs.every(x => Math.abs(x - r) < 0.02 * r + 0.01) ? { x: cx, y: cy, d: 2 * r } : null;
  }
  // what is just inside and just outside the loop: a pocket floor has the floor level inside and a wall outside, a boss top the reverse
  function sides(c) {
    const p = chainTravel(c), n = p.length, inLeft = cArea(cP(p)) > 0;
    let floor = 0, rim = 0, s = 0;
    const N = Math.min(24, n);
    for (let k = 0; k < N; k++) {
      const i = Math.floor((k + 0.5) * n / N), a = p[i], b = p[(i + 1) % n], t = nrm2(sub2(b, a)), m = lerp2(a, b, 0.5), nl = P2(-t.y * (inLeft ? 1 : -1), t.x * (inLeft ? 1 : -1));
      const tin = partTopAt(m.x + nl.x * 0.6, m.y + nl.y * 0.6), tout = partTopAt(m.x - nl.x * 0.6, m.y - nl.y * 0.6);
      s++;
      if (Math.abs(tin - c.z) < 0.05 && tout > c.z + 0.05) floor++;
      else if (Math.abs(tin - c.z) < 0.05 && tout < c.z - 0.05) rim++;
    }
    return { floor: s && floor / s > 0.7, outline: s && rim / s > 0.7 };
  }
  const area = c => Math.abs(cArea(cP(chainTravel(c))));
  const sameZ = (a, b) => Math.abs(a - b) < 0.02;
  CF.selectors = {
    holes: () => { const seen = new Map(); for (const c of allChains()) { const o = circleOf(c); if (!o) continue; const k = Math.round(o.x * 50) + ',' + Math.round(o.y * 50) + ',' + Math.round(o.d * 50); const e = seen.get(k); if (!e || c.z > e.c.z) seen.set(k, { c, o }); } return [...seen.values()]; },
    pockets: () => allChains().filter(c => !circleOf(c) && c.z < camPart().z1 - 0.01 && sides(c).floor),
    outline: () => { const l = allChains().filter(c => !circleOf(c) && sides(c).outline); l.sort((a, b) => area(b) - area(a)); return l.slice(0, 1); },
  };
  function setChains(op, list, label) {
    if (!list.length) { toast('Nothing like that in this part.'); return; }
    const before = snap();
    op.chains = list.map((c, i) => ({ id: i + 1, rev: false, start: 0, ...JSON.parse(JSON.stringify(c)) }));
    if (typeof camAutoTool === 'function') camAutoTool(op);                  // the largest tool that fits what was picked
    record(`${op.name}: ${label}`, before);
    camRefresh();
  }
  function selectHelpersHTML(op) {
    if (op.type !== 'chain') return '';
    const S = CF.selectors, circ = op.cm === 'drill' || op.cm === 'circle', btns = [];
    if (circ) {
      const by = new Map();
      for (const h of S.holes()) { const k = +h.o.d.toFixed(2); by.set(k, (by.get(k) || 0) + 1); }
      [...by.entries()].sort((a, b) => a[0] - b[0]).forEach(([d, n]) => btns.push(`<button class="chip" data-cfsel="hole:${d}">All Ø${fmtLs(d)} holes <small>×${n}</small></button>`));
    } else {
      const np = S.pockets().length;
      if (np) btns.push(`<button class="chip" data-cfsel="pockets">All pockets <small>×${np}</small></button>`);
      if ((op.chains || []).some(c => c.closed)) btns.push('<button class="chip" data-cfsel="samez">Floors at the same depth</button>');
      if (S.outline().length) btns.push('<button class="chip" data-cfsel="outline">Part outline</button>');
    }
    if ((op.chains || []).length) btns.push('<button class="chip" data-cfsel="clear">Clear</button>');
    return btns.length ? `<div class="field cf-sel"><span>Select by feature</span><div class="chips">${btns.join('')}</div></div>` : '';
  }
  function doSelect(op, what) {
    const S = CF.selectors;
    if (what === 'clear') { const before = snap(); op.chains = []; if (typeof camAutoTool === 'function') camAutoTool(op); record(`${op.name}: clear`, before); camRefresh(); return; }
    if (what.startsWith('hole:')) { const d = +what.slice(5); setChains(op, S.holes().filter(h => Math.abs(h.o.d - d) < 0.02).map(h => h.c), `all Ø${fmtLs(d)} holes`); return; }
    if (what === 'pockets') { setChains(op, S.pockets(), 'all pockets'); return; }
    if (what === 'outline') { setChains(op, S.outline(), 'part outline'); return; }
    if (what === 'samez') {
      const zs = (op.chains || []).filter(c => c.closed).map(c => c.z), pk2 = S.pockets().filter(c => zs.some(z => sameZ(z, c.z)));
      const have = (op.chains || []).slice(), add = pk2.filter(c => !have.some(h => (h.eks || []).some(k => (c.eks || []).includes(k))));
      setChains(op, [...have, ...add], 'same-depth floors');
    }
  }

  // ═══ The guided flow: steps, tabs, footer ═══
  const STEPS = op => geomKind(op) === 'none' ? ['tool', 'params'] : ['geo', 'tool', 'params'];
  const STEP_NAME = { geo: 'Select geometry', tool: 'Choose the tool', params: 'Set the parameters' };
  const TABS = [['tool', 'Tool'], ['cut', 'Cut'], ['depth', 'Depths'], ['lead', 'Lead in/out'], ['link', 'Linking'], ['feeds', 'Feeds & speeds']];
  const DEPTH = new Set(['opSd', 'opMcAp', 'opDepth', 'opThrough', 'opWlBot', 'opPeck', 'opPkI', 'opPkJ', 'opPkK', 'opRpl', 'opS22', 'opS52', 'opDwell', 'opTapJ', 'opBsD', 'opBsC']);
  const LEAD = new Set(['opTabs', 'opTabW', 'opTabH']);
  const LINK = new Set(['opMcRamp', 'opRamp', 'opMcRamping']);
  function bucketOf(el) {
    const ids = [...el.querySelectorAll('[id]')].map(x => x.id), sets = [...el.querySelectorAll('[data-opset]')].map(x => x.dataset.opset.split(':')[0]);
    if (el.id && !ids.includes(el.id)) ids.push(el.id);
    if (el.querySelector('#opTool')) return 'tool';
    if (el.querySelector('[data-chmode],[data-chdo],[data-dia],[data-chrow],[data-opbool],.pick,.drill-table,table') || sets.includes('cm')) return 'geo';
    if (ids.some(i => DEPTH.has(i)) || sets.includes('depthMode')) return 'depth';
    if (sets.includes('lead') || ids.some(i => LEAD.has(i))) return 'lead';
    if (sets.includes('entry') || ids.some(i => LINK.has(i))) return 'link';
    return 'cut';
  }
  function h3Bucket(el) { const t = el.textContent.toLowerCase(); return /feeds/.test(t) ? 'feeds' : /tab/.test(t) ? 'lead' : 'cut'; }
  function arrange(body, op) {
    const B = { auto: [], geo: [], tool: [], cut: [], depth: [], lead: [], link: [], feeds: [], warn: [], stats: [], intro: [] };
    let section = null, foot = null;
    for (const el of [...body.children]) {
      if (el.matches('.btns') && el.querySelector('[data-camdo="overview"]')) { foot = el; continue; }
      if (el.matches('.cf-flow')) continue;
      if (el.matches('h3.sub')) { section = h3Bucket(el); B[section].push(el); continue; }
      if (el.matches('.autotool')) { B.auto.push(el); continue; }
      if (el.matches('p.err-note')) { B.warn.push(el); continue; }
      if (el.matches('dl.kv') && /^cutting/i.test(el.textContent.trim())) { section = null; B.stats.push(el); continue; }
      if (el.matches('p.note') && /computing/i.test(el.textContent)) { section = null; B.stats.push(el); continue; }
      if (el.matches('p.note') && !el.classList.contains('cyc-note') && !section && el === body.firstElementChild) { B.intro.push(el); continue; }
      if (section) { B[section].push(el); continue; }
      if (el.matches('.row2, .row3')) {                                  // a row can mix fields from several tabs: split it
        const kids = [...el.children], by = {};
        kids.forEach(k => { const b = bucketOf(k); (by[b] = by[b] || []).push(k); });
        for (const [b, ks] of Object.entries(by)) { const r = document.createElement('div'); r.className = 'row' + Math.min(3, ks.length); ks.forEach(k => r.appendChild(k)); B[b].push(r); }
        continue;
      }
      B[bucketOf(el)].push(el);
    }
    return { B, foot };
  }
  const ctoolHTML = (op, B) => {
    const types = compat(op), all = cam().tools, rec = recommend(op), fit = all.filter(t => types.includes(t.type)), other = all.filter(t => !types.includes(t.type));
    const card = t => `<button class="cf-tool ${op.tool === t.n ? 'on' : ''}" data-cftool="${t.n}"><span class="nm">${esc(toolName(t))}</span><span class="sub">${t.flutes} fl · ${Math.round(t.rpm).toLocaleString()} rpm · ${uval(t.feed, 1)} ${uRate()}</span>${rec && rec.tool.n === t.n ? `<i class="cf-rec" ${rec.why ? `data-tip="${esc(rec.why)}"` : ''}>Recommended</i>` : ''}</button>`;
    return `<div class="cf-tools">${fit.length ? fit.map(card).join('') : '<p class="note">No tool of the right type yet. Add one in the Tool Library.</p>'}</div>${rec && rec.why && !rec.auto ? `<p class="note cf-why">${esc(rec.tool.n === op.tool ? 'Recommended: ' : 'Suggested: T' + rec.tool.n + ' · ')}${esc(rec.why)}.</p>` : ''}${other.length ? `<details class="cf-more"><summary>Other tools in the library (${other.length})</summary><div class="cf-tools">${other.map(card).join('')}</div></details>` : ''}`;
  };
  function linkHTML(op) {
    const C = cam();
    return `<label class="chk"><input type="checkbox" id="cfSafeLinks" ${op.safeLinks ? 'checked' : ''}> Lift to the retract height before every rapid move</label>
      <dl class="kv"><dt>Clearance height</dt><dd>${fmtLs(C.safe)} above the stock</dd><dt>Retract height</dt><dd>${fmtLs(C.retract)} above the stock</dd></dl>
      <div class="btns"><button class="btn" data-cfsetup="1">Change in Setup</button></div>`;
  }
  function decorate() {
    const op = curOp();
    panel.classList.remove('cf-on');
    if (!op || op.type === 'wire' || !panel.querySelector('.pn-body')) return;
    const f = FLOW();
    if (f.id !== op.id) {                                       // opened from the ribbon or the list: a pocket or chain with nothing picked yet starts at its geometry
      const needGeo = (op.type === 'pocket' || op.type === 'chain') && !geomCount(op);
      Object.assign(CF.FLOW, { id: op.id, step: needGeo ? 'geo' : 'params', tab: 'cut', fresh: false, autoTool: false, touched: true });
    }
    if (!STEPS(op).includes(f.step)) f.step = STEPS(op)[0];
    const body = panel.querySelector('.pn-body'), { B, foot } = arrange(body, op);
    const delBtn = foot && foot.querySelector('[data-camdo="delop"]');
    // tool tab: cards, then the library select the operation already built
    B.link.push(Object.assign(document.createElement('div'), { className: 'cf-link', innerHTML: linkHTML(op) }));
    const toolBox = document.createElement('div'); toolBox.className = 'cf-toolbox'; toolBox.innerHTML = ctoolHTML(op, B);
    B.tool = [...B.auto, toolBox];
    if (op.type === 'chain') {
      B.geo = B.geo.filter(e => !e.querySelector('[data-opset^="cm:"]') && !(e.matches('h3.sub') && /high speed|^2d$|^3d$/i.test(e.textContent.trim())));
      const m = MC_CM[op.cm], nm = m ? m.name : { contour: 'Contour', pocket: 'Pocket', slot: 'Slot Mill', circle: 'Circle Mill', deburr: 'Chamfer / Deburr', drill: 'Drill' }[op.cm || 'contour'];
      const tl = document.createElement('div'); tl.className = 'cf-tp'; tl.innerHTML = `<span>Toolpath</span><b>${esc(nm)}</b><button class="chip" data-cfswap="1">Change…</button>`;
      B.geo.unshift(tl);
    }
    const geoSel = document.createElement('div'); geoSel.innerHTML = selectHelpersHTML(op);
    if (geoSel.firstElementChild) B.geo.push(geoSel.firstElementChild);
    const tabs = TABS.filter(([k]) => B[k].length);
    const tab = tabs.some(([k]) => k === f.tab) ? f.tab : (f.step === 'tool' ? 'tool' : (tabs.find(([k]) => k !== 'tool') || tabs[0])[0]);
    f.tab = tab;
    body.innerHTML = '';
    body.classList.add('cf-body');
    panel.classList.add('cf-on');
    B.warn.forEach(e => { e.classList.add('cf-warn'); body.appendChild(e); });
    body.insertAdjacentHTML('beforeend', '<div class="cf-title"><h3></h3><p></p></div>');
    const mk = (k, els) => { const d = document.createElement('div'); d.className = 'cf-pane'; d.dataset.pane = k; els.forEach(e => d.appendChild(e)); body.appendChild(d); return d; };
    const geoPane = mk('geo', [...B.geo, ...B.intro]);
    if (!B.geo.length) geoPane.insertAdjacentHTML('beforeend', '<p class="note">Nothing to select for this toolpath. Go on to the tool.</p>');
    const strip = document.createElement('div'); strip.className = 'cf-tabs'; strip.setAttribute('role', 'tablist');
    strip.innerHTML = tabs.map(([k, l]) => `<button role="tab" data-cftab="${k}">${l}</button>`).join('');
    body.appendChild(strip);
    for (const [k] of tabs) mk(k, B[k]);          // every tab stays in the page (hidden), so each field keeps its binding
    B.stats.forEach(e => body.appendChild(e));
    const bar = document.createElement('div'); bar.className = 'cf-bar';
    bar.innerHTML = '<button class="btn ghost" data-cfdel="1" data-tip="Delete this toolpath">Delete</button><span class="sp"></span><button class="btn" data-cfback="1">Back</button><button class="btn primary" data-cfnext="1"><span class="lb"></span><span class="kbd">Enter</span></button>';
    body.appendChild(bar);
    if (foot && delBtn) { foot.hidden = true; body.appendChild(foot); }   // kept (hidden) so the panel's own Delete / Done handlers stay bound
    body.querySelectorAll('[title]').forEach(e => { e.dataset.tip = e.dataset.tip || e.getAttribute('title'); e.removeAttribute('title'); });   // the app's own tip, not the browser's
    wire(op, body);
    apply(op, body, false);
    const f0 = FLOW(), sk = op.id + ':' + f0.step;
    if (CF._shown !== sk) {                                      // a new step opens at its top
      CF._shown = sk; const sc = body.closest('#panel'), top = () => { body.scrollTop = 0; if (sc) sc.scrollTop = 0; };
      top(); requestAnimationFrame(top); setTimeout(top, 90);
    }
    updateHint();
  }
  // show the step's pane (geometry, or the chosen tab), the right title and the right footer
  function apply(op, body, anim) {
    const f = FLOW(), geo = f.step === 'geo', st = STEPS(op);
    if (anim) { const sc = body.closest('#panel'), top = () => { body.scrollTop = 0; if (sc) sc.scrollTop = 0; }; top(); requestAnimationFrame(top); setTimeout(top, 90); }   // a new step opens at its top
    body.querySelector('.cf-title h3').textContent = STEP_NAME[f.step];
    body.querySelector('.cf-title p').textContent = promptText(op, true);
    body.querySelectorAll('.cf-pane').forEach(p => {
      const show = geo ? p.dataset.pane === 'geo' : p.dataset.pane === f.tab;
      if (show && p.hidden && anim) { p.style.animation = 'none'; void p.offsetWidth; p.style.animation = ''; }
      p.hidden = !show;
    });
    body.querySelector('.cf-tabs').hidden = geo;
    body.querySelectorAll('[data-cftab]').forEach(b => b.classList.toggle('on', b.dataset.cftab === f.tab));
    body.querySelectorAll('.cf-warn').forEach(w => { w.hidden = geo && !geomCount(op); });
    body.querySelector('[data-cfback]').hidden = st.indexOf(f.step) <= 0;
    body.querySelector('[data-cfnext] .lb').textContent = f.step === st[st.length - 1] ? 'OK' : 'Next';
  }
  function wire(op, body) {
    body.querySelectorAll('[data-cfswap]').forEach(b => b.addEventListener('click', () => pickerOpen({ swap: op })));
    body.querySelectorAll('[data-cfnext]').forEach(b => b.addEventListener('click', () => next(op)));
    body.querySelectorAll('[data-cfback]').forEach(b => b.addEventListener('click', () => back(op)));
    body.querySelectorAll('[data-cfdel]').forEach(b => b.addEventListener('click', () => { const d = body.querySelector('[data-camdo="delop"]'); if (d) d.click(); }));
    body.querySelectorAll('[data-cftab]').forEach(b => b.addEventListener('click', () => { const f = FLOW(); f.tab = b.dataset.cftab; f.step = f.tab === 'tool' ? 'tool' : 'params'; apply(op, body, true); if (window.guideRefresh) guideRefresh(); updateHint(); }));
    body.querySelectorAll('[data-cftool]').forEach(b => b.addEventListener('click', () => { const n = +b.dataset.cftool; if (n === op.tool) return; if (typeof camSetToolManual === 'function') camSetToolManual(op, n); else camEdit(op, 'tool', n); }));
    body.querySelectorAll('[data-cfsel]').forEach(b => b.addEventListener('click', () => doSelect(op, b.dataset.cfsel)));
    body.querySelectorAll('[data-cfsetup]').forEach(b => b.addEventListener('click', () => { CAMUI.view = 'setup'; camRefresh(); }));
    const sl = body.querySelector('#cfSafeLinks'); if (sl) sl.addEventListener('change', () => camEdit(op, 'safeLinks', sl.checked));
  }
  function go(op, step) {
    const f = FLOW();
    if (f.step === 'geo' && step !== 'geo') applyTool(op);
    f.step = step; f.tab = step === 'tool' ? 'tool' : step === 'params' ? (f.tab === 'tool' ? 'cut' : f.tab) : f.tab;
    if (step === 'params') f.visitedParams = true;
    refreshPanel(); updateHint();
  }
  // leaving geometry: a fresh toolpath takes the tool that suits what was picked, and the cut depth that suits the tool
  function applyTool(op) {
    const f = FLOW();
    if (!f.fresh || !f.autoTool) return;
    const r = recommend(op);
    if (r && r.tool.n !== op.tool) op.tool = r.tool.n;
    if (!f.touched) smartDefaults(op);
  }
  function next(op) {
    const st = STEPS(op), i = st.indexOf(FLOW().step);
    if (i === 0 && geomKind(op) === 'chain' && !geomCount(op)) { toast('Click an edge first, or pick a feature below.'); return; }
    if (i < st.length - 1) go(op, st[i + 1]); else finish(op);
  }
  function back(op) { const st = STEPS(op), i = st.indexOf(FLOW().step); if (i > 0) go(op, st[i - 1]); }
  function finish(op) {
    const done = op.name;
    CF.FLOW.id = null;
    CHAINUI.startFor = null; CHAINUI.hover = null;
    CAMUI.view = 'cat'; CAMUI.cat = typeof catOf === 'function' ? catOf(op) : 'manual';
    camRefresh(); updateHint();
    toast(`${done} is in the program. Press N for another toolpath.`);
  }
  function cancelFresh(op) {
    const f = FLOW();
    CAMUI.view = 'overview'; f.id = null;
    if (hist.cur === f.histCur && hist.cur > 0) { jumpTo(hist.cur - 1); camRefresh(); toast('Toolpath cancelled'); return; }
    const C = cam(), before = snap(); C.ops.splice(C.ops.indexOf(op), 1); TP.delete(op.id); record('Delete ' + op.name, before); camRefresh();
  }
  CF.go = go; CF.next = next; CF.back = back; CF.finish = finish;

  // ═══ On-screen prompts ═══
  function promptText(op, plain) {
    const f = FLOW(), n = geomCount(op), g = geomKind(op), k = s => plain ? s : `<span class="kbd">${s}</span>`;
    if (CHAINUI.startFor != null) return 'Click the corner of the chain where the cut should start.';
    if (f.step === 'geo') {
      if (g === 'chain') {
        const circ = op.cm === 'drill' || op.cm === 'circle', cx = !circ && window.CHAINX && CHAINX.prompt(op, n);
        if (cx) return cx;
        return n ? `${n} chain${n > 1 ? 's' : ''} selected. Click another edge to add it${plain ? '' : ', right-click for options'}, check the arrow and the start dot, then go on.`
          : circ ? 'Click the edge of a hole. Each click takes one circle.' : CHAINUI.mode === 'chain' ? 'Click an edge: the whole chain it belongs to is picked.' : 'Click an edge. Double-click takes the whole chain.';
      }
      if (g === 'faces') return op.type === 'chamfer' ? 'Click the sloped faces to cut.' : op.type === 'pocket' ? 'Click the flat floor faces to clear.' : 'Click flat faces for the boundary, or leave it on the part outline.';
      if (g === 'holes') return 'Click holes, or pick hole sizes below.';
    }
    if (f.step === 'tool') return 'Pick the cutter. The recommended one fits what you selected.';
    return 'Change any value: the toolpath redraws as you type.';
  }
  const updateHint0 = updateHint;
  updateHint = function () {
    updateHint0();
    const op = curOp();
    if (!op || op.type === 'wire' || !FLOW().id || FLOW().id !== op.id) return;
    const k = s => `<span class="kbd">${s}</span>`, f = FLOW();
    hintEl.innerHTML = `<b>${esc(op.name)} · ${STEP_NAME[f.step]}:</b> ${esc(promptText(op, true))} · ${k('Enter')} ${STEPS(op).indexOf(f.step) === STEPS(op).length - 1 ? 'OK' : 'next'} · ${k('Esc')} ${f.fresh && !geomCount(op) ? 'cancel' : 'done'}`;
  };

  // ═══ Panel hooks, live preview ═══
  const bindCamPanel0 = bindCamPanel;
  bindCamPanel = function () { bindCamPanel0(); try { decorate(); } catch (e) { console.error('flow', e); } };
  const LIVE = { opSo: 'stepover', opSoL: 'stepover', opSd: 'stepdown', opMcAp: 'stepdown', opLeave: 'leave', opThrough: 'through', opLw: 'leaveWall', opLf: 'leaveFloor', opPeck: 'peck', opRest: 'restD', opFs: 'finishStock', opDepth: 'depth', opMcPeelW: 'peelW', opSlotW: 'slotW', opPitch: 'pitch', opChSize: 'chSize', opTabW: 'tabW', opTabH: 'tabH' };
  let liveT = 0, orig = null;
  panel.addEventListener('input', e => {
    const op = curOp(), el = e.target;
    if (!op || !el.matches || !el.matches('input[type=number][data-cam-input]') || !(el.id in LIVE)) return;
    const k = LIVE[el.id], v = parseFloat(el.value);
    if (!isFinite(v) || v < 0 || (v === 0 && !/leave|through|finish|depth|rest/i.test(k))) return;
    if (!orig || orig.id !== op.id || orig.k !== k) orig = { id: op.id, k, had: k in op, v: op[k] };
    op[k] = el.dataset.len ? fromU(v) : v;
    clearTimeout(liveT);
    liveT = setTimeout(() => { camDraw(); requestDraw(); }, 90);
  });
  panel.addEventListener('change', e => {                              // put the old value back so the panel's own handler records a proper undo step
    const op = curOp();
    if (orig && op && op.id === orig.id) { if (orig.had) op[orig.k] = orig.v; else delete op[orig.k]; }
    orig = null; clearTimeout(liveT);
  }, true);
  panel.addEventListener('click', e => {                              // the Step by step card: click a step to go there
    const li = e.target.closest && e.target.closest('.guide-steps li'), op = curOp();
    if (!li || !op || FLOW().id !== op.id) return;
    const i = [...li.parentNode.children].indexOf(li), st = STEPS(op);
    if (i < st.length) go(op, st[i]); else finish(op);
  });
  // the Step by step card follows the flow
  if (typeof GD === 'object') {
    const steps = () => {
      const op = curOp(); if (!op) return [];
      const f = FLOW(), st = STEPS(op), at = st.indexOf(f.step), g = geomKind(op), n = geomCount(op);
      const out = [];
      if (st[0] === 'geo') out.push(gS(g === 'chain' ? 'Select the chain' : g === 'holes' ? 'Select the holes' : 'Select the faces', g === 'chain' ? 'Click an edge: the whole chain is picked. Shift-click adds more. Check the arrow (direction) and the green dot (start), or use Reverse and Start.' : 'Click in the view, or pick by size or feature in the panel.', () => at > 0));
      out.push(gS('Choose the tool', 'The recommended cutter is marked. Speeds and feeds follow the material.', () => at > st.indexOf('tool')));
      out.push(gS('Set the parameters', 'Cut, depths, lead in/out, linking and feeds. The toolpath redraws as you type.', () => false));
      out.push(gS('Press OK', 'Enter or OK puts it in the program; N starts the next toolpath.'));
      return out;
    };
    GD['op:chain'] = ['Toolpath steps', steps];
    GD.op = ['Toolpath steps', steps];
  }

  // ═══ Shortcuts and right-click ═══
  const typing = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA' || a.isContentEditable); };
  window.addEventListener('keydown', e => {
    if (UIX.ws !== 'cam' || pk || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!document.getElementById('modal').hidden || (typeof CMD !== 'undefined' && CMD)) return;
    const op = curOp();
    if ((e.key === 'n' || e.key === 'N') && !typing() && !e.shiftKey && CAMUI.view !== 'sim') { e.preventDefault(); e.stopImmediatePropagation(); pickerOpen(); return; }
    if (!op || op.type === 'wire' || typing() || FLOW().id !== op.id) return;
    if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); next(op); }
    else if (e.key === 'Escape') {
      e.preventDefault(); e.stopImmediatePropagation();
      if (CHAINUI.startFor != null) { CHAINUI.startFor = null; camRefresh(); return; }
      if (FLOW().fresh && !geomCount(op) && geomKind(op) !== 'none') cancelFresh(op); else finish(op);
    }
  }, true);
  let rc = null;
  ov.addEventListener('pointerdown', e => { rc = e.button === 2 ? local(e) : null; });
  ov.addEventListener('pointerup', e => {
    if (!rc || e.button !== 2) return;
    const p = local(e), r0 = rc; rc = null;
    const op = curOp();
    if (Math.hypot(p.x - r0.x, p.y - r0.y) > 3 || !op || op.type === 'wire' || FLOW().id !== op.id) return;
    const last = (op.chains || []).slice(-1)[0], items = [];
    items.push({ label: STEPS(op).indexOf(FLOW().step) === STEPS(op).length - 1 ? 'OK (Enter)' : 'Next step (Enter)', run: () => next(op) });
    if (op.type === 'chain' && last) {
      items.push({ label: 'Reverse the last chain', run: () => chainDo(op, 'rev:' + last.id) });
      if (last.closed && !(op.cm === 'drill' || op.cm === 'circle')) items.push({ label: 'Pick a start point…', run: () => chainDo(op, 'start:' + last.id) });
      items.push({ label: 'Remove the last chain', run: () => chainDo(op, 'del:' + last.id) });
      items.push({ label: 'Clear the selection', run: () => doSelect(op, 'clear') });
    }
    items.push(null, { label: FLOW().fresh && !geomCount(op) ? 'Cancel this toolpath (Esc)' : 'Done (Esc)', danger: FLOW().fresh && !geomCount(op), run: () => (FLOW().fresh && !geomCount(op) && geomKind(op) !== 'none' ? cancelFresh(op) : finish(op)) });
    showMenu(items, e.clientX, e.clientY);
  });

  // ═══ The ribbon: one New Toolpath button leads the toolpath panels ═══
  if (typeof IC === 'object' && !IC.camnew) IC.camnew = '<circle cx="10" cy="10" r="7"/><path d="M10 6.5v7M6.5 10h7"/>';
  if (typeof RB_HUE === 'object' && !('toolpath' in RB_HUE)) RB_HUE.toolpath = 160;
  const camToolbar0 = camToolbar;
  camToolbar = function () {
    const h = camToolbar0();
    if (typeof isWire === 'function' && isWire()) return h;
    const P = rbPanel('Toolpath', [['flow:new', 'New Toolpath', 'N', 'camnew']], 1, 'data-cam'), i = h.indexOf('<section class="rb-panel" style="--h:' + rbHue('2D') + '" aria-label="2D"');
    return i >= 0 ? h.slice(0, i) + P + h.slice(i) : h + P;
  };
  const camAction0 = camAction;
  camAction = function (a) { if (a === 'flow:new') { pickerOpen(); return; } camAction0(a); };
  if (typeof TIP_TXT === 'object') TIP_TXT['flow:new'] = ['Start any toolpath from one searchable list: contour, pocket, drilling, high speed, 3D. It then walks you through geometry, tool and parameters.', ['Search or pick a toolpath (or press N).', 'Click the geometry. Chains are picked whole; Shift adds more.', 'Check the tool, set the parameters, press Enter for OK.']];
  if (typeof TIP_ART === 'object' && typeof TipArt === 'object' && TIP_ART['add:chain']) TIP_ART['flow:new'] = TIP_ART['add:chain'];
  // the Manual panel and the empty browser list point at the picker too
  const catPanel0 = catPanel;
  catPanel = function (k) {
    const h = catPanel0(k);
    return k === 'auto' ? h : h.replace('<button class="btn primary" data-camadd="chain">Add Chain</button>', '<button class="btn primary" data-cfnew="1">New toolpath <span class="kbd">N</span></button>');
  };
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-cfnew]'); if (b) pickerOpen(); });
  // when a toolpath is opened from a list it starts on the parameters, not on geometry
  const camRefresh0 = camRefresh;
  void camRefresh0;


  // ═══ Operations manager: the program list in the browser (drag to reorder, duplicate, regenerate, enable, show, stale marker) ═══
  // A toolpath is stale when the model changed after its geometry was picked: it still cuts what was picked, which may no longer be there.
  const geoKey = op => JSON.stringify([(op.chains || []).map(c => [c.eks, c.rev, c.start, c.pts.length]), op.faces || [], op.diams || []]);
  const modelKey = () => { try { return typeof camModelKey === 'function' ? camModelKey() : ''; } catch (e) { return ''; } };
  function staleOf(op, mk) {
    if (!(op.chains || []).length && !(op.faces || []).length) return false;
    const gk = geoKey(op);
    if (op._gk !== gk) { op._gk = gk; op._gsig = mk; }                 // geometry just picked (or first seen): fresh
    return op._gsig !== mk;
  }
  CF.isStale = op => staleOf(op, modelKey());
  // pick the same geometry again from the model as it is now; whatever no longer exists is dropped
  function regenerate(op, quiet) {
    const before = snap(), all = new Map();
    for (const b of visibleBodies()) { const m = bodyMesh(b); for (const ch of edgeChains(m)) if (chainFlat(ch)) all.set(chainEdgeKey(ch), { m, ch }); }
    let lost = 0;
    if ((op.chains || []).length) {
      const keep = [];
      for (const c of op.chains) {
        const hit = (c.eks || []).map(k => all.get(k)).find(Boolean), nc = hit && buildChain(hit.m, hit.ch, (c.eks || []).length > 1 || c.closed);
        if (!nc) { lost++; continue; }
        if (nc.pts.length !== c.pts.length) c.start = 0;
        Object.assign(c, { z: nc.z, closed: nc.closed, pts: nc.pts, eks: nc.eks });
        keep.push(c);
      }
      op.chains = keep;
    }
    if ((op.faces || []).length) { const n = op.faces.length; op.faces = op.faces.filter(r => findFace(visibleBodies(), r)); lost += n - op.faces.length; }
    if (typeof camAutoTool === 'function') camAutoTool(op);
    op._gk = geoKey(op); op._gsig = modelKey(); TP.delete(op.id);
    record(`Regenerate ${op.name}`, before);
    camRefresh();
    if (!quiet) toast(lost ? `${op.name}: ${lost} piece${lost > 1 ? 's' : ''} of geometry no longer in the model were dropped.` : `${op.name} is up to date.`);
    return lost;
  }
  CF.regenerate = regenerate;
  function duplicate(op) {
    const C = cam(), before = snap(), c = JSON.parse(JSON.stringify(op, (k, v) => k[0] === '_' ? undefined : v));
    c.id = C.next++; c.name = uniqueName(op.name.replace(/ copy( \d+)?$/, '') + ' copy');
    C.ops.splice(C.ops.indexOf(op) + 1, 0, c);
    record('Duplicate ' + op.name, before);
    camRefresh();
    return c;
  }
  function removeOp(op) {
    const C = cam(), before = snap();
    C.ops.splice(C.ops.indexOf(op), 1); TP.delete(op.id);
    if (CAMUI.op === op.id && CAMUI.view === 'op') CAMUI.view = 'overview';
    record('Delete ' + op.name, before);
    camRefresh();
  }
  function moveOp(op, ref, after) {
    const C = cam(), i = C.ops.indexOf(op), before = snap();
    if (op === ref) return;
    C.ops.splice(i, 1);
    let j = C.ops.indexOf(ref) + (after ? 1 : 0);
    if (j < 0) j = C.ops.length;
    C.ops.splice(j, 0, op);
    if (C.ops.indexOf(op) === i) return;
    record(`Move ${op.name}`, before);
    camRefresh();
  }
  CF.moveOp = moveOp; CF.duplicate = duplicate;
  const ICO = {
    grip: '<path d="M7 5h.01M7 10h.01M7 15h.01M13 5h.01M13 10h.01M13 15h.01" stroke-width="2.4"/>',
    dup: '<rect x="7" y="7" width="9" height="9" rx="1.6"/><path d="M4 12.5V5.6A1.6 1.6 0 0 1 5.6 4h6.9"/>',
    regen: '<path d="M16 10a6 6 0 1 1-1.8-4.3"/><path d="M16 3.5v3.2h-3.2"/>',
    del: '<path d="M5.5 6l9 9M14.5 6l-9 9"/>',
    off: '<path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z"/><path d="M3 17L17 3"/>',
  };
  const ic = (k, extra) => `<svg viewBox="0 0 20 20">${ICO[k] || IC[k] || ''}</svg>${extra || ''}`;
  function opmHTML() {
    const C = cam(), nums = camOpNums(), mk = modelKey();
    let stale = 0;
    const rows = C.ops.map(op => {
      let P = null, t = '';
      try { P = toolpath(op); if (P && !P.pending) t = fmtTime(pathStats(P).min); else if (P && P.pending) t = 'computing…'; } catch (e) { /* shown without time */ }
      const st = staleOf(op, mk), warn = P && P.warn && P.warn.length, tool = (() => { try { return 'T' + toolOf(op.tool).n; } catch (e) { return ''; } })();
      if (st) stale++;
      const info = OP_INFO[op.type] || {};
      return `<li class="opm-row ${CAMUI.op === op.id && CAMUI.view === 'op' ? 'sel' : ''} ${op.sup ? 'off' : ''} ${op.hide ? 'hid' : ''}" draggable="true" data-opm="${op.id}">
        <span class="grip" data-tip="Drag to change the order">${ic('grip')}</span>
        <input type="checkbox" class="opm-on" data-opm-on ${op.sup ? '' : 'checked'} aria-label="Include in the program">
        <span class="num">${op.sup ? '' : nums.get(op.id)}</span>
        <span class="body"><span class="nm">${esc(op.name)}</span><span class="sub">${[tool, t, op.auto ? 'auto' : ''].filter(Boolean).join(' · ')}</span></span>
        ${warn ? '<i class="opm-warn" data-tip="This toolpath has a warning">!</i>' : ''}${st ? '<button class="opm-stale" data-opm-regen data-tip="The model changed after this geometry was picked. Click to pick it again from the model.">Stale</button>' : ''}
        <span class="acts"><button data-opm-eye class="${op.hide ? 'on' : ''}" data-tip="${op.hide ? 'Show' : 'Hide'} this toolpath in the view">${ic(op.hide ? 'off' : 'eye')}</button><button data-opm-dup data-tip="Duplicate">${ic('dup')}</button><button data-opm-regen data-tip="Regenerate from the model">${ic('regen')}</button><button data-opm-del data-tip="Delete">${ic('del')}</button></span></li>`;
    }).join('');
    return `<div class="sec-title opm-head">Operations <span>${C.ops.length || ''}</span><span class="sp"></span>${stale ? `<button class="opm-all" data-opm-regenall>Regenerate ${stale} stale</button>` : ''}<button class="opm-new" data-cfnew="1" data-tip="New toolpath (N)">${ic('camnew')}</button></div>
      <ul class="opm" data-opm-list>${rows || '<li class="empty">Nothing programmed yet. Press N to start a toolpath, or run Auto Detect.</li>'}</ul>`;
  }
  const camTree0 = camTree;
  camTree = function () {
    const h = camTree0(), i = h.indexOf('<div class="sec-title">Operations');
    return i < 0 ? h : h.slice(0, i) + opmHTML();
  };
  function opmMenu(op, x, y) {
    const C = cam(), i = C.ops.indexOf(op);
    showMenu([
      { label: 'Edit ' + op.name, run: () => { CAMUI.view = 'op'; CAMUI.op = op.id; camRefresh(); } },
      { label: 'Duplicate', run: () => duplicate(op) },
      { label: 'Regenerate from the model', run: () => regenerate(op) },
      { label: op.sup ? 'Include in program' : 'Leave out of program', run: () => camEdit(op, 'sup', !op.sup) },
      { label: op.hide ? 'Show in the view' : 'Hide in the view', run: () => camEdit(op, 'hide', !op.hide) },
      null,
      i > 0 ? { label: 'Move to the top', run: () => moveOp(op, C.ops[0], false) } : undefined,
      i < C.ops.length - 1 ? { label: 'Move to the end', run: () => moveOp(op, C.ops[C.ops.length - 1], true) } : undefined,
      null,
      { label: 'Delete', danger: true, run: () => removeOp(op) },
    ].filter(x2 => x2 !== undefined), x, y);
  }
  const bindCamTree0 = bindCamTree;
  bindCamTree = function (el) {
    bindCamTree0(el);
    const list = el.querySelector('[data-opm-list]');
    if (!list) return;
    const C = cam(), opOf = n => C.ops.find(o => o.id === +n.closest('[data-opm]').dataset.opm);
    list.addEventListener('click', e => {
      const row = e.target.closest('[data-opm]');
      if (!row) return;
      const op = opOf(row), q = s => e.target.closest(s);
      if (q('[data-opm-on]')) { camEdit(op, 'sup', !e.target.closest('[data-opm-on]').checked); return; }
      if (q('[data-opm-eye]')) { camEdit(op, 'hide', !op.hide); return; }
      if (q('[data-opm-dup]')) { duplicate(op); return; }
      if (q('[data-opm-regen]')) { regenerate(op); return; }
      if (q('[data-opm-del]')) { removeOp(op); return; }
      if (SIM.on) simStop();
      CAMUI.view = 'op'; CAMUI.op = op.id; camRefresh();
    });
    list.addEventListener('contextmenu', e => { const row = e.target.closest('[data-opm]'); if (row) { e.preventDefault(); opmMenu(opOf(row), e.clientX, e.clientY); } });
    let drag = null;
    const clear = () => list.querySelectorAll('.drop-before, .drop-after, .dragging').forEach(r => r.classList.remove('drop-before', 'drop-after', 'dragging'));
    list.addEventListener('dragstart', e => { const row = e.target.closest('[data-opm]'); if (!row) return; drag = opOf(row); row.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(drag.id)); });
    list.addEventListener('dragover', e => {
      const row = e.target.closest('[data-opm]');
      if (!drag || !row) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      const r = row.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
      list.querySelectorAll('.drop-before, .drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
      row.classList.add(after ? 'drop-after' : 'drop-before');
    });
    list.addEventListener('drop', e => {
      const row = e.target.closest('[data-opm]');
      if (!drag || !row) return;
      e.preventDefault();
      const r = row.getBoundingClientRect(), op = drag; drag = null; clear();
      moveOp(op, opOf(row), e.clientY > r.top + r.height / 2);
    });
    list.addEventListener('dragend', () => { drag = null; clear(); });
    const all = el.querySelector('[data-opm-regenall]');
    if (all) all.addEventListener('click', () => { let lost = 0; const mk = modelKey(); for (const op of cam().ops.slice()) if (staleOf(op, mk)) lost += regenerate(op, true); toast(lost ? `Regenerated. ${lost} piece${lost > 1 ? 's' : ''} of geometry no longer in the model were dropped.` : 'Every toolpath is up to date.'); });
  };
  // a model change refreshes the list so the stale marker shows at once
  const camModelChanged0 = camModelChanged;
  camModelChanged = function () { camModelChanged0.apply(this, arguments); };

  // ═══ Look ═══
  const css = document.createElement('style');
  css.textContent = `
#cfPicker { position: fixed; inset: 0; z-index: 70; display: flex; align-items: flex-start; justify-content: center; padding-top: 12vh; background: rgba(14, 18, 26, 0); transition: background .18s var(--ease, ease); }
#cfPicker.in { background: rgba(14, 18, 26, .32); }
.cf-card { width: min(480px, calc(100vw - 32px)); max-height: 70vh; display: flex; flex-direction: column; background: var(--panel); border: 1px solid var(--rule); border-radius: 14px; box-shadow: 0 18px 50px rgba(0, 0, 0, .25), var(--shadow); overflow: hidden; opacity: 0; transform: translateY(-8px) scale(.985); transition: opacity .18s var(--ease, ease), transform .22s var(--ease, ease); font-family: var(--font, Inter, system-ui, sans-serif); }
#cfPicker.in .cf-card { opacity: 1; transform: none; }
.cf-search { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--rule); }
.cf-search svg { width: 16px; height: 16px; fill: none; stroke: var(--muted); stroke-width: 1.8; stroke-linecap: round; flex: none; }
.cf-search input { flex: 1; border: 0; outline: 0; background: transparent; font: 500 14px var(--font, Inter, system-ui, sans-serif); color: var(--ink); min-width: 0; }
.cf-list { overflow-y: auto; padding: 4px 6px 8px; }
.cf-grp { position: sticky; top: 0; background: var(--panel); padding: 8px 8px 4px; font: 650 10px var(--font, Inter, system-ui, sans-serif); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); z-index: 1; }
.cf-item { display: grid; grid-template-columns: 22px 1fr auto; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border: 0; background: transparent; border-radius: 9px; cursor: pointer; text-align: left; color: var(--ink); font: 500 13px var(--font, Inter, system-ui, sans-serif); transition: background .12s ease; }
.cf-item svg { width: 20px; height: 20px; fill: none; stroke: var(--accent); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.cf-item .sub { font-size: 11px; color: var(--muted); font-weight: 400; }
.cf-item.sel { background: var(--accent-soft); }
.cf-empty { padding: 22px 14px; text-align: center; color: var(--muted); font-size: 12.5px; }
.cf-foot { display: flex; gap: 16px; padding: 8px 14px; border-top: 1px solid var(--rule); font-size: 11px; color: var(--muted); background: var(--panel-2); }
#cfPicker .kbd, .cf-foot .kbd, .cf-flow .kbd, .cf-bar .btn .kbd { font: 600 10px var(--mono, ui-monospace, monospace); padding: 1px 5px; border: 1px solid var(--rule); border-radius: 5px; background: var(--panel-2); color: var(--muted); margin-left: 4px; }
.cf-bar .btn.primary .kbd { background: rgba(255, 255, 255, .18); border-color: rgba(255, 255, 255, .3); color: var(--accent-ink); }
#panel.cf-on .pn-body { gap: 10px; padding-bottom: 0; }
.cf-flow { margin: 0 -2px; }
.cf-chips { display: flex; align-items: center; gap: 4px; }
.cf-chips i { flex: 1; height: 2px; background: var(--rule); border-radius: 2px; min-width: 6px; }
.cf-chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--rule); background: var(--panel-2); border-radius: 99px; padding: 3px 9px 3px 4px; font: 600 11px var(--font, Inter, system-ui, sans-serif); color: var(--muted); cursor: pointer; transition: background .2s var(--ease, ease), color .2s var(--ease, ease), border-color .2s var(--ease, ease); }
.cf-chip b { width: 17px; height: 17px; border-radius: 50%; display: grid; place-items: center; background: var(--panel); border: 1.5px solid var(--rule); font: 700 9.5px var(--font, Inter, system-ui, sans-serif); }
.cf-chip.now { background: var(--accent-soft); border-color: var(--accent); color: var(--ink); }
.cf-chip.now b { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.cf-chip.done b { border-color: var(--ok); color: var(--ok); }
.cf-chip.ok:hover { border-color: var(--ok); color: var(--ink); }
.chain-list { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
.chain-list li { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 6px 8px; border: 1px solid var(--rule); border-radius: 9px; background: var(--panel-2); font-size: 12px; }
.chain-list .nm { font-weight: 650; color: var(--ink); }
.chain-list .sub { color: var(--muted); flex: 1; min-width: 70px; }
.chain-list .mini { border: 1px solid var(--rule); background: var(--panel); border-radius: 6px; padding: 2px 8px; font: 600 11px var(--font, Inter, system-ui, sans-serif); color: var(--ink-2); cursor: pointer; transition: border-color .15s ease, color .15s ease; }
.chain-list .mini:hover { border-color: var(--accent); color: var(--accent); }
.chain-list .mini.on { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
.cf-tp { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }
.cf-tp b { color: var(--ink); font-weight: 650; flex: 1; }
.cf-title h3 { margin: 2px 0 2px; font: 650 14px var(--font, Inter, system-ui, sans-serif); color: var(--ink); }
.cf-title p { margin: 0; font-size: 11.5px; line-height: 1.45; color: var(--muted); }
.cf-tabs { display: flex; flex-wrap: wrap; gap: 4px; position: relative; }
.cf-tabs button { border: 1px solid var(--rule); background: var(--panel-2); border-radius: 99px; padding: 4px 10px; font: 600 11px var(--font, Inter, system-ui, sans-serif); color: var(--ink-2); cursor: pointer; transition: background .18s var(--ease, ease), color .18s var(--ease, ease), border-color .18s var(--ease, ease); }
.cf-tabs button:hover { border-color: var(--accent); }
.cf-tabs button.on { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
.cf-pane[hidden], .cf-tabs[hidden], .cf-warn[hidden], .cf-bar [hidden] { display: none !important; }
.cf-pane { display: flex; flex-direction: column; gap: 12px; animation: cf-in .22s var(--ease, ease) both; }
@keyframes cf-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.cf-tools { display: flex; flex-direction: column; gap: 6px; }
.cf-tool { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; text-align: left; padding: 8px 10px; border: 1px solid var(--rule); background: var(--panel-2); border-radius: 10px; cursor: pointer; color: var(--ink); transition: border-color .15s ease, background .15s ease, box-shadow .15s ease; }
.cf-tool:hover { border-color: var(--accent); }
.cf-tool.on { border-color: var(--accent); background: var(--accent-soft); box-shadow: inset 0 0 0 1px var(--accent); }
.cf-tool .nm { font: 600 12.5px var(--font, Inter, system-ui, sans-serif); }
.cf-tool .sub { grid-column: 1; font-size: 11px; color: var(--muted); }
.cf-rec { grid-row: 1; grid-column: 2; font: 650 9px var(--font, Inter, system-ui, sans-serif); letter-spacing: .06em; text-transform: uppercase; font-style: normal; color: var(--ok); border: 1px solid var(--ok); border-radius: 99px; padding: 1px 6px; align-self: center; }
.cf-more { margin-top: 4px; font-size: 12px; color: var(--ink-2); }
.cf-more summary { cursor: pointer; padding: 4px 0; color: var(--muted); }
.cf-more .cf-tools { margin-top: 6px; }
.cf-why { margin: 0; }
.cf-sel .chips { display: flex; flex-wrap: wrap; gap: 6px; }
.cf-sel .chip small { color: var(--muted); }
.cf-bar { position: sticky; bottom: 0; display: flex; align-items: center; gap: 8px; margin: 6px -16px 0; padding: 10px 16px; background: var(--panel); border-top: 1px solid var(--rule); z-index: 2; }
.cf-bar .sp { flex: 1; }
.cf-bar .btn.ghost { background: transparent; border-color: transparent; color: var(--muted); }
.cf-bar .btn.ghost:hover { color: var(--danger); }
@media (prefers-reduced-motion: reduce) { .cf-card, #cfPicker, .cf-pane { transition: none; animation: none; } }
`;
  css.textContent += `
.opm { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.opm .empty { padding: 8px 4px; font-size: 12px; color: var(--muted); }
.opm-head { display: flex; align-items: center; gap: 6px; }
.opm-head .sp { flex: 1; }
.opm-head button { border: 1px solid var(--rule); background: var(--panel-2); border-radius: 7px; color: var(--ink-2); cursor: pointer; font: 600 10.5px var(--font, Inter, system-ui, sans-serif); padding: 2px 7px; transition: border-color .15s ease, color .15s ease; }
.opm-head .opm-new { padding: 2px 4px; line-height: 0; }
.opm-head .opm-new svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; }
.opm-head button:hover { border-color: var(--accent); color: var(--accent); }
.opm-head .opm-all { border-color: #d9a441; color: #a8741a; text-transform: none; letter-spacing: 0; }
.opm-row { position: relative; display: flex; align-items: center; gap: 6px; padding: 6px 6px 6px 2px; border: 1px solid transparent; border-radius: 9px; cursor: pointer; font-size: 12px; color: var(--ink); transition: background .15s ease, border-color .15s ease, opacity .2s ease; }
.opm-row:hover { background: var(--panel-2); }
.opm-row.sel { background: var(--accent-soft); border-color: var(--accent); }
.opm-row.off { opacity: .55; }
.opm-row.hid .nm { font-style: italic; }
.opm-row .grip { cursor: grab; color: var(--muted); display: grid; place-items: center; width: 14px; flex: none; }
.opm-row .grip svg, .opm-row .acts svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.opm-row .num { font: 600 10px var(--mono, ui-monospace, monospace); color: var(--muted); min-width: 14px; text-align: right; }
.opm-row .body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.opm-row .nm { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.opm-row .sub { font-size: 10.5px; color: var(--muted); }
.opm-row .acts { display: none; gap: 1px; }
.opm-row:hover .acts, .opm-row.sel .acts { display: flex; }
.opm-row .acts button { border: 0; background: transparent; padding: 3px; border-radius: 6px; color: var(--muted); cursor: pointer; line-height: 0; }
.opm-row .acts button:hover { background: var(--panel); color: var(--accent); }
.opm-row .acts button.on { color: var(--accent); }
.opm-row .acts [data-opm-del]:hover { color: var(--danger); }
.opm-stale { border: 1px solid #d9a441; background: color-mix(in srgb, #d9a441 14%, var(--panel)); color: #a8741a; border-radius: 99px; font: 700 9px var(--font, Inter, system-ui, sans-serif); letter-spacing: .05em; text-transform: uppercase; padding: 1px 6px; cursor: pointer; }
.opm-warn { font-style: normal; font: 700 10px var(--font, Inter, system-ui, sans-serif); width: 15px; height: 15px; border-radius: 50%; display: grid; place-items: center; background: var(--danger); color: #fff; }
.opm-row.dragging { opacity: .4; }
.opm-row.drop-before::before, .opm-row.drop-after::after { content: ''; position: absolute; left: 6px; right: 6px; height: 2px; border-radius: 2px; background: var(--accent); }
.opm-row.drop-before::before { top: -2px; } .opm-row.drop-after::after { bottom: -2px; }
.opm-on { margin: 0; accent-color: var(--accent); }
`;
  document.head.appendChild(css);
})();
