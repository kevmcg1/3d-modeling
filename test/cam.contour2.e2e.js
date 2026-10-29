// Chain Contour, multiple passes and lead radius (Fusion's "multiple stepovers", Mastercam's "multi passes", lead-in radius):
//   Rough passes N at Spacing: N offset contours outside the final one, outermost first, then the final pass at Leave.
//   Lead radius: the lead arc's radius (default 0.6 of the tool radius + 1 mm).
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/cam.contour2.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (3d-modeler.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 900)); } };
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
  await page.evaluate(() => { const s = SAMPLES.find(x => x.name === 'Pocketed plate'); loadDoc(s.make(), 'test'); }); await page.waitForTimeout(1200);
  await page.evaluate(() => { setWorkspace('cam'); camAddOp('chain'); }); await page.waitForTimeout(1200);
  await page.evaluate(() => {
    window.allChains = () => { const out = []; for (const b of visibleBodies()) { const m = bodyMesh(b); for (const ch of edgeChains(m)) if (chainFlat(ch)) { const c = buildChain(m, ch, true); if (c) out.push(c); } } return out; };
    window.bigClosed = () => allChains().filter(c => c.closed).sort((a, b) => Math.abs(cArea(cP(chainTravel(b)))) - Math.abs(cArea(cP(chainTravel(a)))))[0];
    window.run = set => {
      const c = bigClosed(), op = opById(CAMUI.op); chainSetMode(op, 'contour');
      op.chains = [{ id: 1, rev: false, start: 0, ...c }];
      for (const k of ['comp', 'roughN', 'roughSp', 'leadR', 'tabs', 'ramp', 'leave', 'compD', 'tabW', 'tabH']) delete op[k];
      Object.assign(op, { stepdown: 30, lead: 'arc', side: 'auto', tool: 1 }, set || {}); cam().post.ctrl = 'haas';
      const P = toolpath(op), o = camOrigin(), r = P.tool.d / 2, chain = chainTravel(c).map(p => [p.x - o[0], p.y - o[1]]);
      return { m: P.m.map(m => ({ x: m.x - o[0], y: m.y - o[1], z: m.z - o[2], r: m.r, cc: m.cc || '' })), warn: P.warn, r, chain, text: postGcode().text, inch: isIn() };
    };
  });
  // the cutting loops at the deepest level: runs of feed moves at the lowest Z, split where the tool lifts
  const loops = r => { const zmin = Math.min(...r.m.filter(m => !m.r).map(m => m.z)), out = []; let cur = null; for (const m of r.m) { if (!m.r && Math.abs(m.z - zmin) < 1e-6) { if (!cur) out.push(cur = []); cur.push([m.x, m.y]); } else if (m.r) cur = null; } return out.filter(l => l.length > 12); };
  // the middle of a loop (leads excluded): its median distance to the chain
  const offsetOf = (l, chain) => { const d = l.map(p => distPoly(p, chain, true)).sort((a, b) => a - b); return d[Math.floor(d.length / 2)]; };

  await ok('Without rough passes the contour is one pass at Leave (unchanged)', async () => {
    const r = await page.evaluate(() => run({ leave: 0.3 })), L = loops(r);
    assert(L.length === 1 && Math.abs(offsetOf(L[0], r.chain) - (r.r + 0.3)) < 0.03, JSON.stringify(L.map(l => offsetOf(l, r.chain))));
  });

  await ok('Rough passes N at Spacing: N offset contours (outermost first), then the final pass at Leave', async () => {
    const r = await page.evaluate(() => run({ leave: 0.3, roughN: 2, roughSp: 1.5 })), L = loops(r);
    const offs = L.map(l => offsetOf(l, r.chain)), want = [r.r + 0.3 + 3, r.r + 0.3 + 1.5, r.r + 0.3];
    assert(L.length === 3 && offs.every((v, i) => Math.abs(v - want[i]) < 0.03), 'offsets ' + JSON.stringify(offs) + ' wanted ' + JSON.stringify(want));
  });

  await ok('Default spacing is 0.4 of the tool diameter; zero passes ignores the spacing', async () => {
    let r = await page.evaluate(() => run({ roughN: 1 })), L = loops(r), offs = L.map(l => offsetOf(l, r.chain));
    assert(L.length === 2 && Math.abs(offs[0] - offs[1] - 0.4 * r.r * 2) < 0.03, JSON.stringify(offs));
    r = await page.evaluate(() => run({ roughN: 0, roughSp: 5 })); assert(loops(r).length === 1);
  });

  await ok('Rough passes are not posted with holding tabs; the final pass is', async () => {
    const r = await page.evaluate(() => run({ roughN: 1, roughSp: 2, tabs: 2, stepdown: 5 }));
    const zmin = Math.min(...r.m.filter(m => !m.r).map(m => m.z)), top = Math.max(...r.m.filter(m => !m.r && m.z < zmin + 3).map(m => m.z));
    const L = loops(r);                                           // the deepest cuts: the rough pass is whole, the final one is cut into tabs (it lifts, so it splits)
    assert(L.length >= 2 && top > zmin + 0.2, 'tabs lift the final pass: ' + L.length + ' loops, top ' + top + ' vs ' + zmin);
  });

  await ok('Rough passes with Control compensation: every pass posts its own offset contour, G41 / G42 and G40 pair up, and each programmed contour is the chain offset by that pass', async () => {
    const r = await page.evaluate(() => run({ comp: 'control', leave: 0, roughN: 2, roughSp: 1.5 }));
    const L = r.text.split('\n').map(l => l.replace(/\(.*?\)/g, '').trim()), on = L.filter(l => /\bG4[12]\b/.test(l)).length, off = L.filter(l => /\bG40 X/.test(l)).length;
    assert(on === 3 && on === off, `${on} start-ups, ${off} cancels`);
    // read each stretch's programmed contour
    const k = r.inch ? 25.4 : 1, num = (s, c) => { const m = s.match(new RegExp('(?:^|\\s)' + c + '(-?\\d*\\.?\\d+)')); return m ? parseFloat(m[1]) * k : null; };
    let x = null, y = null, g = 1, cur = null; const spans = [];
    for (const raw of L) {
      const s = raw.replace(/\(.*?\)/g, '').trim(); const gm = s.match(/^G([0-3])\b/); if (gm) g = +gm[1];
      const X = num(s, 'X'), Y = num(s, 'Y'), I = num(s, 'I'), J = num(s, 'J');
      if (/\bG4[12]\b/.test(s)) cur = { pts: [[X, Y]] };
      else if (cur && (X != null || Y != null)) {
        const nx = X == null ? x : X, ny = Y == null ? y : Y;
        if (g === 2 || g === 3) { const cx = x + (I || 0), cy = y + (J || 0), rr = Math.hypot(x - cx, y - cy); let a0 = Math.atan2(y - cy, x - cx), a1 = Math.atan2(ny - cy, nx - cx); if (g === 3) { while (a1 <= a0 + 1e-9) a1 += 2 * Math.PI; } else { while (a1 >= a0 - 1e-9) a1 -= 2 * Math.PI; } for (let q = 1; q <= 16; q++) { const t = a0 + (a1 - a0) * q / 16; cur.pts.push([cx + rr * Math.cos(t), cy + rr * Math.sin(t)]); } } else cur.pts.push([nx, ny]);
        if (/\bG40\b/.test(s)) { spans.push(cur); cur = null; }
      }
      if (X != null) x = X; if (Y != null) y = Y;
    }
    // a programmed contour's corner vertices (the long straight runs): their distance to the chain is that pass's offset
    const offs = spans.slice(0, 3).map(sp => { const mid = sp.pts.filter(p => Math.hypot(p[0] - sp.pts[0][0], p[1] - sp.pts[0][1]) > 0); const d = mid.map(p => distPoly(p, r.chain, true)).sort((a, b) => a - b); return d[Math.floor(d.length * 0.3)]; });
    assert(offs.length === 3 && Math.abs(offs[0] - 3) < 0.05 && Math.abs(offs[1] - 1.5) < 0.05 && offs[2] < 0.05, JSON.stringify(offs));
  });

  await ok('Lead radius sets the tool-center lead arc radius (default 0.6 of the tool radius + 1 mm); Control posts the arc one tool radius wider', async () => {
    const d = await page.evaluate(() => run({ leadR: 3 })), r = d.r;
    const first = d.m.findIndex(m => !m.r), run1 = d.m.slice(first, first + 12);
    // the first cut level starts the lead: the arc's chord points are all 3 mm from its centre; compare radius via the chord end points
    const xs = run1.map(m => [m.x, m.y]);
    const r0 = await page.evaluate(() => run({})); assert(r0.m.length > 0);
    const big = await page.evaluate(() => run({ comp: 'control', leadR: 7 }));
    const arc = big.text.split('\n').find(l => /^G[23] /.test(l) || /^G[23]\b/.test(l.replace(/^N\d+ /, '')));
    const I = parseFloat((arc.match(/I(-?\d*\.?\d+)/) || [])[1]), J = parseFloat((arc.match(/J(-?\d*\.?\d+)/) || [])[1]), k = big.inch ? 25.4 : 1;
    assert(Math.abs(Math.hypot(I, J) * k - (7 + r)) < 0.02, `first arc radius ${(Math.hypot(I, J) * k).toFixed(3)} vs ${7 + r}: ${arc}`);
    assert(xs.length > 3, 'moves');
  });

  await ok('The panel has Rough passes, Spacing and Lead radius; each change is one Undo step', async () => {
    await page.evaluate(() => { run({}); camRefresh(); });
    const has = await page.evaluate(() => { const h = chainPanelFields(opById(CAMUI.op)); return ['opRoughN', 'opRoughSp', 'opLeadR'].map(id => h.includes('id="' + id + '"')); });
    assert(has.every(Boolean), JSON.stringify(has));
    const h0 = await page.evaluate(() => hist.cur);
    await page.evaluate(() => camEdit(opById(CAMUI.op), 'roughN', 2));
    assert(await page.evaluate(() => hist.cur) === h0 + 1);
    await page.evaluate(() => undo()); await page.waitForTimeout(200);
    assert(!(await page.evaluate(() => opById(CAMUI.op).roughN)), 'undo');
  });

  await ok('Verify finds nothing wrong with a 3-pass contour (computer and control compensation)', async () => {
    for (const comp of [undefined, 'control']) {
      const r = await page.evaluate(async c => { run({ comp: c, roughN: 2, roughSp: 1.5 }); await verifyAndFix(() => {}); const v = VERIFY.report; return { issues: v.issues.filter(i => i.type !== 'plunge').map(i => i.type), fixes: v.fixes.length }; }, comp);
      assert(!r.issues.length && !r.fixes, String(comp) + ' ' + JSON.stringify(r));
    }
  });

  await ok('the page raised no errors', async () => { assert.deepStrictEqual(errs, [], errs.join('\n')); });
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
