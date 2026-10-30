// Table Driven Pattern, Fill Pattern and Configurations (patterns2.js).
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/design.patterns2.e2e.js
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
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' })); await page.route(/gate\.js/, r => r.abort());
  await page.addInitScript(() => { window.DATUM_NOFX = true; }); await page.goto('file://' + path.resolve(__dirname, '..', '3d-modeler.html')); await page.waitForTimeout(1500);
  await ok('table driven pattern: each row makes one copy at the typed offset (X right, Y back, Z up) and turn', async () => {
    const r = await page.evaluate(() => {
      const B = { id: 10, type: 'primitive', name: 'B', shape: 'box', base: 'XY', cx: 0, cy: 0, off: 0, op: 'new', w: 10, d: 10, h: 10, dia: 12, dia2: 0, tube: 6, center: true, sit: true };
      loadDoc({ features: [B, { id: 11, type: 'tabpat', name: 'T', bodies: [10], rows: [{ dx: 30, dy: 0, dz: 0, rz: 0 }, { dx: 0, dy: 40, dz: 0, rz: 0 }, { dx: 0, dy: 0, dz: 25, rz: 0 }], join: false }], next: 200 }, 'x');
      const c = evaluate(0.05), bb = i => c.bodies[i].bb.map(v => +v.toFixed(3));
      loadDoc({ features: [B, { id: 11, type: 'tabpat', name: 'T', bodies: [10], rows: [{ dx: 0, dy: 0, dz: 0, rz: 45 }], join: false }], next: 200 }, 'x'); const c2 = evaluate(0.05);
      loadDoc({ features: [B, { id: 11, type: 'tabpat', name: 'T', bodies: [10], rows: [], join: false }], next: 200 }, 'x');
      return { errors: c.errors, n: c.bodies.length, b0: bb(0), b1: bb(1), b2: bb(2), b3: bb(3), rot: c2.bodies[1].bb, e: evaluate(0.05).errors[11] };
    });
    assert.deepStrictEqual(r.errors, {}); assert.strictEqual(r.n, 4);
    close(r.b1[0] - r.b0[0], 30, 1e-6, 'x copy'); close(r.b2[2] - r.b0[2], -40, 1e-6, 'back (internal -z)'); close(r.b3[1] - r.b0[1], 25, 1e-6, 'up (internal y)');
    close(r.rot[3] - r.rot[0], 10 * Math.SQRT2, 0.01, 'a 45° turn widens the box to its diagonal'); assert(/row/i.test(r.e), r.e);
  });
  await ok('fill pattern: a 10 mm box on a 60 × 40 plate with 20 mm spacing and 5 mm margin fills the grid and leaves the rest', async () => {
    const r = await page.evaluate(() => {
      const plate = { id: 10, type: 'primitive', name: 'Plate', shape: 'box', base: 'XY', cx: 0, cy: 0, off: 0, op: 'new', w: 60, d: 40, h: 4, dia: 12, dia2: 0, tube: 6, center: true, sit: true };
      const post = { id: 11, type: 'primitive', name: 'Post', shape: 'box', base: 'XY', cx: 0, cy: 0, off: 4, op: 'new', w: 6, d: 6, h: 6, dia: 12, dia2: 0, tube: 6, center: true, sit: true };
      loadDoc({ features: [plate, post], next: 200 }, 'x'); const c0 = evaluate(0.05), pb = c0.bodies[0], m = bodyMesh(pb);
      const top = pb.polys.filter(p => p.n[2] > 0.99).sort((a, b) => b.v[0][2] - a.v[0][2])[0], ref = faceRef(m, top.f, faceInfo(m, top.f).on);
      const F = o => ({ id: 12, type: 'fillpat', name: 'F', bodies: [11], face: ref, kind: 'grid', sx: 20, sy: 20, margin: 5, join: false, ...o });
      const run = o => { loadDoc({ features: [plate, post, F(o)], next: 200 }, 'x'); const c = evaluate(0.05); return { e: c.errors, n: c.bodies.length - 2, bb: c.bodies.slice(2).map(b => b.bb.map(v => +v.toFixed(2))) }; };
      return { grid: run({}), hex: run({ kind: 'hex', sx: 20 }), none: run({ sx: 500 }), bad: run({ sx: 0 }) };
    });
    assert.deepStrictEqual(r.grid.e, {}, JSON.stringify(r.grid));
    // lattice anchored at the post (the plate centre): x in -30..30 minus margin → -20,0,20 ; y in -20..20 minus margin → -20? (margin 5 from ±20 → |y| ≤ 15) → 0 only ⇒ 3 x 1 spots minus the seed = 2
    assert.strictEqual(r.grid.n, 2, JSON.stringify(r.grid));
    assert(r.hex.n >= 2 && !Object.keys(r.hex.e).length, JSON.stringify(r.hex));
    assert(/no copy fits|fits/i.test(r.none.e[12] || '') || r.none.n === 0, JSON.stringify(r.none)); assert(/spacing/i.test(r.bad.e[12] || ''), JSON.stringify(r.bad.e));
  });
  await ok('configurations: save, edit, switch and load a CSV design table', async () => {
    const r = await page.evaluate(() => {
      const B = { id: 10, type: 'primitive', name: 'B', shape: 'box', base: 'XY', cx: 0, cy: 0, off: 0, op: 'new', w: 10, d: 10, h: 10, dia: 12, dia2: 0, tube: 6, center: true, sit: true, expr: { w: 'width' } };
      loadDoc({ features: [B], params: [{ name: 'width', expr: '10' }, { name: 'gap', expr: '2' }], next: 200 }, 'x'); setWorkspace('model'); applyModel(evaluate(0.05), { tol: 0.05 });
      document.querySelector('[data-act="i:configs"]').click();
      document.querySelector('[data-cf-add]').click();                              // Config 1 = width 10
      doc.params[0].expr = '30'; document.querySelector('[data-cf-add]').click();   // Config 2 = width 30
      const w = () => { const c = evaluate(0.05), b = c.bodies[0].bb; return +(b[3] - b[0]).toFixed(3); };
      const out = { names: doc.configs.map(c => c.name), vals: doc.configs.map(c => c.vals.width) };
      CONFIGS.activate(0); out.w1 = w(); out.active = doc.activeConfig;
      CONFIGS.activate(1); out.w2 = w();
      CONFIGS.loadCsv('parameter,Small,Big\nwidth,5,50\ngap,1,4'); out.loaded = doc.configs.map(c => [c.name, c.vals.width, c.vals.gap]);
      CONFIGS.activate(1); out.w3 = w(); out.csv = CONFIGS.parseCsv('a,"b,c"\n1,2').flat();
      return out;
    });
    assert.deepStrictEqual(r.names, ['Config 1', 'Config 2']); assert.deepStrictEqual(r.vals, ['10', '30']);
    close(r.w1, 10, 1e-6, 'config 1'); close(r.w2, 30, 1e-6, 'config 2'); assert.strictEqual(r.active, 'Config 1');
    assert.deepStrictEqual(r.loaded, [['Small', '5', '1'], ['Big', '50', '4']]); close(r.w3, 50, 1e-6, 'Big'); assert.deepStrictEqual(r.csv, ['a', 'b,c', '1', '2']);
  });
  await ok('ribbon buttons open the tools', async () => {
    const r = await page.evaluate(() => {
      loadDoc({ features: [], params: [{ name: 'w', expr: '1' }], next: 200 }, 'x'); setWorkspace('model'); const out = {};
      for (const a of ['f:tabpat', 'f:fillpat', 'i:configs']) { const b = document.querySelector(`[data-act="${a}"]`); out[a] = !!b && !!TIP_TXT[a]; if (b) { b.click(); out[a] = out[a] && !!CMD; cancelCmd(); } }
      return out;
    });
    assert(Object.values(r).every(Boolean), JSON.stringify(r));
  });
  await ok('no page errors', async () => assert.deepStrictEqual(errs, []));
  console.log(`${pass} passed, ${fail} failed`); await browser.close(); process.exit(fail ? 1 : 0);
})();
