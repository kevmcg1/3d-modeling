// Holding ↑ / ↓ in a number field keeps stepping the value (one step per key auto-repeat), in every kind of numeric field:
// feature fields, the ƒ expression box, sketch properties (which rebuild the panel on change) and the Parameters panel.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/number-step.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 700)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(() => { try { localStorage.setItem('datum.units', 'mm'); } catch (e) { /* no storage */ } });
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' })); await page.route(/gate\.js/, r => r.abort());
  await page.goto('file://' + path.resolve(__dirname, '..', '3d-modeler.html')); await page.waitForTimeout(1500);
  const box = { id: 10, type: 'primitive', name: 'Box', shape: 'box', base: 'XY', cx: 0, cy: 0, off: 0, op: 'new', w: 10, d: 10, h: 10, dia: 10, dia2: 0, tube: 6, center: true, sit: true };
  // a held key = one keydown per auto-repeat, then a single keyup
  const hold = async (key, n, mods = []) => { for (const m of mods) await page.keyboard.down(m); for (let i = 0; i < n; i++) await page.keyboard.down(key); await page.keyboard.up(key); for (const m of mods) await page.keyboard.up(m); await page.waitForTimeout(80); };
  const openBox = async () => {
    await page.evaluate(async b => { cancelCmd(); loadDoc({ features: [b], params: [{ name: 'wall', expr: '4' }], next: 200 }, 'x'); setWorkspace('model'); applyModel(evaluate(0.05), { tol: 0.05 }); cmdFeat('primitive', doc.features[0]); await new Promise(r => setTimeout(r, 300)); }, box);
  };

  await ok('feature field: every auto-repeat steps the value and the model, focus stays', async () => {
    await openBox(); await page.focus('input[data-fv="w"]');
    await hold('ArrowUp', 5);
    const r = await page.evaluate(() => ({ w: CMD.f.w, v: document.querySelector('input[data-fv="w"]').value, foc: document.activeElement && document.activeElement.dataset.fv }));
    assert(r.w === 15 && r.v === '15' && r.foc === 'w', JSON.stringify(r));
    await hold('ArrowDown', 2); assert.strictEqual(await page.evaluate(() => CMD.f.w), 13);
  });
  await ok('Shift steps ×10 and Ctrl steps ×0.1', async () => {
    await openBox(); await page.focus('input[data-fv="w"]');
    await hold('ArrowUp', 2, ['Shift']); assert.strictEqual(await page.evaluate(() => CMD.f.w), 30);
    await hold('ArrowDown', 3, ['Control']); assert(Math.abs(await page.evaluate(() => CMD.f.w) - 29.7) < 1e-9);
  });
  await ok('each repeat fires input events (not only the last)', async () => {
    await openBox(); await page.focus('input[data-fv="w"]');
    await page.evaluate(() => { window.__n = 0; document.querySelector('input[data-fv="w"]').addEventListener('input', () => window.__n++); });
    await hold('ArrowUp', 6); assert.strictEqual(await page.evaluate(() => window.__n), 6);
  });
  await ok('ƒ expression box holding a plain number steps it and moves the feature live', async () => {
    await openBox(); await page.click('[data-fx="w"]'); await page.waitForSelector('input[data-fx-edit]');
    await hold('ArrowUp', 4);
    const r = await page.evaluate(() => ({ w: CMD.f.w, t: document.querySelector('input[data-fx-edit]') && document.querySelector('input[data-fx-edit]').value }));
    assert(r.w === 14 && r.t === '14', JSON.stringify(r));
  });
  await ok('a sketch property box (panel rebuilds on change) keeps focus through a hold', async () => {
    const found = await page.evaluate(() => {
      cancelCmd(); if (S.sk) exitSketchMode(false);
      const f = { id: newId(), type: 'sketch', name: 'S' + newId(), ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: [], vis: true };
      insertFeature(f); enterSketch(f); const e = { id: newId(), type: 'line', a: P2(0, 0), b: P2(20, 0) }; f.ents.push(e); modelChanged();
      setTool('select'); S.sel = new Set([e]); refreshPanel(); const i = document.querySelector('#panel input[data-prop]'); return i ? i.dataset.prop : null;
    });
    assert(found, 'no property box'); await page.waitForTimeout(300);
    const sel = `#panel input[data-prop="${found}"]`; const before = parseFloat(await page.inputValue(sel));
    await page.focus(sel); await hold('ArrowUp', 5);
    const after = parseFloat(await page.inputValue(sel));
    assert(Math.abs(after - before - 5) < 1e-6, `${before} -> ${after}`);
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.dataset.prop), found);
  });
  await ok('Parameters panel expression box steps a plain number', async () => {
    await page.reload(); await page.waitForTimeout(1500);
    await page.evaluate(async b => { loadDoc({ features: [b], params: [{ name: 'wall', expr: '4' }], next: 200 }, 'x'); setWorkspace('model'); document.querySelector('[data-act="i:params"]').click(); await new Promise(r => setTimeout(r, 300)); }, box);
    await page.focus('[data-par="expr"][data-i="0"]'); await hold('ArrowUp', 3);
    const r = await page.evaluate(() => ({ e: doc.params[0].expr, foc: document.activeElement && document.activeElement.dataset.par }));
    assert(String(r.e) === '7' && r.foc === 'expr', JSON.stringify(r));
  });
  await ok('arrows still move the caret in an expression that is not a plain number', async () => {
    const r = await page.evaluate(() => { const i = document.createElement('input'); i.type = 'text'; i.setAttribute('data-fx-edit', '1'); i.value = 'wall*2'; return NumStep.eligible(i); });
    assert.strictEqual(r, false);
  });
  await ok('no page errors', async () => assert.deepStrictEqual(errs, []));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
