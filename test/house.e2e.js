// House Design in a real browser: quick trim (hover preview, click, drag fence, Shift extend) and text notes (place, edit, move, undo, DXF).
// Run: NODE_PATH=<dir with playwright> CHROMIUM_PATH=<chrome> node test/house.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 300)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'house.html')); await page.waitForTimeout(500);
  const pos = (x, y) => page.evaluate(([x, y]) => { const p = HOUSE.toS([x, y]), r = document.querySelector('#pc').getBoundingClientRect(); return [p[0] + r.left, p[1] + r.top]; }, [x, y]);
  const walls = () => page.evaluate(() => HOUSE.doc.walls.filter(w => w.lv === HOUSE.S.lv).map(w => [w.a, w.b].map(p => p.map(v => Math.round(v)).join(',')).join('>')).sort());
  const fresh = () => page.evaluate(() => { const d = HOUSE.doc, lv = HOUSE.S.lv; d.walls.length = 0; d.opens.length = 0; d.rooms.length = 0; d.roofs.length = 0; d.stairs.length = 0; d.dims.length = 0; d.texts.length = 0;
    HOUSE.addWall([0, 0], [240, 0], lv); HOUSE.addWall([80, -60], [80, 60], lv); HOUSE.addWall([160, -60], [160, 60], lv); HOUSE.addWall([0, 100], [240, 100], lv); HOUSE.addWall([120, 20], [120, 180], lv); HOUSE.commit(); HOUSE.zoomFit(true); });

  await ok('trim: hover previews the piece between the crossing walls', async () => {
    await fresh(); await page.evaluate(() => HOUSE.setTool('trim')); await page.waitForTimeout(400);
    const [x, y] = await pos(120, 0.5); await page.mouse.move(x, y); await page.waitForTimeout(200);
    assert(await page.evaluate(() => !!(HOUSE.S.hover && HOUSE.S.hover.span)));
  });
  await ok('trim: click removes just that piece and keeps the rest', async () => {
    const [x, y] = await pos(120, 0.5); await page.mouse.click(x, y); await page.waitForTimeout(100);
    const w = await walls(); assert(w.includes('0,0>80,0') && w.includes('160,0>240,0') && !w.includes('0,0>240,0'), JSON.stringify(w));
    await page.keyboard.press('Control+z'); await page.waitForTimeout(100); assert((await walls()).includes('0,0>240,0'));
  });
  await ok('trim: dragging a line across walls trims them all in one undo step', async () => {
    await fresh(); const [a, b] = await pos(100, -30), [c, d] = await pos(100, 130);
    await page.mouse.move(a, b); await page.mouse.down(); await page.mouse.move(c, d, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(100);
    const w = await walls(); assert(w.includes('0,0>80,0') && w.includes('160,0>240,0') && w.includes('120,100>240,100') && !w.includes('0,0>240,0') && !w.includes('0,100>240,100'), JSON.stringify(w));
    await page.keyboard.press('Control+z'); await page.waitForTimeout(100); assert((await walls()).includes('0,0>240,0') && (await walls()).includes('0,100>240,100'));
  });
  await ok('trim: Shift-click near a wall end runs it to the next wall', async () => {
    await page.evaluate(() => { const d = HOUSE.doc, lv = HOUSE.S.lv; d.walls.length = 0; HOUSE.addWall([0, 0], [70, 0], lv); HOUSE.addWall([120, -50], [120, 90], lv); HOUSE.commit(); HOUSE.zoomFit(true); });
    const [x, y] = await pos(65, 0); await page.keyboard.down('Shift'); await page.mouse.move(x, y); await page.waitForTimeout(150);
    assert(await page.evaluate(() => !!(HOUSE.S.hover && HOUSE.S.hover.ext)), 'extend preview'); await page.mouse.click(x, y); await page.keyboard.up('Shift'); await page.waitForTimeout(100);
    assert((await walls()).includes('0,0>120,0'), JSON.stringify(await walls()));
  });
  await ok('text: A key picks the tool, click + type + Enter places a multi-line note', async () => {
    await fresh(); await page.evaluate(() => HOUSE.setTool('select')); await page.keyboard.press('a'); assert.strictEqual(await page.evaluate(() => HOUSE.S.tool), 'text');
    const [x, y] = await pos(100, 40); await page.mouse.click(x, y); await page.waitForTimeout(250);
    assert(await page.evaluate(() => !!document.querySelector('.noteEd')), 'editor'); await page.keyboard.type('Deck'); await page.keyboard.press('Shift+Enter'); await page.keyboard.type('12 x 14'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
    assert.deepStrictEqual(await page.evaluate(() => HOUSE.doc.texts.map(t => t.str)), ['Deck\n12 x 14']);
  });
  await ok('text: select, drag to move, undo, properties panel, DXF export, delete', async () => {
    await page.keyboard.press('Escape'); await page.keyboard.press('v'); const [x, y] = await pos(104, 44), [x2, y2] = await pos(180, 120);
    await page.mouse.click(x, y); await page.waitForTimeout(100); assert(await page.evaluate(() => document.querySelector('#rside').textContent.includes('Letter size')), 'properties');
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x2, y2, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(100);
    const p = await page.evaluate(() => HOUSE.doc.texts[0].p); assert(Math.abs(p[0] - 176) < 6 && Math.abs(p[1] - 116) < 6, JSON.stringify(p));
    await page.keyboard.press('Control+z'); await page.waitForTimeout(80); assert(Math.abs(await page.evaluate(() => HOUSE.doc.texts[0].p[0]) - 100) <= 4);
    assert(await page.evaluate(() => /Deck/.test(HOUSE.exportDXF(false)) && /12 x 14/.test(HOUSE.exportDXF(false))));
    const [dx, dy] = await pos(104, 44); await page.mouse.click(dx, dy); await page.keyboard.press('Delete'); await page.waitForTimeout(80); assert.strictEqual(await page.evaluate(() => HOUSE.doc.texts.length), 0);
  });
  await ok('text: survives save and load (sanitize keeps notes)', async () => {
    const n = await page.evaluate(() => { const d = JSON.parse(JSON.stringify(HOUSE.doc)); d.texts = [{ id: 'tx1', lv: HOUSE.S.lv, p: [10, 10], str: 'Hi', h: 10, rot: 30, c: '#ff0000', bold: true }, { id: 'tx2', lv: HOUSE.S.lv, p: [1, 1], str: '  ', h: 10 }]; return HOUSE.sanitize(d).texts.length; });
    assert.strictEqual(n, 1);
  });
  await ok('no page errors', async () => { assert.deepStrictEqual(errs, []); });
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
