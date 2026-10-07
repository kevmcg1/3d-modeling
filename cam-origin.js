// Manufacture: Set Origin, the Mastercam way. One obvious button (ribbon, and a chip over the view) starts a pick: hover
// anything on the part or the stock (a face, an edge, a vertex, an arc or hole center, a stock corner, or any spot on a
// surface) and a live X / Y / Z triad shows where the work origin would go. Clicking it opens a confirmation, "Your
// origin was here / Now you moved it here", with both positions, a small picture and the shift. Confirm moves G54;
// toolpaths stay in model space, so the G-code, the setup sheet, the simulation and verify all follow from camOrigin().
// One undo step puts it back. Picked points are stored as cam().origin = { pick: [x, y, z], k } (see wcsName / camOrigin).
(function () {
  'use strict';
  const ORG = { on: false, hover: null, pend: null };
  window.ORG_STATE = ORG;
  const NEW_KINDS = { scorner: 'Stock corner', sedge: 'Stock edge midpoint', sface: 'Stock face center', eon: 'Point on edge', surf: 'Point on surface' };
  Object.assign(KP_LABEL, NEW_KINDS);
  Object.assign(IC, { camorigin: '<circle cx="10" cy="10" r="2.2"/><path d="M10 2v4.5M10 13.5V18M2 10h4.5M13.5 10H18" opacity=".6"/><path d="M10 10l5.5-5.5M13 4.5h2.5V7"/>' });
  FA_MAP.camorigin = 'location-crosshairs';
  RB_HUE.origin = 172;

  const hasStock = () => UIX.ws === 'cam' && !!camStock();
  const mach = P => [P[0], -P[2], P[1]];                                  // world (x, up, -y) -> machine (x, y, z)
  const num = v => +v.toFixed(5);
  const onStock = k => k === 'scorner' || k === 'sedge' || k === 'sface';

  // ── what the cursor can land on: part key points, stock corners / edges / faces, any edge, any surface ──
  function stockPoints(st) {
    const X = [st.x0, st.x1], Y = [st.y0, st.y1], Z = [st.z0, st.z1], mx = (a, b) => (a + b) / 2, out = [];
    for (const x of X) for (const y of Y) for (const z of Z) out.push({ k: 'scorner', m: [x, y, z] });
    for (const x of X) for (const y of Y) out.push({ k: 'sedge', m: [x, y, mx(...Z)] });
    for (const x of X) for (const z of Z) out.push({ k: 'sedge', m: [x, mx(...Y), z] });
    for (const y of Y) for (const z of Z) out.push({ k: 'sedge', m: [mx(...X), y, z] });
    for (const x of X) out.push({ k: 'sface', m: [x, mx(...Y), mx(...Z)] });
    for (const y of Y) out.push({ k: 'sface', m: [mx(...X), y, mx(...Z)] });
    for (const z of Z) out.push({ k: 'sface', m: [mx(...X), mx(...Y), z] });
    return out.map(p => ({ k: p.k, P: toW(...p.m) }));
  }
  function snapAt(x, y) {
    const bodies = visibleBodies(), m = P2(x, y), PX = 13;
    let best = null;
    const kp = pickKeyPoint(x, y, bodies, PX);
    if (kp) best = { P: kp.P, k: kp.k, d: dst2(toScreen(kp.P), m) };
    const st = camStock();
    if (st && VIS.stock) for (const s of stockPoints(st)) {
      const d = dst2(toScreen(s.P), m);
      if (d <= PX && (!best || d < best.d - 0.5)) best = { P: s.P, k: s.k, d };
    }
    if (!best) {
      const e = bodies.length ? pickEdge(x, y, bodies, 9) : null;
      if (e) best = { P: e.P, k: 'eon', d: 0 };
    }
    if (!best && bodyMeshes.length) {
      const hit = rayAt(x, y).intersectObjects(bodyMeshes.map(b => b.me), false)[0];
      if (hit) best = { P: A3(hit.point), k: 'surf', d: 0 };
    }
    return best && { P: best.P, k: best.k, m: mach(best.P).map(num) };
  }

  // ── start / finish ──
  function start() {
    if (UIX.ws !== 'cam') setWorkspace('cam');
    if (!camStock()) { toast('Open a part first, there is nothing to put an origin on'); return; }
    if (typeof SIM !== 'undefined' && SIM.on) { simStop(); CAMUI.view = 'overview'; }
    if (CMD) cancelCmd();
    CAMUI.pickOrigin = false;
    ORG.on = true; ORG.hover = null; ORG.pend = null;
    refreshChrome();
  }
  function end() {
    ORG.on = false; ORG.hover = null; ORG.pend = null;
    ov.className = '';
    refreshChrome();
  }
  function refreshChrome() { updateHint(); renderChip(); if (typeof TB_render === 'function') { try { refreshToolbar(); } catch (e) { /* ribbon not built yet */ } } requestDraw(); }

  // ── the view chip: always visible in Manufacture ──
  let chip = null;
  function renderChip() {
    if (!chip) {
      chip = document.createElement('div'); chip.id = 'orgChip';
      chip.addEventListener('click', e => { if (e.target.closest('button')) (ORG.on ? end : start)(); });
      document.getElementById('viewport').appendChild(chip);
    }
    const show = hasStock() && !(typeof SIM !== 'undefined' && SIM.on);
    chip.hidden = !show;
    if (!show) return;
    const C = cam(), o = camOrigin();
    chip.classList.toggle('on', ORG.on);
    chip.innerHTML = `<span class="oc-ic">${svg('camorigin')}</span><span class="oc-t"><b>Work origin · G54</b><small>${xmlEsc(wcsName(C) || '')}</small></span><button class="oc-b ${ORG.on ? 'on' : ''}" type="button">${ORG.on ? 'Cancel' : 'Set origin'}</button>`;
    chip.title = `X ${fmtLs(o[0])}  Y ${fmtLs(o[1])}  Z ${fmtLs(o[2])} in the model`;
  }

  // ── pointer: hover previews, click opens the confirmation ──
  const onView = e => e.target === ov;
  window.addEventListener('pointermove', e => {
    if (!ORG.on || !onView(e) || ORG.pend || UIX.ws !== 'cam') return;
    const { x, y } = local(e);
    ORG.hover = snapAt(x, y); ov.className = ORG.hover ? 'pointer' : '';
    requestDraw(); updateReadout();
  }, true);
  window.addEventListener('pointerdown', e => {
    if (!ORG.on || !onView(e) || e.button !== 0) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (ORG.pend) return;
    const { x, y } = local(e), c = snapAt(x, y) || ORG.hover;
    if (!c) { toast('Nothing there: click the part, its edges or the stock box'); return; }
    ORG.hover = c; confirmDialog(c);
  }, true);
  window.addEventListener('keydown', e => {
    if (!ORG.on || e.key !== 'Escape') return;
    e.stopImmediatePropagation(); closeModal(); end();
  }, true);
  const closeModal0 = closeModal;
  closeModal = function () { closeModal0(); if (ORG.pend) end(); };
  const updateHint0 = updateHint;
  updateHint = function () {
    updateHint0();
    if (ORG.on) hintEl.innerHTML = `<b>Set origin:</b> hover a face, edge, vertex, arc or hole center, stock corner or any surface, then click.<span class="oc-live" id="orgLive"></span> <span class="kbd">Esc</span> cancels · right-drag orbits`;
  };
  function updateReadout() {
    const el = document.getElementById('orgLive'); if (!el) return;
    const h = ORG.hover, o = camOrigin();
    el.innerHTML = h ? `<br><b>${KP_LABEL[h.k]}</b> · ${['X', 'Y', 'Z'].map((a, i) => `${a} ${fmtLs(h.m[i] - o[i])}`).join('  ')} from the current origin` : '';
  }

  // ── the live preview: the new axes at the cursor ──
  const drawOverlay0 = drawOverlay;
  drawOverlay = function () {
    drawOverlay0();
    if (UIX.ws !== 'cam') { if (ORG.on) end(); return; }
    if (!ORG.on) return;
    const c = ORG.pend || ORG.hover; if (!c) return;
    const m = c.m, L = Math.max(6, sceneR * 0.2), s0 = toScreen(toW(...m));
    og.save(); og.lineCap = 'round';
    for (const [dv, col, t] of [[[1, 0, 0], '#d9443a', 'X'], [[0, 1, 0], '#2ea052', 'Y'], [[0, 0, 1], '#2f6fe0', 'Z']]) {
      const e = toScreen(toW(m[0] + dv[0] * L, m[1] + dv[1] * L, m[2] + dv[2] * L)), dx = e.x - s0.x, dy = e.y - s0.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      og.strokeStyle = og.fillStyle = col; og.lineWidth = 3;
      og.beginPath(); og.moveTo(s0.x, s0.y); og.lineTo(e.x, e.y); og.stroke();
      og.beginPath(); og.moveTo(e.x + ux * 8, e.y + uy * 8); og.lineTo(e.x - uy * 4.5, e.y + ux * 4.5); og.lineTo(e.x + uy * 4.5, e.y - ux * 4.5); og.closePath(); og.fill();
      og.font = '700 12px Inter, system-ui, sans-serif'; og.fillText(t, e.x + ux * 14 - 4, e.y + uy * 14 + 4);
    }
    og.strokeStyle = COL.accent; og.fillStyle = 'rgba(255,255,255,.85)'; og.lineWidth = 2;
    og.beginPath(); og.arc(s0.x, s0.y, 7, 0, TAU); og.fill(); og.stroke();
    og.beginPath(); og.arc(s0.x, s0.y, 2.2, 0, TAU); og.fillStyle = COL.accent; og.fill();
    const label = `${KP_LABEL[c.k]} · new G54`;
    og.font = '600 12px Inter, system-ui, sans-serif';
    const w = og.measureText(label).width + 14;
    og.fillStyle = COL.panel || '#fff'; og.globalAlpha = 0.94; og.fillRect(s0.x + 12, s0.y - 34, w, 22); og.globalAlpha = 1;
    og.strokeStyle = COL.accent; og.lineWidth = 1; og.strokeRect(s0.x + 12.5, s0.y - 33.5, w, 22);
    og.fillStyle = COL.ink; og.fillText(label, s0.x + 19, s0.y - 18);
    og.restore();
  };

  // ── the confirmation ──
  const AX = ['x', 'y', 'z'];
  // a small drawing of the stock and part with the origin marked: top (X, Y) and front (X, Z)
  function pic(st, part, p, hot) {
    const W = 150, H = 96, pad = 12, col = hot ? 'var(--accent)' : 'var(--muted)';
    const view = (title, ax, ay) => {
      const xa = st[AX[ax] + '0'], xb = st[AX[ax] + '1'], ya = st[AX[ay] + '0'], yb = st[AX[ay] + '1'];
      const sc = Math.min((W - 2 * pad) / ((xb - xa) || 1), (H - 2 * pad - 6) / ((yb - ya) || 1)), ox = (W - (xb - xa) * sc) / 2, oy = (H - 6 - (yb - ya) * sc) / 2;
      const X = v => ox + (v - xa) * sc, Y = v => H - 6 - oy - (v - ya) * sc;
      const rect = (b, attrs) => `<rect x="${X(b[AX[ax] + '0'])}" y="${Y(b[AX[ay] + '1'])}" width="${(b[AX[ax] + '1'] - b[AX[ax] + '0']) * sc}" height="${(b[AX[ay] + '1'] - b[AX[ay] + '0']) * sc}" ${attrs}/>`;
      const cx = X(p[ax]), cy = Y(p[ay]);
      return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${title}">${rect(st, 'fill="none" stroke="var(--muted)" stroke-dasharray="4 3"')}${part ? rect(part, 'fill="var(--panel-2)" stroke="var(--ink-2)"') : ''}<g stroke="${col}" fill="none" stroke-width="2"><circle cx="${cx}" cy="${cy}" r="5"/><path d="M${cx - 10} ${cy}H${cx + 10}M${cx} ${cy - 10}V${cy + 10}"/></g><text x="6" y="${H - 3}" font-size="9" fill="var(--muted)" font-family="Inter, system-ui, sans-serif">${title}</text></svg>`;
    };
    return view('Top (X, Y)', 0, 1) + view('Front (X, Z)', 0, 2);
  }
  function coords(m) { return ['X', 'Y', 'Z'].map((a, i) => `<span><i>${a}</i>${fmtLs(m[i])}</span>`).join(''); }
  function confirmDialog(c) {
    ORG.pend = c;
    const C = cam(), o = camOrigin(), n = c.m, st = camStock(), part = camPart();
    const d = n.map((v, i) => v - o[i]), moved = d.some(v => Math.abs(v) > 1e-6);
    const nOps = C.ops.filter(q => !q.sup).length;
    const card = document.getElementById('modalCard');
    const was = pic(st, part, o, false), now = pic(st, part, n, true);
    card.innerHTML = `<div class="m-head"><h3>Move your work origin?</h3><button class="x" data-mx title="Close">×</button></div>
      <div class="org-cmp">
        <div class="org-col was"><h4>Your origin was here</h4><div class="org-name">${xmlEsc(wcsName(C) || 'Work origin')}</div><div class="org-xyz">${coords(o)}</div><div class="org-pic">${was}</div></div>
        <div class="org-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 12h15M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <div class="org-col now"><h4>Now you moved it here</h4><div class="org-name">${KP_LABEL[c.k]}${onStock(c.k) ? ' on the stock' : ' on the part'}</div><div class="org-xyz">${coords(n)}</div><div class="org-pic">${now}</div></div>
      </div>
      <div class="org-shift">${moved ? `Every coordinate shifts by <b>X ${fmtLs(-d[0])}</b> <b>Y ${fmtLs(-d[1])}</b> <b>Z ${fmtLs(-d[2])}</b>` : 'That is where the origin already is, nothing would change.'}</div>
      <p class="org-q"><b>You ok with this?</b> It's going to move all your coordinates and change your G-code and toolpaths.</p>
      <p class="note">${nOps} operation${nOps === 1 ? '' : 's'}, the G-code, the G54 work offset, the setup sheet and the simulation are rebuilt from the new origin. Undo (Ctrl+Z) puts it back.</p>
      <div class="btns org-btns"><button class="btn" data-org="cancel">Cancel</button><button class="btn primary" data-org="ok">Confirm</button></div>`;
    document.getElementById('modal').hidden = false;
    card.querySelector('[data-mx]').addEventListener('click', closeModal);
    card.querySelector('[data-org="cancel"]').addEventListener('click', closeModal);
    card.querySelector('[data-org="ok"]').addEventListener('click', () => apply(c));
    card.querySelector('[data-org="ok"]').focus();
    requestDraw();
  }

  // ── apply: one undo step, then everything that reads the origin is rebuilt ──
  function apply(c) {
    const before = snap();
    cam().origin = { pick: c.m.map(num), k: c.k };
    record('Work origin: ' + KP_LABEL[c.k].toLowerCase(), before);
    ORG.pend = null; document.getElementById('modal').hidden = true; end();
    const wasSim = typeof SIM !== 'undefined' && SIM.on;
    if (wasSim) { simStop(); CAMUI.view = 'sim'; simStart(); }
    camRefresh();
    toast(`Work origin moved to the ${KP_LABEL[c.k].toLowerCase()}`);
  }

  // ── names: stock picks read "on the stock" ──
  const wcsName0 = wcsName;
  wcsName = function (C) { const o = C.origin; if (o && typeof o === 'object' && o.pick && onStock(o.k)) return `${KP_LABEL[o.k]} on the stock`; return wcsName0(C); };

  // ── the ribbon button, the legacy "Pick origin" buttons and the Setup menu all start the same pick ──
  const camToolbar0 = camToolbar;
  camToolbar = function () {
    const h = camToolbar0();
    if (/aria-label="Origin"/.test(h)) return h;
    const panel = rbPanel('Origin', [['setorigin', 'Set Origin', '', 'camorigin', ORG.on]], 1, 'data-cam');
    const i = h.search(/<section class="rb-panel"[^>]*aria-label="Machine">/);
    return i < 0 ? h + panel : h.slice(0, i) + panel + h.slice(i);
  };
  const camAction0 = camAction;
  camAction = function (a) { if (a === 'setorigin') { ORG.on ? end() : start(); return; } camAction0(a); };
  const camPanel0 = camPanel;
  camPanel = function () { return camPanel0().replace('data-stkdo="pick"', 'data-orgdo="start"').replace(/>Pick origin on the[^<]*</, '>Set origin on the part…<'); };
  const bindCamPanel0 = bindCamPanel;
  bindCamPanel = function () {
    bindCamPanel0();
    panel.querySelectorAll('[data-orgdo="start"]').forEach(b => b.addEventListener('click', start));
    const org = document.getElementById('camOrigin');
    if (org) org.addEventListener('change', e => { if (org.value === '__pick') { e.stopImmediatePropagation(); CAMUI.pickOrigin = false; start(); } }, true);
  };
  // the dropdown's "Pick on the part…" entry must not run the old apply-at-once pick
  const camRefresh0 = camRefresh;
  camRefresh = function () { camRefresh0(); renderChip(); };

  // ── look ──
  const st = document.createElement('style');
  st.textContent = `
#orgChip { position: absolute; left: 12px; bottom: 78px; z-index: 5; display: flex; align-items: center; gap: 9px; padding: 6px 7px 6px 10px; background: color-mix(in srgb, var(--panel) 94%, transparent); border: 1px solid var(--rule); border-radius: 10px; box-shadow: var(--shadow); font-family: var(--font); transition: border-color .2s var(--ease), box-shadow .2s var(--ease), transform .2s var(--ease); }
#orgChip[hidden] { display: none; }
#orgChip.on { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft), var(--shadow); }
#orgChip .oc-ic svg { width: 20px; height: 20px; fill: none; stroke: var(--accent); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; display: block; }
#orgChip .oc-t { display: flex; flex-direction: column; line-height: 1.25; max-width: 210px; }
#orgChip .oc-t b { font-size: 12px; font-weight: 600; color: var(--ink); }
#orgChip .oc-t small { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#orgChip .oc-b { font: 600 12px var(--font); padding: 6px 12px; border-radius: 8px; border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); cursor: pointer; transition: filter .15s var(--ease), transform .15s var(--ease); }
#orgChip .oc-b:hover { filter: brightness(1.08); transform: translateY(-1px); }
#orgChip .oc-b.on { background: transparent; color: var(--accent); }
.oc-live { display: inline; color: var(--ink-2); }
.org-cmp { display: grid; grid-template-columns: 1fr auto 1fr; gap: 10px; align-items: stretch; margin: 6px 0 10px; animation: orgIn .24s var(--ease); }
.org-col { border: 1px solid var(--rule); border-radius: 10px; padding: 10px 12px; background: var(--panel-2); min-width: 0; }
.org-col.now { border-color: var(--accent); background: var(--accent-soft); }
.org-col h4 { margin: 0 0 4px; font-size: 12.5px; font-weight: 700; color: var(--ink); }
.org-col.now h4 { color: var(--accent); }
.org-name { font-size: 12px; color: var(--ink-2); margin-bottom: 6px; }
.org-xyz { display: flex; flex-wrap: wrap; gap: 4px 10px; font: 600 12.5px var(--mono); color: var(--ink); margin-bottom: 8px; }
.org-xyz i { font-style: normal; color: var(--muted); margin-right: 4px; font-weight: 500; }
.org-pic { display: flex; flex-wrap: wrap; gap: 6px; }
.org-pic svg { background: var(--panel); border: 1px solid var(--rule); border-radius: 6px; max-width: 100%; height: auto; }
.org-arrow { display: flex; align-items: center; color: var(--accent); }
.org-shift { font-size: 12.5px; color: var(--ink-2); margin: 2px 0 8px; }
.org-shift b { color: var(--ink); font-family: var(--mono); font-weight: 600; margin-right: 6px; }
.org-q { font-size: 14px; color: var(--ink); margin: 8px 0 4px; }
.org-btns { justify-content: flex-end; }
@keyframes orgIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@media (max-width: 720px) { .org-cmp { grid-template-columns: 1fr; } .org-arrow { transform: rotate(90deg); justify-content: center; } }
@media (prefers-reduced-motion: reduce) { .org-cmp { animation: none; } }`;
  document.head.appendChild(st);
  document.addEventListener('DOMContentLoaded', renderChip);
  setTimeout(renderChip, 0);
})();
