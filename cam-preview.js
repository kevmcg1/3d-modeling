// Manufacture: a see-through preview of the stock while an operation is being programmed.
//
// With an operation open in the panel, the stock is cut by every operation up to and including that one (the same StockModel
// the simulation uses) and drawn see-through over the part, before anything is simulated. Changing the tool side, a depth, a
// stepover, the tool or any other parameter rebuilds the toolpath, and the preview follows it. The cutting runs in its own
// worker (or in short slices on the main thread when there is no worker), so typing into a field never stalls the view; the
// previous preview stays up until the new one is ready.
(function () {
  'use strict';
  const PV = {
    on: true, seq: 0, key: null, timer: 0, group: null, busy: false, failed: false, w: null, job: null, state: '', mats: null, mat: null,
  };
  try { PV.on = localStorage.getItem('datum.stockPreview') !== '0'; } catch (e) { /* storage blocked: default on */ }

  // see-through stock: the raw faces faint, the machined ones a little stronger so the cut reads at a glance
  function mats() {
    if (PV.mats) return PV.mats;
    const M = matOf(), common = { transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.2 };
    PV.mats = {
      raw: new THREE.MeshStandardMaterial({ ...common, color: M.raw, opacity: 0.22 }),
      cut: new THREE.MeshStandardMaterial({ ...common, color: COL.accent, opacity: 0.38, emissive: COL.accent, emissiveIntensity: 0.15 }),
    };
    return PV.mats;
  }
  const dropMats = () => { if (PV.mats) { PV.mats.raw.dispose(); PV.mats.cut.dispose(); PV.mats = null; } };
  function skin(group) {
    const m = mats(), L = StockLook.materials();
    group.traverse(o => {
      if (!o.isMesh) return;
      o.material = Array.isArray(o.material) ? [m.raw, m.cut] : o.material === L.raw ? m.raw : m.cut;
      o.renderOrder = 4;
    });
    return group;
  }
  function show(group) {
    if (PV.group) { if (PV.group.parent) PV.group.parent.remove(PV.group); PV.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    PV.group = group;
    if (group && wanted()) camGroup.add(group);
    requestDraw();
  }

  // The operation being programmed, when there is one to preview.
  function editing() {
    if (UIX.ws !== 'cam' || SIM.on || CAMUI.view !== 'op') return null;
    const op = opById(CAMUI.op);
    return op && !op.sup ? op : null;
  }
  const wanted = () => PV.on && VIS.stock && !!editing();

  // The moves of every operation up to and including op, timed as the simulation times them.
  const pid = new WeakMap(); let pidN = 0;
  const idOf = P => { let k = pid.get(P); if (!k) pid.set(P, k = ++pidN); return k; };
  function program(op) {
    const ops = cam().ops, upto = ops.indexOf(op), keys = [];
    if (upto < 0) return null;
    for (const o of ops.slice(0, upto + 1)) {
      if (o.sup) continue;
      const P = toolpath(o);
      if (P && P.pending) return { pending: true };
      keys.push(P ? idOf(P) + ':' + P.m.length : '-');
    }
    const ids = new Set(ops.slice(0, upto + 1).map(o => o.id));
    return { segs: () => simProgram().segs.filter(s => ids.has(s.op)), key: op.id + '|' + keys.join(',') + '|' + JSON.stringify(cam().stock) };
  }

  function status(s) {
    PV.state = s;
    const el = document.getElementById('opStockPvNote');
    if (el) el.innerHTML = note();
  }
  const note = () => !PV.on ? '' : PV.state === 'busy' ? '<span class="spin"></span> Updating the stock preview…'
    : PV.state === 'wait' ? 'The stock preview follows once the toolpaths finish computing.'
    : PV.state === 'empty' ? 'This operation has no toolpath yet, so the stock is shown uncut.'
    : PV.state === 'ready' ? 'See-through: the stock as it will be after this operation. Machined faces are tinted.' : '';

  // Rebuild when what the preview shows has changed (called after every Manufacture redraw).
  function check() {
    const op = editing();
    if (!op || !PV.on) { PV.key = null; PV.seq++; stopJob(); if (PV.group) show(null); return; }
    if (PV.group && !PV.group.parent && VIS.stock) camGroup.add(PV.group);
    if (PV.group && !VIS.stock && PV.group.parent) PV.group.parent.remove(PV.group);
    const pg = program(op);
    if (!pg) return;
    if (pg.pending) { status('wait'); return; }
    const mk = (doc.cam && doc.cam.material) || '';
    if (mk !== PV.mat) { PV.mat = mk; dropMats(); if (PV.group) skin(PV.group); }      // a new material changes the stock's color
    if (pg.key === PV.key) return;
    PV.key = pg.key;
    clearTimeout(PV.timer);
    status('busy');
    PV.timer = setTimeout(() => build(pg.segs()), 120);                  // typing into a field: one rebuild for the last value
  }

  function build(segs) {
    const seq = ++PV.seq, st = camStock();
    stopJob();
    if (!st || !wanted()) return;
    const levels = stockLevels(st, segs), total = segs.length ? segs[segs.length - 1].t1 : 0;
    if (!segs.some(s => !s.r)) { const m = new StockModel(st, levels), v = new StockView(m); v.update(); show(skin(v.group)); status('empty'); return; }
    if (!PV.failed && worker()) {
      const init = simWorkerInit(st, segs, levels), view = new SimChunks();
      init.msg.seq = seq;
      PV.job = { seq, view, total };
      PV.w.postMessage(init.msg, init.transfer);
      return;
    }
    mainThread(seq, st, levels, segs);
  }

  // ── in a worker ──
  function worker() {
    if (PV.w) return true;
    try {
      const w = new Worker(URL.createObjectURL(new Blob([simWorkerSrc()], { type: 'text/javascript' })));
      w.onmessage = e => onMsg(e.data);
      w.onerror = e => { console.warn('[Datum] Stock preview worker failed; cutting on the main thread.', e.message); PV.failed = true; PV.w = null; PV.key = null; check(); };
      PV.w = w;
      return true;
    } catch (e) { PV.failed = true; return false; }
  }
  function onMsg(m) {
    const J = PV.job;
    if (!J || m.seq !== J.seq) return;
    if (m.k === 'err') { console.error('[Datum] Stock preview error:', m.error); PV.job = null; status(''); return; }
    J.view.apply(m.chunks);
    if (!J.applied) { J.applied = true; PV.w.postMessage({ k: 'apply', seq: J.seq, t: J.total }); return; }
    PV.job = null;
    if (J.seq !== PV.seq || !wanted()) { J.view.dispose(); return; }
    show(skin(J.view.group));
    status('ready');
  }

  // ── on the main thread, a few milliseconds at a time ──
  function mainThread(seq, st, levels, segs) {
    const model = new StockModel(st, levels), job = { seq, i: 0, h: 0 };
    PV.job = job;
    const step = () => {
      if (PV.job !== job || seq !== PV.seq) return;
      const t0 = performance.now();
      while (job.i < segs.length && performance.now() - t0 < 12) {
        const sg = segs[job.i++];
        if (!sg.r) model.cut(sg.a, sg.b, sg.tool, sg.fin, sg.ax);
        if (sg.slug) model.removeRegion(sg.slug);
        if (job.i % 48 === 0) model.flush();
      }
      if (job.i < segs.length) { job.h = setTimeout(step, 0); return; }
      model.flush();
      PV.job = null;
      if (!wanted()) return;
      const v = new StockView(model); v.update();
      show(skin(v.group));
      status('ready');
    };
    step();
  }
  function stopJob() {
    const J = PV.job;
    if (!J) return;
    if (J.h) clearTimeout(J.h);
    if (J.view) J.view.dispose();
    PV.job = null;
  }

  // ── hooks ──
  const camDraw0 = camDraw;
  camDraw = function () {
    const keep = PV.group;
    camDraw0();
    if (keep && keep === PV.group && wanted() && VIS.stock) camGroup.add(keep);   // camDraw clears the group; the preview is kept, not rebuilt
    check();
  };
  const camPanel0 = camPanel;
  camPanel = function () {
    let h = camPanel0();
    if (CAMUI.view === 'op' && !SIM.on) {
      const op = opById(CAMUI.op), at = '<div class="btns"><button class="btn" data-camdo="delop">';
      if (op && h.includes(at))
        h = h.replace(at, `<div id="opStockPvBox"><label class="chk" data-tip="Draw the stock see-through as it will be after this operation, updated as you change the tool side or any other setting"><input type="checkbox" id="opStockPv" ${PV.on ? 'checked' : ''}> Preview the stock</label><p class="note" id="opStockPvNote">${note()}</p></div>${at}`);
    }
    return h;
  };
  const bindCamPanel0 = bindCamPanel;
  bindCamPanel = function () {
    bindCamPanel0();
    // the guided flow (cam-flow.js) sorts the panel into tabs after this: keep the switch out of the tabs, above the footer
    Promise.resolve().then(() => { const box = document.getElementById('opStockPvBox'), bar = box && box.parentElement && box.closest('.pn-body') && box.closest('.pn-body').querySelector(':scope > .cf-bar'); if (bar) bar.before(box); });
    const el = document.getElementById('opStockPv');
    if (el) el.addEventListener('change', () => {
      PV.on = el.checked;
      try { localStorage.setItem('datum.stockPreview', PV.on ? '1' : '0'); } catch (e) { /* not kept */ }
      PV.key = null; status(PV.on ? 'busy' : ''); check();
    });
  };
  window.StockPreview = PV;
})();
