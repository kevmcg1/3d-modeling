// ═══════════════════════════════════════════════════════════════════
//  User parameters and expressions (Design tab), as in Fusion's
//  Change Parameters and SolidWorks' Equations / Global Variables.
//  Parameters live in doc.params as {name, expr}. A length field can be
//  given an expression (the ƒ button beside it): the feature keeps the
//  text in f.expr[field] and the number is recomputed before every
//  evaluation, so changing a parameter re-sizes everything that uses it.
//  Lengths in expressions are millimetres; use "in", "cm", "m" or "ft"
//  after a number to convert. Angles are degrees.
// ═══════════════════════════════════════════════════════════════════
(() => {
  if (typeof FEATS === 'undefined' || !window.FUSION1) return;
  const INSP = window.FUSION1;
  const st = document.createElement('style');
  st.textContent = '.fx-btn{flex:none;margin-left:6px;padding:0 6px;height:24px;border-radius:5px;border:1px solid var(--rule);background:transparent;color:var(--muted);font:italic 600 12px serif;cursor:pointer}'
    + '.fx-btn.on{color:var(--accent);border-color:var(--accent)}.fx-btn:hover{color:var(--ink)}'
    + '.par-tbl{width:100%;border-collapse:collapse;font-size:12px}.par-tbl td{padding:3px 2px;border-bottom:1px solid var(--rule)}.par-tbl input{width:100%;min-width:0}.par-tbl .v{text-align:right;color:var(--muted);white-space:nowrap}.par-bad{color:var(--danger,#e5484d)}';
  document.head.appendChild(st);

  // ── the expression language ────────────────────────────────────────
  const UNITS = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };
  const FUNCS = {
    sin: x => Math.sin(x * Math.PI / 180), cos: x => Math.cos(x * Math.PI / 180), tan: x => Math.tan(x * Math.PI / 180),
    asin: x => Math.asin(x) * 180 / Math.PI, acos: x => Math.acos(x) * 180 / Math.PI, atan: x => Math.atan(x) * 180 / Math.PI,
    sqrt: Math.sqrt, abs: Math.abs, min: Math.min, max: Math.max, round: Math.round, floor: Math.floor, ceil: Math.ceil, pow: Math.pow, log: Math.log10, ln: Math.log, exp: Math.exp, sign: Math.sign,
  };
  const CONSTS = { pi: Math.PI, e: Math.E };
  const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
  // recursive descent: expr = term {(+|-) term}; term = pow {(*|/|%) pow}; pow = unary [^ pow]; unary = [-|+] atom
  function parseExpr(src, lookup) {
    const s = String(src), n = s.length;
    let i = 0;
    const ws = () => { while (i < n && /\s/.test(s[i])) i++; };
    const fail = m => { throw new Error(m); };
    function atom() {
      ws();
      if (s[i] === '(') { i++; const v = add(); ws(); if (s[i] !== ')') fail('Missing )'); i++; return v; }
      const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
      if (num) {
        i += num[0].length; let v = parseFloat(num[0]);
        const u = /^\s*(mm|cm|ft|in|m)(?![A-Za-z0-9_])/.exec(s.slice(i));
        if (u) { v *= UNITS[u[1]]; i += u[0].length; }
        return v;
      }
      const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
      if (id) {
        i += id[0].length; const name = id[0]; ws();
        if (s[i] === '(') {
          const fn = FUNCS[name.toLowerCase()]; if (!fn) fail('Unknown function ' + name);
          i++; const args = []; ws();
          if (s[i] !== ')') for (;;) { args.push(add()); ws(); if (s[i] === ',') { i++; continue; } break; }
          if (s[i] !== ')') fail('Missing )'); i++;
          return fn(...args);
        }
        if (name in CONSTS && !lookup.has(name)) return CONSTS[name];
        return lookup.get(name);
      }
      fail(i >= n ? 'The expression ends too soon' : 'Unexpected ' + s[i]);
    }
    function unary() { ws(); if (s[i] === '-') { i++; return -unary(); } if (s[i] === '+') { i++; return unary(); } return atom(); }
    function pow() { const b = unary(); ws(); if (s[i] === '^') { i++; return Math.pow(b, pow()); } return b; }
    function mul() { let v = pow(); for (;;) { ws(); const c = s[i]; if (c === '*') { i++; v *= pow(); } else if (c === '/') { i++; v /= pow(); } else if (c === '%') { i++; v %= pow(); } else return v; } }
    function add() { let v = mul(); for (;;) { ws(); const c = s[i]; if (c === '+') { i++; v += mul(); } else if (c === '-') { i++; v -= mul(); } else return v; } }
    const v = add(); ws();
    if (i < n) fail('Unexpected ' + s[i]);
    if (!isFinite(v)) fail('That is not a number');
    return v;
  }
  // every parameter's value, with cycles and bad names reported per parameter
  function paramValues(params) {
    const list = params || (doc.params || []), by = new Map(list.map(p => [p.name, p])), vals = new Map(), errs = {}, busy = new Set();
    const lookup = { has: n => by.has(n), get(n) { return val(n); } };
    function val(n) {
      if (vals.has(n)) return vals.get(n);
      const p = by.get(n);
      if (!p) throw new Error('Unknown name ' + n);
      if (busy.has(n)) throw new Error('Circular: ' + n + ' uses itself');
      busy.add(n);
      try { const v = parseExpr(p.expr, lookup); vals.set(n, v); return v; } finally { busy.delete(n); }
    }
    for (const p of list) {
      if (!NAME_RE.test(p.name || '')) { errs[p.name] = 'Names use letters, digits and _, and start with a letter'; continue; }
      try { val(p.name); } catch (e) { errs[p.name] = e.message; }
    }
    return { vals, errs, lookup };
  }
  const evalText = (text, params) => parseExpr(text, paramValues(params).lookup);

  // ── features: f.expr[field] keeps the text, f[field] the number ────
  let exprErrors = {};
  function applyExprs() {
    const { lookup } = paramValues(), errs = {};
    for (const f of doc.features) {
      if (!f.expr) continue;
      for (const [k, text] of Object.entries(f.expr)) {
        try { const v = parseExpr(text, lookup); if (f[k] !== v) f[k] = v; } catch (e) { errs[f.id] = k + ': ' + e.message; }
      }
    }
    exprErrors = errs;
  }
  const modelChanged0 = modelChanged;
  modelChanged = function () { applyExprs(); return modelChanged0.apply(this, arguments); };   // the worker gets a copy of the document, so the numbers are settled first
  if (typeof Kernel !== 'undefined') for (const k of ['evalAsync', 'cam3d', 'camMesh']) { const f0 = Kernel[k]; Kernel[k] = function () { applyExprs(); return f0.apply(this, arguments); }; }
  const evaluate0 = evaluate;
  evaluate = function () { applyExprs(); const c = evaluate0.apply(this, arguments); for (const [id, m] of Object.entries(exprErrors)) if (!c.errors[id]) c.errors[id] = m; return c; };

  // ── the ƒ button beside every length and angle field ──────────────
  const num0 = pf.num;
  pf.num = function (label, key) {
    const html = num0.apply(this, arguments), f = CMD && CMD.f, on = !!(f && f.expr && f.expr[key]);
    const i = html.lastIndexOf('</label>');
    return i < 0 ? html : html.slice(0, i) + `<button type="button" class="fx-btn ${on ? 'on' : ''}" data-fx="${key}" title="${on ? 'Expression: ' + String(f.expr[key]).replace(/"/g, '&quot;') : 'Type an expression or a parameter name'}" aria-label="Expression for ${label}">ƒ</button>` + html.slice(i);
  };
  const toast0 = typeof toast === 'function' ? toast : () => {};
  panel.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-fx]');
    if (!b || !CMD || CMD.type !== 'feat') return;
    e.preventDefault();
    const key = b.dataset.fx, f = CMD.f, host = b.parentElement, old = host.querySelector('input[data-fv]');
    if (!old || old.dataset.fxEdit) return;
    const t = document.createElement('input');
    t.type = 'text'; t.dataset.fxEdit = '1'; t.className = old.className; t.setAttribute('inputmode', 'text'); t.autocomplete = 'off'; t.spellcheck = false;
    t.value = f.expr && f.expr[key] ? f.expr[key] : old.value;
    t.placeholder = 'e.g. width/2 + 3 mm';
    old.replaceWith(t); t.focus(); t.select();
    let done = false;
    const commit = () => {
      if (done) return; done = true;
      const text = t.value.trim(), len = !!old.dataset.len;
      if (/^-?(\d+\.?\d*|\.\d+)$/.test(text) || text === '') {
        if (f.expr) { delete f.expr[key]; if (!Object.keys(f.expr).length) delete f.expr; }
        const v = parseFloat(text);
        if (isFinite(v)) f[key] = old.dataset.int ? Math.round(len ? fromU(v) : v) : len ? fromU(v) : v;
      } else {
        try {
          const v = evalText(text);
          (f.expr || (f.expr = {}))[key] = text; f[key] = old.dataset.int ? Math.round(v) : v;
        } catch (err) { toast0('Expression: ' + err.message); }
      }
      featSync();
    };
    t.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); commit(); } else if (ev.key === 'Escape') { ev.stopPropagation(); done = true; refreshPanel(); } });
    t.addEventListener('blur', commit);
  });
  // typing a plain number into a field takes the expression off it
  const bindFeatPanel0 = bindFeatPanel;
  bindFeatPanel = function () {
    if (CMD && CMD.type === 'feat') panel.querySelectorAll('input[data-fv]').forEach(inp => inp.addEventListener('input', () => {   // runs before the field's own handler
      const f = CMD.f, k = inp.dataset.fv;
      if (f.expr && f.expr[k]) { delete f.expr[k]; if (!Object.keys(f.expr).length) delete f.expr; }
    }));
    return bindFeatPanel0.apply(this, arguments);
  };

  // ── the Parameters panel (an Inspect kind) ─────────────────────────
  const fmtV = v => (Math.abs(v) < 1e-9 ? '0' : String(+v.toFixed(5)));
  function setParams(next, label) {
    const s = snap(); doc.params = next; record(label, s); modelChanged(true);
    refreshPanel();
  }
  INSP.titleOf.params = 'Parameters'; INSP.tagOf.params = 'named values';
  INSP.body.params = () => {
    const list = doc.params || [], { vals, errs } = paramValues(list);
    const rows = list.map((p, i) => `<tr><td><input type="text" data-par="name" data-i="${i}" value="${p.name}" aria-label="Name" spellcheck="false"></td>`
      + `<td><input type="text" data-par="expr" data-i="${i}" value="${String(p.expr).replace(/"/g, '&quot;')}" aria-label="Expression" spellcheck="false"></td>`
      + `<td class="v ${errs[p.name] ? 'par-bad' : ''}" title="${errs[p.name] || ''}">${errs[p.name] ? '!' : fmtV(vals.get(p.name))}</td>`
      + `<td><button class="btn" data-par-del="${i}" title="Delete" aria-label="Delete parameter">×</button></td></tr>`).join('');
    const bad = Object.values(errs)[0];
    const users = list.length ? doc.features.filter(f => f.expr).length : 0;
    return (list.length ? `<table class="par-tbl"><tr><th>Name</th><th>Expression</th><th>Value</th><th></th></tr>${rows}</table>` : '<p class="note">No parameters yet. Add one, then type its name in the ƒ box beside any length.</p>')
      + (bad ? `<p class="note err-note">${bad}</p>` : '')
      + '<div class="btns"><button class="btn" data-par-add="1">Add parameter</button></div>'
      + `<p class="note">${users} feature field${users === 1 ? '' : 's'} use expressions. Parameters can use each other (<code>wall*2</code>), numbers with units (<code>1.5 in</code>), and sin, cos, sqrt, min, max, round. Lengths are millimetres; angles are degrees. Changing a value re-sizes everything that uses it.</p>`;
  };
  INSP.bind.params = pn => {
    pn.querySelectorAll('[data-par-add]').forEach(b => b.addEventListener('click', () => {
      const list = (doc.params || []).map(p => ({ ...p })); let n = list.length + 1;
      while (list.some(p => p.name === 'd' + n)) n++;
      list.push({ name: 'd' + n, expr: '10' }); setParams(list, 'Parameter added');
    }));
    pn.querySelectorAll('[data-par-del]').forEach(b => b.addEventListener('click', () => { const list = (doc.params || []).filter((_, i) => i !== +b.dataset.parDel); setParams(list, 'Parameter deleted'); }));
    pn.querySelectorAll('[data-par]').forEach(inp => inp.addEventListener('change', () => {
      const list = (doc.params || []).map(p => ({ ...p })), p = list[+inp.dataset.i];
      if (!p) return;
      if (inp.dataset.par === 'name') {
        const nm = inp.value.trim(), old = p.name;
        if (!NAME_RE.test(nm) || list.some(q => q !== p && q.name === nm)) { toast0('That name is not usable or is taken'); refreshPanel(); return; }
        p.name = nm;
        for (const q of list) q.expr = String(q.expr).replace(new RegExp('\\b' + old + '\\b', 'g'), nm);
        for (const f of doc.features) if (f.expr) for (const k of Object.keys(f.expr)) f.expr[k] = String(f.expr[k]).replace(new RegExp('\\b' + old + '\\b', 'g'), nm);
      } else p.expr = inp.value;
      setParams(list, 'Parameter edited');
    }));
  };
  INSP.hint.params = k => `<b>Parameters:</b> name a value, then use the name in any ƒ field. ${k('Esc')} closes.`;
  window.PARAMS = { parseExpr, paramValues, evalText, applyExprs };   // handle for the tests

  // ── menu, icon, help ───────────────────────────────────────────────
  Object.assign(IC, { params: '<path d="M4 5h12M4 10h12M4 15h12" opacity=".5"/><text x="5" y="9" font-size="8" font-style="italic" font-family="serif" fill="currentColor" stroke="none">ƒ</text>' });
  Object.assign(FA_MAP, { params: 'square-root-variable' });
  MENU_IC['i:params'] = 'params';
  TB_MENUS.modify.push(null, ['i:params', 'Parameters', '']);
  const rbAppend = (h, title, items) => {
    const key = `</div><div class="rb-title">${title}</div>`, i = h.indexOf(key);
    return i < 0 ? h : h.slice(0, i) + `<div class="rb-col">${items.map(it => rbBtn('data-act', it, 'sm')).join('')}</div>` + h.slice(i);
  };
  const mt = modelToolbarHTML;
  modelToolbarHTML = function () { return rbAppend(mt.apply(this, arguments), 'Modify', [['i:params', 'Parameters', '', 'params', CMD && CMD.type === 'inspect' && CMD.kind === 'params']]); };
  TIP_TXT['i:params'] = ['Name values and use them in any length, so one change re-sizes the model.', ['Add a parameter and give it a value.', 'Click the ƒ beside a length and type its name or a formula.', 'Change the parameter and everything follows.']];
  const gi = GD.inspect;
  if (gi) GD.inspect = [gi[0], () => (CMD && CMD.kind === 'params'
    ? [gS('Add a parameter', 'A name and a value, like wall = 3.', () => (doc.params || []).length > 0), gS('Use it in a field', 'Click ƒ beside a length and type the name.', () => doc.features.some(f => f.expr)), gS('Change the value', 'Everything that uses it re-sizes.', null, true)]
    : gi[1]())];
  if (typeof TipArt !== 'undefined' && typeof TIP_ART !== 'undefined') {
    const { C, at, P, box } = TipArt, iso = (f, ox = 60, oy = 48, s = 1.55) => () => { at(ox, oy, s); return f(); };
    TIP_ART['i:params'] = [iso(() => box(-14, -8, 0, 28, 16, 10, 'a'), 60, 54, 1.4), iso(() => box(-20, -8, 0, 40, 16, 10, 'a'), 60, 54, 1.2)];
    void C; void P;
  }
  const A = window.TipAnim;
  if (A && A.scene) A.scene('i:params', g => {
    g.view(120, 134, 3); const k = g.seg(0.3, 0.8), w = 24 + 14 * k;
    g.box(-w / 2, -8, 0, w, 16, 10, 'a'); g.arrow([w / 2, 0, 10], [w / 2 + 6, 0, 10], 'r', 1.4); g.chip('width = ' + Math.round(w) + ' mm', 'a');
  });
  refreshUI();
})();
