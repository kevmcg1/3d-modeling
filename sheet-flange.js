// ═══════════════════════════════════════════════════════════════════
//  Sheet metal edge work (Design tab): Edge Flange, Miter Flange (flanges
//  on several edges that meet at corners, mitered), Hem and Jogged Flange.
//  Pick the thin end edge of a sheet (where the end meets the big face).
//  The kernel half is in index.html next to the other kernel scripts.
//  Coverage list: docs/fusion-coverage.md
// ═══════════════════════════════════════════════════════════════════
(() => {
  if (typeof FEATS === 'undefined' || typeof hoverAxis === 'undefined') return;
  const rbAppend = (h, title, items) => {
    const key = `</div><div class="rb-title">${title}</div>`, i = h.indexOf(key);
    return i < 0 ? h : h.slice(0, i) + `<div class="rb-col">${items.map(it => rbBtn('data-act', it, 'sm')).join('')}</div>` + h.slice(i);
  };
  Object.assign(FEAT_BASE, { eflange: 'Edge Flange', mflange: 'Miter Flange', hem: 'Hem', jog: 'Jog' });
  Object.assign(FEAT_IC, { eflange: 'eflange', mflange: 'mflange', hem: 'hem', jog: 'jog' });
  const featDeps0 = featDeps;
  featDeps = function (f, ids, fromMeta) { featDeps0.apply(this, arguments); if (f.type === 'eflange') for (const r of f.edges || []) if (r.e) { fromMeta(r.e.a); fromMeta(r.e.b); } };
  const sameEdge = (a, b) => JSON.stringify(a.e) === JSON.stringify(b.e);
  const edgeList = f => `<div class="pick ${f.edges.length ? '' : 'empty'}"><span>${f.edges.length ? f.edges.length + ' edge' + (f.edges.length > 1 ? 's' : '') + ' chosen' : 'Click straight edges at the end of the sheet'}</span><span class="n">${f.edges.length || ''}</span></div>`
    + (f.edges.length ? '<div class="btns"><button class="btn" data-fdo="clear">Clear edges</button></div>' : '');

  // one tool definition per kind; they all become an 'eflange' feature
  const tool = (kind, label, home, extra) => ({
    label, home: 'edges', before: true, need: 'Pick the sheet edges.',
    init: () => Object.assign({ type: 'eflange', kind: kind === 'mflange' ? 'flange' : kind, edges: [], ang: 90, len: 15, rt: 1, flip: false, jogH: 10, htype: 'closed', op: 'join' }, extra || {}),
    base: () => kind,
    ready: f => f.edges.length > 0 && (kind !== 'mflange' || f.edges.length > 1),
    start(c) { const s = sel3D; if (s && s.kind === 'edge') { const a = axisFromHover(s); if (a && a.k === 'edge') c.f.edges = [a]; } },
    move(x, y) { hoverAxis(x, y, false); },
    click() {
      const f = CMD.f, a = axisFromHover(hover3D); if (!a || a.k !== 'edge') return;
      if (kind === 'mflange' || f.edges.length === 0 || true) { const i = f.edges.findIndex(r => sameEdge(r, a)); if (i >= 0) f.edges.splice(i, 1); else if (kind === 'mflange') f.edges.push(a); else f.edges = [a]; }
      featSync();
    },
    draw() { for (const r of CMD.f.edges) { const c = findChain(beforeBodies(), r); if (c) strokeChain(c.ch, COL.accent, 3.4); } },
    panel: f => edgeList(f)
      + (kind === 'hem' ? pf.seg('Hem', 'htype', [['closed', 'Closed'], ['open', 'Open']]) : pf.num('Bend angle', 'ang', { step: 15, min: 1 }))
      + pf.num(kind === 'hem' ? 'Return length' : 'Length (after the bend)', 'len', { len: 1, min: 0, step: isIn() ? 0.05 : 1 })
      + (kind === 'jog' ? pf.num('Jog height', 'jogH', { len: 1, min: 0, step: isIn() ? 0.05 : 1 }) : '')
      + (kind === 'hem' && f.htype !== 'open' ? '' : pf.num('Inside bend radius (× thickness)', 'rt', { step: 0.25, min: 0 }))
      + pf.chk('Bend the other way', 'flip')
      + pf.note({ eflange: 'Adds a bent flange to the end edge of a sheet, as thick as the sheet. Click the edge where the thin end meets the big face; the flange bends off that face.', mflange: 'Adds a flange to every edge you click and miters the corners where two of them meet. Click the edges again to drop them.', hem: 'Folds the sheet edge back on itself: closed lies flat on the sheet, open leaves a gap set by the radius.', jog: 'Adds a stepped flange: it bends out, runs across, then bends back to the original direction, offset by the jog height.' }[kind]),
    act: { clear() { CMD.f.edges = []; featSync(); } },
    hint: () => kind === 'mflange' ? 'click the sheet edges that meet at corners' : 'click the thin end edge of the sheet',
    sub: f => (kind === 'hem' ? (f.htype === 'open' ? 'open' : 'closed') : `${+f.ang}°`) + ' · ' + fmtLs(f.len),
    title: undefined,
  });
  FEATS.eflange = tool('eflange', 'Edge Flange');
  FEATS.mflange = tool('mflange', 'Miter Flange');
  FEATS.hem = tool('hem', 'Hem', null, { kind: 'hem', ang: 180 });
  FEATS.jog = tool('jog', 'Jog', null, { kind: 'jog' });

  Object.assign(IC, {
    eflange: '<path d="M2.5 14h9"/><path d="M11.5 14c3 0 4-1.5 4-4V4"/><path d="M2.5 16h9.5c4 0 5.5-2.5 5.5-6V4" opacity=".5"/>',
    mflange: '<path d="M3 15h10"/><path d="M13 15V6"/><path d="M3 15V9" opacity=".6"/><path d="M13 6l2-2M3 9l2-2" opacity=".5"/>',
    hem: '<path d="M3 13h10c3 0 3-4 0-4H6"/>',
    jog: '<path d="M2.5 14h5c2 0 2-4 4-4h6"/>',
  });
  Object.assign(FA_MAP, { eflange: 'ruler-vertical', mflange: 'border-style', hem: 'rotate-left', jog: 'stairs' });
  Object.assign(MENU_IC, { 'f:eflange': 'eflange', 'f:mflange': 'mflange', 'f:hem': 'hem', 'f:jog': 'jog' });
  TB_MENUS.create.push(['f:eflange', 'Edge Flange', ''], ['f:mflange', 'Miter Flange', ''], ['f:hem', 'Hem', ''], ['f:jog', 'Jog', '']);
  const mt = modelToolbarHTML;
  modelToolbarHTML = function () { return rbAppend(mt.apply(this, arguments), 'Create', [['f:eflange', 'Edge Flange', '', 'eflange', cmdIs('eflange')], ['f:mflange', 'Miter Flange', '', 'mflange', cmdIs('mflange')], ['f:hem', 'Hem', '', 'hem', cmdIs('hem')], ['f:jog', 'Jog', '', 'jog', cmdIs('jog')]]); };
  Object.assign(TIP_TXT, {
    'f:eflange': ['Bend a flange up from the end edge of a sheet.', ['Click the thin end edge of the sheet.', 'Set the angle, length and bend radius.', 'OK. The flange is as thick as the sheet.']],
    'f:mflange': ['Flanges on several sheet edges, mitered where they meet.', ['Click each end edge, round the corner.', 'Set the angle and length.', 'OK. The corners are cut square to each other.']],
    'f:hem': ['Fold the edge of a sheet back on itself.', ['Click the thin end edge.', 'Choose closed or open, and the return length.', 'OK.']],
    'f:jog': ['A stepped flange: out, across, and back.', ['Click the thin end edge.', 'Set the jog height and the length after it.', 'OK.']],
  });
  if (typeof TipArt !== 'undefined' && typeof TIP_ART !== 'undefined') {
    const { C, at, P, box } = TipArt, iso = (f, ox = 60, oy = 48, s = 1.55) => () => { at(ox, oy, s); return f(); };
    const sheet = () => box(-24, -12, 0, 30, 24, 2, 'n');
    Object.assign(TIP_ART, {
      'f:eflange': [iso(sheet, 60, 56, 1.3), iso(() => sheet() + box(4, -12, 2, 2, 24, 16, 'a'), 60, 56, 1.3)],
      'f:mflange': [iso(sheet, 60, 56, 1.3), iso(() => sheet() + box(4, -12, 2, 2, 24, 14, 'a') + box(-24, -12, 2, 30, 2, 14, 'a'), 60, 56, 1.3)],
      'f:hem': [iso(sheet, 60, 56, 1.3), iso(() => sheet() + box(4, -12, 0, 2, 24, 6, 'a') + box(-6, -12, 4, 12, 24, 2, 'a'), 60, 56, 1.3)],
      'f:jog': [iso(sheet, 60, 56, 1.3), iso(() => sheet() + box(4, -12, 0, 6, 24, 2, 'a') + box(8, -12, 2, 2, 24, 8, 'a') + box(8, -12, 10, 12, 24, 2, 'a'), 60, 56, 1.3)],
    });
  }
  const A = window.TipAnim;
  if (A && A.scene) {
    const base = g => g.box(-24, -10, 0, 30, 20, 2, 'n');
    A.scene('f:eflange', g => { g.view(120, 136, 3); const k = g.seg(0.25, 0.8); base(g); g.box(4, -10, 2, 2, 20, 16 * k, 'a'); g.chip(Math.round(90 * k) + '°', 'a'); });
    A.scene('f:mflange', g => { g.view(120, 136, 3); const k = g.seg(0.25, 0.8); base(g); g.box(4, -10, 2, 2, 20, 14 * k, 'a'); g.box(-24, -10, 2, 28, 2, 14 * k, 'a'); });
    A.scene('f:hem', g => { g.view(120, 136, 3); const k = g.seg(0.25, 0.8); base(g); g.box(4, -10, 0, 2, 20, 6 * Math.min(1, 2 * k), 'a'); if (k > 0.5) g.box(4 - 10 * (k - 0.5) * 2, -10, 4, 10 * (k - 0.5) * 2 + 2, 20, 2, 'a'); });
    A.scene('f:jog', g => { g.view(120, 136, 3); const k = g.seg(0.25, 0.8); base(g); g.box(4, -10, 0, 6 * k, 20, 2, 'a'); g.box(8, -10, 2, 2, 20, 8 * k, 'a'); if (k > 0.6) g.box(8, -10, 10, 12 * (k - 0.6) / 0.4, 20, 2, 'a'); });
  }
  refreshUI();
})();
