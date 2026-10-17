// ═══════════════════════════════════════════════════════════════════
//  Weldments (Design tab): Structural Member. A standard profile
//  (rectangular or round tube, bar, angle, channel, I-beam, T) swept
//  along a sketch path with mitered corners, like SolidWorks' structural
//  members and Fusion's frame generator. The kernel half is in index.html
//  next to the other kernel scripts. Coverage list: docs/fusion-coverage.md
// ═══════════════════════════════════════════════════════════════════
(() => {
  if (typeof FEATS === 'undefined' || typeof STRUCT_TYPES === 'undefined') return;
  const rbAppend = (h, title, items) => {
    const key = `</div><div class="rb-title">${title}</div>`, i = h.indexOf(key);
    return i < 0 ? h : h.slice(0, i) + `<div class="rb-col">${items.map(it => rbBtn('data-act', it, 'sm')).join('')}</div>` + h.slice(i);
  };
  Object.assign(FEAT_BASE, { struct: 'Structural Member' });
  Object.assign(FEAT_IC, { struct: 'struct' });
  const featDeps0 = featDeps;
  featDeps = function (f, ids) { featDeps0.apply(this, arguments); if (f.type === 'struct' && f.path) ids.add(f.path.sketch); };
  const PRESETS = { rtube: { s: 40, h: 40, t: 3 }, rbar: { s: 40, h: 10, t: 0 }, angle: { s: 40, h: 40, t: 4 }, channel: { s: 30, h: 60, t: 4 }, ibeam: { s: 50, h: 80, t: 5 }, ttube: { s: 40, h: 40, t: 3 }, tbar: { s: 40, h: 40, t: 4 } };

  FEATS.struct = {
    label: 'Structural Member', home: 'path', need: 'Pick the path the member follows.',
    init: () => ({ path: null, stype: 'rtube', ...PRESETS.rtube, rot: 0, cap0: false, cap1: false, ct: 4, op: opDefault() }),
    ready: f => !!(f.path && f.path.ents.length),
    onSet(key) { if (key === 'stype') Object.assign(CMD.f, PRESETS[CMD.f.stype]); },
    showSketch: (f, id) => { const sk = byId(id); return !!sk && (sk.vis !== false || (f.path && f.path.sketch === id) || CMD.step === 'path'); },
    start() { CMD.step = 'path'; },
    move(x, y) {
      const e = hoverSkEnt(x, y);
      if (e) { const sk = byId(e.sketch); CMD.chainPrev = { sketch: e.sketch, ents: curveChain(sk, sk.ents.find(q => q.id === e.ent)).map(q => q.id) }; } else CMD.chainPrev = null;
      requestDraw();
    },
    click() {
      const h = hover3D;
      if (!h || h.kind !== 'skent') return;
      const sk = byId(h.sketch);
      CMD.f.path = { sketch: sk.id, ents: curveChain(sk, sk.ents.find(q => q.id === h.ent)).map(e => e.id) }; CMD.chainPrev = null; featSync();
    },
    draw() { const p = CMD.f.path; if (p) strokeSkEnts(p.sketch, p.ents, COL.accent, 3.2); if (CMD.chainPrev) strokeSkEnts(CMD.chainPrev.sketch, CMD.chainPrev.ents, COL['face-hot'], 2.6); },
    panel: f => pf.pick('Path', f.path ? (byId(f.path.sketch) || {}).name + ' · ' + f.path.ents.length + ' curve' + (f.path.ents.length > 1 ? 's' : '') : 'Click a sketch curve', f.path ? '✓' : '', 'path')
      + pf.sel('Profile', 'stype', Object.entries(STRUCT_TYPES), f.stype)
      + (f.stype === 'ttube' ? pf.num('Diameter', 's', { len: 1, min: 0, step: isIn() ? 0.05 : 1 }) : `<div class="row2">${pf.num(f.stype === 'ibeam' || f.stype === 'tbar' ? 'Flange width' : 'Width', 's', { len: 1, min: 0, step: isIn() ? 0.05 : 1 })}${pf.num('Height', 'h', { len: 1, min: 0, step: isIn() ? 0.05 : 1 })}</div>`)
      + (f.stype === 'rbar' ? '' : pf.num(f.stype === 'rtube' || f.stype === 'ttube' ? 'Wall thickness' : 'Material thickness', 't', { len: 1, min: 0, step: isIn() ? 0.01 : 0.5 }))
      + (f.stype === 'ttube' ? '' : pf.num('Turn the profile (°)', 'rot', { step: 15 }))
      + pf.chk('Cap the start', 'cap0') + pf.chk('Cap the end', 'cap1') + (f.cap0 || f.cap1 ? pf.num('End cap thickness', 'ct', { len: 1, min: 0, step: isIn() ? 0.02 : 0.5 }) : '')
      + pf.op(f)
      + pf.note('The profile is centered on the path and swept along it; corners are mitered. Draw the frame as one sketch of lines, pick a curve, and the whole joined chain is used. For a closed frame, draw it as separate members, or cut them to length with Combine.'),
    hint: () => 'click a curve of the path (joined curves come along), then choose the profile',
    sub: f => `${STRUCT_TYPES[f.stype] || ''} ${fmtLs(f.s)}${f.stype === 'ttube' ? '' : ' × ' + fmtLs(f.h)}`.trim(),
    hideSketch: f => { const sk = f.path && byId(f.path.sketch); if (sk) sk.vis = false; },
  };

  Object.assign(IC, { struct: '<path d="M3 16h14" opacity=".5"/><path d="M4 4h12v3H11v6h5v3H4v-3h5V7H4z"/>' });
  Object.assign(FA_MAP, { struct: 'grip-lines-vertical' });
  MENU_IC['f:struct'] = 'struct';
  TB_MENUS.create.push(['f:struct', 'Structural Member', '']);
  const mt = modelToolbarHTML;
  modelToolbarHTML = function () { return rbAppend(mt.apply(this, arguments), 'Create', [['f:struct', 'Structural Member', '', 'struct', cmdIs('struct')]]); };
  TIP_TXT['f:struct'] = ['A standard tube, angle, channel or beam swept along a sketch path.', ['Click the path in a sketch.', 'Pick the profile and its size.', 'OK. Corners are mitered.']];
  if (typeof TipArt !== 'undefined' && typeof TIP_ART !== 'undefined') {
    const { C, at, P, box, line } = TipArt, iso = (f, ox = 60, oy = 48, s = 1.55) => () => { at(ox, oy, s); return f(); };
    TIP_ART['f:struct'] = [iso(() => line([P(-22, 6, 0), P(0, 6, 0), P(0, -8, 0), P(20, -8, 0)], C.path, 1.6, 'stroke-dasharray="3 2"'), 60, 52, 1.3), iso(() => box(-22, 3, 0, 22, 6, 6, 'a') + box(-3, -8, 0, 6, 17, 6, 'a') + box(0, -11, 0, 22, 6, 6, 'a'), 60, 52, 1.3)];
  }
  const A = window.TipAnim;
  if (A && A.scene) A.scene('f:struct', g => {
    g.view(120, 136, 3); const f = g.seg(0.25, 0.85), path = [[-20, -8, 0], [-20, 8, 0], [6, 8, 0], [6, 8, 14]];
    g.line(path, 'r', 1.2, { dash: [3, 2] });
    const pts = []; for (let i = 0; i < path.length - 1; i++) for (let k = 0; k < 8; k++) pts.push([0, 1, 2].map(j => path[i][j] + (path[i + 1][j] - path[i][j]) * k / 8));
    const hd = g.head(pts, f); if (hd.length > 1) g.tube(hd, 2.8, 'a', { n: 4 });
  });
  refreshUI();
})();
