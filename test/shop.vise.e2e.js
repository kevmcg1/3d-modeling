// Workholding: every vise (incl. the Kurt sizes) and the parallels build, sit on the bed and between the jaws.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/shop.vise.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 700)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' }));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await page.waitForTimeout(2000);
  const load = kinds => page.evaluate(async kinds => {
    const k = sampleKit();
    kinds.forEach((kd, i) => k.features.push({ id: k.nid(), type: 'shop', name: kd, ...FEATS.shop.init(), ...shopDefaults(kd), kind: kd, cx: i * 500, cy: 0 }));
    loadDoc(k.doc(), 'test'); await new Promise(r => setTimeout(r, 2500));
    return MODEL.bodies.map(b => ({ id: b.id, bb: b.bb }));
  }, kinds);
  await ok('the vise list has the Kurt sizes', async () => {
    const l = await page.evaluate(() => Object.entries(SHOP).filter(([, v]) => v.grp === 'Vises').map(([k, v]) => v.name));
    assert(['Kurt DX4 (4 in)', 'Kurt DX6 (6 in)', 'Kurt D688 (6 in)', 'Kurt DX8 (8 in)'].every(n => l.includes(n)), l.join());
  });
  await ok('every vise builds all its parts, and the parallels stand on the bed between the jaws', async () => {
    const kinds = await page.evaluate(() => Object.keys(SHOP).filter(k => SHOP[k].grp === 'Vises'));
    const bs = await load(kinds);
    for (const kd of kinds) assert(await page.evaluate(k => SHOP[k].parts.length > 0, kd), kd);
    const vise = await page.evaluate(async () => {
      const d = doc.features.find(f => f.kind === 'kurtDX6'); const out = {};
      MODEL.bodies.forEach(b => { const j = Math.round((b.id - d.id) * 1000); if (j >= 0 && j < 8) out[j] = b.bb; });
      return { out, open: d.open, par: d.par };
    });
    assert(vise.out[7], 'the parallels part is missing: ' + Object.keys(vise.out));
    const bed = vise.out[1][1];                                    // the jaws stand on the bed (bb is x0,y0,z0,x1,y1,z1 with Y up)
    assert(Math.abs(vise.out[7][1] - bed) < 0.5, `parallels start at ${vise.out[7][1]}, bed top ${bed}`);
    assert(vise.out[7][0] > vise.out[1][3] - 1 && vise.out[7][3] < vise.out[3][0] + 1, 'parallels leave the jaw gap');
  });
  await ok('the Workholding sample loads each item with its own sizes', async () => {
    const r = await page.evaluate(async () => { loadDoc(SAMPLES.find(x => x.name === 'Workholding table').make(), 'test'); await new Promise(r => setTimeout(r, 2500)); const b = doc.features.find(f => f.kind === 'block123'); return { W: b.W, hasHd: b.hd }; });
    assert(Math.abs(r.W - 50.8) < 1e-6 && r.hasHd === 5.2, JSON.stringify(r));
  });
  await ok('no page errors', async () => assert.deepStrictEqual(errs, []));
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
