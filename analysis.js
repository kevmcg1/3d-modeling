// ═══════════════════════════════════════════════════════════════════
//  Surface analysis (Inspect): Zebra Stripes (how smoothly faces blend,
//  by the reflection of striped light) and Curvature (the radius of every
//  round face, flagging concave corners a cutter of a given size cannot
//  reach). Coverage list: docs/fusion-coverage.md
// ═══════════════════════════════════════════════════════════════════
(() => {
  if (typeof FEATS === 'undefined' || !window.FUSION1 || !window.MORE_TOOLS) return;
  const INSP = window.FUSION1, MT = window.MORE_TOOLS;
  const rbAppend = (h, title, items) => {
    const key = `</div><div class="rb-title">${title}</div>`, i = h.indexOf(key);
    return i < 0 ? h : h.slice(0, i) + `<div class="rb-col">${items.map(it => rbBtn('data-act', it, 'sm')).join('')}</div>` + h.slice(i);
  };
  const num = (v, d = 2) => (isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 }) : '—');
  const AX = { X: [1, 0, 0], Y: [0, 0, -1], Z: [0, 1, 0] };
  const unitIn = () => (isIn() ? 'in' : 'mm');
  const polyArea = p => { let a = 0; for (let q = 1; q + 1 < p.v.length; q++) a += len3(crs3(sub3(p.v[q], p.v[0]), sub3(p.v[q + 1], p.v[0]))) / 2; return a; };

  // ── Zebra stripes ──
  const ZB = { ax: 'Z', width: 12, key: null };
  function paintZebra() {
    INSP.clearGrp();
    const pos = [], nor = [];
    for (const b of visibleBodies()) for (const p of INSP.bodyPolys(b)) {
      const N = p.v.map(v => { try { return Surf.normalAt(p.f, v); } catch (e) { return p.n; } });
      for (let q = 1; q + 1 < p.v.length; q++) { pos.push(...p.v[0], ...p.v[q], ...p.v[q + 1]); nor.push(...N[0], ...N[q], ...N[q + 1]); }
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    const a = AX[ZB.ax];
    const mat = new THREE.ShaderMaterial({
      uniforms: { uAxis: { value: new THREE.Vector3(a[0], a[1], a[2]) }, uFreq: { value: 1 / (ZB.width * 0.01) } },
      vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uAxis; uniform float uFreq; varying vec3 vN; varying vec3 vP; void main(){ vec3 n = normalize(vN); if(!gl_FrontFacing) n = -n; vec3 I = projectionMatrix[3][3] == 1.0 ? vec3(0.0,0.0,-1.0) : normalize(vP); vec3 R = reflect(I, n); vec3 ax = normalize(mat3(viewMatrix) * uAxis); float t = dot(R, ax) * uFreq * 0.5; float band = step(0.5, fract(t)); vec3 c = mix(vec3(0.07,0.08,0.1), vec3(0.96,0.97,0.98), band); gl_FragColor = vec4(c, 1.0); }',
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const m = new THREE.Mesh(g, mat); m.renderOrder = 19; m.userData.zebra = true; INSP.grp.add(m);
  }
  const zebraData = () => { const k = JSON.stringify([ZB.ax, ZB.width]); if (ZB.key !== k || !INSP.grp.children.length) { paintZebra(); ZB.key = k; } };
  INSP.titleOf.zebra = 'Zebra Stripes'; INSP.tagOf.zebra = 'surface flow';
  INSP.open.zebra = () => { ZB.key = null; };
  INSP.body.zebra = () => {
    zebraData();
    const seg = `<div class="seg">${[['X', 'X'], ['Y', 'Y'], ['Z', 'Z (up)']].map(([v, l]) => `<button data-an-z="ax" data-v="${v}" class="${ZB.ax === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    return `<div class="field"><span>Stripes run across</span>${seg}</div>`
      + `<label class="field"><span>Stripe spacing</span><input type="range" min="2" max="40" step="1" value="${ZB.width}" data-an-z="width"></label>`
      + '<p class="note">The part is shown mirroring a striped wall. Stripes that run straight on across two faces mean the faces meet smoothly; stripes that jump or kink at an edge mean the faces only touch (a sharp corner) or meet at a different angle. Rotate the view to move the stripes.</p>';
  };
  INSP.bind.zebra = pn => {
    pn.querySelectorAll('button[data-an-z]').forEach(b => b.addEventListener('click', () => { ZB[b.dataset.anZ] = b.dataset.v; ZB.key = null; refreshPanel(); requestDraw(); }));
    pn.querySelectorAll('input[data-an-z]').forEach(i => i.addEventListener('input', () => { ZB.width = +i.value; ZB.key = null; zebraData(); requestDraw(); }));
  };
  INSP.hint.zebra = k => `<b>Zebra Stripes:</b> smooth blends keep the stripes flowing; kinks show a sharp or uneven join. ${k('Esc')} closes.`;

  // ── Curvature: the radius of each round face ──
  const CV = { min: 3, res: null };
  const COLC = { tight: [0.9, 0.28, 0.3], ok: [0.18, 0.66, 0.31], convex: [0.18, 0.5, 0.9] };
  const HEXC = { tight: '#e5484d', ok: '#2fa84f', convex: '#2f7be8' };
  function curvatureScan() {
    const rows = new Map(), items = [], names = bodyNames();
    let flat = 0, other = 0;
    for (const b of visibleBodies()) for (const p of INSP.bodyPolys(b)) {
      const s = Surf.list[p.f], A = polyArea(p);
      if (!s || s.t === 'P') { flat += A; continue; }
      let r = null;
      if (s.t === 'C') r = s.r; else if (s.t === 'T' && s.prm) r = s.prm.r;
      if (!(r > 0)) { other += A; continue; }
      const concave = s.sg < 0, key = (concave ? 'v' : 'x') + r.toFixed(3);
      let row = rows.get(key); if (!row) rows.set(key, row = { r, concave, area: 0, n: 0, kind: s.t === 'C' ? 'Cylinder' : 'Torus', body: names[b.id] || 'Body' });
      row.area += A; row.n++;
      items.push({ p, concave, r });
    }
    const list = [...rows.values()].sort((a, b) => a.r - b.r);
    const hole = list.filter(x => x.concave);
    return { rows: list, items, flat, other, tightest: hole.length ? hole[0].r : null, model: MODEL };
  }
  function curvData() {
    if (!(CV.res && CV.res.model === MODEL)) CV.res = curvatureScan();
    MT.paintGrp(CV.res.items.map(i => ({ p: i.p, c: i.concave ? (i.r < CV.min ? COLC.tight : COLC.ok) : COLC.convex })));
    return CV.res;
  }
  INSP.titleOf.curv = 'Curvature'; INSP.tagOf.curv = 'radii';
  INSP.open.curv = () => { CV.res = null; };
  INSP.body.curv = () => {
    const R = curvData();
    if (!R.rows.length) return '<p class="note">There are no round faces on the visible bodies.</p>';
    const rad = v => `${num(toU(v), isIn() ? 4 : 3)} ${unitIn()}`;
    const bad = R.rows.filter(r => r.concave && r.r < CV.min), badA = bad.reduce((s, r) => s + r.area, 0);
    return `<div class="measure-big"><span>${R.tightest == null ? '—' : num(toU(R.tightest), isIn() ? 4 : 3)}</span> ${unitIn()}</div><p class="note" style="margin-top:-6px">Tightest inside radius</p>`
      + `<label class="field"><span>Smallest cutter radius (${unitIn()})</span><input type="number" data-an-c="min" min="0" step="${isIn() ? 0.01 : 0.5}" value="${+toU(CV.min).toFixed(4)}"></label>`
      + `<div class="an-key"><i style="background:${HEXC.tight}"></i>Inside corners tighter than that<b>${bad.length ? bad.length + ' radii · ' + num(badA / 100, 2) + ' cm²' : 'none'}</b></div>`
      + `<table class="insp-tbl"><tr><th>Radius</th><th>Kind</th><th>Faces</th></tr>${R.rows.map(r => `<tr><td>${rad(r.r)}</td><td>${r.concave ? 'inside' : 'outside'}</td><td>${r.n}</td></tr>`).join('')}</table>`
      + '<p class="note">Red faces are inside round corners and holes tighter than the cutter you set: it cannot reach into them. Green ones it can. Blue faces are outside rounds, which any cutter can make. Free-form and cone faces are not measured.</p>';
  };
  INSP.bind.curv = pn => pn.querySelectorAll('[data-an-c="min"]').forEach(i => i.addEventListener('change', () => { const v = parseFloat(i.value); if (isFinite(v) && v >= 0) CV.min = fromU(v); refreshPanel(); requestDraw(); }));
  INSP.hint.curv = k => `<b>Curvature:</b> red inside rounds are tighter than your cutter. ${k('Esc')} closes.`;

  const stale0 = INSP.stale;
  INSP.stale = kind => { if (stale0) stale0(kind); if (kind === 'zebra') ZB.key = null; if (kind === 'curv') CV.res = null; };
  window.ANALYSIS = { ZB, CV, curvatureScan };

  Object.assign(IC, {
    zebra: '<path d="M4 3l12 4M4 7l12 4M4 11l12 4M4 15l12 4" opacity=".55"/><path d="M4 5l12 4M4 9l12 4M4 13l12 4"/>',
    curv: '<path d="M3 16c0-8 4-12 12-12" /><path d="M3 16c4 0 8-4 8-8" opacity=".45"/><path d="M15 4l-2 5M10 6l-1 4" opacity=".6"/>',
  });
  Object.assign(FA_MAP, { zebra: 'bars-staggered', curv: 'circle-notch' });
  Object.assign(MENU_IC, { 'i:zebra': 'zebra', 'i:curv': 'curv' });
  TB_MENUS.construct.push(['i:zebra', 'Zebra Stripes', ''], ['i:curv', 'Curvature', '']);
  const ins = k => CMD && CMD.type === 'inspect' && CMD.kind === k;
  const mt = modelToolbarHTML;
  modelToolbarHTML = function () { return rbAppend(mt.apply(this, arguments), 'Inspect', [['i:zebra', 'Zebra Stripes', '', 'zebra', ins('zebra')], ['i:curv', 'Curvature', '', 'curv', ins('curv')]]); };
  Object.assign(TIP_TXT, {
    'i:zebra': ['See how smoothly faces blend, by the reflection of striped light.', ['Click it.', 'Pick which way the stripes run.', 'Stripes that run straight across an edge mean a smooth blend.']],
    'i:curv': ['The radius of every round face, and the inside corners a cutter cannot reach.', ['Click it.', 'Type the smallest cutter radius you have.', 'Red inside rounds are tighter than that.']],
  });
  if (typeof TipArt !== 'undefined' && typeof TIP_ART !== 'undefined') {
    const { C, at, P, box, poly } = TipArt, iso = (f, ox = 60, oy = 48, s = 1.55) => () => { at(ox, oy, s); return f(); };
    const stripes = n => Array.from({ length: n }, (_, i) => poly([P(-16 + i * 32 / n, -10, 12), P(-16 + (i + 0.5) * 32 / n, -10, 12), P(-16 + (i + 0.5) * 32 / n, 10, 12), P(-16 + i * 32 / n, 10, 12)], 'rgba(20,24,30,.8)', 'none', 0)).join('');
    Object.assign(TIP_ART, {
      'i:zebra': [iso(() => box(-16, -10, 0, 32, 20, 12), 60, 54, 1.4), iso(() => box(-16, -10, 0, 32, 20, 12) + stripes(6), 60, 54, 1.4)],
      'i:curv': [iso(() => box(-16, -10, 0, 32, 20, 12), 60, 54, 1.4), iso(() => box(-16, -10, 0, 32, 20, 12) + poly([P(-16, -10, 12), P(-8, -10, 12), P(-8, 10, 12), P(-16, 10, 12)], 'rgba(229,72,77,.55)', C.acc, 1.2), 60, 54, 1.4)],
    });
  }
  const A = window.TipAnim;
  if (A && A.scene) {
    A.scene('i:zebra', g => { g.view(120, 136, 3); const k = g.seg(0.25, 0.8); g.box(-16, -10, 0, 32, 20, 12, 'n'); if (k > 0.2) for (let i = 0; i < 6; i++) g.box(-16 + i * 5.4, -10, 12, 2.7, 20, 0.6, 'a'); });
    A.scene('i:curv', g => { g.view(120, 136, 3); const k = g.seg(0.25, 0.8); g.box(-16, -10, 0, 32, 20, 12, 'n'); g.box(-16, -10, 12, 8 * k, 20, 0.6, 'r'); if (k > 0.5) g.chip('R 3 mm', 'r'); });
  }
  refreshUI();
})();
