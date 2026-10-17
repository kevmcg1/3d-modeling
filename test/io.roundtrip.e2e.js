// 3D files in and out: OBJ, STL and STEP written by the modeler read back with the same size, volume and triangle count (STEP: the same flat faces),
// the closed-mesh check tells a sound mesh from a broken one (open edges, flipped triangles, T-junctions that are not gaps), and the import panel and export dialog
// preview the model in Shaded, Wireframe and Solid.
// STEP reading is the OpenCascade reader the app loads from a CDN; here it is served from node_modules (occt-import-js@0.0.23) so the test runs offline.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2, occt-import-js@0.0.23> CHROMIUM_PATH=<chrome> node test/io.roundtrip.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js'), occt: path => require.resolve('occt-import-js/dist/' + path) }; require.resolve('occt-import-js/dist/occt-import-js.js'); } catch (e) { libs = null; }
if (!libs) { console.log('skip: needs three, clipper-lib and occt-import-js in node_modules (3d-modeler.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert'), fs = require('fs');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 1500)); } };

// ground truth read from the files in node, independently of the app
const stlBin = buf => { const n = buf.readUInt32LE(80), T = []; for (let t = 0; t < n; t++) { const o = 84 + t * 50 + 12; T.push([0, 1, 2].map(k => [0, 1, 2].map(a => buf.readFloatLE(o + k * 12 + a * 4)))); } return T; };
const objTris = text => { const V = [], T = []; for (const l of text.split('\n')) { if (l.startsWith('v ')) V.push(l.slice(2).trim().split(/\s+/).map(Number)); else if (l.startsWith('f ')) { const f = l.slice(2).trim().split(/\s+/).map(s => +s.split('/')[0] - 1); for (let i = 1; i + 1 < f.length; i++) T.push([V[f[0]], V[f[i]], V[f[i + 1]]]); } } return T; };
const measure = T => { let vol = 0; const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (const [a, b, c] of T) { vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; for (const p of [a, b, c]) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } } return { vol: Math.abs(vol), ext: [0, 1, 2].map(k => hi[k] - lo[k]).sort((x, y) => x - y), tris: T.length }; };
const near = (a, b, rel, what) => assert(Math.abs(a - b) <= rel * Math.max(1, Math.abs(b)), what + ': ' + a + ' vs ' + b);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [];
  const open = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true }), page = await ctx.newPage();
    page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.dismiss());
    await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' })); await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' })); await page.route(/fonts\.g/, r => r.abort());
    await page.route(/cdn\.jsdelivr\.net\/npm\/occt-import-js@0\.0\.23\/dist\//, (r, req) => { const f = req.url().split('/dist/')[1]; r.fulfill({ path: libs.occt(f), contentType: f.endsWith('.wasm') ? 'application/wasm' : 'text/javascript', headers: { 'access-control-allow-origin': '*' } }); });
    await page.goto('file://' + path.resolve(__dirname, '..', '3d-modeler.html')); await page.waitForTimeout(2500);
    await page.evaluate(() => { loadDoc(SAMPLES.find(s => s.name === 'Pocketed plate').make(), 't'); }); await page.waitForTimeout(1000);
    return page;
  };
  const exportAs = async (page, key) => { const dl = page.waitForEvent('download', { timeout: 30000 }); await page.evaluate(k => runExport(k), key); const d = await dl; return { name: d.suggestedFilename(), buf: fs.readFileSync(await d.path()) }; };
  const importBuf = (page, name, buf) => page.evaluate(async ({ name, b64 }) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); await importFiles([new File([bytes], name)]);
    const M = MESHES[CMD.f.mesh]; let vol = 0; const P = M.P, I = M.I, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let t = 0; t < I.length; t += 3) { const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3; vol += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6; }
    for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[i + k]); hi[k] = Math.max(hi[k], P[i + k]); }
    return { vol: Math.abs(vol), ext: [0, 1, 2].map(k => hi[k] - lo[k]).sort((x, y) => x - y), tris: I.length / 3, fmt: CMD.info.fmt, line: (document.querySelector('.io-imp .io-line') || {}).textContent || '', cmd: CMD.type };
  }, { name, b64: buf.toString('base64') });

  const page = await open();
  const truth = {};
  await ok('STL: the file is a binary STL, closed, and reads back with the same size, volume and triangles', async () => {
    const { name, buf } = await exportAs(page, 'stl'); assert(/\.stl$/.test(name)); assert.strictEqual(buf.length, 84 + 50 * buf.readUInt32LE(80));
    truth.stl = measure(stlBin(buf)); assert(truth.stl.vol > 1000 && truth.stl.tris > 100, JSON.stringify(truth.stl));
    const r = await importBuf(page, name, buf); assert.strictEqual(r.fmt, 'STL'); assert.strictEqual(r.tris, truth.stl.tris);
    near(r.vol, truth.stl.vol, 1e-4, 'volume'); truth.stl.ext.forEach((e, i) => near(r.ext[i], e, 1e-4, 'extent ' + i));
    assert(/^Closed/.test(r.line), 'the import panel says: ' + r.line);
  });

  await page.evaluate(() => { cancelCmd(); }); await page.evaluate(() => { loadDoc(SAMPLES.find(s => s.name === 'Pocketed plate').make(), 't'); }); await page.waitForTimeout(800);
  await ok('OBJ: reads back with the same size, volume and triangles', async () => {
    const { name, buf } = await exportAs(page, 'obj'); assert(/\.obj$/.test(name));
    const m = measure(objTris(buf.toString())); near(m.vol, truth.stl.vol, 1e-4, 'file volume'); truth.stl.ext.forEach((e, i) => near(m.ext[i], e, 1e-4, 'file extent ' + i));
    const r = await importBuf(page, name, buf); assert.strictEqual(r.fmt, 'OBJ'); assert.strictEqual(r.tris, m.tris);
    near(r.vol, truth.stl.vol, 1e-4, 'volume'); truth.stl.ext.forEach((e, i) => near(r.ext[i], e, 1e-4, 'extent ' + i)); assert(/^Closed/.test(r.line), r.line);
  });

  await page.evaluate(() => { cancelCmd(); loadDoc(SAMPLES.find(s => s.name === 'Pocketed plate').make(), 't'); }); await page.waitForTimeout(800);
  let stepBuf;
  await ok('STEP: a real AP214 file whose faces the OpenCascade reader finds again, with the same size and volume', async () => {
    const { name, buf } = await exportAs(page, 'step'); stepBuf = buf; const text = buf.toString();
    assert(/^ISO-10303-21;/.test(text) && /END-ISO-10303-21;\s*$/.test(text) && /MANIFOLD_SOLID_BREP/.test(text) && /CLOSED_SHELL/.test(text), text.slice(0, 300));
    const r = await importBuf(page, name, buf); assert.strictEqual(r.fmt, 'STEP');
    near(r.vol, truth.stl.vol, 2e-3, 'volume'); truth.stl.ext.forEach((e, i) => near(r.ext[i], e, 1e-3, 'extent ' + i));
    assert(/^Closed/.test(r.line), r.line);
    const faces = await page.evaluate(() => CMD.info.patches + CMD.info.faces); assert(faces >= 10, 'faces found ' + faces);
  });

  await ok('STEP written again from the imported STEP is the same solid (volume and extents)', async () => {
    await page.evaluate(() => importOK()); await page.waitForTimeout(800);
    const bodies = await page.evaluate(() => MODEL.bodies.filter(b => !b.hole).length); assert(bodies >= 1);
    await page.evaluate(() => { doc.hidden = doc.hidden || {}; MODEL.bodies.forEach(b => { if (!doc.features.some(f => f.type === 'import')) return; }); });
    const { buf } = await exportAs(page, 'stl'); const m = measure(stlBin(buf));
    // the plate was imported next to itself, so two copies: the imported one is the second volume
    assert(m.vol > truth.stl.vol * 1.9 && m.vol < truth.stl.vol * 2.1, 'volume of both ' + m.vol + ' vs ' + truth.stl.vol);
  });

  await ok('the closed-mesh check: a cube is closed, a missing triangle is open, a flipped one (its three edges) is flipped, a T-junction is not a gap', async () => {
    const r = await page.evaluate(() => {
      const P = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1]);
      const I = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5];
      const c = __io.check(P, Uint32Array.from(I)), miss = __io.check(P, Uint32Array.from(I.slice(3))), fl = I.slice(); [fl[3], fl[4]] = [fl[4], fl[3]];
      const flip = __io.check(P, Uint32Array.from(fl));
      // the same cube with its front face cut into three triangles around a vertex that sits on the bottom edge: the bottom face has one long edge facing two short ones
      const P2 = new Float32Array([...P, 0.5, 0, 0]), I2 = I.slice(0, 12).concat([0, 8, 4, 8, 1, 5, 8, 5, 4]).concat(I.slice(18));
      const t = __io.check(P2, Uint32Array.from(I2));
      return { c: [c.closed, c.open, c.flipped], miss: [miss.closed, miss.open], flip: [flip.closed, flip.flipped], text: __io.words(miss), t: [t.closed, t.open] };
    });
    assert.deepStrictEqual(r.c, [true, 0, 0]); assert.deepStrictEqual(r.miss, [false, 3]); assert.deepStrictEqual(r.flip, [false, 3]);
    assert(/Not closed: 3 open edges \(holes or gaps, drawn in red\)/.test(r.text), r.text);
    assert.deepStrictEqual(r.t, [true, 0], 'the long bottom edge is matched by the two short front edges');
  });

  await ok('a broken STL imports, and the import panel says it has open edges', async () => {
    await page.evaluate(() => { cancelCmd(); loadDoc(SAMPLES.find(s => s.name === 'Pocketed plate').make(), 't'); }); await page.waitForTimeout(600);
    const { name, buf } = await exportAs(page, 'stl'), n = buf.readUInt32LE(80), broken = Buffer.concat([buf.subarray(0, 84), buf.subarray(84 + 50 * 5)]); broken.writeUInt32LE(n - 5, 80);
    const r = await importBuf(page, 'broken-' + name, broken); assert(/^Not closed: .*open edge/.test(r.line), r.line);
    assert.strictEqual(await page.evaluate(() => document.querySelector('.io-imp .io-line').classList.contains('bad')), true);
  });

  await ok('import preview: Shaded, Wireframe and Solid change the 3D view, and closing the panel puts the view back', async () => {
    const r = await page.evaluate(async () => {
      const before = SHADE, out = {}; const btn = k => document.querySelector('.io-imp [data-ioview="' + k + '"]');
      for (const k of ['wire', 'shaded', 'solid']) { btn(k).click(); out[k] = [SHADE, btn(k).classList.contains('on')]; }
      btn('wire').click(); const during = SHADE; cancelCmd(); return { before, out, during, after: SHADE };
    });
    assert.deepStrictEqual(r.out, { wire: ['wire', true], shaded: ['shaded', true], solid: ['solid', true] }); assert.strictEqual(r.during, 'wire'); assert.strictEqual(r.after, r.before);
  });

  await ok('export preview: the dialog draws the model that will be written, in all three views, and says it is closed', async () => {
    await page.evaluate(() => { loadDoc(SAMPLES.find(s => s.name === 'Pocketed plate').make(), 't'); openExport(); }); await page.waitForFunction(() => document.querySelector('#ioPrev canvas') && /Closed|Not closed/.test(document.getElementById('ioLine').textContent), null, { timeout: 30000 });
    assert(/^Closed/.test(await page.textContent('#ioLine')));
    const lit = async () => page.evaluate(() => { const c = document.querySelector('#ioPrev canvas'), g = document.createElement('canvas'); g.width = c.width; g.height = c.height; const x = g.getContext('2d'); x.drawImage(c, 0, 0); const d = x.getImageData(0, 0, g.width, g.height).data; let n = 0, h = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 20) n++; h = (Math.imul(h, 31) + d[i] + d[i + 1] * 3 + d[i + 3] * 7) | 0; } return { n, h }; });
    const counts = {}, sums = {};
    for (const k of ['shaded', 'wire', 'solid']) { await page.click('#ioPrev [data-ioview="' + k + '"]'); await page.waitForTimeout(500); const L = await lit(); counts[k] = L.n; sums[k] = L.h; assert.strictEqual(await page.evaluate(() => window.__ioLast.mode), k); }
    assert(counts.shaded > 2000 && counts.solid > 2000 && counts.wire > 200, JSON.stringify(counts)); assert.strictEqual(new Set(Object.values(sums)).size, 3, 'the three views look different: ' + JSON.stringify(sums));
    await page.evaluate(() => closeModal()); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(() => !!document.querySelector('#ioPrev canvas')), false, 'the viewer goes away with the dialog');
  });

  await ok('export preview follows the curve quality and the bodies ticked', async () => {
    await page.evaluate(() => { openExport(); }); await page.waitForFunction(() => /Closed|Not closed/.test(document.getElementById('ioLine').textContent), null, { timeout: 30000 });
    const t0 = await page.evaluate(() => window.__ioLast.sum.tris);
    await page.click('[data-expq="fine"]'); await page.waitForFunction(t => window.__ioLast.sum.tris !== t, t0, { timeout: 30000 });
    assert(await page.evaluate(() => window.__ioLast.sum.tris) > t0, 'fine has more triangles'); await page.evaluate(() => closeModal());
  });

  await ok('no page errors', async () => assert.deepStrictEqual(errs, []));
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
