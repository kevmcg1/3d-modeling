// User parameters and expressions (parameters.js): the expression language, features that follow a parameter, the ƒ button and the Parameters panel.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/design.params.e2e.js
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
  const box = { id: 10, type: 'primitive', name: 'Box', shape: 'box', base: 'XY', cx: 0, cy: 0, off: 0, op: 'new', w: 10, d: 10, h: 10, dia: 10, dia2: 0, tube: 6, center: true, sit: true };

  await ok('expressions: arithmetic, units, functions, precedence, parameters that use each other', async () => {
    const r = await page.evaluate(() => {
      const P = [{ name: 'a', expr: '2 in' }, { name: 'b', expr: 'a*2 + 1' }, { name: 'c', expr: 'sqrt(16) + max(1, 3)^2 - 10 % 4' }, { name: 'd', expr: 'sin(30)*10' }];
      const { vals } = PARAMS.paramValues(P);
      return { a: vals.get('a'), b: vals.get('b'), c: vals.get('c'), d: vals.get('d'), neg: PARAMS.evalText('-(2+3)*2^2', []), pi: PARAMS.evalText('pi', []) };
    });
    close(r.a, 50.8, 1e-9, 'a'); close(r.b, 102.6, 1e-9, 'b'); close(r.c, 11, 1e-9, 'c'); close(r.d, 5, 1e-9, 'd'); close(r.neg, -20, 1e-9, 'neg'); close(r.pi, Math.PI, 1e-12, 'pi');
  });
  await ok('bad input: unknown names, cycles, junk and division by zero are errors, not crashes', async () => {
    const r = await page.evaluate(() => {
      const t = (src, P = []) => { try { PARAMS.evalText(src, P); return 'ok'; } catch (e) { return e.message; } };
      const cyc = PARAMS.paramValues([{ name: 'x', expr: 'y' }, { name: 'y', expr: 'x' }]).errs;
      return { unk: t('zzz'), junk: t('2 +'), div: t('1/0'), fn: t('foo(1)'), cyc: Object.keys(cyc).length, bad: PARAMS.paramValues([{ name: '1x', expr: '1' }]).errs['1x'] };
    });
    assert(/Unknown/.test(r.unk) && r.junk !== 'ok' && r.div !== 'ok' && /Unknown function/.test(r.fn) && r.cyc === 2 && r.bad, JSON.stringify(r));
  });
  await ok('a feature field with an expression follows its parameter', async () => {
    const r = await page.evaluate(b => {
      const f = { ...b, w: 99, expr: { w: 'wall*3' } };
      loadDoc({ features: [f], params: [{ name: 'wall', expr: '4' }], next: 200 }, 'x');
      const vol = c => { let v = 0; for (const p of c.bodies[0].polys) for (let i = 1; i + 1 < p.v.length; i++) v += dot3(p.v[0], crs3(p.v[i], p.v[i + 1])) / 6; return v; };
      const a = vol(evaluate(0.05)); doc.params[0].expr = '5'; const c2 = evaluate(0.05); const b2 = vol(c2);
      doc.features[0].expr.w = 'nope'; const c3 = evaluate(0.05);
      return { a, b2, w: doc.features[0].w, err: c3.errors[10] || '' };
    }, box);
    close(r.a, 12 * 10 * 10, 1e-6, 'wall 4 -> w 12'); close(r.b2, 15 * 10 * 10, 1e-6, 'wall 5 -> w 15'); assert(/Unknown name nope/.test(r.err), r.err);
  });
  await ok('the ƒ button turns a field into an expression box and keeps the text on the feature', async () => {
    const r = await page.evaluate(async b => {
      loadDoc({ features: [b], params: [{ name: 'wall', expr: '4' }], next: 200 }, 'x'); setWorkspace('model'); applyModel(evaluate(0.05), { tol: 0.05 });
      cmdFeat('primitive', doc.features[0]); await new Promise(r => setTimeout(r, 300));
      const btn = panel.querySelector('[data-fx="w"]'); if (!btn) return { btn: false };
      btn.click(); const t = panel.querySelector('input[data-fx-edit]'); if (!t) return { btn: true, edit: false };
      t.value = 'wall * 2.5'; t.dispatchEvent(new Event('blur')); await new Promise(r => setTimeout(r, 300));
      const f = CMD.f, on = !!panel.querySelector('[data-fx="w"].on'); const out = { btn: true, edit: true, w: f.w, expr: f.expr && f.expr.w, on };
      const inp = panel.querySelector('input[data-fv="w"]'); inp.value = '7'; inp.dispatchEvent(new Event('input', { bubbles: true }));
      out.after = { w: CMD.f.w, expr: CMD.f.expr && CMD.f.expr.w };
      cancelCmd(); return out;
    }, box);
    assert(r.btn && r.edit, JSON.stringify(r)); close(r.w, 10, 1e-9, 'wall*2.5'); assert.strictEqual(r.expr, 'wall * 2.5'); assert(r.on);
    assert(r.after.w !== 10 && !r.after.expr, 'typing a number drops the expression: ' + JSON.stringify(r.after));
  });
  await ok('the Parameters panel adds, renames (and rewrites users) and deletes', async () => {
    const r = await page.evaluate(async b => {
      loadDoc({ features: [{ ...b, expr: { w: 'd1*2' } }], params: [{ name: 'd1', expr: '5' }], next: 200 }, 'x'); setWorkspace('model');
      document.querySelector('[data-act="i:params"]').click(); await new Promise(r => setTimeout(r, 200));
      const out = { open: CMD && CMD.kind === 'params', rows: panel.querySelectorAll('.par-tbl tr').length };
      panel.querySelector('[data-par-add]').click(); await new Promise(r => setTimeout(r, 200)); out.added = doc.params.length;
      const nm = panel.querySelector('[data-par="name"][data-i="0"]'); nm.value = 'wall'; nm.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 200));
      out.name = doc.params[0].name; out.use = doc.features[0].expr.w;
      panel.querySelector('[data-par-del="1"]').click(); await new Promise(r => setTimeout(r, 200)); out.left = doc.params.length;
      cancelCmd(); return out;
    }, box);
    assert(r.open && r.rows === 2 && r.added === 2 && r.name === 'wall' && r.use === 'wall*2' && r.left === 1, JSON.stringify(r));
  });
  await ok('no page errors', async () => assert.deepStrictEqual(errs, []));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
