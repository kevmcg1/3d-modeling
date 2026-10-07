// Every toolpath type, run on its own: it must plan without an error, make finite moves inside the stock, and post G-code that passes the machine check.
// Auto Program is covered by cam.qa.e2e.js; this runs each operation alone (face, contour, pocket, every drill cycle, 3D finishing strategies, Z-level, engraving, thread mill).
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/cam.ops.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (index.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 700)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' }));
  await page.route(/fonts\.g/, r => r.abort());
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await page.waitForTimeout(2000);
  await page.addScriptTag({ path: path.resolve(__dirname, 'lib', 'gcode-check.js') });
  // loads the part, adds one operation, waits for its path, and reports what came out
  const runOp = (part, spec) => page.evaluate(async ([part, spec]) => {
    const e0 = camEpoch; loadDoc(SAMPLES.find(x => x.name === part).make(), 'test'); setWorkspace('cam');
    for (let i = 0; i < 200 && camEpoch === e0; i++) await new Promise(r => setTimeout(r, 50));
    cam().ops.length = 0;
    if (spec.fromAuto) { autoResult(); autoApply(true); const keep = cam().ops.filter(o => o.type === spec.type).slice(0, 1); cam().ops.length = 0; cam().ops.push(...keep); if (!keep.length) return { done: true, moves: 0, thr: 0, bad: 0, out: 0, warn: 'Auto Program made no ' + spec.type + ' operation for this part', probs: [], msg: '', lines: 0, none: true }; } else camAddOp(spec.type, spec.kind);
    const op = cam().ops[cam().ops.length - 1]; Object.assign(op, spec.set || {}); const marg = 70;   // a face mill or a contour starts a tool diameter or two outside the stock
    const done = await waitToolpaths(90000), P = toolpath(op), st = camStock();
    const m = (P && P.m) || [], bad = m.filter(p => !(isFinite(p.x) && isFinite(p.y) && isFinite(p.z))).length;
    const out = m.filter(p => p.x < st.x0 - marg || p.x > st.x1 + marg || p.y < st.y0 - marg || p.y > st.y1 + marg || p.z < st.z0 - 1 || p.z > st.z1 + cam().safe + 5).length;
    let g = null, probs = [], msg = ''; try { g = postGcode(); probs = gcheck(g.text, { units: isIn() ? 'in' : 'mm' }); } catch (e) { msg = 'post: ' + e.message; }
    return { done, moves: m.length, thr: P && P.thr ? P.thr.length : 0, bad, out, warn: ((P && P.warn) || []).join(' | '), probs: probs.slice(0, 3), msg, lines: g ? g.text.split('\n').length : 0 };
  }, [part, spec]);
  const expectOp = async (part, spec, opts = {}) => {
    const r = await runOp(part, spec);
    assert(r.done, 'the toolpath never finished'); assert.strictEqual(r.msg, '');
    assert.strictEqual(r.bad, 0, 'non-finite moves'); assert.strictEqual(r.out, 0, r.out + ' moves outside the stock'); assert.deepStrictEqual(r.probs, [], 'G-code check');
    assert(!r.none, r.warn);
    if (!opts.mayBeEmpty) assert(r.moves > 5 || r.thr > 0, 'no moves. ' + r.warn);
    return r;
  };
  const PLATE = 'Pocketed plate', MOLD = 'Mold half insert';
  for (const [name, part, spec] of [
    ['face (zigzag)', PLATE, { type: 'face' }], ['face (one way)', PLATE, { type: 'face', set: { pattern: 'oneway' } }],
    ['2D contour (faces from Auto Program)', PLATE, { type: 'contour', fromAuto: true }], ['2D pocket (faces from Auto Program)', PLATE, { type: 'pocket', fromAuto: true }],
    ['spot drill', PLATE, { type: 'drill', kind: 'spot' }], ['peck drill', PLATE, { type: 'drill', kind: 'peck' }], ['drill', PLATE, { type: 'drill', kind: 'drill' }],
    ['counterbore', PLATE, { type: 'drill', kind: 'cbore' }], ['tap', PLATE, { type: 'drill', kind: 'tap' }],
    ['3D parallel', MOLD, { type: 'parallel' }], ['waterline', MOLD, { type: 'waterline' }], ['rough pocket (Z-level)', MOLD, { type: 'zrough' }],
    ...['radial', 'spiral', 'scallop', 'pencil', 'flats', 'steep', 'shallow'].map(s => ['3D finish: ' + s, MOLD, { type: 'surf', set: { strategy: s } }]),
    ['engraving', PLATE, { type: 'engrave' }],
  ]) await ok('toolpath: ' + name, () => expectOp(part, spec, { mayBeEmpty: /pencil|steep|shallow|flats/.test(name) }));
  await ok('chamfer swarf with no faces picked tells the user to pick, and posts valid G-code', async () => { const r = await expectOp('Flanged boss', { type: 'chamfer' }, { mayBeEmpty: true }); assert(/Pick the faces/.test(r.warn), r.warn); });
  await ok('thread mill: Auto-detect threads on the Flanged boss makes thread paths and posts helical arcs', async () => {
    const r = await page.evaluate(async () => {
      const e0 = camEpoch; loadDoc(SAMPLES.find(x => x.name === 'Flanged boss').make(), 'test'); setWorkspace('cam');
      for (let i = 0; i < 200 && camEpoch === e0; i++) await new Promise(r => setTimeout(r, 50));
      cam().ops.length = 0; CAMUI.view = 'threads'; thrAuto(); await waitToolpaths(90000);
      const ops = cam().ops.map(o => ({ type: o.type, name: o.name, moves: (toolpath(o) && toolpath(o).m || []).length, thr: (toolpath(o) && toolpath(o).thr || []).length, warn: ((toolpath(o) && toolpath(o).warn) || []).join(' | ') }));
      const g = postGcode(); return { ops, probs: gcheck(g.text, { units: isIn() ? 'in' : 'mm' }).slice(0, 3), arcs: (g.text.match(/\bG0?[23]\b/g) || []).length };
    });
    assert(r.ops.length > 0, 'no operations were made'); assert(r.ops.some(o => o.type === 'thread' && o.thr > 0), 'no thread-mill path: ' + JSON.stringify(r.ops)); assert.deepStrictEqual(r.probs, []); assert(r.arcs > 0, 'no helical arcs');
  });
  await ok('wire EDM operation can be added', async () => { const r = await page.evaluate(() => { loadDoc(SAMPLES.find(x => x.name === 'Pocketed plate').make(), 'test'); setWorkspace('cam'); cam().ops.length = 0; camAddOp('wire'); return cam().ops.length; }); assert(r >= 1); });
  await ok('no page errors', async () => assert.deepStrictEqual(errs, []));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
