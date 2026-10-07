// Manufacture: controllers (post processors) and work offsets G54 to G59.
//
// postGcode() in index.html builds one program from every operation. What differs between controllers is small and lives
// here, as a profile per controller: the program header and end, the tool change, how the tool length is applied, which
// canned cycles exist (and in what words), how a dwell is written, comment style, and the work-offset words. Everything a
// profile cannot do is posted as plain moves, which every control accepts, with a comment saying so.
//
// Work offsets: G54 is the work origin you set in Setup. Setup can add G55 to G59, each an origin of its own (a corner, a
// construction point, or any of those shifted by X Y Z, for several parts or vises on one table). An operation picks the
// offset it runs in; its G-code coordinates are relative to that origin and a G55 (and so on) line is posted before it.
(function () {
  'use strict';
  const pad = (n, k) => String(Math.max(0, Math.round(n))).padStart(k, '0');
  const num = v => { const s = String(+(+v).toFixed(3)); return Number.isInteger(+s) ? s + '.' : s; };
  const semi = l => { const m = /^\((.*)\)$/.exec(l); if (m) return '; ' + m[1]; return l.replace(/\s+\(([^()]*)\)\s*$/, ' ; $1'); };
  const WCS = ['G54', 'G55', 'G56', 'G57', 'G58', 'G59'];
  const ISO_MODES = ['drill', 'spot', 'peck', 'chip', 'ream', 'bore', 'bored', 'tap', 'fine', 'back'];

  // ── ISO family: Haas, Fanuc, Mach3, Grbl ──
  const iso = o => Object.assign({
    ext: 'nc', wcs: WCS, indexed: false, g12: false, grbl: false,
    head: pf => ['%', `O${pad(pf.program, 5)} (DATUM)`],
    init: inch => [`${inch ? 'G20' : 'G21'} G90 G94 G17 G40 G49 G80`],
    toolChange: t => [`T${t.n} M6`],
    tlc: (t, z) => `G43 H${t.n} Z${z}`,
    dwell: s => `G4 P${+s.toFixed(2)}`,
    cycP: s => { const v = +s.toFixed(3); return Number.isInteger(v) ? v + '.' : String(v); },
    canned: mode => ISO_MODES.includes(mode),
    end: () => ['G28 G91 Z0.', 'G90', 'M30', '%'],
  }, o);

  const POSTS = {
    haas: iso({ id: 'haas', name: 'Haas (NGC)', indexed: true, g12: true, head: pf => ['%', `O${pad(pf.program, 5)} (DATUM - HAAS MILL)`] }),
    fanuc: iso({
      id: 'fanuc', name: 'Fanuc 0i / 30i', indexed: true,
      head: pf => ['%', `O${pad(pf.program, 4)} (DATUM - FANUC)`],
      toolChange: t => [`T${pad(t.n, 2)} M06`],
      dwell: s => `G04 P${Math.round(s * 1000)}`,                                // Fanuc reads P as milliseconds
      cycP: s => String(Math.round(s * 1000)),
      notes: (cy, P, N) => {
        const out = [];
        if (cy.mode === 'tap') out.push(`M29 S${Math.round(P.tool.rpm)}`, `(RIGID TAP G84 - PITCH ${fmtLs(P.tap.pitch, 4)}, F = RPM X PITCH. M29 SELECTS RIGID TAPPING ON FANUC)`);
        if (cy.mode === 'chip') out.push('(G73 BACKS OFF BY PARAMETER 5114 BETWEEN PECKS - CHECK THE PARAMETER)');
        if (cy.mode === 'peck') out.push('(G83 STOPS ITS RAPID BY PARAMETER 5115 ABOVE THE LAST PECK - CHECK THE PARAMETER)');
        if (cy.mode === 'fine') out.push(`(G76 FINE BORE - Q${N(cy.shift)} SHIFTS THE BAR OFF THE WALL, THE SPINDLE ORIENTS FIRST - NEEDS SPINDLE ORIENT)`);
        if (cy.mode === 'back') out.push(`(G87 BACK BORE - Q${N(cy.shift)} SHIFTS THE BAR OFF THE WALL, R IS THE FAR SIDE, Z IS THE TOP OF THE CUT - NEEDS SPINDLE ORIENT)`);
        if (cy.mode === 'bore') out.push('(G86 BORE - THE SPINDLE STOPS AT THE BOTTOM, THEN RAPID OUT)');
        return out;
      },
    }),
    mach3: iso({
      id: 'mach3', name: 'Mach3 / Mach4', ext: 'tap',
      head: pf => [`(PROGRAM ${pf.program} - DATUM FOR MACH3)`],
      canned: mode => ['drill', 'spot', 'peck', 'chip', 'ream', 'bore', 'bored'].includes(mode),
      end: () => ['G53 G0 Z0', 'M30'],
      notes: () => ['(MACH3 CANNED CYCLES - G98 / G99 RETURN PLANES AND P IN SECONDS)'],
    }),
    grbl: iso({
      id: 'grbl', name: 'Grbl', ext: 'gcode', grbl: true,
      head: () => [],
      init: inch => [`${inch ? 'G20' : 'G21'} G90 G94 G17`],
      toolChange: (t, name) => [`M0 (Change to ${name})`],
      tlc: () => null,
      canned: () => false,
      end: z => [`G0 Z${z}`, 'M2'],
    }),
    siemens: iso({
      id: 'siemens', name: 'Siemens Sinumerik 840D', ext: 'mpf', semi,
      head: pf => [`; DATUM - SINUMERIK PROGRAM ${pf.program}`],
      init: inch => [`${inch ? 'G70' : 'G71'} G90 G94 G17 G40 G64`],
      toolChange: t => [`T${t.n}`, 'M6', 'D1'],                                  // the tool's length is taken from its D1 edge
      tlc: () => null,
      dwell: s => `G4 F${+s.toFixed(2)}`,
      canned: mode => ['drill', 'spot', 'peck', 'chip', 'ream', 'tap'].includes(mode),
      end: () => ['G74 Z1=0', 'M30'],
      cycleEnd: () => ['MCALL'],
      // Sinumerik cycles are called modally: MCALL CYCLEnn(...), then one position block per hole, then MCALL to cancel.
      cycleLines: (cy, P, t, c) => {
        const { N, F, o, safe } = c, out = [], hs = P.holes, R = Math.max(...hs.map(h => h.r)) - o[2];
        const rfp = R - cy.rpl, rtp = cy.ret === 'G98' ? safe - o[2] : R, sd = cy.rpl, dtb = cy.p > 0 ? +cy.p.toFixed(2) : 0;
        const fdpr = cy.i > 0 ? cy.i : cy.q, dam = cy.i > 0 ? cy.j : 0;
        const call = dp => {
          const A = `${N(rtp)},${N(rfp)},${N(sd)},${N(dp)},0`;
          if (cy.mode === 'drill') return `CYCLE81(${A})`;
          if (cy.mode === 'spot') return `CYCLE82(${A},${dtb})`;
          if (cy.mode === 'peck' || cy.mode === 'chip') return `CYCLE83(${A},0,${N(fdpr)},${N(dam)},${dtb},0,1,${cy.mode === 'peck' ? 1 : 0})`;
          if (cy.mode === 'ream') return `CYCLE85(${A},${dtb},${F(t.plunge)},${F(t.plunge)})`;
          return `CYCLE84(${A},${dtb},3,0,${N(P.tap.pitch)},0,${Math.round(t.rpm)},${Math.round(t.rpm * (cy.tapJ || 1))})`;   // rigid tap
        };
        out.push(`(${cy.mode === 'tap' ? 'RIGID TAP' : 'DRILLING'}: RTP ${N(rtp)}, REFERENCE PLANE ${N(rfp)}, SAFETY DISTANCE ${N(sd)})`);
        if (cy.mode !== 'tap') out.push(`G1 F${F(t.plunge)}`);
        let dp = null;
        hs.forEach((h, k) => {
          const d = h.z - o[2];
          if (dp === null || Math.abs(d - dp) > 1e-6) { if (dp !== null) out.push('MCALL'); dp = d; c.mark(h.mi); out.push(`MCALL ${call(d)}`); }
          out.push(`X${N(h.x - o[0])} Y${N(h.y - o[1])}`);
        });
        return out;
      },
    }),
  };

  window.POSTS = POSTS;
  window.POST_ORDER = ['haas', 'fanuc', 'mach3', 'grbl', 'siemens'];
  window.postProfile = pf => POSTS[pf && pf.ctrl] || POSTS.haas;
  window.postFileName = () => { const C = cam(), P = postProfile(C.post), n = P.id === 'siemens' ? 'DATUM' + C.post.program : 'datum-O' + C.post.program; return `${n}.${P.ext}`; };

  // ── work offsets ──
  const wcsOf = () => { const C = cam(); return C.wcs || (C.wcs = {}); };                  // { 55: { o: <origin choice>, d: [dx, dy, dz] mm } }
  window.wcsLabel = n => {
    if (n === 54) return wcsName(cam());
    const w = wcsOf()[n]; if (!w) return 'not set';
    const sh = (w.d || [0, 0, 0]).some(v => Math.abs(v) > 1e-9) ? ` shifted ${w.d.map(v => fmtLs(v)).join(', ')}` : '';
    return wcsName({ origin: w.o }) + sh;
  };
  window.opOrigin = op => {
    const n = 54 + Math.max(0, Math.min(5, (op.wcs | 0) || 0)), w = n > 54 ? wcsOf()[n] : null;
    if (!w) return camOrigin();
    const b = camOrigin(w.o), d = w.d || [0, 0, 0];
    return [b[0] + d[0], b[1] + d[1], b[2] + d[2]];
  };

  const sel = (id, opts, cur) => `<select id="${id}">${opts.map(([v, l]) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  function wcsPanel(C) {
    const w = wcsOf(), pts = doc.features.filter(f => f.type === 'point' && !f.sup);
    const originOpts = Object.entries(ORIGIN_LABEL).map(([k, l]) => [k, l]).concat(pts.map(f => [f.id, `${f.name} (construction point)`]));
    const rows = Object.keys(w).map(Number).sort().map(n => {
      const e = w[n], d = e.d || [0, 0, 0];
      return `<div class="wcs-row" data-wcs="${n}"><div class="wcs-head"><b>G${n}</b>${sel('wcsO' + n, originOpts, e.o)}<button class="icon-btn" data-wcsdel="${n}" aria-label="Remove G${n}">×</button></div>
        <div class="row3">${['X', 'Y', 'Z'].map((a, i) => `<label class="field"><span>${a} shift (${uName()})</span><input type="number" data-wcsd="${n}:${i}" step="any" value="${+toU(d[i]).toFixed(4)}"></label>`).join('')}</div></div>`;
    }).join('');
    const free = [55, 56, 57, 58, 59].filter(n => !w[n]);
    return `<div class="field"><span>More work offsets</span></div>${rows}
      ${free.length ? `<div class="btns"><button class="btn" data-wcsadd="${free[0]}">Add G${free[0]}</button></div>` : ''}
      <p class="note">${Object.keys(w).length ? 'Each operation picks its offset in its own panel; the program switches with a G55 to G59 line. Shift an origin to place a second part or vise on the table.' : 'G54 is the origin above. Add G55 to G59 to machine several parts or vises in one program.'}</p>`;
  }

  const camPanel0 = camPanel;
  camPanel = function () {
    let h = camPanel0();
    const C = cam(), v = CAMUI.view;
    if (v === 'setup' && camStock() && !isWire() && h.includes('<dl class="kv"><dt>Origin in model')) h = h.replace(/(<dl class="kv"><dt>Origin in model[^]*?<\/dl>)/, `$1${wcsPanel(C)}`);
    if (v === 'post' && !isWire() && h.includes('<span>Haas mill (NGC)</span>')) {
      const P = postProfile(C.post);
      h = h.replace(/<div class="field"><span>Controller<\/span><div class="pick"><span>Haas mill \(NGC\)<\/span><\/div><\/div>/,
        `<div class="field"><span>Controller</span>${sel('postCtrl', POST_ORDER.map(k => [k, POSTS[k].name]), P.id)}</div>`);
      h = h.replace(/(<p class="note">The program is open in the G-code editor)/, `<label class="chk"><input type="checkbox" id="postNums" ${C.post.lineNums ? 'checked' : ''}> Line numbers (N10, N20 …)</label>$1`);
    }
    if (v === 'op' && Object.keys(wcsOf()).length) {
      const op = opById(CAMUI.op);
      if (op && op.type !== 'wire') {
        const opts = [[0, 'G54 · ' + wcsLabel(54)]].concat(Object.keys(wcsOf()).map(Number).sort().map(n => [n - 54, `G${n} · ${wcsLabel(n)}`]));
        h = h.replace('<div class="field"><span>Tool</span><select id="opTool">', `<div class="field"><span>Work offset</span>${sel('opWcs', opts, (op.wcs | 0) || 0)}</div><div class="field"><span>Tool</span><select id="opTool">`);
      }
    }
    return h;
  };

  const bindCamPanel0 = bindCamPanel;
  bindCamPanel = function () {
    bindCamPanel0();
    const C = cam(), edit = (label, fn) => { const before = snap(); fn(); record(label, before); camRefresh(); };
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('change', () => fn(el)); };
    on('postCtrl', el => edit('Controller: ' + (POSTS[el.value] || POSTS.haas).name, () => { C.post.ctrl = el.value; }));
    on('postNums', el => edit('Line numbers', () => { C.post.lineNums = el.checked; }));
    on('opWcs', el => { const op = opById(CAMUI.op); if (op) camEdit(op, 'wcs', +el.value); });
    panel.querySelectorAll('[data-wcsadd]').forEach(b => b.addEventListener('click', () => edit('Add G' + b.dataset.wcsadd, () => { wcsOf()[+b.dataset.wcsadd] = { o: C.origin && typeof C.origin !== 'object' ? C.origin : 'top-center', d: [0, 0, 0] }; })));
    panel.querySelectorAll('[data-wcsdel]').forEach(b => b.addEventListener('click', () => edit('Remove G' + b.dataset.wcsdel, () => { const n = +b.dataset.wcsdel; delete wcsOf()[n]; for (const op of C.ops) if (54 + (op.wcs | 0) === n) op.wcs = 0; })));
    panel.querySelectorAll('.wcs-row').forEach(row => {
      const n = +row.dataset.wcs;
      on('wcsO' + n, el => edit('G' + n + ' origin', () => { wcsOf()[n].o = /^\d+$/.test(el.value) ? +el.value : el.value; }));
      row.querySelectorAll('[data-wcsd]').forEach(inp => inp.addEventListener('change', () => { const v = parseFloat(inp.value), i = +inp.dataset.wcsd.split(':')[1]; if (isFinite(v)) edit('G' + n + ' shift', () => { wcsOf()[n].d[i] = fromU(v); }); }));
    });
  };

  const st = document.createElement('style');
  st.textContent = `.wcs-row { padding: 8px 0; border-top: 1px solid var(--line, rgba(0,0,0,.08)); } .wcs-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; } .wcs-head select { flex: 1; min-width: 0; }`;
  document.head.appendChild(st);
})();
