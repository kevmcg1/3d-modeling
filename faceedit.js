// ═══════════════════════════════════════════════════════════════════
//  Face edits (Design tab): Replace Face (move a flat face onto another
//  plane), Delete Face (heal a chamfer or fillet strip, or close a
//  hole) and Split Face (cut a flat face in two along a plane).
//  The kernel half is in index.html. Coverage list: docs/fusion-coverage.md
// ═══════════════════════════════════════════════════════════════════
(() => {
  if (typeof FEATS === 'undefined' || !FEATS.draft || typeof pickFaceToggle === 'undefined') return;
  const rbAppend = (h, title, items) => {
    const key = `</div><div class="rb-title">${title}</div>`, i = h.indexOf(key);
    return i < 0 ? h : h.slice(0, i) + `<div class="rb-col">${items.map(it => rbBtn('data-act', it, 'sm')).join('')}</div>` + h.slice(i);
  };
  Object.assign(FEAT_BASE, { repface: 'Replace Face', delface: 'Delete Face', splitface: 'Split Face' });
  Object.assign(FEAT_IC, { repface: 'repface', delface: 'delface', splitface: 'splitface' });
  const featDeps0 = featDeps;
  featDeps = function (f, ids, fromMeta) { featDeps0.apply(this, arguments); if (f.type === 'repface' || f.type === 'delface' || f.type === 'splitface') for (const r of f.faces || []) fromMeta(r.m); };

  const faceTool = (label, home, need, extra) => ({
    label, home, before: true, need,
    init: () => Object.assign({ faces: [] }, extra.init),
    ready: f => f.faces.length > 0 && (!extra.plane || !!f.plane),
    start(c) { const s = sel3D; if (s && s.kind === 'face') c.f.faces = [faceRef(s.mesh, s.fid, faceInfo(s.mesh, s.fid).on)]; },
    move(x, y) { if (CMD.step === 'plane') hoverPlaneRef(x, y); else hoverBeforeFace(x, y, extra.pick); },
    click(x, y) {
      const f = CMD.f;
      if (CMD.step === 'plane') { const p = planeRefFromHover(hover3D); if (!p) return; f.plane = p; CMD.step = 'faces'; featSync(); return; }
      const h = pickBefore(x, y);
      if (!h) return;
      if (extra.pick && !extra.pick(h)) { toast(extra.warn); return; }
      pickFaceToggle(f, 'faces', h); featSync();
    },
    hl(add) { hlFaces(add, CMD.f.faces); },
    panel: f => pf.pick('Faces', f.faces.length ? 'Click a face again to drop it' : extra.prompt, f.faces.length || '', 'faces')
      + (f.faces.length ? '<div class="btns"><button class="btn" data-fdo="clear">Clear</button></div>' : '')
      + (extra.plane ? pf.plane(extra.plane, 'plane', 'plane') : '') + extra.fields(f) + pf.note(extra.note),
    act: { clear() { CMD.f.faces = []; featSync(); } },
    hint: c => c.step === 'plane' ? 'click a flat face or construction plane to be the target' : extra.hint,
    sub: extra.sub,
  });
  const flat = h => Surf.list[h.fid].t === 'P';
  FEATS.repface = faceTool('Replace Face', 'faces', 'Pick the flat faces to move and the plane they should end on.', {
    init: { plane: { k: 'origin', w: 'XZ' }, off: 0 }, plane: 'Move onto this plane', pick: flat, warn: 'Only flat faces can be replaced.',
    prompt: 'Click flat faces', hint: 'click the flat faces to move',
    fields: () => pf.num('Offset from the plane', 'off', { len: 1, step: isIn() ? 0.05 : 1 }),
    note: 'Each face is moved onto the plane (or tilted to lie on it), and the faces next to it stretch to follow. Pick a flat face or a construction plane as the target.',
    sub: f => (+f.off ? fmtLs(f.off) : 'onto plane'),
  });
  FEATS.delface = faceTool('Delete Face', 'faces', 'Pick the chamfer, fillet or hole faces to delete.', {
    init: {}, prompt: 'Click a chamfer, fillet or hole face', hint: 'click the chamfer, fillet or hole faces to remove',
    fields: () => '', note: 'A chamfer or fillet between two flat faces is removed and the two faces grow until they meet. The walls of a hole are removed, the hole is closed over and any floor inside it goes away. For a counterbore, pick every wall of it.',
    sub: f => '× ' + f.faces.length,
  });
  FEATS.splitface = faceTool('Split Face', 'faces', 'Pick the flat faces to split and the plane to split them along.', {
    init: { plane: { k: 'origin', w: 'XZ' } }, plane: 'Split along this plane', pick: flat, warn: 'Only flat faces can be split.',
    prompt: 'Click flat faces', hint: 'click the flat faces to split',
    fields: () => '', note: 'The face is cut in two along the plane, so the halves can be picked, moved or colored on their own. The shape of the part does not change.',
    sub: () => 'by plane',
  });

  Object.assign(IC, {
    repface: '<path d="M3 15h8l3-5H6z" opacity=".45"/><path d="M5 5h12v3H5z"/><path d="M11 9v4m0 0l-1.5-1.5M11 13l1.5-1.5"/>',
    delface: '<path d="M4 15V7l5-3h6v11z" opacity=".5"/><path d="M4 7l5 2 6-2M9 9v6" opacity=".9"/><path d="M13 12l4 4m0-4l-4 4"/>',
    splitface: '<path d="M3 14l4-8h10l-4 8z" opacity=".5"/><path d="M5 10h11" stroke-dasharray="2 1.6"/><path d="M10 3v14" opacity=".4"/>',
  });
  Object.assign(FA_MAP, { repface: 'arrows-up-down', delface: 'eraser', splitface: 'scissors' });
  Object.assign(MENU_IC, { 'f:repface': 'repface', 'f:delface': 'delface', 'f:splitface': 'splitface' });
  TB_MENUS.modify.push(['f:repface', 'Replace Face', ''], ['f:delface', 'Delete Face', ''], ['f:splitface', 'Split Face', '']);
  const mt = modelToolbarHTML;
  modelToolbarHTML = function () {
    return rbAppend(mt.apply(this, arguments), 'Modify', [['f:repface', 'Replace Face', '', 'repface', cmdIs('repface')], ['f:delface', 'Delete Face', '', 'delface', cmdIs('delface')], ['f:splitface', 'Split Face', '', 'splitface', cmdIs('splitface')]]);
  };
  Object.assign(TIP_TXT, {
    'f:repface': ['Move a flat face onto another plane.', ['Click the flat faces to move.', 'Pick the plane they should end on.', 'OK. The faces next to them stretch to follow.']],
    'f:delface': ['Remove a chamfer, fillet or hole and heal the part.', ['Click the faces to delete.', 'OK. The faces next to them grow to close the gap.']],
    'f:splitface': ['Cut a flat face in two along a plane.', ['Click the flat faces to split.', 'Pick the plane to split along.', 'OK. The part keeps its shape.']],
  });
  if (typeof TipArt !== 'undefined' && typeof TIP_ART !== 'undefined') {
    const { C, at, P, box, line } = TipArt, iso = (f, ox = 60, oy = 56, s = 1.3) => () => { at(ox, oy, s); return f(); };
    Object.assign(TIP_ART, {
      'f:repface': [iso(() => box(-16, -10, 0, 32, 20, 10, 'a')), iso(() => box(-16, -10, 0, 32, 20, 16, 'a'))],
      'f:delface': [iso(() => box(-16, -10, 0, 32, 20, 12, 'a') + line([P(-16, -10, 12), P(-16, 10, 12)], C.warn, 2.4)), iso(() => box(-16, -10, 0, 32, 20, 12, 'a'))],
      'f:splitface': [iso(() => box(-16, -10, 0, 32, 20, 12, 'a')), iso(() => box(-16, -10, 0, 32, 20, 12, 'a') + line([P(0, -10, 12), P(0, 10, 12)], C.warn, 2.4))],
    });
  }
  const A = window.TipAnim;
  if (A && A.scene) {
    A.scene('f:repface', g => { g.view(120, 136, 3); const k = g.seg(0.25, 0.8); g.box(-16, -10, 0, 32, 20, 10 + 6 * k, 'a'); });
    A.scene('f:delface', g => { g.view(120, 136, 3); const k = g.seg(0.25, 0.8); g.box(-16, -10, 0, 32, 20, 12, 'a'); if (k < 0.5) g.chip('Chamfer', 'a'); else g.chip('Healed', 'a'); });
    A.scene('f:splitface', g => { g.view(120, 136, 3); const k = g.seg(0.25, 0.8); g.box(-16, -10, 0, 32, 20, 12, 'a'); if (k > 0.4) g.chip('Two faces', 'a'); });
  }
  refreshUI();
})();
