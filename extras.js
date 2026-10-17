// ═══════════════════════════════════════════════════════════════════
//  Extras (Design tab): Dome, and the Cut List (an Inspect tool).
//  The Dome evaluator is in index.html next to the other kernel scripts.
//  Coverage list: docs/fusion-coverage.md
// ═══════════════════════════════════════════════════════════════════
(() => {
  if (typeof FEATS === 'undefined' || !window.FUSION1) return;
  const INSP = window.FUSION1;
  const rbAppend = (h, title, items) => {
    const key = `</div><div class="rb-title">${title}</div>`, i = h.indexOf(key);
    return i < 0 ? h : h.slice(0, i) + `<div class="rb-col">${items.map(it => rbBtn('data-act', it, 'sm')).join('')}</div>` + h.slice(i);
  };
  const num = (v, d = 2) => (isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 }) : '—');
  Object.assign(FEAT_BASE, { dome: 'Dome', gusset: 'Gusset' });
  Object.assign(FEAT_IC, { dome: 'dome', gusset: 'gusset' });

  // ── Dome ──
  FEATS.dome = {
    label: 'Dome', home: 'faces', before: true, need: 'Pick the flat faces to dome.',
    init: () => ({ faces: [], h: 5 }),
    ready: f => f.faces.length > 0,
    start(c) { const s = sel3D; if (s && s.kind === 'face' && Surf.list[s.fid].t === 'P') c.f.faces = [faceRef(s.mesh, s.fid, faceInfo(s.mesh, s.fid).on)]; },
    move(x, y) { hoverBeforeFace(x, y); },
    click(x, y) { const h = pickBefore(x, y); if (!h) return; pickFaceToggle(CMD.f, 'faces', h); featSync(); },
    hl(add) { hlFaces(add, CMD.f.faces); },
    panel: f => pf.pick('Faces', f.faces.length ? 'Click a face again to drop it' : 'Click flat faces', f.faces.length || '') + (f.faces.length ? '<div class="btns"><button class="btn" data-fdo="clear">Clear faces</button></div>' : '')
      + pf.num('Height', 'h', { len: 1, min: 0, step: isIn() ? 0.05 : 1 })
      + pf.note('Raises a round dome over each face, cut to the outline of the face, so a round face gets a round cap and a square face a square one. The dome is as high as you set it at the middle of the face.'),
    act: { clear() { CMD.f.faces = []; featSync(); } },
    hint: () => 'click the flat faces to dome, then type the height',
    sub: f => fmtLs(f.h),
  };

  // ── Gusset: a triangular web in the corner between two faces ──
  FEATS.gusset = {
    label: 'Gusset', home: 'a', before: true, need: 'Click the two faces that make the corner.',
    init: () => ({ a: null, b: null, d1: 15, d2: 15, t: 4, frac: 0.5 }),
    ready: f => !!(f.a && f.b),
    move(x, y) { hoverBeforeFace(x, y, h => Surf.list[h.fid].t === 'P'); },
    click(x, y) {
      const c = CMD, f = c.f, h = pickBefore(x, y); if (!h || Surf.list[h.fid].t !== 'P') return;
      const ref = faceRef(h.mesh, h.fid, faceInfo(h.mesh, h.fid).on), k = c.step === 'b' ? 'b' : 'a';
      f[k] = ref; c.step = !f.a ? 'a' : !f.b ? 'b' : c.step; featSync();
    },
    hl(add) { hlFaces(add, [CMD.f.a, CMD.f.b].filter(Boolean)); },
    panel: f => pf.pick('First face', f.a ? 'Face chosen' : 'Click a flat face', f.a ? '✓' : '', 'a') + pf.pick('Second face', f.b ? 'Face chosen' : 'Click the face it meets', f.b ? '✓' : '', 'b')
      + `<div class="row2">${pf.num('Leg along first face', 'd1', { len: 1, min: 0, step: isIn() ? 0.05 : 1 })}${pf.num('Leg along second face', 'd2', { len: 1, min: 0, step: isIn() ? 0.05 : 1 })}</div>`
      + pf.num('Thickness', 't', { len: 1, min: 0, step: isIn() ? 0.05 : 0.5 }) + pf.num('Position along the corner (0 to 1)', 'frac', { step: 0.05, min: 0 })
      + pf.note('A triangular web that braces the corner where two flat faces meet. The faces have to be the outside of the material, the way a bracket and its wall are. Use a pattern to repeat it.'),
    hint: c => c.step === 'b' ? 'click the second flat face of the corner' : 'click the first flat face of the corner',
    sub: f => `${fmtLs(f.d1)} × ${fmtLs(f.d2)}`,
  };

  // ── Cut List: identical bodies counted together, with their sizes ──
  function cutList() {
    const names = bodyNames(), rows = [];
    for (const b of visibleBodies()) {
      const d = [b.bb[3] - b.bb[0], b.bb[4] - b.bb[1], b.bb[5] - b.bb[2]].sort((a, c) => c - a), vol = Math.abs(polyVolume(INSP.bodyPolys(b)));
      const hit = rows.find(r => r.d.every((x, i) => Math.abs(x - d[i]) < 0.01) && Math.abs(r.vol - vol) <= 0.001 * Math.max(vol, 1));
      if (hit) { hit.qty++; hit.names.push(names[b.id] || 'Body'); } else rows.push({ qty: 1, d, vol, names: [names[b.id] || 'Body'] });
    }
    return rows.sort((a, b) => b.vol - a.vol);
  }
  INSP.cutList = cutList;
  const dimTxt = d => d.map(v => num(toU(v), isIn() ? 3 : 2)).join(' × ') + ' ' + (isIn() ? 'in' : 'mm');
  INSP.titleOf.cutlist = 'Cut List'; INSP.tagOf.cutlist = 'parts & sizes';
  INSP.body.cutlist = () => {
    const rows = cutList();
    if (!rows.length) return '<p class="note">There are no visible bodies to list.</p>';
    const total = rows.reduce((s, r) => s + r.qty, 0);
    return `<div class="pick"><span>${rows.length} different part${rows.length > 1 ? 's' : ''}</span><span class="n">${total} piece${total > 1 ? 's' : ''}</span></div>`
      + `<table class="insp-tbl"><tr><th>Qty</th><th>Part</th><th>Size (box)</th></tr>${rows.map(r => `<tr><td>${r.qty}</td><td>${r.names[0]}${r.qty > 1 ? ' +' + (r.qty - 1) : ''}</td><td>${dimTxt(r.d)}</td></tr>`).join('')}</table>`
      + '<div class="btns"><button class="btn" data-cl="copy">Copy as CSV</button></div>'
      + '<p class="note">Bodies with the same size and volume are counted as one part. The size is the box around each body, longest side first. Hidden bodies are left out.</p>';
  };
  INSP.bind.cutlist = pn => pn.querySelectorAll('[data-cl="copy"]').forEach(b => b.addEventListener('click', () => {
    const csv = ['Qty,Part,Length,Width,Height,Volume (mm3)', ...cutList().map(r => [r.qty, '"' + r.names[0] + '"', ...r.d.map(v => +v.toFixed(3)), +r.vol.toFixed(2)].join(','))].join('\n');
    INSP.lastCsv = csv;
    try { navigator.clipboard.writeText(csv).then(() => toast('Cut list copied'), () => toast('Could not copy the cut list')); } catch (e) { toast('Could not copy the cut list'); }
  }));
  INSP.hint.cutlist = k => `<b>Cut List:</b> every part and how many there are. ${k('Esc')} closes.`;

  Object.assign(IC, {
    gusset: '<path d="M3 4v12h14" opacity=".55"/><path d="M3 16V7l9 9z"/>',
    dome: '<path d="M3 15h14" opacity=".6"/><path d="M4.5 15c0-6 2.5-9 5.5-9s5.5 3 5.5 9"/>',
    cutlist: '<path d="M4 5h12M4 10h12M4 15h12" opacity=".5"/><path d="M4 5h3M4 10h3M4 15h3"/>',
  });
  Object.assign(FA_MAP, { gusset: 'play', dome: 'circle-half-stroke', cutlist: 'list-check' });
  Object.assign(MENU_IC, { 'f:gusset': 'gusset', 'f:dome': 'dome', 'i:cutlist': 'cutlist' });
  TB_MENUS.modify.push(['f:dome', 'Dome', ''], ['f:gusset', 'Gusset', '']);
  TB_MENUS.construct.push(['i:cutlist', 'Cut List', '']);
  const mt = modelToolbarHTML;
  modelToolbarHTML = function () {
    let h = rbAppend(mt.apply(this, arguments), 'Modify', [['f:dome', 'Dome', '', 'dome', cmdIs('dome')], ['f:gusset', 'Gusset', '', 'gusset', cmdIs('gusset')]]);
    return rbAppend(h, 'Inspect', [['i:cutlist', 'Cut List', '', 'cutlist', CMD && CMD.type === 'inspect' && CMD.kind === 'cutlist']]);
  };
  Object.assign(TIP_TXT, {
    'f:gusset': ['A triangular brace in the corner where two faces meet.', ['Click the first flat face.', 'Click the face it meets.', 'Set the leg sizes, thickness and position.']],
    'f:dome': ['Raise a rounded dome on a flat face.', ['Click the flat face.', 'Type the height.', 'OK. The dome follows the outline of the face.']],
    'i:cutlist': ['A list of every part, its size and how many there are.', ['Click it.', 'Identical bodies are counted together.', 'Copy it as CSV for a shop order.']],
  });
  const gi = GD.inspect;
  if (gi) GD.inspect = [gi[0], () => (CMD && CMD.kind === 'cutlist' ? [gS('Read the list', 'Identical bodies are counted as one part.', () => true), gS('Copy it', 'Copy as CSV puts it on the clipboard. Esc to close.', null, true)] : gi[1]())];
  if (typeof TipArt !== 'undefined' && typeof TIP_ART !== 'undefined') {
    const { C, at, P, box, poly } = TipArt, iso = (f, ox = 60, oy = 48, s = 1.55) => () => { at(ox, oy, s); return f(); };
    Object.assign(TIP_ART, {
      'f:gusset': [iso(() => box(-24, -12, 0, 48, 24, 4) + box(-24, -12, 4, 4, 24, 20), 60, 56, 1.2), iso(() => box(-24, -12, 0, 48, 24, 4) + box(-24, -12, 4, 4, 24, 20) + box(-20, -2, 4, 14, 4, 2, 'a') + box(-20, -2, 6, 8, 4, 6, 'a') + box(-20, -2, 12, 3, 4, 4, 'a'), 60, 56, 1.2)],
      'f:dome': [iso(() => box(-16, -12, 0, 32, 24, 10) + poly([P(-16, -12, 10), P(16, -12, 10), P(16, 12, 10), P(-16, 12, 10)], 'rgba(47,123,232,.35)', C.acc, 1.4), 60, 56, 1.35), iso(() => box(-16, -12, 0, 32, 24, 10) + box(-10, -7, 10, 20, 14, 5, 'a'), 60, 56, 1.35)],
      'i:cutlist': [iso(() => box(-24, -6, 0, 20, 12, 8) + box(-2, -6, 0, 20, 12, 8) + box(20, -6, 0, 8, 12, 8, 'a'), 60, 56, 1.2), iso(() => box(-24, -6, 0, 20, 12, 8, 'a') + box(-2, -6, 0, 20, 12, 8, 'a') + box(20, -6, 0, 8, 12, 8), 60, 56, 1.2)],
    });
  }
  const A = window.TipAnim;
  if (A && A.scene) {
    A.scene('f:gusset', g => {
      g.view(120, 136, 3); const k = g.seg(0.3, 0.8);
      g.box(-24, -12, 0, 48, 24, 4, 'n'); g.box(-24, -12, 4, 4, 24, 20, 'n'); g.box(-20, -2, 4, 14 * k, 4, 2, 'a'); g.box(-20, -2, 4, 4, 4, 14 * k, 'a');
    });
    A.scene('f:dome', g => {
      g.view(120, 136, 3); const k = g.seg(0.3, 0.8), R = (w, d) => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
      g.prism(R(30, 22), 0, 10, 'n'); g.prism(R(30 * (1 - 0.45 * k), 22 * (1 - 0.45 * k)), 10, 10 + 6 * k, 'a'); g.cursorAt([0, 0, 10 + 6 * k], 0);
    });
    A.scene('i:cutlist', g => {
      g.view(120, 136, 3); const k = g.seg(0.3, 0.8);
      g.box(-24, -6, 0, 18, 12, 8, k > 0.5 ? 'a' : 'n'); g.box(-3, -6, 0, 18, 12, 8, k > 0.5 ? 'a' : 'n'); g.box(18, -6, 0, 8, 12, 8, 'n'); if (k > 0.5) g.chip('2 × + 1 ×', 'a');
    });
  }
  refreshUI();
})();
