// Manufacture: 2D pocket and contour accept sloped and curved faces (cut flat at the face's highest point).
// Manufacture: 2D pocket and contour accept sloped and curved faces (cut flat at the face's highest point).
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (index.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 400)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' }));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await page.waitForTimeout(2000);
  await page.evaluate(() => { const s = SAMPLES.find(x => x.name === 'Wedge block'); loadDoc(s.make(), 'test'); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { setWorkspace('cam'); });
  await page.waitForTimeout(800);
  for (const type of ['pocket', 'contour']) {
    await ok(`${type}: a sloped face can be picked and the toolpath is built`, async () => {
      const r = await page.evaluate(t => {
        camAddOp(t); const op = opById(CAMUI.op); op.faces = [];
        const h = (() => { for (const b of visibleBodies()) { const m = bodyMesh(b); for (let f = 0; f < Surf.list.length; f++) { const s = Surf.list[f]; if (s && s.t === 'P' && Math.abs(s.n[1]) < 0.9 && Math.abs(s.n[1]) > 0.1 && faceVerts(m, f).length) return { mesh: m, fid: f, kind: 'face' }; } } return null; })();
        if (!h) return { none: true };
        camToggleFace(op, h);
        const P = toolpath(op);
        return { faces: op.faces.length, moves: P && P.m ? P.m.length : 0, warn: (P.warn || []).join('|') };
      }, type);
      assert(!r.none && r.faces === 1 && r.moves > 0, JSON.stringify(r));
    });
  }
  await ok('no page errors', async () => assert.deepStrictEqual(errs, []));
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
