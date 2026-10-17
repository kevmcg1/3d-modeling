// ═══════════════════════════════════════════════════════════════════
//  More sketch tools (Design tab): Conic Curve, Arc Slot, Equation
//  Curve, and Insert DXF / SVG. Everything is stored as the lines,
//  arcs and circles the other sketch tools make, so it extrudes,
//  trims, offsets and machines like any drawn profile.
//  Coverage list: docs/fusion-coverage.md
// ═══════════════════════════════════════════════════════════════════
(() => {
  if (typeof SKETCH_TOOLS === 'undefined' || typeof toolClick === 'undefined' || !window.PARAMS) return;
  const rbAppend = (h, title, items) => {
    const key = `</div><div class="rb-title">${title}</div>`, i = h.indexOf(key);
    return i < 0 ? h : h.slice(0, i) + `<div class="rb-col">${items.map(it => rbBtn('data-act', it, 'sm')).join('')}</div>` + h.slice(i);
  };
  const clamp01 = (v, a, b) => Math.max(a, Math.min(b, v));
  const E = {
    line: (a, b) => ({ type: 'line', a: cp2(a), b: cp2(b) }),
    circle: (c, r) => ({ type: 'circle', c: cp2(c), r }),
    arc: (c, r, a0, a1) => ({ type: 'arc', c: cp2(c), r, a0, a1 }),
  };
  // A curve f(t), t0..t1, as arcs: each span goes through three exact points of the curve (a line where it is straight).
  function curveEnts(f, t0, t1, spans) {
    const out = [];
    let prev = f(t0);
    for (let i = 0; i < spans; i++) {
      const ta = t0 + (t1 - t0) * i / spans, tb = t0 + (t1 - t0) * (i + 1) / spans, a = prev, b = f(tb), m = f((ta + tb) / 2), g = arcThrough(a, m, b);
      prev = b;
      if (dst2(a, b) < 1e-9) continue;
      if (!g || g.r > dst2(a, b) * 1e4) out.push(E.line(a, b)); else out.push(E.arc(g.c, g.r, g.a0, g.a1));
    }
    return out;
  }

  // ── Conic curve: start, end, the point where the end tangents meet, then a point it passes near ──
  const conicRho = (p0, p1, a, q) => { const m = lerp2(p0, p1, 0.5), u = sub2(a, m), d = dot2(u, u); return d < 1e-12 ? 0.5 : clamp01(dot2(sub2(q, m), u) / d, 0.02, 0.98); };
  function conicEnts(p0, p1, a, rho) {
    const w = rho / (1 - rho);
    const f = t => { const s = 1 - t, b0 = s * s, b1 = 2 * w * t * s, b2 = t * t, k = b0 + b1 + b2; return P2((b0 * p0.x + b1 * a.x + b2 * p1.x) / k, (b0 * p0.y + b1 * a.y + b2 * p1.y) / k); };
    return curveEnts(f, 0, 1, 10);
  }
  // ── Arc slot: center, start of the slot (sets the radius), end of the slot, then the width ──
  function arcSlotEnts(c, p1, p2, q) {
    const R = dst2(c, p1), r = Math.abs(dst2(c, q) - R);
    if (R < 1e-9 || r < 1e-9 || R - r < 1e-6) return null;
    let a0 = ang2(c, p1), a1 = ang2(c, p2), sw = mod(a1 - a0, TAU);
    if (sw < 1e-9) return null;
    if (sw > Math.PI) { const t = a0; a0 = a1; a1 = t + TAU; sw = a1 - a0; }
    else a1 = a0 + sw;
    const e0 = polar(c, R, a0), e1 = polar(c, R, a1);
    return [E.arc(c, R + r, a0, a1), E.arc(e1, r, a1, a1 + Math.PI), E.arc(c, R - r, a0, a1), E.arc(e0, r, a0 + Math.PI, a0 + TAU)];
  }
  const mine = t => t === 'conic' || t === 'arcslot';
  const need = t => (t === 'conic' ? 3 : 3);
  const toolClick1 = toolClick;
  toolClick = function (p) {
    const t = S.tool;
    if (!mine(t)) return toolClick1.apply(this, arguments);
    const n = S.pts.length;
    if (n < need(t)) { if (n && dst2(S.pts[n - 1], p) < 1e-9) return; S.pts.push(p); resetDim(); return; }
    const ents = t === 'conic' ? conicEnts(S.pts[0], S.pts[1], S.pts[2], conicRho(S.pts[0], S.pts[1], S.pts[2], p)) : arcSlotEnts(S.pts[0], S.pts[1], S.pts[2], p);
    if (!ents || !ents.length) { toast('Those points do not make a shape. Try other points.'); return; }
    pushUndo(t === 'conic' ? 'Conic curve' : 'Arc slot'); addEnts(ents); S.pts = []; resetDim();
  };
  const dimSpec1 = dimSpec;
  dimSpec = function () { return mine(S.tool) ? null : dimSpec1.apply(this, arguments); };
  const applyDims1 = applyDims;
  applyDims = function (p) { return mine(S.tool) ? p : applyDims1.apply(this, arguments); };
  const preview1 = drawToolPreview;
  drawToolPreview = function () {
    preview1.apply(this, arguments);
    const t = S.tool, c = S.cur;
    if (!mine(t) || !c || !S.pts.length) return;
    const m = planeXf(planeOf(S.sk)), mouse = S.mouse || P2(0, 0), pv = e => strokeEnt(m, e, COL.accent, 1.6, [5, 4]), pts = S.pts, n = pts.length;
    if (t === 'conic') {
      if (n === 1) pv(E.line(pts[0], c));
      else if (n === 2) { pv(E.line(pts[0], c)); pv(E.line(c, pts[1])); const es = conicEnts(pts[0], pts[1], c, 0.5); es.forEach(pv); }
      else { pv(E.line(pts[0], pts[2])); pv(E.line(pts[2], pts[1])); const rho = conicRho(pts[0], pts[1], pts[2], c); conicEnts(pts[0], pts[1], pts[2], rho).forEach(pv); label('ρ ' + rho.toFixed(2), mouse.x + 16, mouse.y - 12); }
    } else if (n === 1) { pv(E.circle(pts[0], dst2(pts[0], c))); label('R ' + fmtLs(dst2(pts[0], c)), mouse.x + 16, mouse.y - 12); }
    else if (n === 2) { pv(E.line(pts[0], pts[1])); pv(E.line(pts[0], c)); const R = dst2(pts[0], pts[1]); pv(E.circle(pts[0], R)); }
    else { const es = arcSlotEnts(pts[0], pts[1], pts[2], c); if (es) { es.forEach(pv); label('Width ' + fmtLs(2 * Math.abs(dst2(pts[0], c) - dst2(pts[0], pts[1]))), mouse.x + 16, mouse.y - 12); } }
    og.fillStyle = COL.accent;
    for (const p of pts) { const s = xfPt(m, p); og.beginPath(); og.arc(s.x, s.y, 3, 0, TAU); og.fill(); }
  };
  const hint1 = updateHint;
  updateHint = function () {
    hint1.apply(this, arguments);
    if (!S.sk || CMD || !mine(S.tool)) return;
    const n = S.pts.length, steps = S.tool === 'conic'
      ? ['click the start point', 'click the end point', 'click where the two end tangents meet', 'click a point the curve passes near']
      : ['click the center', 'click the start of the slot (sets the radius)', 'click the end of the slot', 'click to set the width'];
    hintEl.innerHTML = `<b>${S.tool === 'conic' ? 'Conic curve' : 'Arc slot'}:</b> ${steps[Math.min(n, 3)]}`;
  };
  SKETCH_TOOLS[0].push(['conic', 'Conic Curve', ''], ['arcslot', 'Arc Slot', '']);

  // ── Insert DXF / SVG ──
  const weld = ents => {
    const anchors = [];
    for (const e of ents) if (e.type === 'arc') anchors.push(polar(e.c, e.r, e.a0), polar(e.c, e.r, e.a1));
    const seen = new Map(), key = p => Math.round(p.x * 1e4) + ':' + Math.round(p.y * 1e4);
    const snap = p => {
      const k = key(p);
      if (seen.has(k)) return seen.get(k);
      for (const a of anchors) if (dst2(a, p) < 1e-4) { seen.set(k, a); return a; }
      seen.set(k, p); return p;
    };
    for (const e of ents) if (e.type === 'line') { e.a = cp2(snap(e.a)); e.b = cp2(snap(e.b)); }
    return ents.filter(e => e.type !== 'line' || dst2(e.a, e.b) > 1e-9);
  };
  function bulgeEnts(p, q, bulge) {
    if (Math.abs(bulge) < 1e-9) return [E.line(p, q)];
    const th = 4 * Math.atan(bulge), ch = dst2(p, q);
    if (ch < 1e-12) return [];
    const r = ch / (2 * Math.sin(Math.abs(th) / 2)), mid = lerp2(p, q, 0.5), dn = nrm2(P2(-(q.y - p.y), q.x - p.x));
    const h = Math.sqrt(Math.max(0, r * r - ch * ch / 4)) * (Math.abs(th) > Math.PI ? -1 : 1) * Math.sign(bulge);
    const c = add2(mid, mul2(dn, h));
    return th > 0 ? [E.arc(c, r, ang2(c, p), ang2(c, p) + th)] : [E.arc(c, r, ang2(c, q), ang2(c, q) - th)];
  }
  function polylineEnts(vs, closed) {
    const out = [], n = vs.length;
    for (let i = 0; i + (closed ? 0 : 1) < n; i++) { const a = vs[i], b = vs[(i + 1) % n]; out.push(...bulgeEnts(a, b, a.b || 0)); }
    return out;
  }
  function bsplinePoint(deg, knots, ctrl, u) {
    const n = ctrl.length - 1;
    let k = deg;
    while (k < n && u >= knots[k + 1]) k++;
    const d = ctrl.slice(k - deg, k + 1).map(p => cp2(p));
    for (let r = 1; r <= deg; r++) for (let j = deg; j >= r; j--) {
      const den = knots[j + 1 + k - r] - knots[j + k - deg];
      const al = den ? (u - knots[j + k - deg]) / den : 0;
      d[j] = P2((1 - al) * d[j - 1].x + al * d[j].x, (1 - al) * d[j - 1].y + al * d[j].y);
    }
    return d[deg];
  }
  const catmull = (pts, t) => {
    const n = pts.length - 1, s = clamp01(t, 0, n - 1e-9), i = Math.floor(s), u = s - i, g = k => pts[clamp01(k, 0, n)];
    const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2), u2 = u * u, u3 = u2 * u;
    const c = (a, b, c2, d) => 0.5 * ((2 * b) + (-a + c2) * u + (2 * a - 5 * b + 4 * c2 - d) * u2 + (-a + 3 * b - 3 * c2 + d) * u3);
    return P2(c(p0.x, p1.x, p2.x, p3.x), c(p0.y, p1.y, p2.y, p3.y));
  };
  function parseDXF(text) {
    const L = text.split(/\r?\n/), pairs = [];
    for (let i = 0; i + 1 < L.length; i += 2) pairs.push([parseInt(L[i].trim(), 10), L[i + 1].trim()]);
    let unit = 1;
    for (let i = 0; i < pairs.length; i++) if (pairs[i][0] === 9 && pairs[i][1] === '$INSUNITS') { const u = pairs[i + 1] && +pairs[i + 1][1]; unit = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 }[u] || 1; break; }
    const recs = []; let sec = '', cur = null;
    for (let i = 0; i < pairs.length; i++) {
      const [c, v] = pairs[i];
      if (c === 0) {
        if (v === 'SECTION') { sec = pairs[i + 1] && pairs[i + 1][1]; cur = null; continue; }
        if (v === 'ENDSEC' || v === 'EOF') { sec = ''; cur = null; continue; }
        if (sec === 'ENTITIES') { cur = { t: v, g: [] }; recs.push(cur); } else cur = null;
      } else if (cur) cur.g.push([c, v]);
    }
    const num = (r, code, d = 0) => { const x = r.g.find(q => q[0] === code); return x ? parseFloat(x[1]) : d; };
    const all = (r, code) => r.g.filter(q => q[0] === code).map(q => parseFloat(q[1]));
    const ents = [], skipped = {}; const S_ = unit;
    const pt = (x, y) => P2(x * S_, y * S_);
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i];
      if (r.t === 'LINE') ents.push(E.line(pt(num(r, 10), num(r, 20)), pt(num(r, 11), num(r, 21))));
      else if (r.t === 'CIRCLE') ents.push(E.circle(pt(num(r, 10), num(r, 20)), num(r, 40) * S_));
      else if (r.t === 'ARC') { const a0 = num(r, 50) * Math.PI / 180, a1 = num(r, 51) * Math.PI / 180; ents.push(E.arc(pt(num(r, 10), num(r, 20)), num(r, 40) * S_, a0, a0 + mod(a1 - a0, TAU) || a0 + TAU)); }
      else if (r.t === 'LWPOLYLINE') {
        const vs = []; for (const [c, v] of r.g) { if (c === 10) vs.push({ ...pt(parseFloat(v), 0), b: 0 }); else if (c === 20 && vs.length) vs[vs.length - 1].y = parseFloat(v) * S_; else if (c === 42 && vs.length) vs[vs.length - 1].b = parseFloat(v); }
        ents.push(...polylineEnts(vs, (num(r, 70) & 1) === 1));
      } else if (r.t === 'POLYLINE') {
        const vs = []; let j = i + 1;
        for (; j < recs.length && recs[j].t === 'VERTEX'; j++) vs.push({ ...pt(num(recs[j], 10), num(recs[j], 20)), b: num(recs[j], 42) });
        i = j - 1; if (recs[j] && recs[j].t === 'SEQEND') i = j;
        ents.push(...polylineEnts(vs, (num(r, 70) & 1) === 1));
      } else if (r.t === 'ELLIPSE') {
        const c = pt(num(r, 10), num(r, 20)), mx = num(r, 11) * S_, my = num(r, 21) * S_, a = Math.hypot(mx, my), b = a * num(r, 40, 1), th = Math.atan2(my, mx);
        const t0 = num(r, 41, 0), t1r = num(r, 42, TAU), t1 = t1r > t0 ? t1r : t1r + TAU;
        ents.push(...curveEnts(t => P2(c.x + a * Math.cos(t) * Math.cos(th) - b * Math.sin(t) * Math.sin(th), c.y + a * Math.cos(t) * Math.sin(th) + b * Math.sin(t) * Math.cos(th)), t0, t1, Math.max(4, Math.ceil((t1 - t0) / (Math.PI / 8)))));
      } else if (r.t === 'SPLINE') {
        const xs = [], ys = [], fx = [], fy = [];
        for (const [c, v] of r.g) { const q = parseFloat(v) * S_; if (c === 10) xs.push(q); else if (c === 20) ys.push(q); else if (c === 11) fx.push(q); else if (c === 21) fy.push(q); }
        const fit = fx.map((x, k) => P2(x, fy[k])), ctrl = xs.map((x, k) => P2(x, ys[k])), deg = num(r, 71, 3), knots = all(r, 40);
        if (fit.length >= 2) ents.push(...curveEnts(t => catmull(fit, t), 0, fit.length - 1, (fit.length - 1) * 2));
        else if (ctrl.length > deg && knots.length === ctrl.length + deg + 1) ents.push(...curveEnts(u => bsplinePoint(deg, knots, ctrl, u), knots[deg], knots[ctrl.length], Math.max(6, ctrl.length * 2)));
        else if (ctrl.length >= 2) ents.push(...curveEnts(t => catmull(ctrl, t), 0, ctrl.length - 1, (ctrl.length - 1) * 2));
      } else skipped[r.t] = (skipped[r.t] || 0) + 1;
    }
    return { ents: weld(ents), skipped, unit: unit === 1 ? 'mm' : unit === 25.4 ? 'in' : unit + ' mm' };
  }
  // SVG: paths, lines, polylines, polygons, rectangles, circles and ellipses, with transforms. y points up in a sketch, so y is flipped.
  const M_I = [1, 0, 0, 1, 0, 0], mMul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  function svgTransform(s) {
    let m = M_I;
    const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g; let g;
    while ((g = re.exec(s || ''))) {
      const a = g[2].split(/[\s,]+/).filter(Boolean).map(Number);
      let t = M_I;
      if (g[1] === 'matrix' && a.length === 6) t = a;
      else if (g[1] === 'translate') t = [1, 0, 0, 1, a[0] || 0, a[1] || 0];
      else if (g[1] === 'scale') t = [a[0], 0, 0, a.length > 1 ? a[1] : a[0], 0, 0];
      else if (g[1] === 'rotate') { const r = (a[0] || 0) * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r); t = [c, sn, -sn, c, 0, 0]; if (a.length === 3) t = mMul(mMul([1, 0, 0, 1, a[1], a[2]], t), [1, 0, 0, 1, -a[1], -a[2]]); }
      else if (g[1] === 'skewX') t = [1, 0, Math.tan((a[0] || 0) * Math.PI / 180), 1, 0, 0];
      else if (g[1] === 'skewY') t = [1, Math.tan((a[0] || 0) * Math.PI / 180), 0, 1, 0, 0];
      m = mMul(m, t);
    }
    return m;
  }
  function pathCmds(d) {
    const out = [], re = /([MmLlHhVvCcSsQqTtAaZz])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
    let cmd = null, args = [], g;
    const need = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
    const flush = () => {
      if (!cmd) return;
      const k = need[cmd.toUpperCase()];
      if (k === 0) { out.push({ c: cmd, a: [] }); return; }
      for (let i = 0; i + k <= args.length; i += k) out.push({ c: i && (cmd === 'M' || cmd === 'm') ? (cmd === 'M' ? 'L' : 'l') : cmd, a: args.slice(i, i + k) });
    };
    // arc flags can be written without separators ("a1 1 0 01.5 2"): read them one digit at a time
    const src = d || '';
    let i = 0;
    while (i < src.length) {
      re.lastIndex = i; g = re.exec(src);
      if (!g) break;
      i = re.lastIndex;
      if (g[1]) { flush(); cmd = g[1]; args = []; }
      else {
        if (cmd && cmd.toUpperCase() === 'A' && (args.length % 7 === 3 || args.length % 7 === 4) && /^[01]/.test(g[2]) && g[2].length > 1 && !/[.eE]/.test(g[2].slice(0, 2))) { args.push(+g[2][0]); i -= g[2].length - 1; }
        else args.push(+g[2]);
      }
    }
    flush();
    return out;
  }
  function parseSVG(text) {
    const dom = new DOMParser().parseFromString(text, 'image/svg+xml'), root = dom.documentElement;
    if (!root || root.nodeName.toLowerCase() !== 'svg' || dom.getElementsByTagName('parsererror').length) throw new Error('That does not look like an SVG file');
    const len = v => { const m = /^\s*([-+]?[\d.]+(?:e[-+]?\d+)?)\s*([a-z%]*)/i.exec(v || ''); return m ? { v: +m[1], u: m[2].toLowerCase() } : null; };
    const UNIT = { '': 25.4 / 96, px: 25.4 / 96, mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6 };
    const vb = (root.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number), w = len(root.getAttribute('width'));
    let scale = 25.4 / 96;
    if (w && w.u !== '%' && UNIT[w.u] !== undefined) scale = vb.length === 4 && vb[2] > 0 ? w.v * UNIT[w.u] / vb[2] : UNIT[w.u];
    const ents = [], skipped = {};
    const flip = (m, x, y) => P2((m[0] * x + m[2] * y + m[4]) * scale, -(m[1] * x + m[3] * y + m[5]) * scale);
    const sim = m => Math.abs(m[0] * m[0] + m[1] * m[1] - (m[2] * m[2] + m[3] * m[3])) < 1e-9 * (1 + Math.abs(m[0] * m[0])) && Math.abs(m[0] * m[2] + m[1] * m[3]) < 1e-9 * (1 + Math.abs(m[0] * m[0]));
    const SP = 8;
    const cubic = (m, p0, p1, p2, p3) => { const f = t => { const s = 1 - t; return [s * s * s * p0[0] + 3 * s * s * t * p1[0] + 3 * s * t * t * p2[0] + t * t * t * p3[0], s * s * s * p0[1] + 3 * s * s * t * p1[1] + 3 * s * t * t * p2[1] + t * t * t * p3[1]]; }; ents.push(...curveEnts(t => { const q = f(t); return flip(m, q[0], q[1]); }, 0, 1, SP)); };
    const arcTo = (m, p0, rx, ry, rot, large, sweep, p1) => {
      if (!rx || !ry) { ents.push(E.line(flip(m, ...p0), flip(m, ...p1))); return; }
      rx = Math.abs(rx); ry = Math.abs(ry);
      const ph = rot * Math.PI / 180, c = Math.cos(ph), s = Math.sin(ph), dx = (p0[0] - p1[0]) / 2, dy = (p0[1] - p1[1]) / 2, x1 = c * dx + s * dy, y1 = -s * dx + c * dy;
      const lam = x1 * x1 / (rx * rx) + y1 * y1 / (ry * ry); if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
      const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1, den = rx * rx * y1 * y1 + ry * ry * x1 * x1, co = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
      const cxp = co * rx * y1 / ry, cyp = -co * ry * x1 / rx, cx = c * cxp - s * cyp + (p0[0] + p1[0]) / 2, cy = s * cxp + c * cyp + (p0[1] + p1[1]) / 2;
      const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
      const th0 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry); let dth = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
      if (!sweep && dth > 0) dth -= TAU; else if (sweep && dth < 0) dth += TAU;
      const pt = t => { const a = th0 + dth * t, ex = rx * Math.cos(a), ey = ry * Math.sin(a); return flip(m, c * ex - s * ey + cx, s * ex + c * ey + cy); };
      ents.push(...curveEnts(pt, 0, 1, Math.max(2, Math.ceil(Math.abs(dth) / (Math.PI / 6)))));
    };
    const path = (m, d) => {
      let cur = [0, 0], start = [0, 0], lastC = null, lastQ = null;
      for (const { c: cm, a } of pathCmds(d)) {
        const rel = cm === cm.toLowerCase(), C = cm.toUpperCase(), ox = rel ? cur[0] : 0, oy = rel ? cur[1] : 0;
        let next = cur, c2 = null, q2 = null;
        if (C === 'M') { next = [a[0] + ox, a[1] + oy]; start = next; }
        else if (C === 'L') { next = [a[0] + ox, a[1] + oy]; ents.push(E.line(flip(m, ...cur), flip(m, ...next))); }
        else if (C === 'H') { next = [a[0] + ox, cur[1]]; ents.push(E.line(flip(m, ...cur), flip(m, ...next))); }
        else if (C === 'V') { next = [cur[0], a[0] + oy]; ents.push(E.line(flip(m, ...cur), flip(m, ...next))); }
        else if (C === 'C') { const p1 = [a[0] + ox, a[1] + oy]; c2 = [a[2] + ox, a[3] + oy]; next = [a[4] + ox, a[5] + oy]; cubic(m, cur, p1, c2, next); }
        else if (C === 'S') { const p1 = lastC ? [2 * cur[0] - lastC[0], 2 * cur[1] - lastC[1]] : cur; c2 = [a[0] + ox, a[1] + oy]; next = [a[2] + ox, a[3] + oy]; cubic(m, cur, p1, c2, next); }
        else if (C === 'Q' || C === 'T') {
          let q = C === 'Q' ? [a[0] + ox, a[1] + oy] : (lastQ ? [2 * cur[0] - lastQ[0], 2 * cur[1] - lastQ[1]] : cur);
          next = C === 'Q' ? [a[2] + ox, a[3] + oy] : [a[0] + ox, a[1] + oy]; q2 = q;
          cubic(m, cur, [cur[0] + 2 / 3 * (q[0] - cur[0]), cur[1] + 2 / 3 * (q[1] - cur[1])], [next[0] + 2 / 3 * (q[0] - next[0]), next[1] + 2 / 3 * (q[1] - next[1])], next);
        }
        else if (C === 'A') { next = [a[5] + ox, a[6] + oy]; if (dst2(P2(...cur), P2(...next)) > 1e-12) arcTo(m, cur, a[0], a[1], a[2], !!a[3], !!a[4], next); }
        else if (C === 'Z') { if (dst2(P2(...cur), P2(...start)) > 1e-9) ents.push(E.line(flip(m, ...cur), flip(m, ...start))); next = start; }
        cur = next; lastC = c2; lastQ = q2;
      }
    };
    const walk = (el, pm) => {
      if (el.nodeType !== 1) return;
      const m = mMul(pm, svgTransform(el.getAttribute('transform'))), tag = el.nodeName.toLowerCase(), n = k => parseFloat(el.getAttribute(k)) || 0;
      if (tag === 'g' || tag === 'svg' || tag === 'a') { for (const ch of el.children) walk(ch, m); return; }
      if (tag === 'defs' || tag === 'clippath' || tag === 'mask' || tag === 'symbol' || tag === 'metadata') return;
      if (tag === 'path') path(m, el.getAttribute('d'));
      else if (tag === 'line') ents.push(E.line(flip(m, n('x1'), n('y1')), flip(m, n('x2'), n('y2'))));
      else if (tag === 'polyline' || tag === 'polygon') {
        const v = (el.getAttribute('points') || '').split(/[\s,]+/).filter(Boolean).map(Number), pts = [];
        for (let i = 0; i + 1 < v.length; i += 2) pts.push(flip(m, v[i], v[i + 1]));
        for (let i = 0; i + 1 < pts.length; i++) ents.push(E.line(pts[i], pts[i + 1]));
        if (tag === 'polygon' && pts.length > 2) ents.push(E.line(pts[pts.length - 1], pts[0]));
      } else if (tag === 'rect') {
        const x = n('x'), y = n('y'), w2 = n('width'), h = n('height'), rx = Math.min(w2 / 2, parseFloat(el.getAttribute('rx')) || parseFloat(el.getAttribute('ry')) || 0), ry = Math.min(h / 2, parseFloat(el.getAttribute('ry')) || rx);
        if (rx > 0 && ry > 0) path(m, `M${x + rx},${y}H${x + w2 - rx}A${rx},${ry} 0 0 1 ${x + w2},${y + ry}V${y + h - ry}A${rx},${ry} 0 0 1 ${x + w2 - rx},${y + h}H${x + rx}A${rx},${ry} 0 0 1 ${x},${y + h - ry}V${y + ry}A${rx},${ry} 0 0 1 ${x + rx},${y}Z`);
        else path(m, `M${x},${y}H${x + w2}V${y + h}H${x}Z`);
      } else if (tag === 'circle' || tag === 'ellipse') {
        const cx = n('cx'), cy = n('cy'), rx = tag === 'circle' ? n('r') : n('rx'), ry = tag === 'circle' ? n('r') : n('ry');
        if (rx > 0 && ry > 0) {
          if (rx === ry && sim(m)) ents.push(E.circle(flip(m, cx, cy), rx * Math.hypot(m[0], m[1]) * scale));
          else path(m, `M${cx + rx},${cy}A${rx},${ry} 0 1 1 ${cx - rx},${cy}A${rx},${ry} 0 1 1 ${cx + rx},${cy}Z`);
        }
      } else if (['text', 'image', 'use', 'style', 'title', 'desc', 'lineargradient', 'radialgradient', 'pattern', 'filter'].includes(tag)) skipped[tag] = (skipped[tag] || 0) + 1;
    };
    walk(root, M_I);
    return { ents: weld(ents), skipped, unit: 'file scale' };
  }
  function insertText(name, text) {
    if (!S.sk) throw new Error('Open a sketch first');
    const isSvg = /\.svg$/i.test(name) || /^\s*(<\?xml|<svg)/i.test(text), r = isSvg ? parseSVG(text) : parseDXF(text);
    if (!r.ents.length) throw new Error('No lines, arcs or circles were found in ' + name);
    pushUndo('Insert ' + (isSvg ? 'SVG' : 'DXF'));
    for (const e of r.ents) { e.id = newId(); S.sk.ents.push(e); }
    touch(S.sk); modelChanged();
    S.sel.clear(); for (const e of r.ents) S.sel.add(e);
    const sk = Object.keys(r.skipped).length ? ` (skipped: ${Object.entries(r.skipped).map(([k, v]) => k.toLowerCase() + ' ×' + v).join(', ')})` : '';
    toast(`Inserted ${r.ents.length} curve${r.ents.length === 1 ? '' : 's'} from ${name}${sk}`);
    requestDraw();
    return r;
  }

  // ── Equation curve: x(t), y(t) typed as expressions (angles in degrees, lengths in mm) ──
  function equationEnts(o) {
    const base = PARAMS.paramValues(doc.params || []).lookup;
    let tv = 0;
    const lookup = { has: n => n === 't' || base.has(n), get: n => (n === 't' ? tv : base.get(n)) };
    const f = t => { tv = t; return P2(PARAMS.parseExpr(o.x, lookup), PARAMS.parseExpr(o.y, lookup)); };
    const t0 = +o.t0, t1 = +o.t1, n = Math.max(2, Math.min(400, Math.round(+o.n || 24)));
    if (!isFinite(t0) || !isFinite(t1) || t0 === t1) throw new Error('Set two different values for t');
    f(t0); f(t1);
    return curveEnts(f, t0, t1, n);
  }
  function equationCurve(o) {
    if (!S.sk) throw new Error('Open a sketch first');
    const ents = equationEnts(o);
    if (!ents.length) throw new Error('That curve has no length');
    pushUndo('Equation curve'); addEnts(ents); requestDraw();
    return ents;
  }
  function openEquationForm() {
    if (!S.sk) { toast('Open a sketch first.'); return; }
    document.getElementById('sk2Eq')?.remove();
    const box = document.createElement('div');
    box.id = 'sk2Eq'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Equation curve');
    box.style.cssText = 'position:fixed;z-index:60;right:24px;top:120px;width:300px;padding:14px;border-radius:10px;border:1px solid var(--rule);background:var(--panel,var(--bg));color:var(--ink);box-shadow:0 8px 30px rgba(0,0,0,.35);font-size:13px';
    const row = (id, label, v, w) => `<label class="field" style="display:block;margin:6px 0"><span>${label}</span><input id="${id}" type="text" spellcheck="false" value="${v}" style="width:${w || '100%'}"></label>`;
    box.innerHTML = '<b>Equation curve</b>' + row('sk2x', 'x(t) in mm', '20*cos(t)') + row('sk2y', 'y(t) in mm', '20*sin(t)')
      + '<div style="display:flex;gap:8px">' + row('sk2t0', 't from', '0', '70px') + row('sk2t1', 't to', '360', '70px') + row('sk2n', 'Pieces', '24', '60px') + '</div>'
      + '<p class="note" style="margin:6px 0">Angles are in degrees. Parameters can be used too. Try x = 2+t/20 times cos(t) for a spiral.</p><p id="sk2err" class="note" style="color:var(--danger);margin:4px 0"></p>'
      + '<div class="btns"><button class="btn" id="sk2c">Cancel</button><button class="btn primary" id="sk2ok">Draw</button></div>';
    document.body.appendChild(box);
    const val = id => box.querySelector('#' + id).value, close = () => box.remove();
    const go = () => { try { equationCurve({ x: val('sk2x'), y: val('sk2y'), t0: parseFloat(val('sk2t0')), t1: parseFloat(val('sk2t1')), n: parseFloat(val('sk2n')) }); close(); } catch (e) { box.querySelector('#sk2err').textContent = e.message; } };
    box.querySelector('#sk2ok').addEventListener('click', go); box.querySelector('#sk2c').addEventListener('click', close);
    box.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } else if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    box.querySelector('#sk2x').focus();
  }
  function pickFile() {
    if (!S.sk) { toast('Open a sketch first.'); return; }
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.dxf,.svg,image/svg+xml';
    inp.onchange = () => { const f = inp.files[0]; if (!f) return; f.text().then(t => { try { insertText(f.name, t); } catch (e) { toast(e.message); } }); };
    inp.click();
  }
  const action1 = action;
  action = function (a) {
    if (a === 'sk2:insert') { pickFile(); return; }
    if (a === 'sk2:eqn') { openEquationForm(); return; }
    return action1.apply(this, arguments);
  };
  window.SK2 = { insertText, parseDXF, parseSVG, equationCurve, conicEnts, arcSlotEnts, conicRho };

  // ── ribbon, tips, help, icons ──
  Object.assign(IC, {
    conic: '<path d="M3 16C6 4 14 4 17 16" fill="none"/><path d="M3 16l7-12 7 12" opacity=".4" stroke-dasharray="2 1.6"/>',
    arcslot: '<path d="M4 15A8 8 0 0116 6" opacity=".5"/><path d="M2.5 17a8 8 0 0113-11M6.5 17.5a3.5 3.5 0 01-4-1.5M18 4a3.5 3.5 0 01-3.5 3.5"/>',
    sk2insert: '<path d="M5 3h7l4 4v10H5z"/><path d="M12 3v4h4M10.5 9v6m0 0l-2-2m2 2l2-2"/>',
    sk2eqn: '<path d="M2.5 14c3-9 5 9 8 0s5 6 7-6"/><path d="M2.5 17h15" opacity=".4"/>',
  });
  Object.assign(FA_MAP, { conic: 'bezier-curve', arcslot: 'circle-notch', sk2insert: 'file-import', sk2eqn: 'wave-square' });
  Object.assign(TIP_TXT, {
    conic: ['A conic curve: an arc, ellipse, parabola or hyperbola from its end points and where the end tangents meet.', ['Click the start point.', 'Click the end point.', 'Click where the two end tangents meet.', 'Click a point the curve should pass near.']],
    arcslot: ['A slot that curves around a center.', ['Click the center.', 'Click the start of the slot (this sets the radius).', 'Click the end of the slot.', 'Click to set the width.']],
    'sk2:insert': ['Bring a DXF or SVG drawing into the sketch.', ['Click Insert.', 'Pick a .dxf or .svg file.', 'Its lines, arcs, circles and curves land on the sketch, ready to extrude.']],
    'sk2:eqn': ['Draw a curve from equations.', ['Click Equation.', 'Type x(t) and y(t), and the range of t.', 'Click Draw.']],
  });
  Object.assign(TOOL_HELP, {
    conic: 'Click the start, the end, and the point where the two end tangents meet. The 4th click sets how full the curve is: near the chord it is flat, near the meeting point it is pointed. Stored as arcs.',
    arcslot: 'Click the center, the start of the slot (this sets the radius), the end (the short way round, up to 180°), then the width.',
  });
  const SK_TIPS = ['sk2:insert', 'sk2:eqn'];
  if (typeof TipArt !== 'undefined' && typeof TIP_ART !== 'undefined') {
    const { C, dot, sk, grid } = TipArt, k2 = f => () => grid() + f();
    Object.assign(TIP_ART, {
      conic: [k2(() => dot([28, 60]) + dot([92, 60]) + dot([60, 22], C.dim)), k2(() => sk('M28,60 Q60,-4 92,60') + dot([28, 60], C.dim) + dot([92, 60], C.dim) + dot([60, 22], C.dim))],
      arcslot: [k2(() => dot([60, 74]) + dot([36, 40]) + dot([84, 40])), k2(() => sk('M24,48 A40,40 0 0 1 96,48 A6,6 0 0 1 84,52 A28,28 0 0 0 36,52 A6,6 0 0 1 24,48 Z') + dot([60, 74], C.dim))],
      'sk2:insert': [k2(() => sk('M44,20 h24 l12,12 v38 h-36z M68,20 v12 h12')), k2(() => sk('M30,30 h60 v36 h-60z') + sk('M60,48 m-10,0 a10,10 0 1,0 20,0 a10,10 0 1,0 -20,0'))],
      'sk2:eqn': [k2(() => sk('M20,62 L100,62')), k2(() => sk('M20,60 C34,20 46,20 60,45 S86,70 100,30'))],
    });
  }
  const A = window.TipAnim;
  if (A && A.scene) {
    const { lerp } = A.util, board = g => { g.view2d(120, 94, 2.6); g.grid2(10, 46); }, pt = (g, p, c = 'a') => g.dot([p[0], p[1], 0], c, 2.4);
    A.scene('conic', g => {
      board(g); const u = g.seg(0.1, 0.8), p0 = [-30, -12], p1 = [30, -12], ap = [0, 24];
      pt(g, p0); if (g.t > 0.2) pt(g, p1); if (g.t > 0.35) { pt(g, ap); g.line([p0, ap, p1], 'k', 1, { dash: [3, 2] }); }
      if (u > 0.45) { const n = 24, pts = []; for (let i = 0; i <= n * Math.min(1, (u - 0.45) / 0.4); i++) { const t = i / n, s = 1 - t, w = 1, k = s * s + 2 * w * s * t + t * t; pts.push([(s * s * p0[0] + 2 * w * s * t * ap[0] + t * t * p1[0]) / k, (s * s * p0[1] + 2 * w * s * t * ap[1] + t * t * p1[1]) / k]); } g.line(pts, 'a', 2); }
    });
    A.scene('arcslot', g => {
      board(g); const u = g.seg(0.2, 0.8), a0 = 0.5, a1 = lerp(0.5, 2.4, u), pts = (R, n = 30) => Array.from({ length: n + 1 }, (_, i) => [R * Math.cos(lerp(a0, a1, i / n)), -14 + R * Math.sin(lerp(a0, a1, i / n))]);
      pt(g, [0, -14], 'k'); g.line(pts(30), 'a', 2); g.line(pts(20), 'a', 2);
    });
    A.scene('sk2:insert', g => { board(g); const u = g.seg(0.25, 0.8), sh = [[-20, -12], [20, -12], [20, 8], [4, 8], [4, 16], [-20, 16]]; g.line(sh.slice(0, Math.max(2, Math.ceil(sh.length * u))), 'a', 2); if (u > 0.99) g.line(sh, 'a', 2, { close: true }); });
    A.scene('sk2:eqn', g => { board(g); const u = g.seg(0.15, 0.85), n = 60, pts = []; for (let i = 0; i <= n * u; i++) { const t = i / n * 4 * Math.PI; pts.push([-34 + t * 5.4, 14 * Math.sin(t)]); } g.line(pts, 'a', 2); });
  }
  const sketchRibbon2 = sketchRibbonHTML;
  sketchRibbonHTML = function () {
    const T = (a, l, k) => [a, l, k, a, S.tool === a];
    return rbAppend(sketchRibbon2.apply(this, arguments), 'Create', [T('conic', 'Conic', ''), T('arcslot', 'Arc Slot', ''), ['sk2:eqn', 'Equation', '', 'sk2eqn', false], ['sk2:insert', 'Insert', '', 'sk2insert', false]]);
  };
  refreshUI();
})();
