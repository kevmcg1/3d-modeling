/* Browser tests: clicks every control, fuzzes every input, drags, exports, undo, reload.
   Run:  node test/e2e.js      (needs playwright or playwright-core; set CHROMIUM=/path/to/chromium if it is not found) */
const http = require('http'), fs = require('fs'), path = require('path');
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { try { ({ chromium } = require('playwright')); } catch (e2) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (e3) { console.log('skip: playwright is not installed'); process.exit(0); } } }
const ROOT = path.join(__dirname, '..');
let fails = 0, passes = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL ' + m); } else { passes++; if (process.env.VERBOSE) console.log('ok - ' + m); } };

(async () => {
  const server = http.createServer((q, r) => {
    const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.statusCode = 404; return r.end(); }
    r.setHeader('content-type', /\.js$/.test(f) ? 'text/javascript' : 'text/html'); r.end(fs.readFileSync(f));
  }).listen(0);
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--no-sandbox'] });
  const errors = [];
  async function open(opts = {}) {
    const ctx = opts.ctx || await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 200)));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
    page.on('dialog', d => d.accept());
    await page.route('**/*', route => { const u = route.request().url(); if (u.startsWith(url)) return route.continue(); return route.fulfill({ body: '', contentType: 'text/javascript' }); });   // CDNs (PDF export) are not needed here
    await page.goto(url);
    return { page, ctx };
  }
  const noErrors = m => { ok(errors.length === 0, `${m}: no page errors${errors.length ? ' - ' + errors.join(' | ') : ''}`); errors.length = 0; };
  const svgText = page => page.$eval('#oSheet svg', s => s.outerHTML);
  const clean = async (page, m) => { const t = await svgText(page); ok(!/NaN|undefined|Infinity|null/.test(t.replace(/font-family="[^"]*"/g, '')), `${m}: drawing has no NaN / undefined`); return t; };
  const stateOf = async page => { await page.waitForTimeout(450); return page.evaluate(() => { const k = Object.keys(localStorage).find(k => { try { const o = JSON.parse(localStorage.getItem(k)); return o && o.fx; } catch (e) { return false; } }); return k ? JSON.parse(localStorage.getItem(k)) : null; }); };
  const openAll = page => page.evaluate(() => document.querySelectorAll('#orientView details.sec').forEach(d => { d.open = true; d.classList.remove('closing'); }));
  const toFixture = async page => { await openAll(page); await page.click('#modeSeg [data-v=orient]'); await page.click('[data-seg=machine] [data-v=fixture]'); await page.waitForTimeout(450); };
  const texts = page => page.$$eval('#oSheet svg text', t => t.map(x => x.textContent).join('|'));

  /* ---- 1. first load and the original tools still work ---- */
  let { page, ctx } = await open();
  ok(await page.title() === 'Setup Sheet Generator', 'page loads');
  await page.waitForSelector('#page');
  noErrors('first load');
  for (const sample of ['mill', 'lathe']) { await page.click(`[data-sample=${sample}]`); await page.waitForTimeout(200); }
  const crawl = async (scope, label) => {
    const btns = await page.$$(`${scope} button:not([disabled]), ${scope} summary`);
    let clicked = 0;
    for (const b of btns) {
      const vis = await b.isVisible().catch(() => false); if (!vis) continue;
      const txt = (await b.textContent().catch(() => '') || '').trim(), id = (await b.getAttribute('id').catch(() => '')) || '';
      if (/^(SVG|PNG|PDF|Print)/i.test(txt) || /pdfBtn|printBtn|svgBtn/.test(id) || /Reset Everything|Open Project|Import|Image/.test(txt)) continue;
      try { await b.click({ timeout: 800 }); clicked++; } catch (e) { /* covered or animating: not an app error */ }
    }
    noErrors(`${label}: clicked ${clicked} controls`);
  };
  await crawl('#sheetView', 'Setup Sheet crawl');
  for (const el of (await page.$$('#sheetView input[type=text]')).slice(0, 40)) { if (await el.isVisible()) await el.fill('xxxxxé<>&"\'').catch(() => {}); }
  noErrors('Setup Sheet: typed into text fields');

  /* ---- 2. orientation (mill and lathe) regression ---- */
  await page.click('#modeSeg [data-v=orient]'); await page.waitForTimeout(300);
  for (const mach of ['mill', 'lathe', 'mill']) {
    await openAll(page); await page.click(`[data-seg=machine] [data-v=${mach}]`); await page.waitForTimeout(350);
    await crawl('#orientView .editor', `Orientation ${mach} crawl`);
    await clean(page, `orientation ${mach}`);
  }

  /* ---- 3. Table · Fixtures ---- */
  await toFixture(page);
  ok(await page.$eval('#orientView', e => e.dataset.machine) === 'fixture', 'fixture mode is on');
  ok(await page.isVisible('#fxLib'), 'fixture library is visible'); ok(!(await page.isVisible('[data-bind=stockW]')), 'vise-only controls are hidden in fixture mode');
  await clean(page, 'empty table');
  await page.click('#fxLib .dd-btn'); await page.waitForTimeout(250);
  ok(await page.$eval('#fxLib', e => e.classList.contains('open')), 'dropdown opens');
  const opts = await page.$$eval('#fxLib .dd-opt', os => os.map(o => o.dataset.v));
  ok(opts.length >= 9, `library lists ${opts.length} fixtures`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  ok(!(await page.$eval('#fxLib', e => e.classList.contains('open'))), 'Escape closes the dropdown');
  for (const id of opts) {
    await page.click('#fxLib .dd-btn'); await page.click(`#fxLib .dd-opt[data-v="${id}"]`);
    ok((await page.textContent('#fxLib .dd-btn')).length > 2, `picked ${id}`);
    await page.click('[data-fxact=add]'); await page.waitForTimeout(80);
    await clean(page, `added ${id}`);
  }
  noErrors('added every fixture');
  const nItems = await page.$$eval('#fxItems .fx-item', e => e.length); ok(nItems === opts.length, `${nItems} cards for ${opts.length} fixtures`);
  await page.focus('#fxLib .dd-btn'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  ok(!(await page.$eval('#fxLib', e => e.classList.contains('open'))), 'Enter picks and closes');

  for (let i = 0; i < 40; i++) {
    const cards = await page.$$('#fxItems .fx-item'); if (i >= cards.length) break;
    const c = cards[i]; await (await c.$('[data-fxact=toggle]')).click(); await page.waitForTimeout(60);
    for (const b of await c.$$('[data-fxseg] button, [data-fxact=place], [data-fxact=fit]')) { if (await b.isVisible()) await b.click({ timeout: 1500 }).catch(() => {}); }
  }
  noErrors('clicked every card control'); await clean(page, 'after card clicks');

  // fuzz every text input on the page
  const FUZZ = ['', ' ', 'abc', '-5', '0', '1e999', '99999999', '1/0', '1/2', '1 3/8', '12mm', '5"', '٣', '<img src=x onerror=alert(1)>', '"><script>x</script>', 'NaN', 'Infinity', '9'.repeat(60), '0.0000001', '-0', '1,5', '\u{1F600}'];
  const inputs = await page.$$eval('#orientView [data-fx]', els => els.map(e => e.dataset.fx));
  ok(inputs.length > 50, `fuzzing ${inputs.length} inputs`);
  for (const key of inputs) {
    const sel = `#orientView [data-fx="${key}"]`;
    for (const v of FUZZ) await page.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, v).catch(() => {});
    await page.$eval(sel, e => e.blur()).catch(() => {});
  }
  await page.waitForTimeout(500);
  noErrors('fuzzed every input'); await clean(page, 'after fuzz');
  const bad = [];
  const chk = (o, p) => { for (const k in o) { const v = o[k], q = p + '.' + k; if (typeof v === 'number' && (!Number.isFinite(v) || Math.abs(v) > 1000)) bad.push(q + '=' + v); else if (v && typeof v === 'object') chk(v, q); } };
  let st = await stateOf(page);
  chk(st.fx, 'fx'); ok(bad.length === 0, 'every saved number is finite and in range' + (bad.length ? ': ' + bad.slice(0, 5).join(', ') : ''));
  ok(st.fx.items.every(i => typeof i.name === 'string' && i.name.length <= 40), 'item names stay short');
  ok(!(await svgText(page)).includes('<img'), 'typed HTML never reaches the drawing as markup');
  ok(!(await page.$eval('#fxItems', e => e.innerHTML)).includes('<img src=x'), 'typed HTML is escaped in the cards');

  /* ---- 4. adding / editing / deleting ---- */
  await page.evaluate(() => document.querySelector('[data-fxact=ex-clamps]').click()); await page.waitForTimeout(300);
  ok((await page.$$('#fxItems .fx-item')).length === 4, 'example loads four clamps');
  ok(!(await page.textContent('#fxWarn')).includes('hangs'), 'example has no warnings');
  ok(/80×20×8 mm, M10/.test(await texts(page)), 'parts list shows the 80×20×8 mm M10 toe clamp');
  const first = await page.$('#fxItems .fx-item');
  await (await first.$('[data-fxact=toggle]')).click(); await page.waitForTimeout(350);
  await (await first.$('[data-fxseg$=":p.length"] button[data-v="90"]')).click();
  await (await first.$('[data-fxseg$=":p.thick"] button[data-v="12"]')).click();
  await (await first.$('[data-fxseg$=":p.thread"] button[data-v="M8"]')).click();
  await page.waitForTimeout(200);
  ok(/90×20×12 mm, M8/.test(await texts(page)), 'toe clamp changes to 90×20×12, M8');
  await (await first.$('[data-fx$=":x"]')).fill('1.5'); await page.waitForTimeout(150);
  ok((await stateOf(page)).fx.items[0].x === 1.5, 'typing X moves the fixture');
  await (await first.$('[data-fxact=place][data-side=back]')).click(); await page.waitForTimeout(150);
  ok((await stateOf(page)).fx.items[0].rot === 180, 'Place at back turns the clamp 180°');
  await (await first.$('[data-fxseg$=":rot"] button[data-v="90"]')).click();
  ok((await stateOf(page)).fx.items[0].rot === 90, 'rotation button works');
  await (await first.$('[data-fxact=dup]')).click(); await page.waitForTimeout(150);
  ok((await page.$$('#fxItems .fx-item')).length === 5, 'duplicate adds a card');
  await (await (await page.$$('#fxItems .fx-item'))[1].$('[data-fxact=del]')).click(); await page.waitForTimeout(150);
  ok((await page.$$('#fxItems .fx-item')).length === 4, 'delete removes a card');
  noErrors('edit flow');

  // dragging in the top view
  const stockBefore = (await stateOf(page)).fx.stock;
  const bb = await (await page.$('#oSheet [data-fxi="stock"]')).boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.mouse.move(bb.x + bb.width / 2 + 40, bb.y + bb.height / 2 - 30, { steps: 6 }); await page.mouse.up();
  const stockAfter = (await stateOf(page)).fx.stock;
  ok(stockAfter.x > stockBefore.x && stockAfter.y > stockBefore.y, `dragging moves the stock (${stockBefore.x},${stockBefore.y}) -> (${stockAfter.x},${stockAfter.y})`);
  const ib = await (await page.$('#oSheet [data-fxi^="i"]')).boundingBox();
  await page.mouse.move(ib.x + ib.width / 2, ib.y + ib.height / 2); await page.mouse.down(); await page.mouse.move(ib.x + 3000, ib.y - 3000, { steps: 4 }); await page.mouse.up();
  bad.length = 0; chk((await stateOf(page)).fx, 'drag'); ok(bad.length === 0, 'dragging far away stays inside the limits'); noErrors('drag');

  // undo / redo
  const cnt = async () => (await page.$$('#fxItems .fx-item')).length;
  const before = await cnt();
  await (await (await page.$$('#fxItems .fx-item'))[0].$('[data-fxact=del]')).click(); await page.waitForTimeout(700);
  ok(await cnt() === before - 1, 'deleted for undo test');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(500); ok(await cnt() === before, 'Ctrl+Z restores the fixture');
  await page.keyboard.press('Control+y'); await page.waitForTimeout(500); ok(await cnt() === before - 1, 'Ctrl+Y redoes it');
  await page.click('#undoBtn'); await page.waitForTimeout(400); ok(await cnt() === before, 'undo button works');
  noErrors('undo / redo');

  // origin picking by clicking the drawing, axes arrows, themes, surfaces
  await page.click('#oSheet .tgt[data-view=top][data-o=br]', { force: true }); await page.waitForTimeout(500);
  ok((await stateOf(page)).topOrigin === 'br', 'clicking the drawing sets the origin');
  await page.check('[data-bind=axes]'); await page.waitForTimeout(400); await clean(page, 'axes on');
  await page.click('#uiTheme'); await page.waitForTimeout(200); await page.click('#uiTheme');
  for (const k of ['plain', 'holes', 'tslots']) { await page.click(`[data-seg="fx.plate.pattern"] [data-v=${k}]`); await page.waitForTimeout(200); await clean(page, `surface ${k}`); }
  noErrors('origin, axes, theme, surface');

  /* ---- 5. custom fixtures ---- */
  await openAll(page); await page.waitForTimeout(400);
  const BADJSON = ['', '{', 'null', '[]', '{"id":"a"}', '{"id":"vise","name":"x","parts":[{"shape":"box","x":[0,1],"y":[0,1],"z":[0,1]}]}', '{"id":"a b","name":"x","parts":[]}', '{"id":"q","name":"q","parts":[{"shape":"box","x":["$zz",1],"y":[0,1],"z":[0,1]}]}', '{"id":"q","name":"q","parts":[{"shape":"box","x":[0,1e12],"y":[0,1],"z":[0,1]}]}', '{"id":"q","name":"<b>q</b>","parts":[{"shape":"prism","profile":[[0,0]],"len":[0,1]}]}'];
  for (const j of BADJSON) { await page.fill('#fxJson', j); await page.click('[data-fxact=json-add]'); ok(await page.isVisible('#fxJsonErr'), `bad JSON shows an error: ${j.slice(0, 30)}`); }
  const libBefore = (await page.$$('#fxLib .dd-opt')).length;
  await page.click('[data-fxact=json-example]'); await page.click('[data-fxact=json-add]'); await page.waitForTimeout(200);
  ok(!(await page.isVisible('#fxJsonErr')), 'example JSON is accepted'); ok((await page.$$('#fxLib .dd-opt')).length === libBefore + 1, 'custom fixture joins the library');
  ok((await page.textContent('#fxLib .dd-btn')).includes('Riser'), 'custom fixture is selected');
  await page.click('[data-fxact=add]'); await page.waitForTimeout(200); await clean(page, 'custom fixture drawn');
  ok((await texts(page)).includes('Riser block'), 'custom fixture is in the parts list');
  await page.waitForTimeout(500); await page.reload(); await page.waitForTimeout(600);
  ok((await page.$$('#fxLib .dd-opt')).length === libBefore + 1, 'custom fixture survives a reload'); ok((await page.$$('#fxItems .fx-item')).length > 0, 'fixtures survive a reload');
  ok(await page.$eval('#orientView', e => e.dataset.machine) === 'fixture', 'fixture mode survives a reload');
  await page.click('#modeSeg [data-v=orient]'); await page.waitForTimeout(300);
  await openAll(page); await page.waitForTimeout(300); await clean(page, 'after reload');
  await page.click('[data-fxact=json-del]'); await page.waitForTimeout(300); ok((await page.$$('#fxLib .dd-opt')).length === libBefore, 'custom fixture can be removed');
  noErrors('custom fixtures');

  /* ---- 6. exports ---- */
  const dl = await Promise.all([page.waitForEvent('download'), page.click('#svgBtn')]).then(([d]) => d);
  const svgFile = fs.readFileSync(await dl.path(), 'utf8'), svgBody = svgFile.replace(/<style>[\s\S]*?<\/style>/, '');   // the embedded font is base64, which can contain any letters
  ok(/<svg/.test(svgBody) && !/NaN|undefined/.test(svgBody) && !/data-fxi|class="tgt"/.test(svgBody), 'SVG export is clean (no editing handles)');
  ok(svgFile.includes('@font-face'), 'SVG export embeds the font');
  const png = await Promise.all([page.waitForEvent('download'), page.click('[data-action=png]')]).then(([d]) => d); const pb = fs.readFileSync(await png.path()); ok(pb.slice(1, 4).toString() === 'PNG' && pb.length > 5000, 'PNG export is a real image');
  await page.click('[data-action=copy-code]'); await page.waitForTimeout(300); ok((await page.inputValue('#codeBox')).length > 1000, 'code export works');
  await page.click('[data-action=send]'); await page.waitForTimeout(600);
  ok(await page.$eval('html', h => h.dataset.mode) === 'sheet', 'Use in Setup Sheet switches to the sheet'); ok(await page.$eval('#imgEl', i => i.src.startsWith('data:image/svg')), 'drawing lands on the sheet');
  noErrors('exports');

  /* ---- 7. hostile saved data ---- */
  const hostile = [
    { fx: { items: 'nope', custom: 7, plate: { w: 'x', pattern: 'evil' }, stock: null } }, { fx: { items: [null, 3, { type: 5 }, { type: 'vise', p: 'x', x: 'a', rot: {} }, { type: '__proto__' }] } },
    { machine: 'fixture', fx: { items: Array(200).fill({ type: 'vblock', x: 1, y: 1 }) } }, { machine: 'banana' }, { fx: { custom: [{ id: 'z', name: 'z', parts: [{ shape: 'box', x: ['alert(1)', 1], y: [0, 1], z: [0, 1] }] }] } },
    { fx: { plate: { w: 1e99, d: -4 }, stock: { w: 0, h: 'inf' } } },
  ];
  for (const h of hostile) {
    await page.evaluate(h => { const k = Object.keys(localStorage).find(k => { try { return JSON.parse(localStorage.getItem(k)).fx; } catch (e) { return false; } }); localStorage.setItem(k, JSON.stringify(h)); }, h);
    await page.reload(); await page.waitForTimeout(500);
    await page.click('#modeSeg [data-v=orient]'); await page.waitForTimeout(300);
    if (await page.$eval('#orientView', e => e.dataset.machine) !== 'fixture') await page.click('[data-seg=machine] [data-v=fixture]');
    await page.waitForTimeout(400); await clean(page, 'hostile saved data ' + JSON.stringify(h).slice(0, 40));
    ok((await page.$$('#fxItems .fx-item')).length <= 40, 'item count is capped');
  }
  noErrors('hostile saved data');
  await ctx.close();

  /* ---- 8. small screen ---- */
  const small = await browser.newContext({ viewport: { width: 900, height: 700 } }); const sp = await open({ ctx: small });
  await sp.page.click('#modeSeg [data-v=orient]'); await sp.page.click('[data-seg=machine] [data-v=fixture]'); await sp.page.click('[data-fxact=ex-vise]'); await sp.page.waitForTimeout(500);
  await clean(sp.page, 'small screen vise example'); noErrors('small screen');
  await small.close();

  await browser.close(); server.close();
  console.log(`${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
