// ═══════════════════════════════════════════════════════════════════
//  More patterns and configurations (Design tab): Table Driven Pattern
//  (copies at positions you type), Fill Pattern (copies on a grid or
//  honeycomb across a flat face), and Configurations (named sets of
//  parameter values, with a design table to edit them together).
//  The kernel half is in 3d-modeler.html. Coverage list: docs/fusion-coverage.md
// ═══════════════════════════════════════════════════════════════════
(() => {
  if (typeof FEATS === 'undefined' || !window.FUSION1 || typeof bodyTool === 'undefined' || !window.PARAMS) return;
  const INSP = window.FUSION1;
  const rbAppend = (h, title, items) => {
    const key = `</div><div class="rb-title">${title}</div>`, i = h.indexOf(key);
    return i < 0 ? h : h.slice(0, i) + `<div class="rb-col">${items.map(it => rbBtn('data-act', it, 'sm')).join('')}</div>` + h.slice(i);
  };
  Object.assign(FEAT_BASE, { tabpat: 'Table Pattern', fillpat: 'Fill Pattern' });
  Object.assign(FEAT_IC, { tabpat: 'tabpat', fillpat: 'fillpat' });
  const featDeps0 = featDeps;
  featDeps = function (f, ids, fromMeta) { featDeps0.apply(this, arguments); if (f.type === 'fillpat' && f.face) fromMeta(f.face.m); };

  // ── Table Driven Pattern ──
  const FIELDS = [['dx', 'X', 1], ['dy', 'Y', 1], ['dz', 'Z', 1], ['rz', '° about Z', 0]];
  FEATS.tabpat = bodyTool({
    label: 'Table Driven Pattern', home: 'bodies', need: 'Pick the bodies and add rows.',
    init: () => ({ bodies: [], rows: [{ dx: 30, dy: 0, dz: 0, rz: 0 }], join: false }),
    ready: f => f.bodies.length > 0 && f.rows.length > 0,
    text(f, key, v) {                                                    // key is "row.field"
      const [i, k] = key.split('.'), r = f.rows[+i], n = parseFloat(v);
      if (r && isFinite(n)) r[k] = k === 'rz' ? n : fromU(n);
    },
    panel: f => bodyPickPanel(f, 'bodies', 'Bodies to copy')
      + `<div class="field"><span>One copy per row, moved by (${isIn() ? 'in' : 'mm'}) and turned about Z (°)</span><table class="insp-tbl"><tr><th>#</th>${FIELDS.map(c => `<th>${c[1]}</th>`).join('')}<th></th></tr>`
      + f.rows.map((r, i) => `<tr><td>${i + 1}</td>${FIELDS.map(([k, , isLen]) => `<td><input type="number" step="any" style="width:64px" data-ft="${i}.${k}" value="${+(isLen ? toU(+r[k] || 0) : +r[k] || 0).toFixed(4)}"></td>`).join('')}<td><button class="btn" data-fdo="del-${i}" title="Remove row" aria-label="Remove row">×</button></td></tr>`).join('') + '</table></div>'
      + '<div class="btns"><button class="btn" data-fdo="add">Add row</button></div>' + pf.chk('Join copies to the originals', 'join')
      + pf.note('Every row makes one copy of the picked bodies, moved by the X, Y and Z you type (X right, Y back, Z up) and turned about the vertical axis through the middle of the bodies. Use it for positions that follow no regular grid.'),
    act: Object.assign({ add() { const l = CMD.f.rows[CMD.f.rows.length - 1] || { dx: 0, dy: 0, dz: 0, rz: 0 }; CMD.f.rows.push({ ...l }); featSync(); } },
      Object.fromEntries(Array.from({ length: 200 }, (_, i) => ['del-' + i, () => { CMD.f.rows.splice(i, 1); featSync(); }]))),
    hint: () => 'click the bodies to copy, then fill in the table',
    sub: f => '× ' + f.rows.length,
  });

  // ── Fill Pattern ──
  FEATS.fillpat = bodyTool({
    label: 'Fill Pattern', home: 'bodies', need: 'Pick the bodies and the face to fill.',
    init: () => ({ bodies: [], face: null, kind: 'grid', sx: 15, sy: 15, margin: 5, join: false }),
    ready: f => f.bodies.length > 0 && !!f.face,
    move(x, y) { if (CMD.step === 'face') hoverBeforeFace(x, y, h => Surf.list[h.fid].t === 'P'); else hoverBody(x, y); },
    click(x, y) {
      const c = CMD, f = c.f;
      if (c.step === 'face') { const h = pickBefore(x, y); if (!h || Surf.list[h.fid].t !== 'P') return; f.face = faceRef(h.mesh, h.fid, faceInfo(h.mesh, h.fid).on); featSync(); return; }
      const h = hover3D; if (h && h.kind === 'bbody') { toggleIn(f.bodies, h.body); if (!f.face) c.step = 'face'; featSync(); }
    },
    bodyClick(id) { if (CMD.step === 'face') return; toggleIn(CMD.f.bodies, id); if (!CMD.f.face) CMD.step = 'face'; featSync(); },
    hl(add) { for (const id of CMD.f.bodies) add.body(id, selMat); if (CMD.f.face) hlFaces(add, [CMD.f.face]); },
    panel: f => pf.pick('Bodies', f.bodies.length ? f.bodies.map(id => bodyNames()[id] || 'Body').join(', ') : 'Click bodies', f.bodies.length || '', 'bodies') + pf.pick('Face to fill', f.face ? 'Face chosen' : 'Click a flat face', f.face ? '✓' : '', 'face')
      + pf.seg('Layout', 'kind', [['grid', 'Grid'], ['hex', 'Honeycomb']])
      + (f.kind === 'hex' ? pf.num('Spacing', 'sx', { len: 1, min: 0, step: isIn() ? 0.05 : 1 }) : `<div class="row2">${pf.num('Spacing along', 'sx', { len: 1, min: 0, step: isIn() ? 0.05 : 1 })}${pf.num('Spacing across', 'sy', { len: 1, min: 0, step: isIn() ? 0.05 : 1 })}</div>`)
      + pf.num('Keep away from the edge', 'margin', { len: 1, min: 0, step: isIn() ? 0.05 : 1 }) + pf.chk('Join copies to the originals', 'join')
      + pf.note('Copies the picked bodies to every spot of a grid (or honeycomb) that fits on the face. The grid is laid out from where the bodies sit now. Keep-away is the clear distance between a copy’s center and the edge of the face.'),
    hint: c => c.step === 'face' ? 'click the flat face to fill' : 'click the bodies to copy',
    sub: f => (f.kind === 'hex' ? 'honeycomb ' : 'grid ') + fmtLs(f.sx),
  });

  // ── Configurations: named sets of parameter values ──
  const cfgs = () => doc.configs || (doc.configs = []);
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  function change(label, fn) { const s = snap(); fn(); record(label, s); modelChanged(true); refreshPanel(); }
  const snapshotVals = () => Object.fromEntries((doc.params || []).map(p => [p.name, String(p.expr)]));
  function activate(i) {
    const c = cfgs()[i]; if (!c) return;
    change('Configuration: ' + c.name, () => { for (const p of doc.params || []) if (c.vals && p.name in c.vals) p.expr = c.vals[p.name]; doc.activeConfig = c.name; });
  }
  INSP.titleOf.configs = 'Configurations'; INSP.tagOf.configs = 'design table';
  INSP.body.configs = () => {
    const P = doc.params || [], C = cfgs();
    if (!P.length) return '<p class="note">Configurations switch the values of your parameters. Add parameters first (Modify → Parameters), then come back and save a configuration.</p>';
    const head = `<tr><th>Parameter</th>${C.map((c, i) => `<th><input type="text" data-cf="name" data-i="${i}" value="${esc(c.name)}" style="width:80px" aria-label="Configuration name"><br><button class="btn ${doc.activeConfig === c.name ? 'primary' : ''}" data-cf-act="${i}">${doc.activeConfig === c.name ? 'Active' : 'Use'}</button><button class="btn" data-cf-del="${i}" title="Delete" aria-label="Delete configuration">×</button></th>`).join('')}</tr>`;
    const rows = P.map(p => `<tr><td>${esc(p.name)}</td>${C.map((c, i) => `<td><input type="text" data-cf="val" data-i="${i}" data-p="${esc(p.name)}" value="${esc(c.vals && p.name in c.vals ? c.vals[p.name] : p.expr)}" style="width:80px" spellcheck="false"></td>`).join('')}</tr>`).join('');
    return `<table class="insp-tbl">${head}${rows}</table>`
      + '<div class="btns"><button class="btn" data-cf-add="1">Save current values as new</button><button class="btn" data-cf-csv="1">Copy table as CSV</button></div>'
      + '<label class="field"><span>Paste a design table (CSV: first row names, first column parameters)</span><textarea data-cf-paste="1" rows="3" style="width:100%" spellcheck="false"></textarea></label>'
      + '<div class="btns"><button class="btn" data-cf-load="1">Load table</button></div>'
      + '<p class="note">Each column is one configuration. “Use” sets the parameters to that column’s values, so every feature using them follows. Edit a cell to change a value; a parameter’s value can be any expression. Changes to the active column apply at once.</p>';
  };
  INSP.bind.configs = pn => {
    pn.querySelectorAll('[data-cf-act]').forEach(b => b.addEventListener('click', () => activate(+b.dataset.cfAct)));
    pn.querySelectorAll('[data-cf-del]').forEach(b => b.addEventListener('click', () => change('Configuration deleted', () => { const c = cfgs().splice(+b.dataset.cfDel, 1)[0]; if (c && doc.activeConfig === c.name) delete doc.activeConfig; })));
    pn.querySelectorAll('[data-cf-add]').forEach(b => b.addEventListener('click', () => change('Configuration added', () => { let n = cfgs().length + 1; while (cfgs().some(c => c.name === 'Config ' + n)) n++; cfgs().push({ name: 'Config ' + n, vals: snapshotVals() }); })));
    pn.querySelectorAll('[data-cf="name"]').forEach(inp => inp.addEventListener('change', () => change('Configuration renamed', () => { const c = cfgs()[+inp.dataset.i], nm = inp.value.trim(); if (c && nm && !cfgs().some(q => q !== c && q.name === nm)) { if (doc.activeConfig === c.name) doc.activeConfig = nm; c.name = nm; } })));
    pn.querySelectorAll('[data-cf="val"]').forEach(inp => inp.addEventListener('change', () => change('Configuration edited', () => {
      const c = cfgs()[+inp.dataset.i]; if (!c) return;
      c.vals = c.vals || {}; c.vals[inp.dataset.p] = inp.value;
      if (doc.activeConfig === c.name) { const p = (doc.params || []).find(q => q.name === inp.dataset.p); if (p) p.expr = inp.value; }
    })));
    const table = () => { const P = doc.params || [], C = cfgs(); return [['parameter', ...C.map(c => c.name)], ...P.map(p => [p.name, ...C.map(c => (c.vals && p.name in c.vals ? c.vals[p.name] : p.expr))])]; };
    const q = v => (/[",\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
    pn.querySelectorAll('[data-cf-csv]').forEach(b => b.addEventListener('click', () => { INSP.lastCsv = table().map(r => r.map(q).join(',')).join('\n'); try { navigator.clipboard.writeText(INSP.lastCsv); } catch (e) { /* not available */ } toast('Design table copied'); }));
    pn.querySelectorAll('[data-cf-load]').forEach(b => b.addEventListener('click', () => {
      const ta = pn.querySelector('[data-cf-paste]'); if (ta) loadCsv(ta.value);
    }));
  };
  function parseCsv(text) {
    const rows = []; let row = [], cur = '', inq = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inq) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') inq = false; else cur += ch; }
      else if (ch === '"') inq = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; rows.push(row); row = []; }
      else cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim() !== ''));
  }
  function loadCsv(text) {
    const rows = parseCsv(text);
    if (rows.length < 2 || rows[0].length < 2) { toast('A design table needs a header row and at least one configuration column'); return; }
    const names = rows[0].slice(1).map(s => s.trim()), pn = new Set((doc.params || []).map(p => p.name));
    const unknown = rows.slice(1).map(r => r[0].trim()).filter(n => !pn.has(n));
    if (unknown.length) { toast('Unknown parameter: ' + unknown[0]); return; }
    change('Design table loaded', () => {
      doc.configs = names.map((nm, i) => ({ name: nm || 'Config ' + (i + 1), vals: Object.fromEntries(rows.slice(1).map(r => [r[0].trim(), (r[i + 1] || '').trim()]).filter(x => x[1] !== '')) }));
    });
  }
  INSP.hint.configs = k => `<b>Configurations:</b> “Use” a column to set all parameters at once. ${k('Esc')} closes.`;
  window.CONFIGS = { activate, loadCsv, parseCsv };

  Object.assign(IC, {
    tabpat: '<rect x="2.5" y="3" width="4" height="4" rx=".6"/><rect x="11" y="4.5" width="4" height="4" rx=".6" opacity=".6"/><rect x="5" y="12" width="4" height="4" rx=".6" opacity=".6"/><path d="M6.5 5h4M13 8.5l-5 4" opacity=".4" stroke-dasharray="1.6 1.4"/>',
    fillpat: '<rect x="2.5" y="3" width="15" height="14" rx="1" opacity=".5"/><circle cx="6" cy="7" r="1.4"/><circle cx="10" cy="7" r="1.4" opacity=".6"/><circle cx="14" cy="7" r="1.4" opacity=".6"/><circle cx="8" cy="12.5" r="1.4" opacity=".6"/><circle cx="12" cy="12.5" r="1.4" opacity=".6"/>',
    configs: '<rect x="3" y="3" width="14" height="14" rx="1.5" opacity=".5"/><path d="M3 8h14M3 12.5h14M8.5 3v14"/>',
  });
  Object.assign(FA_MAP, { tabpat: 'table-cells-large', fillpat: 'braille', configs: 'table' });
  Object.assign(MENU_IC, { 'f:tabpat': 'tabpat', 'f:fillpat': 'fillpat', 'i:configs': 'configs' });
  TB_MENUS.pattern.push(['f:tabpat', 'Table Driven Pattern', ''], ['f:fillpat', 'Fill Pattern', '']);
  TB_MENUS.construct.push(['i:configs', 'Configurations', '']);
  const mt = modelToolbarHTML;
  modelToolbarHTML = function () {
    let h = rbAppend(mt.apply(this, arguments), 'Pattern', [['f:tabpat', 'Table Driven', '', 'tabpat', cmdIs('tabpat')], ['f:fillpat', 'Fill Pattern', '', 'fillpat', cmdIs('fillpat')]]);
    return rbAppend(h, 'Inspect', [['i:configs', 'Configurations', '', 'configs', CMD && CMD.type === 'inspect' && CMD.kind === 'configs']]);
  };
  Object.assign(TIP_TXT, {
    'f:tabpat': ['Copies at positions you type in a table.', ['Click the bodies to copy.', 'Fill in a row for each copy: how far to move it and how far to turn it.', 'OK.']],
    'f:fillpat': ['Fill a flat face with copies on a grid or honeycomb.', ['Click the bodies to copy, then the face.', 'Set the spacing and how far from the edge.', 'OK. Copies that do not fit are left out.']],
    'i:configs': ['Save sets of parameter values and switch between them.', ['Make parameters first.', 'Save the current values as a configuration.', 'Edit the table, then click Use on a column.']],
  });
  if (typeof TipArt !== 'undefined' && typeof TIP_ART !== 'undefined') {
    const { C, at, P, box } = TipArt, iso = (f, ox = 60, oy = 48, s = 1.55) => () => { at(ox, oy, s); return f(); };
    Object.assign(TIP_ART, {
      'f:tabpat': [iso(() => box(-24, -8, 0, 10, 10, 8, 'a'), 60, 56, 1.3), iso(() => box(-24, -8, 0, 10, 10, 8, 'a') + box(-6, 4, 0, 10, 10, 8, 'a') + box(14, -10, 0, 10, 10, 8, 'a'), 60, 56, 1.3)],
      'f:fillpat': [iso(() => box(-24, -16, 0, 48, 32, 2) + box(-18, -10, 2, 6, 6, 6, 'a'), 60, 56, 1.2), iso(() => box(-24, -16, 0, 48, 32, 2) + [-18, -4, 10].map(x => [-10, 4].map(y => box(x, y, 2, 6, 6, 6, 'a')).join('')).join(''), 60, 56, 1.2)],
      'i:configs': [iso(() => box(-16, -10, 0, 32, 20, 8, 'a'), 60, 56, 1.3), iso(() => box(-16, -10, 0, 32, 20, 8, 'a') + box(-16, -10, 8, 32, 20, 8), 60, 56, 1.3)],
    });
  }
  const A = window.TipAnim;
  if (A && A.scene) {
    A.scene('f:tabpat', g => { g.view(120, 136, 3); const k = g.seg(0.25, 0.8); g.box(-24, -8, 0, 10, 10, 8, 'a'); if (k > 0.3) g.box(-6, 4, 0, 10, 10, 8, 'a'); if (k > 0.6) g.box(14, -10, 0, 10, 10, 8, 'a'); });
    A.scene('f:fillpat', g => { g.view(120, 136, 3); const k = g.seg(0.25, 0.8); g.box(-24, -16, 0, 48, 32, 2, 'n'); [-18, -4, 10].forEach((x, i) => [-10, 4].forEach((y, j) => { if (i + j * 3 <= k * 6) g.box(x, y, 2, 6, 6, 6, 'a'); })); });
    A.scene('i:configs', g => { g.view(120, 136, 3); const k = g.seg(0.25, 0.8); g.box(-16, -10, 0, 32, 20, 8 + 8 * k, 'a'); g.chip(k > 0.5 ? 'Tall' : 'Short', 'a'); });
  }
  refreshUI();
})();
