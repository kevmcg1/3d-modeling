// Every hover tip card must play the tool being used: an action scene that moves, never a still picture or a morph.
// Checks (1) no page uses the old before / after morph, (2) every tip key registered by each page has an action scene,
// (3) every scene changes over the loop and none is a crossfade of two pictures, (4) a sample of real hovers shows a moving canvas.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/tip-anim.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (index.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), fs = require('fs'), assert = require('assert');
const { sweep, offline, openPage } = require('./tip-anim.audit.js');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 900)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });

  await ok('no page or script still builds a before / after morph for tip cards', () => {
    const bad = [];
    for (const f of fs.readdirSync(ROOT).filter(f => /\.(html|js)$/.test(f) && !/^datum\.pre-|^tip-anim-legacy\.js$|^tip-anim\.js$/.test(f))) {
      const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
      if (/TipAnim\.pics\(/.test(s)) bad.push(f + ' calls TipAnim.pics');
      if (/legacyPics/.test(s) && !/TipAnim\.pic\(/.test(s)) bad.push(f + ' uses legacyPics without a scene');
    }
    assert.deepStrictEqual(bad, []);
  });

  // keys every page registers for its tool cards
  const missing = {};
  await ok('every tip key of the main app has an action scene', async () => {
    const p = await openPage(browser, 'index.html');
    const m = await p.evaluate(() => {
      const keys = new Set([...Object.keys(TIP_TXT), ...Object.keys(TIP_ART), ...Object.keys(BTN_TXT), ...Object.keys(OP_INFO).map(k => 'add:' + k)]);
      return [...keys].filter(k => !TipAnim.has(k));
    });
    await p.close(); assert.deepStrictEqual(m, [], 'tip keys without an action scene: ' + m.join(' '));
  });
  await ok('every 2D Drawing command and mode has an action scene', async () => {
    const p = await openPage(browser, 'drawing2d.html');
    const m = await p.evaluate(() => {
      const keys = new Set();
      for (const c of Object.keys(TI)) { keys.add(ARTMAP[c] || c); const t = TI[c]; if (t.modes && ['circle', 'arc', 'ellipse'].includes(c)) t.modes.forEach(x => keys.add(c + x.id)); }
      for (const T of [BTN, AIDINFO, MISC]) Object.values(T).forEach(v => v[3] && keys.add(v[3]));
      return [...keys].filter(k => !TipAnim.has(k));
    });
    await p.close(); assert.deepStrictEqual(m, [], 'keys without an action scene: ' + m.join(' '));
  });
  await ok('every House Design tip has an action scene', async () => {
    const p = await openPage(browser, 'house.html');
    const m = await p.evaluate(() => Object.keys(HOUSE.TIPS).filter(k => !TipAnim.has('h:' + k)));
    await p.close(); assert.deepStrictEqual(m, [], 'keys without an action scene: ' + m.join(' '));
  });

  let off = null;
  await ok('every scene draws, moves through the loop and is not a crossfade of two pictures', async () => {
    off = await offline(browser);
    const bad = [];
    for (const [k, o] of Object.entries(off)) {
      if (o.error) bad.push(k + ' (throws)'); else if (o.changes < 3) bad.push(k + ' (barely moves: ' + o.changes + ' of 8 steps change)'); else if (o.crossfade > 0.5) bad.push(k + ' (looks like a crossfade: ' + (o.crossfade * 100).toFixed(0) + '% blend)');
    }
    assert.deepStrictEqual(bad, []);
    assert(Object.keys(off).length > 350, 'only ' + Object.keys(off).length + ' scenes');
  });

  await ok('hovering real tip cards in every tab shows a moving action scene (sample)', async () => {
    const rows = await sweep(browser, { quick: true });
    const bad = rows.filter(r => !r.scene || !r.hover || r.moved < 0.002 || r.still).map(r => `${r.tab}: ${r.title} [${r.key}] ${r.scene ? 'not moving' : 'no scene'}`);
    assert(rows.length > 60, 'only ' + rows.length + ' cards hovered');
    assert.deepStrictEqual(bad, []);
  });
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
