// ═══════════════════════════════════════════════════════════════════
//  Mesh tools (Design tab): Reverse Normal turns a body inside out (the
//  repair for an imported mesh whose faces point the wrong way), and
//  Reduce merges vertices closer than a size to make a lighter mesh.
//  The kernel half is in index.html. Coverage list: docs/fusion-coverage.md
// ═══════════════════════════════════════════════════════════════════
(() => {
  if (typeof FEATS === 'undefined' || typeof bodyTool === 'undefined') return;
  const rbAppend = (h, title, items) => {
    const key = `</div><div class="rb-title">${title}</div>`, i = h.indexOf(key);
    return i < 0 ? h : h.slice(0, i) + `<div class="rb-col">${items.map(it => rbBtn('data-act', it, 'sm')).join('')}</div>` + h.slice(i);
  };
  Object.assign(FEAT_BASE, { revnorm: 'Reverse Normal', reducemesh: 'Reduce', smoothmesh: 'Smooth' });
  Object.assign(FEAT_IC, { revnorm: 'revnorm', reducemesh: 'reducemesh', smoothmesh: 'smoothmesh' });
  FEATS.revnorm = bodyTool({
    label: 'Reverse Normal', home: 'bodies', need: 'Pick the bodies to turn inside out.',
    init: () => ({ bodies: [] }),
    panel: f => bodyPickPanel(f, 'bodies', 'Bodies') + pf.note('Flips every face so it points the other way. Use it when an imported mesh looks dark or inside out. Doing it twice puts it back.'),
    hint: () => 'click the bodies to turn inside out', sub: () => '',
  });
  FEATS.reducemesh = bodyTool({
    label: 'Reduce', home: 'bodies', need: 'Pick the bodies to lighten.',
    init: () => ({ bodies: [], size: 1 }),
    panel: f => bodyPickPanel(f, 'bodies', 'Bodies') + pf.num('Merge points closer than', 'size', { len: 1, min: 0, step: isIn() ? 0.02 : 0.25 })
      + pf.note('Points that fall in the same cell of this size are merged into one, so a dense mesh gets fewer triangles. The result is a plain triangle mesh, with no round faces left. A bigger size gives a lighter, rougher shape.'),
    hint: () => 'click the bodies, then set the size', sub: f => fmtLs(f.size),
  });
  FEATS.smoothmesh = bodyTool({
    label: 'Smooth', home: 'bodies', need: 'Pick the bodies to smooth.',
    init: () => ({ bodies: [], iter: 3, amount: 0.5 }),
    panel: f => bodyPickPanel(f, 'bodies', 'Bodies') + pf.num('Passes', 'iter', { step: 1, min: 1 }) + pf.num('Amount (0 to 1)', 'amount', { step: 0.1, min: 0 })
      + pf.note('Moves each point toward the middle of its neighbours, which evens out bumps in a rough mesh. Each pass shrinks the body a little; the result is a plain triangle mesh with no round faces.'),
    hint: () => 'click the bodies, then set the passes', sub: f => f.iter + ' × ' + f.amount,
  });
  Object.assign(IC, {
    revnorm: '<path d="M4 14l6 3 6-3V7l-6-3-6 3z" opacity=".5"/><path d="M8 11.5a3 3 0 015.4-1.5M13.5 8.2v2.2h-2.2M12 8.5a3 3 0 01-5.4 1.5"/>',
    smoothmesh: '<path d="M3 12c2-6 3 6 5 0s3 6 5 0 3 4 4-1"/><path d="M3 16h14" opacity=".4"/>',
    reducemesh: '<path d="M3 15l4-9 5 6 5-8v11z" opacity=".5"/><path d="M3 15l9-3M7 6l5 6 5-8" opacity=".9"/>',
  });
  Object.assign(FA_MAP, { revnorm: 'rotate', reducemesh: 'diagram-project', smoothmesh: 'wand-magic-sparkles' });
  Object.assign(MENU_IC, { 'f:revnorm': 'revnorm', 'f:reducemesh': 'reducemesh', 'f:smoothmesh': 'smoothmesh' });
  TB_MENUS.modify.push(['f:revnorm', 'Reverse Normal', ''], ['f:reducemesh', 'Reduce Mesh', ''], ['f:smoothmesh', 'Smooth Mesh', '']);
  const mt = modelToolbarHTML;
  modelToolbarHTML = function () {
    return rbAppend(mt.apply(this, arguments), 'Modify', [['f:revnorm', 'Reverse Normal', '', 'revnorm', cmdIs('revnorm')], ['f:reducemesh', 'Reduce Mesh', '', 'reducemesh', cmdIs('reducemesh')], ['f:smoothmesh', 'Smooth Mesh', '', 'smoothmesh', cmdIs('smoothmesh')]]);
  };
  Object.assign(TIP_TXT, {
    'f:revnorm': ['Turn a mesh inside out.', ['Click the bodies.', 'OK. Every face points the other way.']],
    'f:smoothmesh': ['Even out bumps in a rough mesh.', ['Click the bodies.', 'Set the passes and the amount.', 'OK.']],
    'f:reducemesh': ['Make a dense mesh lighter.', ['Click the bodies.', 'Set the size to merge points at.', 'OK. The mesh has fewer triangles.']],
  });
  if (typeof TipArt !== 'undefined' && typeof TIP_ART !== 'undefined') {
    const { at, box } = TipArt, iso = f => () => { at(60, 56, 1.3); return f(); };
    Object.assign(TIP_ART, {
      'f:revnorm': [iso(() => box(-16, -10, 0, 32, 20, 12, 'a')), iso(() => box(-16, -10, 0, 32, 20, 12))],
      'f:smoothmesh': [iso(() => box(-16, -10, 0, 32, 20, 12, 'a')), iso(() => box(-16, -10, 0, 32, 20, 12))],
      'f:reducemesh': [iso(() => box(-16, -10, 0, 32, 20, 12, 'a')), iso(() => box(-16, -10, 0, 32, 20, 12))],
    });
  }
  const A = window.TipAnim;
  if (A && A.scene) {
    A.scene('f:revnorm', g => { g.view(120, 136, 3); const k = g.seg(0.25, 0.8); g.box(-16, -10, 0, 32, 20, 12, k > 0.5 ? 'n' : 'a'); g.chip(k > 0.5 ? 'Flipped' : 'Inside out', 'a'); });
    A.scene('f:smoothmesh', g => { g.view(120, 136, 3); const k = g.seg(0.25, 0.8); g.box(-16, -10, 0, 32, 20, 12, 'a'); g.chip(k > 0.5 ? 'Smooth' : 'Rough', 'a'); });
    A.scene('f:reducemesh', g => { g.view(120, 136, 3); const k = g.seg(0.25, 0.8); g.box(-16, -10, 0, 32, 20, 12, 'a'); g.chip(k > 0.5 ? 'Fewer triangles' : 'Dense mesh', 'a'); });
  }
  refreshUI();
})();
