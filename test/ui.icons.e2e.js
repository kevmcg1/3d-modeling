// Icons: every icon button has a pure-CSS tooltip (a ::after reading data-ctip: no HTML element) that shows at once, steps aside for the
// rich animated card on a long hover, never runs off the window or gets clipped by a scrolling ribbon, and moves on hover in a way that
// fits what the button does (Revolve turns, Extrude lifts, Mirror flips ...), each icon always the same way. Reduced motion keeps the label
// and drops the motion.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/ui.icons.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (3d-modeler.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 900)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } }); await page.addInitScript(() => { window.DATUM_PREMIUM = true; window.DATUM_AUTO = true; window.DATUM_NOFX = true; });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' })); await page.route(/gate\.js/, r => r.abort());
  await page.goto('file://' + path.resolve(__dirname, '..', '3d-modeler.html') + '?dev=1'); await page.waitForTimeout(3000);
  const centerOf = async sel => { const el = await page.$(sel); const b = await el.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const hover = async sel => { const c = await centerOf(sel); await page.mouse.move(c.x, c.y - 40); await page.mouse.move(c.x, c.y, { steps: 3 }); };
  const tip = sel => page.evaluate(s => { const b = document.querySelector(s), cs = getComputedStyle(b, '::after'); return { content: cs.content, opacity: +cs.opacity, vis: cs.visibility, pos: cs.position, left: parseFloat(cs.left), top: parseFloat(cs.top), w: parseFloat(cs.width), bg: cs.backgroundColor, fg: cs.color, label: b.dataset.ctip }; }, sel);
  const anim = sel => page.evaluate(s => { const b = document.querySelector(s); const v = b.querySelector('svg'); const n = getComputedStyle(v).animationName, kids = [...v.children].map(c => getComputedStyle(c).animationName).filter(x => x !== 'none'); return { n, kids, ico: b.dataset.ico }; }, sel);
  const RIBBON = (name) => `#toolbar .rb-btn[data-tipkey="${name}"], #toolbar [data-act="${name}"]`;

  await ok('every visible icon button has a label in data-ctip and a motion in data-ico; the old HTML tooltip is gone', async () => {
    const r = await page.evaluate(() => {
      const icons = [...document.querySelectorAll('button, [role="button"], .rb-btn, .tb, .vbtn')].filter(b => b.querySelector('svg') && b.getBoundingClientRect().width > 0 && !b.closest('#tipcard'));
      return { n: icons.length, missing: icons.filter(b => !b.dataset.ctip || !b.dataset.ico).slice(0, 8).map(b => (b.id || b.className || b.tagName) + ' [' + (b.getAttribute('aria-label') || b.textContent.trim().slice(0, 16)) + ']'), tip: !!document.getElementById('tip') && document.getElementById('tip').isConnected, kinds: new Set(icons.map(b => b.dataset.ico)).size };
    });
    assert(r.n > 100 && r.missing.length === 0 && !r.tip && r.kinds >= 12, JSON.stringify(r));
  });

  await ok('the tooltip is CSS alone: hover reads data-ctip through ::after, fades in at once, and no HTML tooltip element appears', async () => {
    await hover('#btnTheme');
    await page.waitForTimeout(450);
    const t = await tip('#btnTheme');
    assert(t.content === '"Theme"' && t.opacity > 0.95 && t.vis === 'visible' && t.label === 'Theme', JSON.stringify(t));
    const html = await page.evaluate(() => ({ tip: document.querySelectorAll('#tip, .tip.show, [role="tooltip"]').length, cardOpen: document.body.classList.contains('card-open') }));
    assert(html.tip === 0 && !html.cardOpen, 'no HTML bubble: ' + JSON.stringify(html));
    await page.mouse.move(700, 500); await page.waitForTimeout(450);
    assert((await tip('#btnTheme')).opacity < 0.05, 'fades away when the pointer leaves');
  });

  await ok('the label stays inside the window and is not clipped by the scrolling ribbon (placed by coordinates, fixed)', async () => {
    for (const sel of ['#btnHelp', '#toolbar .rb-btn:nth-of-type(3)', '#btnTheme', '#toolbar .rb-btn:nth-of-type(1)']) {
      await hover(sel); await page.waitForTimeout(450);
      const t = await tip(sel);
      assert(t.pos === 'fixed' && t.opacity > 0.9 && t.left - t.w / 2 >= -1 && t.left + t.w / 2 <= 1401 && t.top >= 0 && t.top < 850, sel + ' ' + JSON.stringify(t));
    }
    await page.mouse.move(700, 500);
  });

  await ok('holding the hover brings the rich card in and the CSS label steps aside; leaving removes both', async () => {
    const sel = '#toolbar .rb-btn:nth-of-type(2)';
    await hover(sel); await page.waitForTimeout(400);
    assert((await tip(sel)).opacity > 0.9, 'the label first');
    await page.waitForTimeout(1600);
    const r = await page.evaluate(() => ({ card: !document.getElementById('tipcard').hidden, open: document.body.classList.contains('card-open') }));
    assert(r.card && r.open, JSON.stringify(r));
    assert((await tip(sel)).opacity < 0.05, 'the label gave way to the card');
    await page.mouse.move(700, 500); await page.waitForTimeout(500);
    assert(await page.evaluate(() => document.getElementById('tipcard').hidden && !document.body.classList.contains('card-open')), 'both gone');
  });

  await ok('each icon moves in a way that fits it: Theme turns, Redo / Undo nudge opposite ways, Keys bounces, Section blinks; every one plays on hover and not at rest', async () => {
    const want = { '#btnTheme': 'ico-spin', '#btnHelp': 'ico-bounce', '#btnSection': 'ico-blink', '#btnFile': 'ico-rise' };
    for (const [sel, name] of Object.entries(want)) {
      await page.mouse.move(700, 500); await page.waitForTimeout(100);
      assert((await anim(sel)).n === 'none', sel + ' is still at rest');
      await hover(sel); await page.waitForTimeout(150);
      const a = await anim(sel); assert(a.n === name, `${sel}: ${JSON.stringify(a)} wanted ${name}`);
    }
    const lr = await page.evaluate(() => [ICONUX.kindOf('undo'), ICONUX.kindOf('redo'), ICONUX.kindOf('extrude'), ICONUX.kindOf('revolve'), ICONUX.kindOf('mirror'), ICONUX.kindOf('fillet'), ICONUX.kindOf('chamfer'), ICONUX.kindOf('delete'), ICONUX.kindOf('save'), ICONUX.kindOf('fit'), ICONUX.kindOf('sketch'), ICONUX.kindOf('pattern'), ICONUX.kindOf('measure'), ICONUX.kindOf('help'), ICONUX.kindOf('lock')]);
    assert.deepStrictEqual(lr, ['left', 'right', 'lift', 'spin', 'flip', 'pulse', 'slash', 'shake', 'drop', 'grow', 'draw', 'stagger', 'stretch', 'bounce', 'wiggle'], JSON.stringify(lr));
  });

  await ok('the ribbon icons move too (hover Extrude and the first Create tool): animation names differ between icons, and an icon always moves the same way', async () => {
    const r = await page.evaluate(() => { const bs = [...document.querySelectorAll('#toolbar .rb-btn')].filter(b => b.dataset.ico); return { n: bs.length, kinds: [...new Set(bs.map(b => b.dataset.ico))].length, a: bs[0] && ICONUX.kindOf(ICONUX.keyOf(bs[0])) === bs[0].dataset.ico }; });
    assert(r.n > 30 && r.kinds >= 8 && r.a, JSON.stringify(r));
    const sel = '#toolbar .rb-btn:nth-of-type(2)';
    await hover(sel); await page.waitForTimeout(150); const a1 = await anim(sel);
    await page.mouse.move(700, 500); await page.waitForTimeout(200); await hover(sel); await page.waitForTimeout(150); const a2 = await anim(sel);
    assert(a1.n !== 'none' || a1.kids.length, 'it moves: ' + JSON.stringify(a1)); assert(JSON.stringify(a1) === JSON.stringify(a2), 'always the same: ' + JSON.stringify([a1, a2]));
  });

  await ok('keyboard focus shows the label too (Tab to a button)', async () => {
    await page.mouse.move(700, 500); await page.focus('#btnSection'); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); await page.waitForTimeout(450);
    const f = await page.evaluate(() => { const b = document.activeElement, cs = getComputedStyle(b, '::after'); return { id: b.id, opacity: +cs.opacity, fv: b.matches(':focus-visible') }; });
    assert(f.id === 'btnSection' && f.fv && f.opacity > 0.9, JSON.stringify(f));
    await page.evaluate(() => document.activeElement.blur());
  });

  await ok('buttons drawn later get their label and motion (switch to Manufacture)', async () => {
    await page.evaluate(() => setWorkspace('cam')); await page.waitForTimeout(1500);
    const r = await page.evaluate(() => { const bs = [...document.querySelectorAll('#toolbar .rb-btn')].filter(b => b.querySelector('svg')); return { n: bs.length, untagged: bs.filter(b => !b.dataset.ctip || !b.dataset.ico).length }; });
    assert(r.n > 20 && r.untagged === 0, JSON.stringify(r));
    await page.evaluate(() => setWorkspace('design')); await page.waitForTimeout(600);
  });

  await ok('light theme: the label is readable (text against its panel) and still CSS', async () => {
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await hover('#btnHelp'); await page.waitForTimeout(450);
    const t = await tip('#btnHelp'), L = s => { const m = s.match(/\d+(\.\d+)?/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
    assert(t.opacity > 0.9 && Math.abs(L(t.bg) - L(t.fg)) > 0.4, JSON.stringify(t));
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await page.mouse.move(700, 500);
  });

  await ok('reduced motion keeps the label and drops the motion', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await hover('#btnTheme'); await page.waitForTimeout(450);
    const a = await anim('#btnTheme'), t = await tip('#btnTheme');
    assert(a.n === 'none' && t.opacity > 0.9, JSON.stringify([a, t]));
    await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.mouse.move(700, 500);
  });

  await ok('the page raised no errors', async () => { assert.deepStrictEqual(errs, [], errs.join('\n')); });
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
