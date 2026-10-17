// ═══════════════════════════════════════════════════════════════════
//  Mates (Design tab): pick a face on one body and a face on another;
//  the first body moves so the faces meet (Coincident, Flush, Parallel)
//  or two round faces share an axis (Concentric), with an offset.
//  The kernel half is in 3d-modeler.html next to the other kernel scripts.
//  Coverage list: docs/fusion-coverage.md
// ═══════════════════════════════════════════════════════════════════
(() => {
  if (typeof FEATS === 'undefined' || typeof pickBefore === 'undefined') return;
  const rbAppend = (h, title, items) => {
    const key = `</div><div class="rb-title">${title}</div>`, i = h.indexOf(key);
    return i < 0 ? h : h.slice(0, i) + `<div class="rb-col">${items.map(it => rbBtn('data-act', it, 'sm')).join('')}</div>` + h.slice(i);
  };
  Object.assign(FEAT_BASE, { mate: 'Mate' });
  Object.assign(FEAT_IC, { mate: 'mate' });
  const MT = [['coincident', 'Coincident'], ['flush', 'Flush'], ['parallel', 'Parallel'], ['concentric', 'Concentric']];
  const MNAME = Object.fromEntries(MT);
  const label = (f, k) => f[k] ? 'Face chosen' : 'Click a face';

  FEATS.mate = {
    label: 'Mate', home: 'faces', before: true, need: 'Click the face that moves, then the face it mates to.',
    init: () => ({ mtype: 'coincident', a: null, b: null, offset: 0, which: 'a' }),
    ready: f => !!(f.a && f.b),
    move(x, y) { hoverBeforeFace(x, y); },
    click(x, y) {
      const f = CMD.f, h = pickBefore(x, y); if (!h) return;
      const ref = faceRef(h.mesh, h.fid, faceInfo(h.mesh, h.fid).on), k = f.which === 'b' ? 'b' : 'a';
      f[k] = ref;
      if (k === 'a' && !f.b) f.which = 'b'; else if (k === 'b' && !f.a) f.which = 'a';
      featSync();
    },
    hl(add) { const f = CMD.f; hlFaces(add, [f.a, f.b].filter(Boolean)); },
    panel: f => `<div class="seg">${[['a', 'Moving face'], ['b', 'Fixed face']].map(([k, n]) => `<button class="${f.which === k ? 'on' : ''}" data-fdo="which-${k}">${n}</button>`).join('')}</div>`
      + pf.pick('Moving face', label(f, 'a'), f.a ? 1 : '') + pf.pick('Fixed face', label(f, 'b'), f.b ? 1 : '')
      + pf.seg('Type', 'mtype', MT)
      + (f.mtype === 'parallel' ? '' : pf.num(f.mtype === 'concentric' ? 'Slide along the axis' : 'Offset', 'offset', { len: 1, step: isIn() ? 0.05 : 1 }))
      + pf.note({ coincident: 'Brings the faces together, back to back, with the body of the first face moved.', flush: 'Makes the two faces point the same way and lie in one plane.', parallel: 'Turns the first body so the faces are parallel and facing each other, without sliding it.', concentric: 'Lines the axes of two round faces up, such as a pin and its hole.' }[f.mtype]
        + ' Click the moving face first, then the face on the other body. Use the buttons above to change either one.'),
    act: {
      'which-a'() { CMD.f.which = 'a'; refreshPanel(); },
      'which-b'() { CMD.f.which = 'b'; refreshPanel(); },
    },
    hint: () => 'click the face that moves, then the face on the other body',
    sub: f => `${MNAME[f.mtype] || ''}${+f.offset && f.mtype !== 'parallel' ? ' ' + fmtLs(f.offset) : ''}`.trim(),
  };

  Object.assign(IC, { mate: '<rect x="2.5" y="4" width="6" height="12" rx=".8" opacity=".6"/><rect x="11.5" y="4" width="6" height="12" rx=".8"/><path d="M8.5 10h3" />' });
  Object.assign(FA_MAP, { mate: 'link' });
  MENU_IC['f:mate'] = 'mate';
  TB_MENUS.modify.push(['f:mate', 'Mate', '']);
  const mt = modelToolbarHTML;
  modelToolbarHTML = function () { return rbAppend(mt.apply(this, arguments), 'Modify', [['f:mate', 'Mate', '', 'mate', cmdIs('mate')]]); };
  TIP_TXT['f:mate'] = ['Snap one body against another by picking a face on each.', ['Click the face that moves.', 'Click the face on the other body.', 'Pick Coincident, Flush, Parallel or Concentric and an offset.']];
  if (typeof TipArt !== 'undefined' && typeof TIP_ART !== 'undefined') {
    const { C, at, box } = TipArt, iso = (f, ox = 60, oy = 48, s = 1.55) => () => { at(ox, oy, s); return f(); };
    TIP_ART['f:mate'] = [iso(() => box(-24, -8, 0, 20, 16, 10) + box(6, -8, 4, 20, 16, 10, 'a'), 60, 56, 1.3), iso(() => box(-24, -8, 0, 20, 16, 10) + box(-4, -8, 0, 20, 16, 10, 'a'), 60, 56, 1.3)];
  }
  const A = window.TipAnim;
  if (A && A.scene) A.scene('f:mate', g => {
    g.view(120, 136, 3); const k = g.seg(0.25, 0.8);
    g.box(-26, -8, 0, 20, 16, 10, 'n'); g.box(8 - 14 * k, -8, 4 * (1 - k), 20, 16, 10, 'a'); g.chip('Coincident', 'a');
  });
  refreshUI();
})();
