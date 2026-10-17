// Mates (mates.js).
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/design.mate.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 700)); } };
const close = (a, b, tol, what) => assert(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (±${tol})`);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' }));
  await page.goto('file://' + path.resolve(__dirname, '..', '3d-modeler.html')); await page.waitForTimeout(1500);
  // two boxes apart in x; a mate then moves the second one
  const run = (mtype, offset, shapeB, kindA, kindB) => page.evaluate(([mtype, offset, shapeB, kindA, kindB]) => {
    const P = (id, shape, cx, extra) => Object.assign({ id, type: 'primitive', name: 'P' + id, shape, base: 'XY', cx, cy: 0, off: 0, op: 'new', w: 20, d: 20, h: 10, dia: 12, dia2: 0, tube: 6, center: true, sit: true }, extra || {});
    const F0 = [P(10, 'box', 0), P(11, shapeB, 60)];
    loadDoc({ features: F0, next: 200 }, 'x'); const c0 = evaluate(0.05), [b0, b1] = c0.bodies;
    const pick = (b, kind, dirn) => { const m = bodyMesh(b), p = kind === 'C' ? b.polys.find(q => Surf.list[q.f].t === 'C') : b.polys.filter(q => Surf.list[q.f].t === 'P').sort((u, v) => dirn * (v.n[1] - u.n[1]))[0]; return faceRef(m, p.f, faceInfo(m, p.f).on); };
    const a = pick(b1, kindA, 1), b = pick(b0, kindB, -1);   // moving: top-most normal; fixed: bottom-most normal
    loadDoc({ features: [...F0, { id: 12, type: 'mate', name: 'M', mtype, a, b, offset }], next: 200 }, 'x'); const c = evaluate(0.05);
    return { errors: c.errors, before: [b0.bb, b1.bb], after: c.bodies.map(x => x.bb) };
  }, [mtype, offset, shapeB, kindA, kindB]);
  await ok('coincident: the top face of the moving box lands on the bottom face of the fixed one', async () => {
    const r = await run('coincident', 0, 'box', 'P', 'P');
    assert.deepStrictEqual(r.errors, {}, JSON.stringify(r));
    close(r.after[1][4], r.after[0][1], 1e-6, 'moving max y meets fixed min y'); close(r.after[0][1], r.before[0][1], 1e-9, 'fixed body unmoved');
  });
  await ok('coincident with an offset leaves that gap', async () => {
    const r = await run('coincident', 7, 'box', 'P', 'P');
    close(r.after[0][1] - r.after[1][4], 7, 1e-6, 'gap');
  });
  await ok('flush: the faces end up in one plane', async () => {
    const r = await run('flush', 0, 'box', 'P', 'P');
    assert.deepStrictEqual(r.errors, {}); close(r.after[1][1], r.after[0][1], 1e-6, 'coplanar');
  });
  await ok('concentric: a cylinder\'s axis lines up with the other cylinder\'s axis', async () => {
    const r = await page.evaluate(() => {
      const P = (id, cx, dia) => ({ id, type: 'primitive', name: 'P' + id, shape: 'cyl', base: 'XY', cx, cy: 0, off: 0, op: 'new', w: 20, d: 20, h: 10, dia, dia2: 0, tube: 6, center: true, sit: true });
      const F0 = [P(10, 0, 20), P(11, 60, 10)];
      loadDoc({ features: F0, next: 200 }, 'x'); const [b0, b1] = evaluate(0.05).bodies;
      const side = b => { const m = bodyMesh(b), p = b.polys.find(q => Surf.list[q.f].t === 'C'); return faceRef(m, p.f, faceInfo(m, p.f).on); };
      loadDoc({ features: [...F0, { id: 12, type: 'mate', name: 'M', mtype: 'concentric', a: side(b1), b: side(b0), offset: 0 }], next: 200 }, 'x'); const c = evaluate(0.05);
      const cen = b => [(b.bb[0] + b.bb[3]) / 2, (b.bb[2] + b.bb[5]) / 2];
      return { errors: c.errors, c0: cen(c.bodies[0]), c1: cen(c.bodies[1]) };
    });
    assert.deepStrictEqual(r.errors, {}, JSON.stringify(r)); close(r.c0[0], r.c1[0], 0.1, 'x'); close(r.c0[1], r.c1[1], 0.1, 'z');
  });
  await ok('errors: same body, missing faces and a wrong face kind', async () => {
    const r = await page.evaluate(() => {
      const P = (id, cx) => ({ id, type: 'primitive', name: 'P' + id, shape: 'box', base: 'XY', cx, cy: 0, off: 0, op: 'new', w: 20, d: 20, h: 10, dia: 12, dia2: 0, tube: 6, center: true, sit: true });
      const F0 = [P(10, 0), P(11, 60)]; loadDoc({ features: F0, next: 200 }, 'x'); const [b0, b1] = evaluate(0.05).bodies;
      const fr = (b, i) => { const m = bodyMesh(b), p = b.polys.filter(q => Surf.list[q.f].t === 'P')[i]; return faceRef(m, p.f, faceInfo(m, p.f).on); };
      const e = M => { loadDoc({ features: [...F0, Object.assign({ id: 12, type: 'mate', name: 'M', mtype: 'coincident', offset: 0 }, M)], next: 200 }, 'x'); return evaluate(0.05).errors[12] || ''; };
      return [e({ a: null, b: null }), e({ a: fr(b0, 0), b: fr(b0, 1) }), e({ a: fr(b1, 0), b: fr(b0, 0), mtype: 'concentric' })];
    });
    assert(/pick/i.test(r[0]) && /different bodies/i.test(r[1]) && /round/i.test(r[2]), JSON.stringify(r));
  });
  await ok('the ribbon button opens the tool and picking two faces makes it ready', async () => {
    const r = await page.evaluate(() => {
      const P = (id, cx) => ({ id, type: 'primitive', name: 'P' + id, shape: 'box', base: 'XY', cx, cy: 0, off: 0, op: 'new', w: 20, d: 20, h: 10, dia: 12, dia2: 0, tube: 6, center: true, sit: true });
      loadDoc({ features: [P(10, 0), P(11, 60)], next: 200 }, 'x'); setWorkspace('model'); applyModel(evaluate(0.05), { tol: 0.05 });
      document.querySelector('[data-act="f:mate"]').click();
      return { open: CMD && CMD.kind === 'mate', panel: /Moving face/.test(panel.innerHTML) && /Concentric/.test(panel.innerHTML), ready: FEATS.mate.ready(CMD.f), tip: !!TIP_TXT['f:mate'] };
    });
    assert(r.open && r.panel && !r.ready && r.tip, JSON.stringify(r));
  });
  await ok('no page errors', async () => assert.deepStrictEqual(errs, []));
  console.log(`${pass} passed, ${fail} failed`); await browser.close(); process.exit(fail ? 1 : 0);
})();
