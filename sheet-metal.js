// ═══════════════════════════════════════════════════════════════════
//  Sheet metal (Design tab): Base Flange from an open profile with real
//  bends, and Flat Pattern. The kernel half is in 3d-modeler.html next to the
//  other kernel scripts. Coverage list: docs/fusion-coverage.md
// ═══════════════════════════════════════════════════════════════════
(() => {
  if (typeof FEATS === 'undefined' || typeof ribLoops === 'undefined') return;
  const rbAppend = (h, title, items) => {
    const key = `</div><div class="rb-title">${title}</div>`, i = h.indexOf(key);
    return i < 0 ? h : h.slice(0, i) + `<div class="rb-col">${items.map(it => rbBtn('data-act', it, 'sm')).join('')}</div>` + h.slice(i);
  };
  Object.assign(FEAT_BASE, { smbase: 'Base Flange', smflat: 'Flat Pattern' });
  Object.assign(FEAT_IC, { smbase: 'smbase', smflat: 'smflat' });
  const featDeps0 = featDeps;
  featDeps = function (f, ids) { featDeps0.apply(this, arguments); if (f.type === 'smbase' && f.chain) ids.add(f.chain.sketch); if (f.type === 'smflat' && f.src != null) ids.add(f.src); };

  FEATS.smbase = {
    label: 'Base Flange', home: 'chain', need: 'Pick the open profile curves.',
    init: () => ({ chain: null, t: 2, r: 2, kf: 0.44, width: 40, sym: false, op: 'new' }),
    ready: f => !!f.chain,
    showSketch: (f, id) => { const sk = byId(id); return !!sk && (sk.vis !== false || (f.chain && f.chain.sketch === id) || CMD.step === 'chain'); },
    start() { CMD.step = 'chain'; },
    move(x, y) {
      const e = hoverSkEnt(x, y);
      if (e) { const sk = byId(e.sketch); CMD.chainPrev = { sketch: e.sketch, ents: curveChain(sk, sk.ents.find(q => q.id === e.ent)).map(q => q.id) }; } else CMD.chainPrev = null;
      requestDraw();
    },
    click() {
      const h = hover3D;
      if (!h || h.kind !== 'skent') return;
      const sk = byId(h.sketch);
      CMD.f.chain = { sketch: sk.id, ents: curveChain(sk, sk.ents.find(q => q.id === h.ent)).map(e => e.id) };
      CMD.chainPrev = null; featSync();
    },
    draw() { const c = CMD.f.chain; if (c) strokeSkEnts(c.sketch, c.ents, COL.accent, 3.2); if (CMD.chainPrev) strokeSkEnts(CMD.chainPrev.sketch, CMD.chainPrev.ents, COL['face-hot'], 2.6); },
    panel: f => pf.pick('Profile', f.chain ? (byId(f.chain.sketch) || {}).name + ' · ' + f.chain.ents.length + ' curve' + (f.chain.ents.length > 1 ? 's' : '') : 'Click the open profile in a sketch', f.chain ? '✓' : '', 'chain')
      + `<div class="row2">${pf.num('Thickness', 't', { len: 1, min: 0, step: isIn() ? 0.01 : 0.5 })}${pf.num('Bend radius (inside)', 'r', { len: 1, min: 0, step: isIn() ? 0.01 : 0.5 })}</div>`
      + `<div class="row2">${pf.num('Width', 'width', { len: 1, min: 0, step: isIn() ? 0.1 : 1 })}${pf.num('K-factor', 'kf', { step: 0.01, min: 0 })}</div>`
      + pf.chk('Centered on the sketch plane', 'sym') + pf.op(f)
      + pf.note('The profile is the middle line of the sheet. Every corner sharper than 20° becomes a bend with the inside radius you set; it is made smaller if the flange next to it is too short. The K-factor (about 0.33 to 0.5) only sets the Flat Pattern length.'),
    hint: () => 'click the open profile curves in a sketch (joined curves come along)',
    sub: f => `${fmtLs(f.t)} × ${fmtLs(f.width)}`,
    hideSketch: f => { const sk = f.chain && byId(f.chain.sketch); if (sk) sk.vis = false; },
  };

  const smList = () => doc.features.filter(f => f.type === 'smbase' && !f.sup);
  FEATS.smflat = {
    label: 'Flat Pattern', home: 'src', need: 'Pick the sheet metal flange to unfold.',
    init: () => ({ src: (smList().slice(-1)[0] || {}).id ?? null, gap: 20 }),
    ready: f => f.src != null,
    start() {}, move() { ov.className = 'default'; }, click() {},
    text(f, key, v) { if (key === 'src') f.src = v === '' ? null : +v; },
    panel: f => {
      const L = smList(), info = (() => { try { return smFlatInfo(f, MODEL, 0.1); } catch (e) { return null; } })();
      const fl = (v) => fmtLs(v, 3);
      return (L.length ? pf.sel('Unfold', 'src', [['', 'Pick…'], ...L.map(s => [s.id, s.name])], f.src == null ? '' : String(f.src)) : '<p class="note">Make a Base Flange first.</p>')
        + pf.num('Gap from the model', 'gap', { len: 1, min: 0 })
        + (info ? `<dl class="kv"><dt>Flat length</dt><dd>${fl(info.len)}</dd><dt>Width</dt><dd>${fl(info.width)}</dd><dt>Thickness</dt><dd>${fl(info.t)}</dd><dt>Bends</dt><dd>${info.bends.length}</dd>${info.bends.map((b, i) => `<dt>Bend ${i + 1}</dt><dd>${+(b.ang * 180 / Math.PI).toFixed(1)}° · inside R ${fl(b.r)}</dd>`).join('')}</dl>` : '')
        + pf.note('Adds a flat plate body of the unfolded length, width and thickness next to the model. Length = flat parts + bend allowance (angle × (inside radius + K × thickness)) for every bend. Use it with Blueprint Drawing for the laser or brake sheet.');
    },
    hint: () => 'pick the flange to unfold in the panel',
    sub: f => { const s = f.src != null && doc.features.find(x => x.id === f.src); return s ? s.name : ''; },
  };

  Object.assign(IC, {
    smbase: '<path d="M3 15h5c3 0 3-4 3-6V5" opacity=".5"/><path d="M3 17h6c4 0 5-3 5-7V5h2v5c0 5-2 9-7 9H3z"/>',
    smflat: '<path d="M2.5 11l3-4h12l-3 4z"/><path d="M5.5 7v-1M10 7v-1M14.5 7v-1" opacity=".5"/><path d="M3 15h14" opacity=".6"/>',
  });
  Object.assign(FA_MAP, { smbase: 'ruler-combined', smflat: 'file-lines' });
  Object.assign(MENU_IC, { 'f:smbase': 'smbase', 'f:smflat': 'smflat' });
  TB_MENUS.create.push(['f:smbase', 'Sheet Metal Base Flange', ''], ['f:smflat', 'Flat Pattern', '']);
  const mt = modelToolbarHTML;
  modelToolbarHTML = function () { return rbAppend(mt.apply(this, arguments), 'Create', [['f:smbase', 'Base Flange', '', 'smbase', cmdIs('smbase')], ['f:smflat', 'Flat Pattern', '', 'smflat', cmdIs('smflat')]]); };
  Object.assign(TIP_TXT, {
    'f:smbase': ['Bend a sheet along an open sketch profile: thickness, width and real bends.', ['Click the open profile in a sketch.', 'Set thickness, bend radius and width.', 'OK. Corners become bends.']],
    'f:smflat': ['Unfold a sheet metal part into a flat plate with its true flat length.', ['Pick the base flange.', 'Read the flat length and the bends.', 'OK. A flat body appears beside the model.']],
  });
  if (typeof TipArt !== 'undefined' && typeof TIP_ART !== 'undefined') {
    const { C, at, P, box, line } = TipArt, iso = (f, ox = 60, oy = 48, s = 1.55) => () => { at(ox, oy, s); return f(); };
    Object.assign(TIP_ART, {
      'f:smbase': [iso(() => line([P(-22, 0, 0), P(-6, 0, 0), P(-6, 0, 16), P(10, 0, 16)], C.sk, 2.4), 60, 56, 1.3), iso(() => box(-22, -12, 0, 16, 24, 2, 'a') + box(-8, -12, 0, 2, 24, 16, 'a') + box(-8, -12, 14, 18, 24, 2, 'a'), 60, 56, 1.3)],
      'f:smflat': [iso(() => box(-22, -12, 0, 16, 24, 2, 'a') + box(-8, -12, 0, 2, 24, 16, 'a'), 60, 56, 1.3), iso(() => box(-24, -12, 0, 48, 24, 2, 'a'), 60, 56, 1.3)],
    });
  }
  const A = window.TipAnim;
  if (A && A.scene) {
    A.scene('f:smbase', g => {
      g.view(120, 136, 3); const k = g.seg(0.3, 0.8);
      g.box(-18, -10, 0, 14 + 4 * (1 - k), 20, 2, 'a'); if (k > 0.1) g.box(-6, -10, 0, 2, 20, 14 * k, 'a'); if (k > 0.6) g.box(-6, -10, 12, 16 * (k - 0.6) / 0.4, 20, 2, 'a');
      g.cursorAt([-6, 0, 14 * k], 0);
    });
    A.scene('f:smflat', g => {
      g.view(120, 138, 3); const k = g.seg(0.3, 0.8), len = 18 + 30 * k;
      g.box(-24, -10, 0, len * (1 - k) + 14 * k, 20, 2, 'a'); if (k < 0.9) g.box(-6 + 2 * (1 - k), -10, 0, 2, 20, 14 * (1 - k), 'a'); g.chip('Flat ' + Math.round(len) + ' mm', 'a');
    });
  }
  refreshUI();
})();
