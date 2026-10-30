// The gate popup: it covers the page and blocks clicks, and pressing "-" dismisses it (it stays gone) so the page behind can be used.
// Run: NODE_PATH=<dir with playwright> CHROMIUM_PATH=<chrome> node test/gate.dismiss.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 600)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  await page.setContent('<!doctype html><html><head></head><body><button id="b" style="position:fixed;left:20px;top:20px;width:120px;height:40px">Under</button></body></html>');
  await page.addScriptTag({ path: path.resolve(__dirname, '..', 'gate.js') });
  const gate = () => page.evaluate(() => !!document.getElementById('nyGate'));
  await ok('the popup is up and covers the page', async () => { assert(await gate()); assert(await page.evaluate(() => document.elementFromPoint(40, 40).closest('#nyGate') !== null)); });
  await ok('other keys leave it up (including Ctrl+minus, the browser zoom)', async () => { await page.keyboard.press('a'); await page.keyboard.press('Control+-'); await page.waitForTimeout(400); assert(await gate()); });
  await ok('"-" dissolves it away and the page behind is clickable', async () => {
    await page.keyboard.press('-'); await page.waitForTimeout(100);
    assert(await page.evaluate(() => +getComputedStyle(document.getElementById('nyGate')).opacity) < 1, 'fading');
    await page.waitForTimeout(500); assert(!(await gate()), 'removed');
    assert(await page.evaluate(() => document.elementFromPoint(40, 40).id === 'b'));
  });
  await ok('it does not come back', async () => { await page.evaluate(() => document.body.appendChild(document.createElement('i'))); await page.waitForTimeout(300); assert(!(await gate())); });
  await ok('the numpad minus works too', async () => {
    const p2 = await browser.newPage(); await p2.setContent('<!doctype html><html><head></head><body></body></html>'); await p2.addScriptTag({ path: path.resolve(__dirname, '..', 'gate.js') });
    await p2.keyboard.press('NumpadSubtract'); await p2.waitForTimeout(500); assert(!(await p2.evaluate(() => !!document.getElementById('nyGate'))));
  });
  await browser.close(); console.log(`${pass} passed, ${fail} failed`); if (fail) process.exit(1);
})();
