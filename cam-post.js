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


  // ── Heidenhain TNC conversational (Klartext) ──
  // Blocks are L (line), CC + C (circle by center and end point) and CYCL DEF; the tool length comes from the tool table, so a
  // TOOL CALL is the whole tool change. Drilling, reaming, boring and rigid tapping use the 200 series cycles, called with M99
  // at each hole; the other cycles post as plain moves.
  const HH_CYCLES = ['drill', 'spot', 'peck', 'chip', 'ream', 'bore', 'bored', 'tap'];
  function buildHeidenhain() {
    const C = cam(), pf = C.post, st0 = camStock(), part = camPart(), inch = isIn(), dp = inch ? 4 : 3, k = inch ? 1 / 25.4 : 1;
    const N = v => { v *= k; const t = (Math.abs(v) < 0.5 * Math.pow(10, -dp) ? 0 : v).toFixed(dp).replace(/0+$/, '').replace(/\.$/, ''); return (+t >= 0 ? '+' : '') + (t === '' || t === '-' ? '0' : t); };
    const Fd = f => (inch ? (f * k).toFixed(1).replace(/\.0$/, '') : String(Math.round(f)));
    const L = [], MAP = []; let SRC = null;
    const out = (line) => { L.push(line); MAP.push(SRC); };
    const unit = inch ? 'INCH' : 'MM', name = String(pf.program);
    const o0 = camOrigin();
    out(`BEGIN PGM ${name} ${unit}`);
    out(`; DATUM - HEIDENHAIN, GENERATED ${new Date().toISOString().slice(0, 10)}`);
    out(`; WCS G54: ${wcsName(C)}`);
    if (st0) {
      out(`BLK FORM 0.1 Z X${N(st0.x0 - o0[0])} Y${N(st0.y0 - o0[1])} Z${N(st0.z0 - o0[2])}`);
      out(`BLK FORM 0.2 X${N(st0.x1 - o0[0])} Y${N(st0.y1 - o0[1])} Z${N(st0.z1 - o0[2])}`);
    }
    let wcsNow = 54, lastTool = null, totalMin = 0;
    const ops = C.ops.filter(op => !op.sup);
    for (const op of ops) {
      const P = toolpath(op), o = opOrigin(op);
      if (!P || P.pending || P.m.length < 2) { out(`; ${op.name}: skipped - ${P && P.pending ? 'still computing' : 'no toolpath'}`); continue; }
      if (opAxis(op)) { out(`; ${op.name}: skipped - needs the part turned or tilted; Heidenhain output is 3-axis`); continue; }
      totalMin += pathStats(P).min;
      const t = P.tool, safe = N(camStock().z1 + C.safe - o[2]);
      SRC = { op: op.id, mi: 0 };
      out(`; ${op.name} - ${toolName(t)}`);
      const wn = 54 + Math.max(0, Math.min(5, (op.wcs | 0) || 0));
      if (wn !== wcsNow || (lastTool === null && wn !== 54)) { out('CYCL DEF 7.0 DATUM SHIFT'); out(`CYCL DEF 7.1 #${wn - 53}`); wcsNow = wn; }
      if (lastTool !== t.n) {
        if (lastTool !== null) { if (pf.optStop) out('M1'); }
        out(`TOOL CALL ${t.n} Z S${Math.round(t.rpm)}`);
        out(`L Z${safe} R0 FMAX M3${pf.coolant ? ' M8' : ''}`);
        lastTool = t.n;
      }
      const rel = m => [m.x - o[0], m.y - o[1], m.z - o[2]];
      const cur = { x: null, y: null, z: null, f: null };
      const line = (rapid, x, y, z, f) => {
        const w = [], nx = x == null ? null : N(x), ny = y == null ? null : N(y), nz = z == null ? null : N(z);
        if (nx !== null && nx !== cur.x) w.push('X' + nx); if (ny !== null && ny !== cur.y) w.push('Y' + ny); if (nz !== null && nz !== cur.z) w.push('Z' + nz);
        if (!w.length) return;
        out(`L ${w.join(' ')} R0 ${rapid ? 'FMAX' : 'F' + Fd(f)}`);
        if (nx !== null) cur.x = nx; if (ny !== null) cur.y = ny; if (nz !== null) cur.z = nz;
      };
      const m0 = rel(P.m[0]); line(true, m0[0], m0[1], null); line(true, null, null, m0[2]);
      const cyc = isDrillOp(op) && P.holes ? (P.cycle || drillSpec(op, t)) : null;
      if (cyc && HH_CYCLES.includes(cyc.mode)) {
        const hs = P.holes, R = Math.max(...hs.map(h => h.r)) - o[2], rfp = R - cyc.rpl, clr = cyc.rpl, sd = camStock().z1 + C.safe - o[2];
        const dwell = cyc.p > 0 ? +cyc.p.toFixed(2) : 0, bottom0 = hs[0].z - o[2];
        let curDepth = null;
        for (const [i, h] of hs.entries()) {
          const bottom = h.z - o[2];
          if (curDepth === null || Math.abs(bottom - curDepth) > 1e-6) {
            curDepth = bottom; SRC = { op: op.id, mi: h.mi };
            const dep = bottom - rfp, base = [`Q200=${N(clr)} ;SET-UP CLEARANCE`, `Q201=${N(dep)} ;DEPTH`];
            const tail = [`Q203=${N(rfp)} ;SURFACE COORDINATE`, `Q204=${N(sd - rfp)} ;2ND SET-UP CLEARANCE`];
            const cyl = (n, title, params) => { out(`CYCL DEF ${n} ${title} ~`); params.forEach((q, j) => out(`    ${q}${j < params.length - 1 ? ' ~' : ''}`)); };
            if (cyc.mode === 'drill' || cyc.mode === 'spot') cyl(200, 'DRILLING', [...base, `Q206=${Fd(t.plunge)} ;FEED RATE FOR PLUNGING`, `Q202=${N(Math.abs(dep))} ;PLUNGING DEPTH`, 'Q210=0 ;DWELL TIME AT TOP', ...tail, `Q211=${dwell} ;DWELL TIME AT DEPTH`, 'Q395=0 ;DEPTH REFERENCE']);
            else if (cyc.mode === 'peck' || cyc.mode === 'chip') cyl(205, 'UNIVERSAL PECKING', [...base, `Q206=${Fd(t.plunge)} ;FEED RATE FOR PLUNGING`, `Q202=${N(cyc.i > 0 ? cyc.i : cyc.q)} ;PLUNGING DEPTH`, ...tail, `Q212=${N(cyc.i > 0 ? cyc.j : 0)} ;DECREMENT`, `Q205=${N(cyc.k > 0 ? cyc.k : 0)} ;MIN. PLUNGING DEPTH`, 'Q258=0.5 ;UPPER ADV STOP DIST', 'Q259=0.5 ;LOWER ADV STOP DIST', `Q257=${cyc.mode === 'chip' ? N(cyc.i > 0 ? cyc.i : cyc.q) : 0} ;DEPTH FOR CHIP BREAKING`, `Q256=${cyc.mode === 'chip' ? N(cyc.s22) : 0.2} ;DIST FOR CHIP BRKNG`, `Q211=${dwell} ;DWELL TIME AT DEPTH`, 'Q379=0 ;STARTING POINT', 'Q253=750 ;F PRE-POSITIONING', `Q208=${Fd(t.plunge * 4)} ;RETRACTION FEED RATE`, 'Q395=0 ;DEPTH REFERENCE']);
            else if (cyc.mode === 'ream') cyl(201, 'REAMING', [...base, `Q206=${Fd(t.plunge)} ;FEED RATE FOR PLUNGING`, `Q211=${dwell} ;DWELL TIME AT DEPTH`, `Q208=${Fd(t.plunge)} ;RETRACTION FEED RATE`, ...tail]);
            else if (cyc.mode === 'tap') cyl(207, 'RIGID TAPPING', [...base, `Q239=${N(P.tap.pitch)} ;THREAD PITCH`, ...tail]);
            else cyl(202, 'BORING', [...base, `Q206=${Fd(t.plunge)} ;FEED RATE FOR PLUNGING`, `Q211=${dwell} ;DWELL TIME AT DEPTH`, `Q208=${Fd(t.plunge)} ;RETRACTION FEED RATE`, ...tail, 'Q214=0 ;DISENGAGING DIRECTION', 'Q336=0 ;ANGLE OF SPINDLE']);
          }
          SRC = { op: op.id, mi: (hs[i + 1] ? hs[i + 1].mi : P.m.length) - 1 };
          out(`L X${N(h.x - o[0])} Y${N(h.y - o[1])} R0 FMAX M99`);
        }
        SRC = { op: op.id, mi: P.m.length - 1 };
        out(`L Z${safe} R0 FMAX`);
        continue;
      }
      if (cyc) out(`; ${DRILL_CYCLES[cyc.mode].g} has no Heidenhain cycle here: posted as moves`);
      let i = 1;
      while (i < P.m.length) {
        const m = P.m[i]; SRC = { op: op.id, mi: i };
        if (m.hold) { if (m.dw) { out('CYCL DEF 9.0 DWELL TIME'); out(`CYCL DEF 9.1 DWELL ${+m.dw.toFixed(2)}`); } i++; continue; }
        if (m.r) { const p = rel(m); line(true, p[0], p[1], p[2]); i++; continue; }
        let j = i;
        while (j + 1 < P.m.length && !P.m[j + 1].r && !P.m[j + 1].hold && !P.m[j + 1].tool && !P.m[j + 1].code && Math.abs(P.m[j + 1].z - m.z) < 1e-9 && P.m[j + 1].f === m.f && Math.abs(P.m[i - 1].z - m.z) < 1e-9) j++;
        if (pf.arcs && j - i >= 3) {
          const pts = [P.m[i - 1], ...P.m.slice(i, j + 1)].map(q => P2(q.x - o[0], q.y - o[1]));
          for (const sg of fitArcs(pts, 0.003)) {
            SRC = { op: op.id, mi: i - 1 + sg.k };
            if (!sg.arc) { line(false, sg.p.x, sg.p.y, m.z - o[2], m.f); continue; }
            out(`CC X${N(sg.c.x)} Y${N(sg.c.y)}`);
            out(`C X${N(sg.p.x)} Y${N(sg.p.y)} DR${sg.ccw ? '+' : '-'} R0 F${Fd(m.f)}`);
            cur.x = N(sg.p.x); cur.y = N(sg.p.y);
          }
          i = j + 1;
        } else { const p = rel(m); line(false, p[0], p[1], p[2], m.f); i++; }
      }
    }
    SRC = null;
    out(`L Z${N(camStock().z1 + C.safe - o0[2])} R0 FMAX M5${pf.coolant ? ' M9' : ''}`);
    out('M30');
    out(`END PGM ${name} ${unit}`);
    const text = L.map((l, i) => `${i} ${l}`).join('\n');
    return { text, ext: 'h', ctrl: 'Heidenhain TNC', lines: L.length, min: totalMin + (ops.length ? 0.15 * new Set(ops.map(x => x.tool)).size : 0), part, map: MAP };
  }
  POSTS.heidenhain = iso({ id: 'heidenhain', name: 'Heidenhain TNC', ext: 'h', build: buildHeidenhain, canned: () => false });

  window.POSTS = POSTS;
  window.POST_ORDER = ['haas', 'fanuc', 'mach3', 'grbl', 'siemens', 'heidenhain'];
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
