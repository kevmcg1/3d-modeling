// Zebra Stripes and Curvature (analysis.js).
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/design.analysis.e2e.js
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
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await page.waitForTimeout(1500);
  const P = (id, shape, extra) => Object.assign({ id, type: 'primitive', name: 'P' + id, shape, base: 'XY', cx: 0, cy: 0, off: 0, op: 'new', w: 40, d: 30, h: 10, dia: 20, dia2: 0, tube: 6, center: true, sit: true }, extra || {});
  const open = (F, act) => page.evaluate(([F, act]) => { loadDoc({ features: F, next: 200 }, 'x'); setWorkspace('model'); applyModel(evaluate(0.05), { tol: 0.05 }); document.querySelector(`[data-act="${act}"]`).click(); return CMD && CMD.kind; }, [F, act]);
  await ok('curvature reads the radius of a cylinder, flags a tight inside corner and keeps outside rounds blue', async () => {
    const hole = P(11, 'cyl', { op: 'cut', dia: 6, h: 10 });                // a 3 mm radius hole through the plate
    const r = await page.evaluate(([F]) => {
      loadDoc({ features: F, next: 200 }, 'x'); setWorkspace('model'); applyModel(evaluate(0.05), { tol: 0.05 });
      const R = ANALYSIS.curvatureScan(); return { rows: R.rows.map(x => [+x.r.toFixed(3), x.concave]), tightest: R.tightest, n: R.items.length };
    }, [[P(10, 'box'), hole]]);
    assert(r.rows.length >= 1 && r.n > 0, JSON.stringify(r)); close(r.tightest, 3, 1e-6, 'tightest inside radius'); assert(r.rows.every(x => x[1]), 'the hole is inside');
    const o = await page.evaluate(([F]) => { loadDoc({ features: F, next: 200 }, 'x'); applyModel(evaluate(0.05), { tol: 0.05 }); return ANALYSIS.curvatureScan().rows.map(x => [+x.r.toFixed(3), x.concave]); }, [[P(10, 'cyl', { dia: 20 })]]);
    assert.deepStrictEqual(o, [[10, false]], 'a boss is an outside round');
  });
  await ok('the Curvature panel opens, shows the table and a cutter limit flags the hole red', async () => {
    const kind = await open([P(10, 'box'), P(11, 'cyl', { op: 'cut', dia: 6, h: 10 })], 'i:curv');
    assert.strictEqual(kind, 'curv');
    const r = await page.evaluate(() => { const t1 = panel.textContent; ANALYSIS.CV.min = 5; refreshPanel(); return { t1, t2: panel.textContent, groups: FUSION1.grp.children.length }; });
    assert(/Tightest inside radius/.test(r.t1) && /inside/.test(r.t1), r.t1.slice(0, 200)); assert(/none/.test(r.t1), 'a 3 mm cutter reaches a 3 mm hole'); assert(/1 radii|radii/.test(r.t2) && !/none/.test(r.t2), 'a 5 mm cutter does not: ' + r.t2.slice(0, 300));
    assert(r.groups >= 1, 'the faces are painted');
  });
  await ok('zebra stripes: the panel opens and a shader overlay covers every face, with analytic normals on a cylinder', async () => {
    const kind = await open([P(10, 'cyl', { dia: 20 })], 'i:zebra');
    assert.strictEqual(kind, 'zebra');
    const r = await page.evaluate(() => {
      const m = FUSION1.grp.children[0], n = m.geometry.attributes.normal, pos = m.geometry.attributes.position;
      let radial = 0, side = 0;
      for (let i = 0; i < n.count; i++) { const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i), x = pos.getX(i), y = pos.getY(i); if (Math.abs(nz) < 1e-6 && Math.hypot(x, y) > 9.9) { side++; if (Math.abs(nx * x + ny * y) / Math.hypot(x, y) > 0.999) radial++; } }
      return { shader: m.material.type === 'ShaderMaterial', verts: pos.count, side, radial, panel: /Stripes run across/.test(panel.textContent) };
    });
    assert(r.shader && r.verts > 12 && r.panel, JSON.stringify(r)); assert(r.side > 0 && r.radial === r.side, 'side normals point straight out: ' + JSON.stringify(r));
  });
  await ok('zebra axis and spacing controls repaint; other tools still work after closing', async () => {
    const r = await page.evaluate(() => {
      const before = FUSION1.grp.children[0].material.uniforms.uAxis.value.toArray();
      document.querySelector('button[data-an-z="ax"][data-v="X"]').click();
      const after = FUSION1.grp.children[0].material.uniforms.uAxis.value.toArray();
      const f0 = FUSION1.grp.children[0].material.uniforms.uFreq.value; const sl = document.querySelector('input[data-an-z="width"]'); sl.value = 4; sl.dispatchEvent(new Event('input'));
      return { before, after, f0, f1: FUSION1.grp.children[0].material.uniforms.uFreq.value };
    });
    assert.deepStrictEqual(r.before, [0, 1, 0]); assert.deepStrictEqual(r.after, [1, 0, 0]); assert(r.f1 > r.f0, 'smaller spacing = more stripes');
  });
  await ok('ribbon buttons and hover cards exist', async () => {
    const r = await page.evaluate(() => ['i:zebra', 'i:curv'].map(a => [!!document.querySelector(`[data-act="${a}"]`), !!TIP_TXT[a]]));
    assert.deepStrictEqual(r, [[true, true], [true, true]]);
  });
  await ok('no page errors', async () => assert.deepStrictEqual(errs, []));
  console.log(`${pass} passed, ${fail} failed`); await browser.close(); process.exit(fail ? 1 : 0);
})();
