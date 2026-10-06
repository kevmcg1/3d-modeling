// ═══════════════════════════════════════════════════════════════════
//  HEAT MAP: the Manufacture simulation's toolpath colored by feeds and speeds.
//  Every cutting move is colored cold to hot by one metric (feed, spindle
//  speed, chip load, material removal rate, or a combined cutting load) worked
//  out from its operation's tool, feed, speed and depth / width of cut. Moves
//  past a safe limit are red. It reads the same numbers as the Feeds & speeds
//  card (feedsOf) and is rebuilt whenever they change, so editing an operation
//  or a tool updates the map live. Loaded after index.html's scripts; it wraps
//  camDraw, camPanel, bindCamPanel and simBarShow and touches nothing else.
// ═══════════════════════════════════════════════════════════════════
(() => {
  if (typeof camDraw !== 'function' || typeof feedsOf !== 'function') return;
  const HEAT = { on: true, metric: 'load', key: '', segs: null, obj: null, range: null, over: 0, ver: 0 };
  window.HEAT = HEAT;

  // cold to hot; red is kept for moves past the limit
  const STOPS = [[0, [47, 111, 224]], [0.28, [31, 182, 200]], [0.52, [44, 193, 123]], [0.76, [242, 194, 48]], [1, [240, 122, 36]]];
  const OVER = [217, 45, 32];
  const ramp = t => {
    t = Math.min(1, Math.max(0, t));
    for (let i = 1; i < STOPS.length; i++) if (t <= STOPS[i][0]) {
      const [t0, c0] = STOPS[i - 1], [t1, c1] = STOPS[i], u = (t - t0) / (t1 - t0);
      return c0.map((v, k) => v + (c1[k] - v) * u);
    }
    return STOPS[STOPS.length - 1][1];
  };
  const css = c => `rgb(${c.map(Math.round).join(',')})`;
  const LEGEND_CSS = `linear-gradient(90deg, ${STOPS.map(([t, c]) => `${css(c)} ${t * 100}%`).join(', ')})`;

  // cutting stiffness (specific cutting force, N/mm²) and what the spindle and a cutter can take
  const KC = { aluminum: 700, brass: 780, stainless: 2400 };
  const SPINDLE_KW = 7.5, RPM_MAX = 12000, CHIP_OVER = 1.6;     // chip load past 1.6× the recommendation: the card's "high" warning
  const toolForceMax = d => 30 * d * d;                          // N a carbide end mill can take before it deflects or breaks

  const METRICS = {
    load: { name: 'Combined cutting load', short: 'Load', unit: '%', tip: 'The larger of spindle power used and force on the cutter, as a share of what each can take.', d: 0 },
    mrr: { name: 'Material removal rate', short: 'MRR', unit: 'cm³/min', tip: 'Volume of metal removed per minute: feed × width × depth of cut.', d: 1 },
    chip: { name: 'Chip load', short: 'Chip load', unit: 'mm/tooth', tip: 'How thick a bite each tooth takes: feed ÷ (rpm × flutes).', d: 3 },
    feed: { name: 'Feed rate', short: 'Feed', unit: '', tip: 'How fast the tool travels through the cut.', d: 0 },
    rpm: { name: 'Spindle speed', short: 'RPM', unit: 'rpm', tip: 'How fast the spindle turns for each tool.', d: 0 },
  };
  const unitOf = k => k === 'feed' ? (typeof uRate === 'function' ? uRate() : 'mm/min') : METRICS[k].unit;
  const showVal = (k, v) => k === 'feed' && typeof uval === 'function' ? uval(v, 1) : (+v).toFixed(METRICS[k].d);

  const drillish = t => ['drill', 'spot', 'reamer', 'cbore', 'bsf', 'tap'].includes(t.type);

  // everything one cutting move is doing, from its operation and tool
  function moveLoad(op, tool, a, b, kc) {
    const f = b.f || tool.feed || 0, rpm = tool.rpm || 0, z = tool.flutes || 2, d = tool.d;
    const dz = Math.abs(b.z - a.z), L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1, plunge = dz > 0.9 * L;
    let ae, ap;
    const fs = feedsOf(op, tool);
    if (plunge || drillish(tool)) { ae = d; ap = Math.max(0.5, op.peck || d * 0.5); }
    else if (op.type === 'parallel' || op.type === 'waterline') { ae = (op.stepover || 0.1) * d; ap = Math.min(op.stepdown || d * 0.1, d * 0.25); }
    else if (op.type === 'contour' || (op.type === 'chain' && op.cm !== 'pocket')) { ae = Math.min(d, Math.max(0.1 * d, op.stepover ? op.stepover * d : 0.3 * d)); ap = op.stepdown || d * 0.5; }
    else { ae = Math.min(d, fs.so); ap = fs.sd || Math.min(d * 0.5, 3); }
    const mrr = plunge ? Math.PI * d * d / 4 * f / 1000 : f * ae * ap / 1000;                    // cm³/min
    const fz = f / Math.max(1, rpm * z), engaged = Math.max(1, z * Math.acos(Math.max(-1, 1 - 2 * ae / d)) / (2 * Math.PI));
    const force = kc * ap * fz * Math.sqrt(ae / d) * engaged;                                     // N, mean tangential
    const power = mrr * kc / 60000;                                                               // kW
    const load = Math.max(power / SPINDLE_KW, force / toolForceMax(d)) * 100;
    return { feed: f, rpm, chip: fz, mrr, load, power, force, ae, ap, ratio: fz / (fs.fzRef || 1), plunge };
  }
  // past the limit for this metric?
  const isOver = (k, m) => k === 'load' ? m.load > 100 : k === 'mrr' ? m.power > SPINDLE_KW : k === 'chip' ? m.ratio > CHIP_OVER && !m.plunge : k === 'rpm' ? m.rpm > RPM_MAX : false;
  const limitOf = (k, tool) => k === 'load' ? 100 : k === 'mrr' ? SPINDLE_KW * 60000 / (KC[(typeof doc !== 'undefined' && doc.cam && doc.cam.material) || 'aluminum'] || 700) : k === 'rpm' ? RPM_MAX : null;

  // one record per cutting move: where it is and the numbers behind it
  const pathIds = new WeakMap(); let nextId = 1;
  const idOf = o => { let i = pathIds.get(o); if (!i) pathIds.set(o, i = nextId++); return i; };
  function gather() {
    const C = cam(), mat = C.material || 'aluminum', kc = KC[mat] || 700, segs = [], keys = [];
    for (const op of C.ops) {
      if (op.sup) continue;
      const P = toolpath(op);
      if (!P || P.pending || !P.m) continue;
      const tool = toolOf(op.tool) || P.tool;
      keys.push([op.id, idOf(P), op.tool, tool && [tool.d, tool.rpm, tool.feed, tool.flutes].join('/'), op.stepdown, op.stepover, op.peck].join(':'));
      for (let i = 1; i < P.m.length; i++) {
        const a = P.m[i - 1], b = P.m[i];
        if (b.r) continue;
        const t = b.tool || P.tool || tool;
        if (!t || t.wire) continue;
        segs.push({ op, tool: t, a, b, m: moveLoad(op, t, a, b, kc) });
      }
    }
    return { segs, key: mat + '|' + keys.join('|') };
  }

  function rebuild() {
    const g = gather(), k = HEAT.metric, key = g.key + '|' + k;
    if (key === HEAT.key && HEAT.obj) return;
    HEAT.key = key; HEAT.segs = g.segs; HEAT.ver++;
    if (HEAT.obj) { HEAT.obj.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); HEAT.obj = null; }
    const n = g.segs.length;
    if (!n) { HEAT.range = null; HEAT.over = 0; return; }
    let lo = Infinity, hi = -Infinity, over = 0;
    for (const s of g.segs) { const v = s.m[k]; if (v < lo) lo = v; if (v > hi) hi = v; }
    HEAT.range = { lo, hi: hi > lo ? hi : lo + 1 };
    const pos = new Float32Array(n * 6), col = new Float32Array(n * 6), pp = new Float32Array(n * 3), mid = new Float32Array(n * 3), pc = new Float32Array(n * 3);
    g.segs.forEach((s, i) => {
      const bad = isOver(k, s.m); s.over = bad; if (bad) over++;
      const c = bad ? OVER : ramp((s.m[k] - lo) / (HEAT.range.hi - lo));
      const A = toW(s.a.x, s.a.y, s.a.z), B = toW(s.b.x, s.b.y, s.b.z);
      for (let j = 0; j < 3; j++) { pos[i * 6 + j] = A[j]; pos[i * 6 + 3 + j] = B[j]; col[i * 6 + j] = col[i * 6 + 3 + j] = c[j] / 255; pc[i * 3 + j] = c[j] / 255; mid[i * 3 + j] = pp[i * 3 + j] = (A[j] + B[j]) / 2; }
    });
    HEAT.over = over; HEAT.mid = mid;
    const grp = new THREE.Group(), lg = new THREE.BufferGeometry(), pg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); lg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    pg.setAttribute('position', new THREE.BufferAttribute(pp, 3)); pg.setAttribute('color', new THREE.BufferAttribute(pc, 3));
    const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true })), pts = new THREE.Points(pg, new THREE.PointsMaterial({ vertexColors: true, size: 4, sizeAttenuation: false }));
    lines.renderOrder = pts.renderOrder = 5; lines.frustumCulled = pts.frustumCulled = false;
    grp.add(lines, pts); grp.userData.heat = true; HEAT.obj = grp;
  }

  const active = () => HEAT.on && typeof SIM !== 'undefined' && SIM.on && UIX.ws === 'cam';

  // draw it in place of the plain blue cutting lines
  const camDraw0 = camDraw;
  camDraw = function () {
    camDraw0.apply(this, arguments);
    if (!active()) { hideTip(); return; }
    rebuild();
    if (!HEAT.obj) return;
    for (const o of [...camGroup.children]) if (o.isLineSegments && !o.userData.own && o.material && (o.material === tpMat.feed || o.material === tpMat.sel)) camGroup.remove(o);
    camGroup.add(HEAT.obj);
  };

  // ── the right sidebar: three steps, then the legend ──
  function panelHtml() {
    const k = HEAT.metric, M = METRICS[k], R = HEAT.range, u = unitOf(k);
    const opts = Object.entries(METRICS).map(([v, m]) => `<option value="${v}" ${v === k ? 'selected' : ''}>${m.name}</option>`).join('');
    let body = '';
    if (HEAT.on) {
      const lim = limitOf(k), noRange = !R;
      body = `<div class="heat-step"><i>3</i><div><b>Read the colors</b>
        <div class="heat-bar" style="background:${LEGEND_CSS}"></div>
        <div class="heat-ends"><span>${noRange ? '—' : showVal(k, R.lo)}</span><span>${M.short}${u ? ' · ' + u : ''}</span><span>${noRange ? '—' : showVal(k, R.hi)}</span></div>
        <div class="heat-over ${HEAT.over ? 'bad' : ''}"><i></i>${HEAT.over ? `${HEAT.over.toLocaleString()} move${HEAT.over === 1 ? '' : 's'} over the safe limit${lim ? ` (${showVal(k, lim)} ${u})` : ''}` : k === 'feed' ? 'Feed has no fixed limit. Watch chip load and load for overloads.' : 'No move is over the safe limit.'}</div>
        <small>Hover the path to read the value at that point.</small></div></div>`;
    }
    return `<h3 class="sub">Heat map</h3><div class="heat">
      <div class="heat-step"><i>1</i><div><label class="chk"><input type="checkbox" id="heatOn" ${HEAT.on ? 'checked' : ''}> Color the toolpath by feeds and speeds</label></div></div>
      <div class="heat-step ${HEAT.on ? '' : 'off'}"><i>2</i><div><b>Pick what to show</b><select id="heatMetric" class="heat-sel" ${HEAT.on ? '' : 'disabled'}>${opts}</select><small>${M.tip}</small></div></div>
      ${body}</div>`;
  }
  const camPanel0 = camPanel;
  camPanel = function () {
    const h = camPanel0.apply(this, arguments);
    if (CAMUI.view !== 'sim') return h;
    const at = h.indexOf('<div class="btns"><button class="btn" data-camdo="endsim">');
    return at < 0 ? h : h.slice(0, at) + panelHtml() + h.slice(at);
  };
  const bind0 = bindCamPanel;
  bindCamPanel = function () {
    bind0.apply(this, arguments);
    if (CAMUI.view !== 'sim') return;
    const on = document.getElementById('heatOn'), sel = document.getElementById('heatMetric');
    if (on) on.addEventListener('change', () => setHeat({ on: on.checked }));
    if (sel) sel.addEventListener('change', () => setHeat({ metric: sel.value }));
  };
  function setHeat(p) { Object.assign(HEAT, p); syncBar(); camDraw(); refreshPanel(); requestDraw(); }

  // ── simulation bar button ──
  function syncBar() { const b = document.getElementById('sbHeat'); if (b) b.classList.toggle('on', HEAT.on); }
  const simBarShow0 = simBarShow;
  simBarShow = function () {
    simBarShow0.apply(this, arguments);
    if (document.getElementById('sbHeat')) { syncBar(); return; }
    const at = document.getElementById('sbSpeed'); if (!at) return;
    at.insertAdjacentHTML('afterend', '<div class="sb-chipctl"><button id="sbHeat" data-tip="Heat map: color the toolpath by feeds and speeds">Heat</button></div>');
    document.getElementById('sbHeat').addEventListener('click', () => setHeat({ on: !HEAT.on }));
    syncBar();
  };
  if (typeof BTN_TXT === 'object') BTN_TXT.sbHeat = ['Heat map: the toolpath colored by feeds and speeds, red where a move is overloaded.', ['Turn it on with this button or in the sidebar.', 'Pick feed, speed, chip load, removal rate or combined load.', 'Hover the path to read the value, and change an operation to see it update.']];

  // ── hover readout ──
  const tip = document.createElement('div'); tip.className = 'heat-tip'; document.body.appendChild(tip);
  const hideTip = () => tip.classList.remove('in');
  let moveEv = null, raf = 0;
  const v = new THREE.Vector3();
  function pick() {
    raf = 0;
    if (!moveEv || !active() || !HEAT.obj || !HEAT.mid) { hideTip(); return; }
    const r = glCanvas.getBoundingClientRect(), mx = moveEv.clientX - r.left, my = moveEv.clientY - r.top, mid = HEAT.mid, n = mid.length / 3;
    let best = -1, bd = 14 * 14;
    for (let i = 0; i < n; i++) {
      v.set(mid[i * 3], mid[i * 3 + 1], mid[i * 3 + 2]).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
      if (v.z < -1 || v.z > 1) continue;
      const dx = (v.x * 0.5 + 0.5) * r.width - mx, dy = (-v.y * 0.5 + 0.5) * r.height - my, d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = i; }
    }
    if (best < 0) { hideTip(); return; }
    const s = HEAT.segs[best], m = s.m, k = HEAT.metric, rows = [['load', 'Cutting load'], ['feed', 'Feed'], ['rpm', 'Spindle'], ['chip', 'Chip load'], ['mrr', 'Removal']];
    tip.innerHTML = `<b>${s.op.name}</b><small>${toolName(s.tool)}</small>` + rows.map(([q, nm]) => `<div class="${q === k ? 'cur' : ''}"><span>${nm}</span><span>${showVal(q, m[q])} ${unitOf(q)}</span></div>`).join('') + (s.over ? `<em>Over the safe limit for ${METRICS[k].short.toLowerCase()}</em>` : '');
    tip.style.left = Math.min(innerWidth - 230, moveEv.clientX + 16) + 'px'; tip.style.top = Math.min(innerHeight - 190, moveEv.clientY + 16) + 'px';
    tip.classList.add('in');
  }
  // the 2D overlay sits on top of the canvas, so listen on the page and keep only moves over the view
  const overView = e => e.target === glCanvas || e.target === ov || (e.target.id === 'view' || (glCanvas.parentElement && glCanvas.parentElement.contains(e.target) && !e.target.closest('#panel, #simbar, #catrail, .ribbon, .heat-tip')));
  document.addEventListener('pointermove', e => { if (!active()) return; if (!overView(e)) { moveEv = null; hideTip(); return; } moveEv = e; if (!raf) raf = requestAnimationFrame(pick); });
  document.addEventListener('pointerleave', () => { moveEv = null; hideTip(); });

  const st = document.createElement('style');
  st.textContent = `
.heat { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
.heat-step { display: flex; gap: 9px; align-items: flex-start; transition: opacity var(--mo) var(--mo-ease); } .heat-step.off { opacity: .45; }
.heat-step > i { flex: none; width: 18px; height: 18px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); font: 700 11px/18px var(--font); text-align: center; font-style: normal; }
.heat-step > div { flex: 1; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; min-width: 0; } .heat-step small { color: var(--muted); font-size: 11.5px; line-height: 1.35; }
.heat-sel { width: 100%; }
.heat-bar { height: 10px; border-radius: 5px; border: 1px solid var(--rule); }
.heat-ends { display: flex; justify-content: space-between; font-size: 11px; color: var(--ink-2); font-variant-numeric: tabular-nums; } .heat-ends span:nth-child(2) { color: var(--muted); }
.heat-over { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--ink-2); } .heat-over i { width: 10px; height: 10px; border-radius: 2px; background: rgb(217, 45, 32); flex: none; opacity: .35; transition: opacity var(--mo) var(--mo-ease); } .heat-over.bad { color: var(--danger); font-weight: 600; } .heat-over.bad i { opacity: 1; }
#sbHeat.on { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }
.heat-tip { position: fixed; z-index: 100; pointer-events: none; width: 210px; padding: 8px 10px; border-radius: 10px; background: var(--panel); color: var(--ink); border: 1px solid var(--rule); box-shadow: var(--shadow); font: 500 12px/1.4 var(--font); opacity: 0; transform: translateY(3px); transition: opacity var(--mo-fast) var(--mo-ease), transform var(--mo-fast) var(--mo-ease); }
.heat-tip.in { opacity: 1; transform: none; } .heat-tip small { display: block; color: var(--muted); margin-bottom: 4px; }
.heat-tip div { display: flex; justify-content: space-between; gap: 8px; color: var(--ink-2); font-variant-numeric: tabular-nums; } .heat-tip div.cur { color: var(--ink); font-weight: 700; } .heat-tip em { display: block; margin-top: 4px; color: var(--danger); font-style: normal; font-weight: 600; }`;
  document.head.appendChild(st);
})();
