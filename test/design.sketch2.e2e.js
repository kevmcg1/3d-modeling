// Conic Curve, Arc Slot, Equation Curve and Insert DXF / SVG (sketch2.js).
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/design.sketch2.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (index.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 500)); } };
const close = (a, b, tol, what) => assert(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (±${tol})`);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } }); await page.addInitScript(() => { window.DATUM_PREMIUM = true; window.DATUM_AUTO = true; window.DATUM_NOFX = true; });   // the CAM Premium lock is off while testing the features it blocks
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' })); await page.route(/gate\.js/, r => r.abort());
  await page.goto('file://' + path.resolve(__dirname, '..', '3d-modeler.html')); await page.waitForTimeout(1500);
  const sk = src => page.evaluate(src => {
    loadDoc({ features: [], next: 10 }, 'x');
    const f = { id: newId(), type: 'sketch', name: 'S', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: [], vis: true };
    insertFeature(f); enterSketch(f);
    const regions = () => arrOf(S.sk).regions, area = () => { const r = regions(); return r.length === 1 ? Math.abs(loopArea(r[0].outer)) : -r.length; };
    const bbx = () => { const b = [1e9, 1e9, -1e9, -1e9], add = p => { b[0] = Math.min(b[0], p.x); b[1] = Math.min(b[1], p.y); b[2] = Math.max(b[2], p.x); b[3] = Math.max(b[3], p.y); };
      for (const e of S.sk.ents) { if (e.type === 'line') { add(e.a); add(e.b); } else if (e.type === 'circle') { add(P2(e.c.x - e.r, e.c.y - e.r)); add(P2(e.c.x + e.r, e.c.y + e.r)); } else for (let k = 0; k <= 400; k++) add(polar(e.c, e.r, e.a0 + (e.a1 - e.a0) * k / 400)); }
      return b; };
    return eval('(' + src + ')')({ area, bbx, regions });
  }, src);
  await ok('conic curve: rho 0.5 is a parabola that peaks halfway up to the apex', async () => {
    const r = await sk(`H => {
      setTool('conic'); toolClick(P2(0, 0)); toolClick(P2(20, 0)); toolClick(P2(10, 20));
      const rho = SK2.conicRho(P2(0, 0), P2(20, 0), P2(10, 20), P2(10, 10));       // a point halfway up the middle: rho .5
      toolClick(P2(10, 10)); const n = S.sk.ents.length, bb = H.bbx();
      return { rho, n, bb, left: S.pts.length, kinds: [...new Set(S.sk.ents.map(e => e.type))] };
    }`);
    close(r.rho, 0.5, 1e-9, 'rho'); assert(r.n >= 8, 'arcs ' + r.n); close(r.bb[0], 0, 1e-6, 'left end'); close(r.bb[2], 20, 1e-6, 'right end'); close(r.bb[3], 10, 0.05, 'a parabola with rho 0.5 peaks halfway to the apex');
  });
  await ok('arc slot: area is the swept ring section plus the two round ends', async () => {
    const r = await sk(`H => {
      setTool('arcslot'); toolClick(P2(0, 0)); toolClick(P2(30, 0)); toolClick(P2(0, 30)); toolClick(P2(35, 0));        // radius 30, quarter turn, width 10
      return { area: H.area(), n: S.sk.ents.length, bb: H.bbx() };
    }`);
    close(r.area, Math.PI / 4 * (35 * 35 - 25 * 25) + Math.PI * 25, 0.1, 'arc slot area'); assert.strictEqual(r.n, 4);
    close(r.bb[2], 35, 0.01, 'right edge'); close(r.bb[3], 35, 0.01, 'top edge');
  });
  await ok('equation curve: a circle from x = 10cos(t), y = 10sin(t) closes and has the right area; bad input throws', async () => {
    const r = await sk(`H => {
      const ents = SK2.equationCurve({ x: '10*cos(t)', y: '10*sin(t)', t0: 0, t1: 360, n: 12 });
      const out = { area: H.area(), n: ents.length };
      try { SK2.equationCurve({ x: 'foo', y: '1', t0: 0, t1: 1, n: 4 }); out.bad = 'no error'; } catch (e) { out.bad = e.message; }
      try { SK2.equationCurve({ x: 't', y: 't', t0: 1, t1: 1, n: 4 }); out.same = 'no error'; } catch (e) { out.same = e.message; }
      return out;
    }`);
    close(r.area, Math.PI * 100, 0.5, 'circle area'); assert(r.bad !== 'no error' && r.same !== 'no error', JSON.stringify(r));
  });
  const DXF = ['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC','0','SECTION','2','ENTITIES',
    '0','LINE','10','0','20','0','11','40','21','0', '0','LINE','10','40','20','0','11','40','21','20', '0','LWPOLYLINE','90','3','70','0','10','40','20','20','10','0','20','20','42','0','10','0','20','0',
    '0','CIRCLE','10','20','20','10','40','4', '0','TEXT','10','0','20','0','1','hi', '0','ENDSEC','0','EOF'].join('\n');
  await ok('insert DXF: lines, a polyline and a circle land in the sketch as a closed outline with a hole; text is skipped', async () => {
    const r = await sk(`H => {
      const res = SK2.insertText('plate.dxf', ${JSON.stringify(DXF)});
      return { n: res.ents.length, skipped: res.skipped, regions: H.regions().length, holes: H.regions().map(g => g.holes ? g.holes.length : -1), bb: H.bbx() };
    }`);
    assert.strictEqual(r.n, 5, JSON.stringify(r)); assert.deepStrictEqual(r.skipped, { TEXT: 1 }); close(r.bb[2], 40, 1e-6, 'width'); close(r.bb[3], 20, 1e-6, 'height');
    assert(r.regions >= 1, JSON.stringify(r));
  });
  await ok('insert DXF: bulge arcs, inch units and ARC entities', async () => {
    const r = await sk(`H => {
      const dxf = ['0','SECTION','2','HEADER','9','$INSUNITS','70','1','0','ENDSEC','0','SECTION','2','ENTITIES','0','LWPOLYLINE','70','1','10','0','20','0','42','1','10','2','20','0','10','2','20','1','10','0','20','1','0','ARC','10','5','20','5','40','1','50','0','51','90','0','ENDSEC','0','EOF'].join('\\n');
      const res = SK2.insertText('b.dxf', dxf);
      return { kinds: res.ents.map(e => e.type), bb: H.bbx(), unit: res.unit };
    }`);
    assert.strictEqual(r.unit, 'in'); assert(r.kinds.includes('arc')); close(r.bb[2], 5 * 25.4 + 25.4, 0.01, 'inch scale on the ARC entity (x 5 + r 1)'); 
  });
  const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="60mm" viewBox="0 0 100 60"><g transform="translate(10,10)"><rect x="0" y="0" width="40" height="30"/><circle cx="20" cy="15" r="5"/><path d="M60 0 h20 a10 10 0 0 1 10 10 v10 q0 10 -10 10 h-20 z"/></g><text>x</text></svg>`;
  await ok('insert SVG: shapes are scaled to the file size, y is flipped and curves become arcs', async () => {
    const r = await sk(`H => {
      const res = SK2.insertText('d.svg', ${JSON.stringify(SVG)});
      const kinds = {}; for (const e of res.ents) kinds[e.type] = (kinds[e.type] || 0) + 1;
      return { kinds, skipped: res.skipped, bb: H.bbx(), regions: H.regions().length };
    }`);
    assert(r.kinds.line >= 4 && r.kinds.circle === 1 && r.kinds.arc >= 2, JSON.stringify(r)); assert.deepStrictEqual(r.skipped, { text: 1 });
    close(r.bb[0], 10, 1e-6, 'left'); close(r.bb[3], -10, 1e-6, 'top of the drawing sits at negative y after the flip'); close(r.bb[2], 10 + 90, 0.01, 'right edge of the path');
    assert(r.regions >= 2, JSON.stringify(r));
  });
  await ok('insert needs an open sketch and a real file', async () => {
    const r = await page.evaluate(() => { loadDoc({ features: [], next: 10 }, 'x'); let a = '', b = ''; try { SK2.insertText('x.dxf', '0\nEOF'); } catch (e) { a = e.message; } const f = { id: newId(), type: 'sketch', name: 'S', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: [], vis: true }; insertFeature(f); enterSketch(f); try { SK2.insertText('x.dxf', '0\nEOF'); } catch (e) { b = e.message; } let c = ''; try { SK2.insertText('x.svg', '<html/>'); } catch (e) { c = e.message; } return [a, b, c]; });
    assert(/open a sketch/i.test(r[0]) && /no lines/i.test(r[1]) && /svg/i.test(r[2]), JSON.stringify(r));
  });
  await ok('ribbon buttons and tool tips exist', async () => {
    const r = await page.evaluate(() => {
      loadDoc({ features: [], next: 10 }, 'x'); const f = { id: newId(), type: 'sketch', name: 'S', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: [], vis: true }; insertFeature(f); enterSketch(f);
      return ['conic', 'arcslot', 'sk2:eqn', 'sk2:insert'].map(a => [a, !!document.querySelector(`[data-act="${a}"]`), !!TIP_TXT[a]]);
    });
    assert(r.every(x => x[1] && x[2]), JSON.stringify(r));
  });
  await ok('equation form opens and draws', async () => {
    const r = await page.evaluate(() => {
      loadDoc({ features: [], next: 10 }, 'x'); const f = { id: newId(), type: 'sketch', name: 'S', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: [], vis: true }; insertFeature(f); enterSketch(f);
      action('sk2:eqn'); const form = document.getElementById('sk2Eq'); if (!form) return 'no form';
      form.querySelector('#sk2ok').click(); const n = S.sk.ents.length, gone = !document.getElementById('sk2Eq');
      return { n, gone };
    });
    assert(r.n > 0 && r.gone, JSON.stringify(r));
  });
  await ok('no page errors', async () => assert.deepStrictEqual(errs, []));
  console.log(`${pass} passed, ${fail} failed`); await browser.close(); process.exit(fail ? 1 : 0);
})();
