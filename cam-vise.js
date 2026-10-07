// Manufacture: the vise and parallels the stock sits in (collision boxes in index.html: viseModel / viseObjects / fixtureHit).
// What was wrong with them: the jaws, base and bars were drawn as unlit near-black boxes (no environment light), so they
// vanished into the background and the parallels read as thin slivers; the vise size only followed the length along the
// jaws, so a wide stock could sit outside a 6 in vise's opening; the placement was cached while toolpaths were still
// computing, so bars could stay under a cut that finished later; and there was no way to see, hide or choose them.
// This file replaces the model (same box kinds, so Verify and fixtureHit work unchanged) and adds the Workholding card in
// Setup: vise on/off, size (auto 4 / 6 / 8 in), parallel height and number, and a Vise & parallels toggle under Show.
(function () {
  'use strict';
  const IN = 25.4;
  // approximate machine-vise classes (jaw width, jaw opening); the opening is what the stock's width across the jaws must fit
  const VISE_SIZES = {
    4: { name: '4 in vise', jaw: 4 * IN, open: 4.6 * IN, plate: 6, jawT: 22 },
    6: { name: '6 in vise', jaw: 6 * IN, open: 6.5 * IN, plate: 6, jawT: 25.4 },
    8: { name: '8 in vise', jaw: 8 * IN, open: 8.6 * IN, plate: 8, jawT: 30 },
  };
  const PAR_HEIGHTS = [['1/2"', 0.5 * IN], ['3/4"', 0.75 * IN], ['1"', IN], ['1.25"', 1.25 * IN]];
  if (VIS.vise === undefined) VIS.vise = true;

  // ── size and orientation: the narrow side goes across the jaws, unless only the other side fits the opening ──
  function layout(V, st) {
    const Wx = st.x1 - st.x0, Wy = st.y1 - st.y0, maxOpen = VISE_SIZES[8].open;
    let across = V.across === 'x' || V.across === 'y' ? V.across : (Wx <= Wy ? 'x' : 'y');
    if (V.across !== 'x' && V.across !== 'y' && (across === 'x' ? Wx : Wy) > maxOpen && (across === 'x' ? Wy : Wx) <= maxOpen) across = across === 'x' ? 'y' : 'x';
    const A = across === 'x' ? Wx : Wy, L = across === 'x' ? Wy : Wx;
    let size = String(V.size || 'auto');
    if (!VISE_SIZES[size]) size = Object.keys(VISE_SIZES).find(k => VISE_SIZES[k].open >= A + 1 && VISE_SIZES[k].jaw >= Math.min(L, 6 * IN)) || Object.keys(VISE_SIZES).find(k => VISE_SIZES[k].open >= A + 1) || '8';
    return { across, size, spec: VISE_SIZES[size], A, L, tooWide: A + 1 > VISE_SIZES[size].open };
  }
  window.viseLayout = () => { const st = camStock(); return st ? layout(viseSet(), st) : null; };

  // ── the model: jaws, base and parallels as boxes (collision), plus fixtures that are only drawn (plates, screw, handle) ──
  viseModel = function () {
    const V = viseSet(), st = camStock(), part = camPart();
    if (!V.on || !st || !part) return null;
    if ((typeof isWire === 'function' && isWire()) || (typeof camSetup === 'function' && camSetup())) return null;
    const pending = cam().ops.some(op => { if (op.sup || op.hide) return false; const P = toolpath(op); return !!(P && P.pending); });
    const key = verifyKey() + '|' + JSON.stringify(cam().vise || null);
    if (!pending && VISE.key === key && VISE.model) return VISE.model;
    const lay = layout(V, st), X = lay.across === 'x', spec = lay.spec;
    const A0 = X ? st.x0 : st.y0, A1 = X ? st.x1 : st.y1, L0 = X ? st.y0 : st.x0, L1 = X ? st.y1 : st.x1, Lm = (L0 + L1) / 2;
    const jawW = spec.jaw, jawT = spec.jawT, bed = st.z0 - V.parH, jawTop = Math.min(st.z0 + V.grip, st.z1 - 1);
    const box = (a0, a1, l0, l1, z0, z1, name, kind) => (X ? { x0: a0, x1: a1, y0: l0, y1: l1, z0, z1, name, kind } : { x0: l0, x1: l1, y0: a0, y1: a1, z0, z1, name, kind });
    const geo = { across: lay.across, pa0: X ? part.x0 : part.y0, pa1: X ? part.x1 : part.y1, bl0: Math.max(L0, (X ? part.y0 : part.x0) + 3), bl1: Math.min(L1, (X ? part.y1 : part.x1) - 3) };
    const jl0 = Lm - jawW / 2, jl1 = Lm + jawW / 2;
    const boxes = [
      box(A0 - jawT, A0, jl0, jl1, bed, jawTop, 'fixed jaw', 'jaw'),
      box(A1, A1 + jawT, jl0, jl1, bed, jawTop, 'moving jaw', 'jaw'),
      box(A0 - jawT - 40, A1 + jawT + 40, jl0 - 20, jl1 + 20, bed - 30, bed, 'vise bed', 'base'),
    ];
    const low = viseLowPoints(st), cs = Array.isArray(V.parX) ? V.parX : viseParallelPositions(V, geo, low);
    if (geo.bl1 - geo.bl0 > 10) for (const c of cs) boxes.push(box(c - V.parT / 2, c + V.parT / 2, geo.bl0, geo.bl1, bed, st.z0, 'parallel', 'parallel'));
    // drawn only: jaw plates on the gripping faces, the lead screw and the handle on the moving-jaw end
    const pl = spec.plate, zc = bed + (jawTop - bed) * 0.5;
    const deco = [
      box(A0 - pl, A0, jl0 + 6, jl1 - 6, bed + 3, jawTop, 'fixed jaw plate', 'plate'),
      box(A1, A1 + pl, jl0 + 6, jl1 - 6, bed + 3, jawTop, 'moving jaw plate', 'plate'),
      box(A0 - jawT - 40 - 2, A0 - jawT - 2, jl0 - 20, jl0 + 20, bed - 30, bed + 8, 'base ear', 'base'),
      box(A1 + jawT + 2, A1 + jawT + 40 + 2, jl1 - 20, jl1 + 20, bed - 30, bed + 8, 'base ear', 'base'),
    ];
    const screw = { name: 'lead screw', kind: 'steel', axis: lay.across, a0: A1 + jawT, a1: A1 + jawT + 40 + 60, l: Lm, z: zc - (jawTop - bed) * 0.12, r: 8 };
    const handle = { name: 'handle', kind: 'steel', axis: lay.across === 'x' ? 'y' : 'x', a0: Lm - 62, a1: Lm + 62, l: screw.a1 - 8, z: screw.z, r: 4, ball: 7 };
    VISE.key = pending ? null : key;
    return (VISE.model = { boxes, deco, rods: [screw, handle], across: lay.across, size: lay.size, spec, tooWide: lay.tooWide, jawTop, bed, jawW, geo, auto: !Array.isArray(V.parX), nPar: boxes.filter(b => b.kind === 'parallel').length });
  };

  // ── drawing: lit steel with edge lines, so the jaws, bars and base read in the view and in the simulation ──
  let mats = null, lineMat = null;
  const getMats = () => {
    if (mats) return mats;
    const env = typeof ToolLook !== 'undefined' && ToolLook.env ? ToolLook.env() : null, mk = (color, metalness, roughness) => new THREE.MeshStandardMaterial({ color, metalness, roughness, envMap: env, envMapIntensity: env ? 0.7 : 0 });
    lineMat = new THREE.LineBasicMaterial({ color: 0x1c2733, transparent: true, opacity: 0.55 });
    return (mats = { jaw: mk(0x4d6b8a, 0.35, 0.5), base: mk(0x3d5671, 0.3, 0.6), plate: mk(0xaeb7c1, 0.6, 0.35), parallel: mk(0xd2ad55, 0.55, 0.32), steel: mk(0x9aa4af, 0.65, 0.35) });
  };
  const boxMesh = (b, m) => {
    const g = new THREE.BoxGeometry(b.x1 - b.x0, b.z1 - b.z0, b.y1 - b.y0), me = new THREE.Mesh(g, m);
    me.position.set((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, -(b.y0 + b.y1) / 2);
    const ed = new THREE.LineSegments(new THREE.EdgesGeometry(g), lineMat); me.add(ed);
    return me;
  };
  const rodMesh = (r, m) => {
    const len = r.a1 - r.a0, g = new THREE.CylinderGeometry(r.r, r.r, len, 20), me = new THREE.Mesh(g, m), mid = (r.a0 + r.a1) / 2;
    if (r.axis === 'x') { me.rotation.z = Math.PI / 2; me.position.set(mid, r.z, -r.l); } else { me.rotation.x = Math.PI / 2; me.position.set(r.l, r.z, -mid); }
    if (r.ball) for (const s of [-1, 1]) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(r.ball, 14, 10), m), off = s * len / 2;
      ball.position.set(0, off, 0); me.add(ball);
    }
    return me;
  };
  viseObjects = function () {
    if (VIS.vise === false) return [];
    const M = viseModel(); if (!M) return [];
    const mt = getMats(), out = [];
    for (const b of M.boxes) out.push(boxMesh(b, mt[b.kind]));
    for (const b of M.deco) out.push(boxMesh(b, mt[b.kind]));
    for (const r of M.rods) out.push(rodMesh(r, mt.steel));
    for (const o of out) o.userData.own = o.userData.vise = true;
    return out;
  };

  // ── Show: Vise & parallels ──
  const renderVis0 = renderVis;
  renderVis = function () {
    renderVis0();
    if (UIX.ws !== 'cam' || !camStock() || !viseModel()) return;
    const el = document.getElementById('visGroup');
    if (el && !el.querySelector('[data-vis="vise"]')) el.insertAdjacentHTML('beforeend', `<button data-vis="vise" class="${VIS.vise !== false ? 'on' : ''}"><i></i>Vise &amp; parallels</button>`);
  };

  // ── Setup: the Workholding card ──
  const fmtH = mm => (PAR_HEIGHTS.find(([, v]) => Math.abs(v - mm) < 0.2) || [`${+(mm / IN).toFixed(2)}"`])[0];
  const seg = (k, items, cur) => `<div class="seg">${items.map(([v, l, t]) => `<button data-vs="${k}:${v}" class="${String(cur) === String(v) ? 'on' : ''}"${t ? ` title="${t}"` : ''}>${l}</button>`).join('')}</div>`;
  function card() {
    const V = viseSet(), st = camStock(); if (!st) return '';
    const M = V.on ? viseModel() : null, lay = layout(V, st);
    const sizes = [['auto', 'Auto', 'The smallest vise whose jaws open wide enough for the stock'], ...Object.entries(VISE_SIZES).map(([k, s]) => [k, k + ' in', `${s.name}: jaws ${fmtLs(s.jaw)} wide, opens ${fmtLs(s.open)}`])];
    let h = `<h3 class="sub">Workholding</h3><div class="field"><span>Vise</span>${seg('on', [[1, 'On'], [0, 'Off', 'No vise: the stock is held some other way, and Verify skips the jaws and parallels']], V.on ? 1 : 0)}</div>`;
    if (!V.on) return h;
    h += `<div class="field"><span>Vise size</span>${seg('size', sizes, V.size && VISE_SIZES[V.size] ? V.size : 'auto')}</div>`;
    const curH = PAR_HEIGHTS.find(([, v]) => Math.abs(v - V.parH) < 0.2);
    h += `<div class="field"><span>Parallels: height, then how many</span><div class="row2">${seg('parH', PAR_HEIGHTS.map(([l, v]) => [v.toFixed(2), l]), curH ? curH[1].toFixed(2) : '')}${seg('parN', [[0, 'None'], [1, 'One'], [2, 'Pair']], V.parN)}</div></div>`;
    h += `<p class="note">${M ? `A ${lay.spec.name} (${fmtLs(lay.spec.jaw)} jaws), the stock across the jaws is ${fmtLs(lay.A)}${lay.tooWide ? ` — <b>wider than it opens (${fmtLs(lay.spec.open)})</b>, pick a bigger vise or turn the stock` : ''}. ${M.nPar ? `${M.nPar} parallel${M.nPar > 1 ? 's' : ''}, ${fmtH(V.parH)} tall${M.auto ? ', placed under solid material clear of the cut-outs' : ''}` : 'No parallels: the part is held on the jaws alone'}. Verify checks the cutter, shank and holder against all of it.` : 'The vise is not drawn for indexed (rotary or trunnion) setups.'}</p>`;
    return h;
  }
  const camPanel0 = camPanel;
  camPanel = function () {
    const h = camPanel0();
    if (CAMUI.view !== 'setup' || !camStock()) return h;
    const c = card();
    return /<p class="note">Machine axes match/.test(h) ? h.replace(/(<p class="note">Machine axes match)/, c + '$1') : h;
  };
  const bindCamPanel0 = bindCamPanel;
  bindCamPanel = function () {
    bindCamPanel0();
    panel.querySelectorAll('[data-vs]').forEach(b => b.addEventListener('click', () => {
      const [k, v] = b.dataset.vs.split(':'), before = snap(), C = cam(), V = { ...(C.vise || {}) };
      if (k === 'on') V.on = v === '1';
      else if (k === 'size') V.size = v;
      else if (k === 'parH') { V.parH = +v; V.parX = null; }
      else if (k === 'parN') { V.parN = +v; V.parX = null; }
      C.vise = V; delete C._barOff;
      VISE.key = null; if (typeof VERIFY !== 'undefined') VERIFY.report = null;
      record('Vise: ' + (k === 'on' ? (V.on ? 'on' : 'off') : k === 'size' ? (V.size === 'auto' ? 'auto size' : V.size + ' in') : k === 'parH' ? 'parallels ' + fmtH(V.parH) : V.parN + ' parallels'), before);
      camRefresh();
    }));
  };
})();
