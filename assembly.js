// ═══════════════════════════════════════════════════════════════════
//  Joints and motion (Design tab): Rigid, Revolute, Slider, Cylindrical,
//  Planar and Ball joints that put the moving bodies at the joint's
//  current position, with limits, and Animate (a motion study that
//  drives the joint back and forth). The kernel half is in index.html
//  next to the other kernel scripts. Coverage list: docs/fusion-coverage.md
// ═══════════════════════════════════════════════════════════════════
(() => {
  if (typeof FEATS === 'undefined' || typeof bodyTool === 'undefined') return;
  const rbAppend = (h, title, items) => {
    const key = `</div><div class="rb-title">${title}</div>`, i = h.indexOf(key);
    return i < 0 ? h : h.slice(0, i) + `<div class="rb-col">${items.map(it => rbBtn('data-act', it, 'sm')).join('')}</div>` + h.slice(i);
  };
  Object.assign(FEAT_BASE, { joint: 'Joint' });
  Object.assign(FEAT_IC, { joint: 'joint' });
  const JT = [['rigid', 'Rigid'], ['revolute', 'Revolute'], ['slider', 'Slider'], ['cylindrical', 'Cylindrical'], ['pinslot', 'Pin-slot'], ['planar', 'Planar'], ['ball', 'Ball']];
  const JNAME = Object.fromEntries(JT);
  const isLin = t => t === 'slider' || t === 'planar';
  const DEF = { revolute: [-180, 180], slider: [-50, 50], cylindrical: [-180, 180], pinslot: [-180, 180], planar: [-50, 50] };
  let timer = null;
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } if (CMD && CMD.type === 'feat' && CMD.kind === 'joint') CMD.playing = false; };

  FEATS.joint = bodyTool({
    label: 'Joint', home: 'bodies', need: 'Pick the bodies that move.',
    init: () => ({ bodies: [], jtype: 'revolute', axis: { k: 'world', w: 'Z' }, pivot: 'center', value: 0, value2: 0, min: -180, max: 180, rx: 0, ry: 0, rz: 0 }),
    onSet(key) { if (key === 'jtype') { stop(); const f = CMD.f, d = DEF[f.jtype]; if (d) { f.min = d[0]; f.max = d[1]; } f.value = 0; f.value2 = 0; } },
    panel(f) {
      const t = f.jtype, lin = isLin(t), moves = t !== 'rigid';
      const slider = moves && t !== 'ball' ? `<div class="field"><span>${lin ? 'Position' : 'Angle'} (${lin ? uName() : '°'})</span><div class="row2"><input type="range" data-fv="value" data-live="1" ${lin ? 'data-len="1"' : ''} min="${lin ? uval(f.min) : f.min}" max="${lin ? uval(f.max) : f.max}" step="${lin ? (isIn() ? 0.02 : 0.5) : 1}" value="${lin ? uval(f.value) : f.value}"><input type="number" data-fv="value" data-live="1" ${lin ? 'data-len="1"' : ''} step="${lin ? (isIn() ? 0.05 : 1) : 5}" value="${lin ? uval(f.value) : +(+f.value).toFixed(3)}"></div></div>` : '';
      return bodyPickPanel(f, 'bodies', 'Moving bodies')
        + pf.seg('Type', 'jtype', JT, 'bodies')
        + (moves && t !== 'ball' ? pf.axis(t === 'planar' ? 'Normal of the plane' : 'Joint axis', 'axis', 'axis', null, true) : '')
        + (t !== 'rigid' && t !== 'ball' && f.axis && f.axis.k === 'world' ? pf.seg('World axis through', 'pivot', [['center', 'Body center'], ['origin', 'Origin']]) : '')
        + slider
        + (t === 'cylindrical' ? pf.num('Slide along the axis', 'value2', { len: 1, step: isIn() ? 0.05 : 1 }) : '')
        + (t === 'pinslot' ? pf.num('Slide across the axis', 'value2', { len: 1, step: isIn() ? 0.05 : 1 }) : '')
        + (t === 'planar' ? pf.num('Second direction', 'value2', { len: 1, step: isIn() ? 0.05 : 1 }) : '')
        + (t === 'ball' ? `<div class="field"><span>Rotate about X · Y · Z (°)</span><div class="row3">${['rx', 'ry', 'rz'].map(k => `<input type="number" data-fv="${k}" data-live="1" step="15" value="${+(+f[k] || 0).toFixed(3)}" title="${k.slice(1).toUpperCase()}">`).join('')}</div></div>` : '')
        + (moves && t !== 'ball' ? `<div class="row2">${pf.num('Lower limit', 'min', lin ? { len: 1 } : { step: 5 })}${pf.num('Upper limit', 'max', lin ? { len: 1 } : { step: 5 })}</div><div class="btns"><button class="btn" data-fdo="play">${CMD.playing ? '■ Stop' : '▶ Animate'}</button></div>` : '')
        + pf.note({ rigid: 'Locks the bodies where they are, as a record of how they are attached.', revolute: 'Spins the bodies about the axis, like a hinge or a wheel.', slider: 'Slides the bodies along the axis, like a drawer.', cylindrical: 'Spins about and slides along the same axis, like a screw or a piston that turns.', pinslot: 'Spins about the axis and slides square to it, like a pin riding in a slot.', planar: 'Slides the bodies in a plane square to the axis.', ball: 'Turns the bodies about X, Y and Z through their center, like a ball joint.' }[t]
          + ' Drag the slider to move it. Animate drives the joint between its limits; the model keeps the position you stop at. For a joint on an edge or cylinder, click Pick… and choose it.');
    },
    act: {
      play() {
        const c = CMD, f = c.f;
        if (timer) { stop(); refreshPanel(); return; }
        if (!FEATS.joint.ready(f)) { toast('Pick the moving bodies first.'); return; }
        c.playing = true; let dir = 1; const lo = +f.min, hi = +f.max, step = (hi - lo) / 40 || 1;
        timer = setInterval(() => {
          if (CMD !== c) { stop(); return; }
          let v = (+f.value || 0) + dir * step;
          if (v >= hi) { v = hi; dir = -1; } else if (v <= lo) { v = lo; dir = 1; }
          f.value = v; featSync();
        }, 140);
        refreshPanel();
      },
    },
    draw() { const f = CMD.f; if (f.axis && f.axis.k !== 'world' && f.jtype !== 'ball' && f.jtype !== 'rigid') drawAxisRef(f.axis); },
    sub: f => `${JNAME[f.jtype] || ''}${f.jtype === 'rigid' || f.jtype === 'ball' ? '' : ' ' + (isLin(f.jtype) ? fmtLs(f.value) : +(+f.value).toFixed(1) + '°')}`.trim(),
  });
  const cancelCmd0 = cancelCmd;
  cancelCmd = function () { stop(); return cancelCmd0.apply(this, arguments); };
  const featOK0 = featOK;
  featOK = function () { stop(); return featOK0.apply(this, arguments); };

  Object.assign(IC, { joint: '<circle cx="10" cy="10" r="2.2"/><rect x="2.5" y="3.5" width="7" height="4" rx=".8" opacity=".6"/><rect x="11" y="12.5" width="6.5" height="4" rx=".8" transform="rotate(-25 14 14.5)"/><path d="M5 12.5a6 6 0 0 0 6 4" opacity=".5" stroke-dasharray="1.6 1.4"/>' });
  Object.assign(FA_MAP, { joint: 'link' });
  MENU_IC['f:joint'] = 'joint';
  TB_MENUS.modify.push(['f:joint', 'Joint', 'J']);
  const mt = modelToolbarHTML;
  modelToolbarHTML = function () { return rbAppend(mt.apply(this, arguments), 'Modify', [['f:joint', 'Joint', '', 'joint', cmdIs('joint')]]); };
  TIP_TXT['f:joint'] = ['Make bodies hinge, slide, spin or swivel, and animate the motion.', ['Click the bodies that move.', 'Pick the joint type and its axis.', 'Drag the slider, or press Animate to drive it between its limits.']];
  if (typeof TipArt !== 'undefined' && typeof TIP_ART !== 'undefined') {
    const { C, at, P, box, line, dot } = TipArt, iso = (f, ox = 60, oy = 48, s = 1.55) => () => { at(ox, oy, s); return f(); };
    TIP_ART['f:joint'] = [iso(() => box(-20, -8, 0, 14, 16, 4) + box(-6, -8, 0, 22, 4, 4, 'a') + dot(P(-6, 0, 2), C.warn, 3), 60, 56, 1.3), iso(() => box(-20, -8, 0, 14, 16, 4) + box(-6, -8, 0, 4, 22, 4, 'a') + dot(P(-6, 0, 2), C.warn, 3), 60, 56, 1.3)];
  }
  const A = window.TipAnim;
  if (A && A.scene) A.scene('f:joint', g => {
    g.view(120, 136, 3); const k = g.seg(0.25, 0.8);
    g.box(-16, -9, 0, 12, 18, 4, 'n'); g.turn('z', 70 * k, [-4, 0, 2], () => g.box(-4, -2, 0, 22, 4, 4, 'a')); g.dot([-4, 0, 4], 'r', 2.5); g.chip('Revolute ' + Math.round(70 * k) + '°', 'a');
  });
  refreshUI();
})();
