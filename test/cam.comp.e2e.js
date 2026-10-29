// Manufacture: cutter compensation in the control (Fusion's "In control / In wear / Inverse wear", Mastercam's Control / Wear / Reverse wear).
// Chain contour toolpaths only post G41 / G42 ... G40 when Compensation is Control, Wear or Reverse wear:
//   Control: the program is the part contour (the chain itself, or the chain with the stock left), with a tangent lead arc one radius wider,
//            a straight start-up move into the arc and a straight cancel move out of it; the simulation keeps the tool-center path.
//   Wear / Reverse wear: the program is the tool-center path with G41 / G42 (swapped for reverse) so the register holds only the wear.
// The posted program is read the way the control reads it: compensation must be engaged by a move at least a radius long, never left on
// through a rapid, tool change or the end, and the geometry is checked against the model: the programmed contour has to lie on the chain,
// and every simulated tool-center point has to sit exactly one tool radius from the programmed path.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/cam.comp.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (3d-modeler.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 900)); } };

// ── reading the program like a control: returns the compensated stretches and the problems found ──
function readComp(text, inch, opts) {
  opts = opts || {}; const k = inch ? 25.4 : 1, probs = [], spans = [], L = text.split('\n');
  let on = null, x = null, y = null, f = null, cur = null, g = 0;
  const num = (s, c) => { const m = s.match(new RegExp('(?:^|\\s)' + c + '(-?\\d*\\.?\\d+)')); return m ? parseFloat(m[1]) * k : null; };
  L.forEach((raw, ln) => {
    const s = raw.replace(/\(.*?\)/g, '').replace(/;.*$/, '').trim(), at = `line ${ln + 1} [${raw.slice(0, 70)}]`; if (!s) return;
    const comp = (s.match(/\bG4([012])\b/) || [])[1];
    const gm = s.match(/^G([0-3])\b/); if (gm) g = +gm[1];
    const X = num(s, 'X'), Y = num(s, 'Y'), I = num(s, 'I'), J = num(s, 'J'), Z = num(s, 'Z');
    if (comp === '1' || comp === '2') {
      if (on) probs.push('compensation turned on while on: ' + at);
      if (!opts.noD && !/\bD\d+/.test(s)) probs.push('G41 / G42 without a D register: ' + at);
      if (g !== 1) probs.push('compensation must start on a G1 line: ' + at);
      const len = Math.hypot((X == null ? x : X) - x, (Y == null ? y : Y) - y);
      cur = { g: 'G4' + comp, d: (s.match(/\bD(\d+)/) || [])[1], start: [x, y], len, pts: [[X, Y]], arcs: [], line: ln + 1 }; on = cur; spans.push(cur);
      if (opts.minLen && len < opts.minLen - 1e-6) probs.push(`start-up move ${len.toFixed(3)} mm is shorter than the tool radius ${opts.minLen}: ` + at);
      x = X; y = Y; return;
    }
    if (comp === '0') {
      if (!on && X == null && Y == null) return;                                  // the safe-start line (G40 G49 G80) is not a cancel move
      if (!on) probs.push('G40 while not on: ' + at);
      if (g !== 1 || X == null && Y == null) probs.push('G40 must come with a G0 / G1 move: ' + at);
      if (on) { on.end = [X == null ? x : X, Y == null ? y : Y]; on.exitLen = Math.hypot(on.end[0] - x, on.end[1] - y); } on = null; if (X != null) x = X; if (Y != null) y = Y; return;
    }
    if (on) {
      if (/^G0\b/.test(s) || /^M(5|6|30|0?6)\b/.test(s) || /^T\d+/.test(s) || /^G(28|91|53)/.test(s) || (Z != null && X == null && Y == null)) probs.push('compensation still on: ' + at);
      else if (X != null || Y != null) {
        const nx = X == null ? x : X, ny = Y == null ? y : Y;
        if (g === 2 || g === 3) on.arcs.push({ from: [x, y], to: [nx, ny], c: [x + (I || 0), y + (J || 0)], ccw: g === 3, line: ln + 1 }); else on.pts.push([nx, ny]);
        on.pts.push([nx, ny, g === 2 || g === 3 ? 'arc' : 'line']);
      }
    }
    if (X != null) x = X; if (Y != null) y = Y;
  });
  if (on) probs.push('compensation left on at the end of the program');
  return { spans, probs };
}
// the polyline of one stretch with its arcs walked (mm)
function walk(sp, text, inch) {
  const k = inch ? 25.4 : 1, L = text.split('\n'), out = [], num = (s, c) => { const m = s.match(new RegExp('(?:^|\\s)' + c + '(-?\\d*\\.?\\d+)')); return m ? parseFloat(m[1]) * k : null; };
  let x = sp.start[0], y = sp.start[1], g = 1; const arcAt = [];
  for (let ln = sp.line - 1; ln < L.length; ln++) {
    const s = L[ln].replace(/\(.*?\)/g, '').trim(); if (!s) continue;
    const gm = s.match(/^G([0-3])\b/); if (gm) g = +gm[1];
    const X = num(s, 'X'), Y = num(s, 'Y'), I = num(s, 'I'), J = num(s, 'J'); if (X == null && Y == null) { if (/\bG40\b/.test(s)) break; continue; }
    const nx = X == null ? x : X, ny = Y == null ? y : Y;
    if (g === 2 || g === 3) {
      const cx = x + (I || 0), cy = y + (J || 0), r = Math.hypot(x - cx, y - cy); let a0 = Math.atan2(y - cy, x - cx), a1 = Math.atan2(ny - cy, nx - cx);
      if (g === 3) { while (a1 <= a0 + 1e-9) a1 += 2 * Math.PI; } else { while (a1 >= a0 - 1e-9) a1 -= 2 * Math.PI; }
      const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) * r / 0.05)); arcAt.push({ i0: out.length, i1: out.length + n, r, rEnd: Math.hypot(nx - cx, ny - cy) });
      for (let i = 1; i <= n; i++) { const t = a0 + (a1 - a0) * i / n; out.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); }
    } else out.push([nx, ny]);
    x = nx; y = ny;
    if (/\bG40\b/.test(s)) break;
  }
  return { pts: [sp.start, ...out], arcAt };
}
const distSeg = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy; let t = l2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
const distPoly = (p, poly, closed) => { let best = Infinity; for (let i = 0; i + 1 < poly.length; i++) best = Math.min(best, distSeg(p, poly[i], poly[i + 1])); if (closed) best = Math.min(best, distSeg(p, poly[poly.length - 1], poly[0])); return best; };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } }); await page.addInitScript(() => { window.DATUM_PREMIUM = true; window.DATUM_AUTO = true; });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' })); await page.route(/gate\.js/, r => r.abort());
  await page.goto('file://' + path.resolve(__dirname, '..', '3d-modeler.html') + '?dev=1'); await page.waitForTimeout(2000);
  await page.addScriptTag({ path: path.resolve(__dirname, 'lib', 'gcode-check.js') });
  const load = async name => { await page.evaluate(n => { const s = SAMPLES.find(x => x.name === n); loadDoc(s.make(), 'test'); }, name); await page.waitForTimeout(1200); await page.evaluate(() => { setWorkspace('cam'); camAddOp('chain'); }); await page.waitForTimeout(1200); };
  await load('Pocketed plate');
  await page.evaluate(() => {
    window.allChains = () => { const out = []; for (const b of visibleBodies()) { const m = bodyMesh(b); for (const ch of edgeChains(m)) if (chainFlat(ch)) { const c = buildChain(m, ch, true); if (c) out.push(c); } } return out; };
    window.bigClosed = () => allChains().filter(c => c.closed).sort((a, b) => Math.abs(cArea(cP(chainTravel(b)))) - Math.abs(cArea(cP(chainTravel(a)))))[0];
    window.floorChain = () => allChains().filter(c => c.closed && Math.abs(c.z - 7) < 0.01).sort((a, b) => Math.abs(cArea(cP(chainTravel(b)))) - Math.abs(cArea(cP(chainTravel(a)))))[0];
    // one chain contour with the given settings; returns what the checks need (all in mm, machine coordinates relative to G54)
    window.runComp = (which, set) => {
      const c = which === 'floor' ? floorChain() : bigClosed(), op = opById(CAMUI.op); chainSetMode(op, 'contour');
      op.chains = [{ id: 1, rev: false, start: 0, ...c }]; Object.assign(op, { stepdown: 6, comp: 'computer', leave: 0, lead: 'arc', ramp: false, tabs: 0, side: 'auto', compD: undefined, coolant: undefined }, set || {});
      cam().post.ctrl = (set && set.ctrl) || 'haas';
      const P = toolpath(op), g = postGcode(), o = camOrigin(), r = P.tool.d / 2;
      const i = P.m.findIndex(m => m.cc === 'on');
      const runs = P.m.map((m, k) => ({ x: m.x - o[0], y: m.y - o[1], cc: m.cc || '', k })).filter(m => m.cc === 'on' || m.cc === 'run');
      const chain = chainTravel(c).map(p => [p.x - o[0], p.y - o[1]]);
      return { text: g.text, inch: isIn(), r, warn: P.warn, info: P.info, runs, chain, closed: !!c.closed, nCC: P.m.filter(m => m.cc).length, side: i >= 0 ? P.m[i].ccSide : null, hasNom: i >= 0 && !!P.m[i].ccNom, tool: P.tool.n };
    };
  });

  await ok('Computer (the default) posts no G41 / G42 and no start-up / cancel moves', async () => {
    const r = await page.evaluate(() => runComp('big', { comp: 'computer' }));
    assert(!/\bG4[12]\b/.test(r.text) && !/G40 X/.test(r.text) && r.nCC === 0 && !/CUTTER COMP/.test(r.text), 'computer compensation must stay as it was');
  });

  await ok('Control: one G41 / G42 line with a D register per level, cancelled by G40 on a move; never on through a rapid, tool change or the end', async () => {
    const r = await page.evaluate(() => runComp('big', { comp: 'control' }));
    const rd = readComp(r.text, r.inch, { minLen: r.r });
    assert.deepStrictEqual(rd.probs, [], JSON.stringify(rd.probs));
    assert(rd.spans.length >= 3, 'three or more levels, each its own start-up and cancel: ' + rd.spans.length);
    assert(rd.spans.every(s => s.g === 'G42' && s.d === String(r.tool)), 'tool on the right of travel is G42 with D = the tool number: ' + JSON.stringify(rd.spans.map(s => [s.g, s.d])));
    assert(/SET THE TOOL RADIUS/.test(r.text), 'the program tells the operator to set the radius');
  });

  await ok('Control: the programmed contour is the chain itself (every chain corner on it, nothing but the leads off it) and the lead arcs are true G2 / G3', async () => {
    const r = await page.evaluate(() => runComp('big', { comp: 'control' }));
    const rd = readComp(r.text, r.inch), sp = rd.spans[0], w = walk(sp, r.text, r.inch);
    assert(sp.arcs.length >= 2, 'lead-in and lead-out arcs post as G2 / G3: ' + sp.arcs.length);
    const poly = w.pts;
    const miss = r.chain.map(p => distPoly(p, poly, false)).reduce((a, b) => Math.max(a, b), 0);
    assert(miss < 0.01, 'a chain point is ' + miss.toFixed(4) + ' mm off the programmed contour');
    // between the lead arcs the programmed path is the chain: every vertex there lies on it
    const first = w.arcAt[0], last = w.arcAt[w.arcAt.length - 1];
    const mid = poly.slice(first.i1 + 1, last.i0 + 1); let far = 0; for (const p of mid) far = Math.max(far, distPoly(p, r.chain, true));
    assert(mid.length >= 4 && far < 0.01, 'the contour strays ' + far.toFixed(4) + ' mm from the chain');
    // each lead arc is one radius wider than the tool-center lead arc: R = lead radius + tool radius, and a clean circle
    for (const a of w.arcAt) assert(Math.abs(a.r - a.rEnd) < 0.01 * 25.4 / 25.4 + 0.005, 'arc start / end radii differ: ' + a.r + ' vs ' + a.rEnd);
  });

  await ok('Control: every simulated tool-center point is one tool radius from the programmed path (so the control cuts what the simulation shows)', async () => {
    for (const which of ['big', 'floor']) {
      const r = await page.evaluate(w => runComp(w, { comp: 'control' }), which);
      const rd = readComp(r.text, r.inch);
      assert(rd.spans.length > 0, which + ': no compensated stretch (warnings ' + JSON.stringify(r.warn) + ')');
      const sp = rd.spans[0], arcIn = sp.arcs[0], arcOut = sp.arcs[sp.arcs.length - 1];
      const firstRun = []; let go = false; for (const m of r.runs) { if (m.cc === 'on') { if (go) break; go = true; } if (go) firstRun.push(m); }
      assert(firstRun.length > 20, which + ': ' + firstRun.length + ' points');
      let worst = 0, at = null;
      const chk = (m, d) => { if (d > worst) { worst = d; at = [m.x, m.y]; } };
      // the lead arcs are concentric with the programmed ones, one radius inside
      const Rin = Math.hypot(arcIn.from[0] - arcIn.c[0], arcIn.from[1] - arcIn.c[1]), Rout = Math.hypot(arcOut.to[0] - arcOut.c[0], arcOut.to[1] - arcOut.c[1]);
      firstRun.slice(0, 9).forEach(m => chk(m, Math.abs(Math.hypot(m.x - arcIn.c[0], m.y - arcIn.c[1]) - (Rin - r.r))));
      firstRun.slice(-8).forEach(m => chk(m, Math.abs(Math.hypot(m.x - arcOut.c[0], m.y - arcOut.c[1]) - (Rout - r.r))));
      // between them the tool center is one radius from the chain, on the tool side
      firstRun.slice(9, -8).forEach(m => chk(m, Math.abs(distPoly([m.x, m.y], r.chain, true) - r.r)));
      assert(worst < 0.05, `${which}: simulated tool center is ${worst.toFixed(4)} mm from one radius at ${JSON.stringify(at)} (${firstRun.length} points)`);
    }
  });

  await ok('Control: the pocket floor outline (tool inside) posts G41 with the contour on the chain and no collision of the start-up with the walls', async () => {
    const r = await page.evaluate(() => runComp('floor', { comp: 'control', side: 'auto' }));
    const rd = readComp(r.text, r.inch, { minLen: r.r });
    assert.deepStrictEqual(rd.probs, [], JSON.stringify(rd.probs));
    assert(rd.spans.length >= 1 && rd.spans.every(s => /G4[12]/.test(s.g)), 'compensated: ' + JSON.stringify(r.warn));
    const w = walk(rd.spans[0], r.text, r.inch), first = w.arcAt[0], last = w.arcAt[w.arcAt.length - 1];
    const mid = w.pts.slice(first.i1 + 1, last.i0 + 1); let far = 0; for (const p of mid) far = Math.max(far, distPoly(p, r.chain, true));
    assert(mid.length >= 4 && far < 0.01, 'the contour strays ' + far.toFixed(4) + ' mm from the floor outline');
  });

  await ok('Control with stock left: the programmed contour sits exactly the Leave distance outside the chain; D still holds the full radius', async () => {
    const r = await page.evaluate(() => runComp('big', { comp: 'control', leave: 0.5 }));
    const rd = readComp(r.text, r.inch);
    assert.deepStrictEqual(rd.probs, []);
    const w = walk(rd.spans[0], r.text, r.inch), first = w.arcAt[0], last = w.arcAt[w.arcAt.length - 1], mid = w.pts.slice(first.i1 + 1, last.i0 + 1);
    let worst = 0; for (const p of mid) worst = Math.max(worst, Math.abs(distPoly(p, r.chain, true) - 0.5));
    assert(mid.length >= 4 && worst < 0.03, 'contour is ' + worst.toFixed(4) + ' mm from chain + 0.5');
    assert(/PLUS THE STOCK LEFT/.test(r.text), 'the comment says stock is left');
  });

  await ok('Control: Offset register (D) can be set, and Siemens posts G41 without a D word', async () => {
    let r = await page.evaluate(() => runComp('big', { comp: 'control', compD: 12 }));
    let rd = readComp(r.text, r.inch); assert(rd.spans.every(s => s.d === '12'), 'D12: ' + JSON.stringify(rd.spans.map(s => s.d)));
    r = await page.evaluate(() => runComp('big', { comp: 'control', ctrl: 'siemens' }));
    rd = readComp(r.text, r.inch, { noD: true }); assert.deepStrictEqual(rd.probs, [], JSON.stringify(rd.probs));
    assert(rd.spans.length > 0 && rd.spans.every(s => s.d == null), 'Siemens takes the radius from the tool edge: ' + JSON.stringify(rd.spans.map(s => s.d)));
  });

  await ok('Wear and Reverse wear: the program stays the tool-center path, G41 / G42 swap, and the posted path matches the simulation', async () => {
    const w = await page.evaluate(() => runComp('big', { comp: 'wear' })), v = await page.evaluate(() => runComp('big', { comp: 'rwear' }));
    const a = readComp(w.text, w.inch), b = readComp(v.text, v.inch);
    assert.deepStrictEqual(a.probs, [], JSON.stringify(a.probs)); assert.deepStrictEqual(b.probs, [], JSON.stringify(b.probs));
    assert(a.spans.length >= 3 && a.spans.every(s => s.g === 'G42'), 'wear on the right is G42: ' + JSON.stringify(a.spans.map(s => s.g)));
    assert(b.spans.every(s => s.g === 'G41'), 'reverse wear swaps to G41');
    assert(/WEAR COMPENSATION/.test(w.text) && /REVERSE WEAR/.test(v.text), 'comments');
    const dev = await page.evaluate(() => { runComp('big', { comp: 'wear' }); return gDeviation().filter(d => d.err || d.toolpathOffGcode > 0.03 || d.gcodeOffToolpath > 0.03); });
    assert.deepStrictEqual(dev, [], 'wear mode posts the tool-center path: ' + JSON.stringify(dev));
  });

  await ok('Heidenhain: Control posts RR / RL on the start-up block, CC + C arcs under the same compensation, R0 on the cancel block; the contour is the chain', async () => {
    const r = await page.evaluate(() => runComp('big', { comp: 'control', ctrl: 'heidenhain' })), k = r.inch ? 25.4 : 1;
    const L = r.text.split('\n').map(l => l.replace(/^\d+ /, '')), probs = [], spans = [];
    let rc = 'R0', x = null, y = null, cc = null, poly = null;
    const nm = (l, c) => { const m = l.match(new RegExp('(?:^|\\s)' + c + '([+-]?\\d*\\.?\\d+)')); return m ? parseFloat(m[1]) * k : null; };
    L.forEach(l => {
      if (/^CC /.test(l)) { cc = [nm(l, 'X'), nm(l, 'Y')]; return; }
      const mm = l.match(/^(L|C) .*?\b(R[0LR])\b/); if (!mm) return;
      const X = nm(l, 'X'), Y = nm(l, 'Y'), want = mm[2];
      if (want !== 'R0' && rc === 'R0') { if (/FMAX/.test(l)) probs.push('start-up must be a feed move: ' + l); poly = [[x, y]]; spans.push({ rc: want, poly, arcs: 0 }); }
      if (want === 'R0' && rc !== 'R0' && /FMAX/.test(l)) probs.push('cancel must be a feed move: ' + l);
      if (rc !== 'R0' && want !== 'R0' && want !== rc) probs.push('compensation changed inside a stretch: ' + l);
      if (poly && (rc !== 'R0' || want !== 'R0')) {
        if (mm[1] === 'C' && cc) {
          const ccw = /DR\+/.test(l), rr = Math.hypot(x - cc[0], y - cc[1]); let a0 = Math.atan2(y - cc[1], x - cc[0]), a1 = Math.atan2(Y - cc[1], X - cc[0]);
          if (ccw) { while (a1 <= a0 + 1e-9) a1 += 2 * Math.PI; } else { while (a1 >= a0 - 1e-9) a1 -= 2 * Math.PI; }
          const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) * rr / 0.05)); for (let q = 1; q <= n; q++) { const t = a0 + (a1 - a0) * q / n; poly.push([cc[0] + rr * Math.cos(t), cc[1] + rr * Math.sin(t)]); }
          spans[spans.length - 1].arcs++;
        } else poly.push([X == null ? x : X, Y == null ? y : Y]);
      }
      if (X != null) x = X; if (Y != null) y = Y; rc = want;
      if (want === 'R0') poly = null;
    });
    assert(spans.length >= 3, 'compensated stretches: ' + spans.length);
    assert(probs.length === 0 && rc === 'R0', JSON.stringify(probs) + ' ends ' + rc);
    assert(spans.every(sp => sp.rc === 'RR' && sp.arcs === 2), 'tool on the right is RR with a lead-in and a lead-out arc: ' + JSON.stringify(spans.map(sp => [sp.rc, sp.arcs])));
    assert(!/\bG4[12]\b/.test(r.text), 'never G41 / G42');
    const sp = spans[0]; let miss = 0; for (const p of r.chain) miss = Math.max(miss, distPoly(p, sp.poly, false));
    assert(miss < 0.01, 'a chain point is ' + miss.toFixed(4) + ' mm off the programmed contour');
  });

  await ok('A control without compensation (Grbl) gets the tool-center path and a note, never a G41', async () => {
    const r = await page.evaluate(() => runComp('big', { comp: 'control', ctrl: 'grbl' }));
    assert(!/\bG4[12]\b/.test(r.text) && /NOT AVAILABLE FOR THIS OPERATION ON GRBL/.test(r.text), 'grbl: ' + r.text.split('\n').filter(l => /CUTTER|G4[012]/.test(l)).join(' | '));
  });

  await ok('Ramping, tabs and an On-the-line tool stay computer-compensated, with a warning that says why', async () => {
    for (const [set, why] of [[{ comp: 'control', ramp: true }, /ramps/], [{ comp: 'control', tabs: 2 }, /tabs/], [{ comp: 'control', side: 'on' }, /on the line/]]) {
      const r = await page.evaluate(s => runComp('big', s), set);
      assert(!/\bG4[12]\b/.test(r.text) && r.nCC === 0 && r.warn.some(w => why.test(w)), JSON.stringify(set) + ' -> ' + JSON.stringify(r.warn));
    }
  });

  await ok('The panel offers Computer / Control / Wear / Reverse wear, shows D for the compensated ones, and one Undo reverts a change', async () => {
    const r = await page.evaluate(() => { const op = opById(CAMUI.op); op.comp = 'computer'; camRefresh(); return { has: ['Computer', 'Control', 'Wear', 'Reverse wear'].every(l => chainPanelFields(op).includes('>' + l + '<')), d0: /opCompD/.test(chainPanelFields(op)) }; });
    assert(r.has && !r.d0, JSON.stringify(r));
    await page.waitForTimeout(300);
    const h0 = await page.evaluate(() => hist.cur);
    await page.evaluate(() => { const op = opById(CAMUI.op); camEdit(op, 'comp', 'control'); });
    const r2 = await page.evaluate(() => { const op = opById(CAMUI.op); return { comp: op.comp, d: /opCompD/.test(chainPanelFields(op)), h: hist.cur }; });
    assert(r2.comp === 'control' && r2.d && r2.h === h0 + 1, JSON.stringify(r2));
    await page.evaluate(() => undo()); await page.waitForTimeout(300);
    assert(await page.evaluate(() => opById(CAMUI.op).comp) === 'computer', 'undo restores Computer');
  });

  await ok('Verify finds no gouge, holder hit or rapid-through-stock in a Control, Wear or Reverse wear program (the start-up and cancel moves included)', async () => {
    for (const comp of ['control', 'wear', 'rwear']) for (const which of ['big', 'floor']) {
      const r = await page.evaluate(async ([w, c]) => { runComp(w, { comp: c, tool: 1 }); await verifyAndFix(() => {}); const v = VERIFY.report; return v ? { ok: v.ok, issues: v.issues.filter(i => i.type !== 'plunge').map(i => i.type + ' ' + (i.msg || '')).slice(0, 5), fixes: v.fixes.length } : null; }, [which, comp]);
      assert(r && !r.issues.length && !r.fixes, which + ' / ' + comp + ': ' + JSON.stringify(r));
    }
  });

  await ok('Control from a corner start (the default tool on the pocket floor): the start moves to the middle of the longest side, and a picked start that cannot take an arc falls back to computer with a warning', async () => {
    const a = await page.evaluate(() => runComp('floor', { comp: 'control', tool: 1 }));
    assert(readComp(a.text, a.inch).spans.length >= 1 && a.nCC > 0, 'compensated from mid-edge: ' + JSON.stringify(a.warn));
    const b = await page.evaluate(() => { const c = floorChain(), op = opById(CAMUI.op); chainSetMode(op, 'contour'); op.chains = [{ id: 1, rev: false, start: 0, sp: { x: chainTravel(c)[0].x, y: chainTravel(c)[0].y }, ...c }]; Object.assign(op, { comp: 'control', tool: 1, ramp: false, tabs: 0, side: 'auto' }); const P = toolpath(op); return { warn: P.warn, nCC: P.m.filter(m => m.cc).length }; });
    assert(b.nCC === 0 && b.warn.some(w => /no room for the start-up/.test(w)), JSON.stringify(b));
  });

  await ok('the page raised no errors', async () => { assert.deepStrictEqual(errs, [], errs.join('\n')); });
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
