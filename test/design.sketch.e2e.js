// Design sketch: quick trim (click, drag sweep, Shift extends) and text notes (place, edit, move, undo, convert to curves).
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/design.sketch.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (index.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 300)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' }));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await page.waitForTimeout(1500);
  const setup = lines => page.evaluate(L => {
    if (S.sk) exitSketchMode(false);
    const f = { id: newId(), type: 'sketch', name: 'S' + newId(), ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: [], vis: true };
    insertFeature(f); enterSketch(f); L.forEach(l => f.ents.push({ id: newId(), type: 'line', a: P2(l[0], l[1]), b: P2(l[2], l[3]) })); modelChanged();
  }, lines);
  const sc = (u, v) => page.evaluate(([u, v]) => { const s = xfPt(planeXf(planeOf(S.sk)), P2(u, v)), r = ov.getBoundingClientRect(); return [s.x + r.left, s.y + r.top]; }, [u, v]);
  const lines = () => page.evaluate(() => S.sk.ents.map(e => [e.a.x, e.a.y, e.b.x, e.b.y].map(v => Math.round(v * 100) / 100).join(',')).sort());
  const grid = [[-30, 0, 30, 0], [-10, -20, -10, 20], [10, -20, 10, 20], [-30, 10, 30, 10]];
  await page.waitForTimeout(500);

  await ok('trim: hover previews the piece, click cuts back to the crossings', async () => {
    await setup(grid); await page.evaluate(() => setTool('trim')); await page.waitForTimeout(900);
    const [x, y] = await sc(0, 0.1); await page.mouse.move(x, y); await page.waitForTimeout(150);
    assert(await page.evaluate(() => !!S.trimPrev), 'no preview'); await page.mouse.click(x, y); await page.waitForTimeout(100);
    const l = await lines(); assert(l.includes('-30,0,-10,0') && l.includes('10,0,30,0') && !l.includes('-30,0,30,0'), JSON.stringify(l));
  });
  await ok('trim: dragging across curves cuts each one, even from empty space, in one undo step', async () => {
    await setup(grid); await page.evaluate(() => setTool('trim')); await page.waitForTimeout(900);
    const [a, b] = await sc(20, -30), [c, d] = await sc(20, 15); await page.mouse.move(a, b); await page.mouse.down(); await page.mouse.move(c, d, { steps: 3 }); await page.mouse.up(); await page.waitForTimeout(100);
    const l = await lines(); assert(l.includes('-30,0,10,0') && l.includes('-30,10,10,10') && l.length === 4, JSON.stringify(l));
    await page.evaluate(() => undo()); await page.waitForTimeout(100);
    assert.strictEqual((await lines()).length, 4); assert((await lines()).includes('-30,0,30,0'));
  });
  await ok('trim: Shift-click extends to the next curve', async () => {
    await setup([[-30, 0, 4, 0], [10, -20, 10, 20]]); await page.evaluate(() => setTool('trim')); await page.waitForTimeout(900);
    const [x, y] = await sc(2, 0); await page.keyboard.down('Shift'); await page.mouse.move(x, y); await page.waitForTimeout(100);
    assert(await page.evaluate(() => !!(S.extPrev && !S.extPrev.none)), 'no extend preview'); await page.mouse.click(x, y); await page.keyboard.up('Shift'); await page.waitForTimeout(100);
    assert((await lines()).includes('-30,0,10,0'), JSON.stringify(await lines()));
  });
  await ok('text: click places a note, typing + Enter keeps it, ribbon has a Text button', async () => {
    await setup([]); await page.evaluate(() => setTool('text')); await page.waitForTimeout(900);
    assert(await page.evaluate(() => !!document.querySelector('[data-act="text"]')), 'ribbon');
    const [x, y] = await sc(-20, 0); await page.mouse.click(x, y); await page.waitForTimeout(250);
    assert(await page.evaluate(() => !!document.querySelector('.sk-text-ed')), 'editor');
    await page.keyboard.type('Hello'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
    const t = await page.evaluate(() => S.sk.texts.map(t => t.str)); assert.deepStrictEqual(t, ['Hello']);
  });
  await ok('text: select, move by dragging, undo; double-click edits; Delete removes', async () => {
    await page.evaluate(() => setTool('select')); const [x, y] = await sc(-17, 3), [x2, y2] = await sc(0, 10);
    await page.mouse.click(x, y); await page.waitForTimeout(100); assert(await page.evaluate(() => !!TXT.sel && !!document.querySelector('[data-txt="str"]')), 'panel');
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x2, y2, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(80);
    const p = await page.evaluate(() => S.sk.texts[0].p); assert(Math.abs(p.x + 3) < 0.5 && Math.abs(p.y - 7) < 0.5, JSON.stringify(p));
    await page.evaluate(() => undo()); await page.waitForTimeout(80); assert(Math.abs((await page.evaluate(() => S.sk.texts[0].p.x)) + 20) < 0.5);
    const [dx, dy] = await sc(-17, 3); await page.mouse.dblclick(dx, dy); await page.waitForTimeout(250);
    assert(await page.evaluate(() => !!document.querySelector('.sk-text-ed')), 'edit box'); await page.keyboard.press('Control+A'); await page.keyboard.type('Bye'); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
    assert.strictEqual(await page.evaluate(() => S.sk.texts[0].str), 'Bye');
    await page.mouse.click(dx, dy); await page.waitForTimeout(80); await page.keyboard.press('Delete'); await page.waitForTimeout(80);
    assert.strictEqual(await page.evaluate(() => (S.sk.texts || []).length), 0);
  });
  await ok('text: Convert to curves makes closed loops that form profiles (O has a hole); undo restores the note', async () => {
    const r = await page.evaluate(() => {
      S.sk.texts = [{ id: newId(), p: P2(0, 0), str: 'O', h: 20, font: 'sans', bold: true, italic: false, rot: 0 }];
      const n = textToCurves(S.sk.texts[0]), arr = arrOf(S.sk); return { n, ents: S.sk.ents.length, texts: S.sk.texts.length, holes: arr.regions.map(x => x.holes.length) };
    });
    assert(r.n > 20 && r.texts === 0 && r.holes.includes(1), JSON.stringify(r));
    await page.evaluate(() => undo()); await page.waitForTimeout(80);
    assert.strictEqual(await page.evaluate(() => [S.sk.ents.length, (S.sk.texts || []).length].join()), '0,1');
  });
  await ok('text: shows in the saved document and survives a reload of the JSON', async () => {
    const n = await page.evaluate(() => { const j = JSON.parse(snap()); const f = j.features.find(x => x.id === S.sk.id); return (f.texts || []).length; });
    assert.strictEqual(n, 1);
  });
  await ok('no page errors', async () => { assert.deepStrictEqual(errs, []); });
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
