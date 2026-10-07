// Browser-side G-code checks for the QA tests. Inject with page.addScriptTag({ path }) after the app has loaded.
//   gcheck(text, { units })  → list of problems found by reading the program like a control would (modal state, feeds, spindle,
//                              tool length offset, arc radius agreement, M30, WCS, units)
//   gDeviation()             → replays the posted program into 3D polylines and compares each operation's toolpath with it, both ways;
//                              drilling, thread, tilted and G12 stretches are skipped (they are canned on the control)
// in-page G-code validator, returns list of problems
window.gcheck = function (text, opts) {
  const probs = [], L = text.split('\n'); opts = opts || {};
  let units = null, abs = true, plane = null, tool = null, spin = false, hOn = false, g = null, f = null, x = 0, y = 0, z = null, n = 0, lastCut = {}, cyc = false, canned = null;
  const num = (w, c) => { const m = w.match(new RegExp('(?:^|\\s)' + c + '(-?\\d*\\.?\\d+)')); return m ? parseFloat(m[1]) : null; };
  let started = false, toolsSeen = new Set(), fmax = 0;
  for (let i = 0; i < L.length; i++) {
    let s = L[i].replace(/\(.*?\)/g, '').trim(); if (!s || s === '%') continue; if (/^O\d+/.test(s)) continue;
    const at = `line ${i + 1} [${L[i].slice(0, 70)}]`;
    if (/NaN|undefined|Infinity/.test(s)) probs.push('bad number: ' + at);
    if (/G20/.test(s)) units = 'in'; if (/G21/.test(s)) units = 'mm';
    if (/G90/.test(s)) abs = true; if (/G91/.test(s) && !/G91 G28/.test(s) && !/G91 G12/.test(s) && !/G91 G13/.test(s)) abs = false;
    if (/G43/.test(s)) hOn = true; if (/G49/.test(s)) hOn = false;
    let m = s.match(/^T(\d+) M6/); if (m) { tool = +m[1]; toolsSeen.add(tool); hOn = false; spin = false; g = null; continue; }
    if (/M3\b/.test(s)) spin = true; if (/M5\b/.test(s)) spin = false;
    const gm = s.match(/^G(\d+(?:\.\d)?)/); const gw = gm ? 'G' + gm[1] : null;
    if (gw && ['G0', 'G1', 'G2', 'G3'].includes(gw)) g = gw;
    if (gw && /^G(81|82|83|73|85|86|89|76|84|74|12|13)$/.test(gw)) { canned = gw; }
    if (/G80/.test(s)) canned = null;
    const X = num(s, 'X'), Y = num(s, 'Y'), Z = num(s, 'Z'), F = num(s, 'F'), I = num(s, 'I'), J = num(s, 'J');
    if (F != null) { f = F; if (!(F > 0)) probs.push('non-positive feed ' + at); else if (F > (units === 'in' ? 400 : 10000)) probs.push('feed ' + F + ' is beyond any control: ' + at); }
    const Sw = num(s, 'S'); if (Sw != null && !/^G(4|10)\b/.test(s) && (Sw <= 0 || Sw > 12000)) probs.push('spindle speed S' + Sw + ': ' + at);
    const Hw = s.match(/G43 H(\d+)/); if (Hw && tool != null && +Hw[1] !== tool) probs.push('length offset H' + Hw[1] + ' does not match tool T' + tool + ': ' + at);
    const isMove = /^(G0|G1|G2|G3|X|Y|Z)/.test(s) && !/^G(28|53|91 G28)/.test(s) && !/^G43/.test(s) && !/^G91/.test(s);
    if (canned) { if (X != null) x = X; if (Y != null) y = Y; if (Z != null) z = Z; continue; }
    if (isMove && g && !/^G43/.test(s) && !/G28/.test(s)) {
      if (tool == null) probs.push('motion before any tool: ' + at);
      if ((g === 'G1' || g === 'G2' || g === 'G3') && f == null) probs.push('feed move with no F yet: ' + at);
      if ((g === 'G1' || g === 'G2' || g === 'G3') && !spin) probs.push('cutting with spindle off: ' + at);
      if (g !== 'G0' && !hOn) probs.push('cutting without tool length offset: ' + at);
      const nx = X != null ? X : x, ny = Y != null ? Y : y, nz = Z != null ? Z : z;
      if (g === 'G2' || g === 'G3') {
        if (I == null && J == null) probs.push('arc without I/J: ' + at);
        const cx = x + (I || 0), cy = y + (J || 0), r1 = Math.hypot(x - cx, y - cy), r2 = Math.hypot(nx - cx, ny - cy), tol = units === 'in' ? 0.0006 : 0.012;
        if (Math.abs(r1 - r2) > tol) probs.push(`arc radius mismatch ${(r1 - r2).toFixed(4)}: ` + at);
      }
      if (f) fmax = Math.max(fmax, f);
      x = nx; y = ny; z = nz;
    } else { if (X != null) x = X; if (Y != null) y = Y; if (Z != null) z = Z; }
  }
  if (!units) probs.push('no units code');
  if (opts.units && units !== opts.units) probs.push('units ' + units + ' != ' + opts.units);
  if (!/M30/.test(text)) probs.push('no M30'); if (!/G54/.test(text)) probs.push('no WCS');
  if (!/G28/.test(text)) probs.push('no return home');
  return probs;
};

// replay the G-code into 3D polylines (mm, machine coords + origin) and compare each op's toolpath to it
window.gReplay = function (text, o, inch) {
  const k = inch ? 25.4 : 1, L = text.split('\n'), ops = []; let cur = null;
  let g = 0, x = 0, y = 0, z = 0, abs = true, cyc = null, rplane = 0, inG12 = false;
  const num = (w, c) => { const m = w.match(new RegExp('(?:^|\\s)' + c + '(-?\\d*\\.?\\d+)')); return m ? parseFloat(m[1]) * k : null; };
  const addSeg = (a, b, rapid) => { if (cur && !cur.fresh) cur.segs.push([a[0] + o[0], a[1] + o[1], a[2] + o[2], b[0] + o[0], b[1] + o[1], b[2] + o[2], rapid ? 1 : 0]); };
  for (const raw of L) {
    const cm = raw.match(/^\((.*)\)\s*$/); if (cm && / — T\d+ /.test(cm[1])) { cur = { name: cm[1].split(' — ')[0], segs: [], skip: false, fresh: true }; ops.push(cur); x = y = z = 0; g = 0; continue; }
    const s = raw.replace(/\(.*?\)/g, '').trim(); if (!s || !cur) continue;
    if (/^T\d+ M6/.test(s)) continue;
    const gm = s.match(/^G(\d+(?:\.\d)?)\b/);
    if (/^G91 G28/.test(s) || /^G28/.test(s)) { cur.tilt = cur.tilt || /G68|G53|G91 G28 Z0\. \(clear/.test(raw); continue; }
    if (/^G90$/.test(s)) { abs = true; continue; } if (/^G91 G1[23]/.test(s)) { cur.skip = true; continue; }
    if (/^G43/.test(s)) { const Z = num(s, 'Z'); if (Z != null) z = Z; cur.fresh = false; continue; }
    if (gm) { const n = +gm[1]; if ([0, 1, 2, 3].includes(n)) { g = n; cyc = null; } else if (/^(81|82|83|73|85|86|89|76|84|74)$/.test(String(n))) { cyc = n; cur.skip = true; } else if (n === 80) { cyc = null; continue; } }
    if (/^G98|^G99/.test(s)) { cur.skip = true; continue; }
    const X = num(s, 'X'), Y = num(s, 'Y'), Z = num(s, 'Z'), I = num(s, 'I'), J = num(s, 'J');
    if (cyc) { if (X != null) x = X; if (Y != null) y = Y; continue; }
    if (X == null && Y == null && Z == null) continue;
    const nx = X != null ? X : x, ny = Y != null ? Y : y, nz = Z != null ? Z : z;
    if ((g === 2 || g === 3) && (I != null || J != null)) {
      const cx = x + (I || 0), cy = y + (J || 0), r = Math.hypot(x - cx, y - cy); let a0 = Math.atan2(y - cy, x - cx), a1 = Math.atan2(ny - cy, nx - cx);
      if (g === 3) { while (a1 <= a0 + 1e-9) a1 += 2 * Math.PI; } else { while (a1 >= a0 - 1e-9) a1 -= 2 * Math.PI; }
      const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) * r / 0.3)); let p = [x, y, z];
      for (let i = 1; i <= n; i++) { const t = a0 + (a1 - a0) * i / n, q = [cx + r * Math.cos(t), cy + r * Math.sin(t), z + (nz - z) * i / n]; addSeg(p, q, 0); p = q; }
    } else addSeg([x, y, z], [nx, ny, nz], g === 0);
    x = nx; y = ny; z = nz;
  }
  return ops;
};
function buildGrid(segs, cell) {
  const G = new Map();
  segs.forEach((s, i) => { const x0 = Math.floor(Math.min(s[0], s[3]) / cell), x1 = Math.floor(Math.max(s[0], s[3]) / cell), y0 = Math.floor(Math.min(s[1], s[4]) / cell), y1 = Math.floor(Math.max(s[1], s[4]) / cell), z0 = Math.floor(Math.min(s[2], s[5]) / cell), z1 = Math.floor(Math.max(s[2], s[5]) / cell);
    for (let a = x0; a <= x1; a++) for (let b = y0; b <= y1; b++) for (let c = z0; c <= z1; c++) { const key = a + ',' + b + ',' + c; let l = G.get(key); if (!l) G.set(key, l = []); l.push(i); } });
  return G;
}
function ptSeg3(px, py, pz, s) { const dx = s[3] - s[0], dy = s[4] - s[1], dz = s[5] - s[2], L = dx * dx + dy * dy + dz * dz; let t = L > 0 ? ((px - s[0]) * dx + (py - s[1]) * dy + (pz - s[2]) * dz) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - s[0] - t * dx, py - s[1] - t * dy, pz - s[2] - t * dz); }
function devPts(pts, segs, cell) {
  const G = buildGrid(segs, cell); let worst = 0, at = null;
  for (const p of pts) { let best = Infinity; const ax = Math.floor(p[0] / cell), ay = Math.floor(p[1] / cell), az = Math.floor(p[2] / cell);
    for (let r = 0; r <= 3 && best > 0.02; r++) { for (let a = ax - r; a <= ax + r; a++) for (let b = ay - r; b <= ay + r; b++) for (let c = az - r; c <= az + r; c++) { if (Math.max(Math.abs(a - ax), Math.abs(b - ay), Math.abs(c - az)) !== r) continue; const l = G.get(a + ',' + b + ',' + c); if (l) for (const i of l) best = Math.min(best, ptSeg3(p[0], p[1], p[2], segs[i])); } if (best < r * cell) break; }
    if (best > worst) { worst = best; at = p; } }
  return { worst, at };
}
window.gDeviation = function () {
  const g = postGcode(), inch = isIn(), o = camOrigin(), R = gReplay(g.text, o, inch), out = [];
  const ops = cam().ops.filter(op => { if (op.sup) return false; const P = toolpath(op); return P && !P.pending && P.m.length >= 2; });   // the post leaves the others out
  ops.forEach((op, i) => {
    const P = toolpath(op), G = R[i]; if (!P || !P.m || P.m.length < 2) return;
    if (!G) { out.push({ op: op.name, err: 'no G-code block' }); return; }
    if (G.skip || G.tilt || isDrillOp(op) || P.thr) { out.push({ op: op.name, skipped: true }); return; }
    const m = P.m.filter(q => !q.r || true), pts = []; let hasG12 = false; const skipIdx = new Set();
    P.m.forEach((q, j) => { if (q.g12) { hasG12 = true; for (let t = j; t <= q.g12.end; t++) skipIdx.add(t); } });
    P.m.forEach((q, j) => { if (!skipIdx.has(j)) pts.push([q.x, q.y, q.z]); });
    const segsG = G.segs;
    const d1 = devPts(pts, segsG, 3);   // toolpath points must lie on the G-code
    // G-code endpoints must lie on the toolpath polyline
    const segsP = []; for (let j = 1; j < P.m.length; j++) { if (skipIdx.has(j)) continue; const a = P.m[j - 1], b = P.m[j]; segsP.push([a.x, a.y, a.z, b.x, b.y, b.z, 0]); }
    const gp = segsG.map(s => [s[3], s[4], s[5]]);
    const d2 = hasG12 ? { worst: 0 } : devPts(gp, segsP, 3);
    out.push({ op: op.name, n: pts.length, toolpathOffGcode: +d1.worst.toFixed(3), gcodeOffToolpath: +d2.worst.toFixed(3), at: d1.worst > 0.03 ? d1.at : (d2.worst > 0.03 ? d2.at : null) });
  });
  return out;
};

// Canned drilling cycles: replays the cycle lines of every drilling operation (X Y Z R carry over from line to line, like on the control)
// and compares every hole with the toolpath's own hole list. Returns the list of mismatches.
window.gDrills = function () {
  const g = postGcode(), inch = isIn(), k = inch ? 25.4 : 1, o = camOrigin(), L = g.text.split('\n'), bad = [];
  const ops = cam().ops.filter(op => { if (op.sup) return false; const P = toolpath(op); return P && !P.pending && P.m.length >= 2; });
  const blocks = []; let cur = null;
  for (const raw of L) {
    const cm = raw.match(/^\((.*)\)\s*$/); if (cm && / — T\d+ /.test(cm[1])) { cur = { lines: [] }; blocks.push(cur); continue; }
    if (cur) cur.lines.push(raw.replace(/\(.*?\)/g, '').trim());
  }
  ops.forEach((op, i) => {
    const P = toolpath(op), B = blocks[i]; if (!isDrillOp(op) || !P.holes || !B || opAxis(op)) return;
    const hs = []; let cyc = false, x = null, y = null, z = null, r = null;
    for (const s of B.lines) {
      const num = c => { const m = s.match(new RegExp('(?:^|\\s)' + c + '(-?\\d*\\.?\\d+)')); return m ? parseFloat(m[1]) * k : null; };
      if (/^G80/.test(s)) { cyc = false; continue; }
      if (/^(G98 |G99 )?G(81|82|83|73|85|86|89|76|84)\b/.test(s)) cyc = true; else if (/^G0\b|^G1\b|^G43/.test(s)) { cyc = false; continue; }
      if (!cyc) continue;
      const X = num('X'), Y = num('Y'), Z = num('Z'), R = num('R'); if (X != null) x = X; if (Y != null) y = Y; if (Z != null) z = Z; if (R != null) r = R;
      if (X != null || Y != null) hs.push([x + o[0], y + o[1], z + o[2], r + o[2]]);
    }
    if (hs.length !== P.holes.length) { bad.push(`${op.name}: ${hs.length} holes posted, ${P.holes.length} planned`); return; }
    P.holes.forEach((h, j) => { const d = [Math.abs(h.x - hs[j][0]), Math.abs(h.y - hs[j][1]), Math.abs(h.z - hs[j][2])]; if (Math.max(...d) > (inch ? 0.003 : 0.002) * 25.4 / (inch ? 1 : 25.4) + 0.01) bad.push(`${op.name}: hole ${j + 1} posted ${hs[j].map(v => v.toFixed(3))} planned ${[h.x, h.y, h.z].map(v => v.toFixed(3))}`); if (hs[j][2] > hs[j][3]) bad.push(`${op.name}: hole ${j + 1} bottom is above its R plane`); });
  });
  return bad;
};
