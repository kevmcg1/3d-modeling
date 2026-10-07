// Fusion-style modeling, batch 4: Boundary Fill, the two-distance and distance-angle chamfer, and the button / panel for each.
// Volumes are compared with exact formulas.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/design.fusion4.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (index.html loads them from CDNs)'); process.exit(0); }
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
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await page.waitForTimeout(1500);
  const run = feats => page.evaluate(F => {
    loadDoc({ features: F, next: 200 }, 'x');
    const c = evaluate(0.05), vol = b => { let v = 0; for (const p of b.polys) for (let i = 1; i + 1 < p.v.length; i++) v += dot3(p.v[0], crs3(p.v[i], p.v[i + 1])) / 6; return v; };
    return { errors: c.errors, bodies: c.bodies.map(b => ({ id: b.id, vol: vol(b), bb: b.bb.map(x => +x.toFixed(3)) })) };
  }, feats);
  const box = (id, op, cx, cy, off, w, d, h) => ({ id, type: 'primitive', name: 'Box' + id, shape: 'box', base: 'XY', cx, cy, off, op, w, d, h, dia: 10, dia2: 0, tube: 6, center: true, sit: true });
  const bfill = (id, bodies, remove = false) => ({ id, type: 'bfill', name: 'Boundary Fill' + id, bodies, remove });

  await ok('boundary fill: a void inside a block becomes a 10 × 10 × 10 body', async () => {
    const r = await run([box(10, 'new', 0, 0, 0, 30, 30, 30), box(11, 'cut', 0, 0, 10, 10, 10, 10), bfill(12, [10])]);
    assert.deepStrictEqual(r.errors, {}); assert.strictEqual(r.bodies.length, 2, 'bodies: ' + JSON.stringify(r.bodies));
    const vols = r.bodies.map(b => b.vol).sort((a, b) => a - b); close(vols[0], 1000, 1, 'cell'); close(vols[1], 27000 - 1000, 1, 'block with the void');
  });
  await ok('boundary fill: a cup closed by a lid fills the 20 × 20 × 14 space under the lid (the lid overlaps the rim by 1)', async () => {
    const r = await run([box(10, 'new', 0, 0, 0, 30, 30, 20), box(11, 'cut', 0, 0, 5, 20, 20, 20), box(12, 'new', 0, 0, 19, 30, 30, 5), bfill(13, [10, 12])]);
    assert.deepStrictEqual(r.errors, {}); const cell = r.bodies.find(b => Math.abs(b.id - 13.001) < 1e-6); assert(cell, 'no cell body: ' + JSON.stringify(r.bodies));
    close(cell.vol, 20 * 20 * 14, 2, 'cell volume (the space under the lid: z 5 to 19)');
  });
  await ok('boundary fill: "Remove the tools" leaves only the filled space', async () => {
    const r = await run([box(10, 'new', 0, 0, 0, 30, 30, 30), box(11, 'cut', 0, 0, 10, 10, 10, 10), bfill(12, [10], true)]);
    assert.deepStrictEqual(r.errors, {}); assert.strictEqual(r.bodies.length, 1); close(r.bodies[0].vol, 1000, 1, 'only the cell');
  });
  await ok('boundary fill: two bodies that enclose nothing say so', async () => {
    const r = await run([box(10, 'new', 0, 0, 0, 20, 20, 20), box(11, 'new', 10, 0, 0, 20, 20, 20), bfill(12, [10, 11])]);
    assert(/No closed space/.test(r.errors[12] || ''), JSON.stringify(r.errors)); assert.strictEqual(r.bodies.length, 2);
  });
  await ok('boundary fill: the ribbon has a button and the panel opens', async () => {
    const r = await page.evaluate(() => {
      loadDoc({ features: [{ id: 10, type: 'primitive', name: 'B', shape: 'box', base: 'XY', cx: 0, cy: 0, off: 0, op: 'new', w: 30, d: 30, h: 30, dia: 10, dia2: 0, tube: 6, center: true, sit: true }], next: 200 }, 'x');
      setWorkspace('model'); const b = document.querySelector('[data-act="f:bfill"]'); if (!b) return { btn: false };
      b.click(); const open = !!CMD && CMD.f && CMD.f.type === 'bfill'; const html = open ? panel.innerHTML : ''; cancelCmd();
      return { btn: true, open, html: /Boundary Fill/.test(html) };
    });
    assert(r.btn, 'no Boundary Fill button'); assert(r.open && r.html, JSON.stringify(r));
  });
  await ok('chamfer panel: the three types switch and the feature keeps its numbers', async () => {
    const r = await page.evaluate(() => {
      loadDoc({ features: [{ id: 10, type: 'primitive', name: 'B', shape: 'box', base: 'XY', cx: 0, cy: 0, off: 0, op: 'new', w: 30, d: 30, h: 30, dia: 10, dia2: 0, tube: 6, center: true, sit: true }], next: 200 }, 'x');
      setWorkspace('model'); cmdEdge('chamfer'); const out = {};
      for (const m of ['two', 'angle', 'eq']) { document.querySelector(`[data-cm="${m}"]`).click(); out[m] = { cmode: CMD.f.cmode, size2: CMD.f.size2, angle: CMD.f.angle, inputs: ['edgeSize2', 'edgeAngle'].map(i => !!document.getElementById(i)) }; }
      cancelCmd(); return out;
    });
    assert.strictEqual(r.two.cmode, 'two'); assert(r.two.size2 > 0 && r.two.inputs[0] && !r.two.inputs[1], JSON.stringify(r.two));
    assert.strictEqual(r.angle.cmode, 'angle'); assert(r.angle.angle > 0 && r.angle.inputs[1] && !r.angle.inputs[0], JSON.stringify(r.angle));
    assert.strictEqual(r.eq.cmode, 'eq'); assert(!r.eq.inputs[0] && !r.eq.inputs[1], JSON.stringify(r.eq));
  });
  await ok('no page errors', async () => assert.deepStrictEqual(errs, [], errs.join('\n')));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
