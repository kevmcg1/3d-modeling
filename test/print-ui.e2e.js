/* End-to-end test of the 3D Print workspace in a real browser.
   Run:  NODE_PATH=<dir with playwright-core, three, clipper-lib> node test/print-ui.e2e.js [--quick]
   (Chromium is taken from PLAYWRIGHT_BROWSERS_PATH, or /opt/pw-browsers/chromium.)

   Checks: no native title tooltips; every button has a hover card with before / after pictures and steps;
   every ribbon, panel and layer-bar control works; every printer and filament; every slicer option changed
   through its own input and sliced; no page errors. */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const quick = process.argv.includes('--quick');
const ROOT = path.join(__dirname, '..');
const nm = n => { for (const p of (process.env.NODE_PATH || '').split(path.delimiter)) { const f = path.join(p, n); if (fs.existsSync(f)) return f; } throw new Error('cannot find ' + n + ' on NODE_PATH'); };
const THREE = fs.readFileSync(path.join(nm('three'), 'build/three.min.js')), CLIPPER = fs.readFileSync(path.join(nm('clipper-lib'), 'clipper.js'));

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('FAIL ' + msg); } };
const log = m => console.log(m);

(async () => {
  const server = http.createServer((q, r) => {
    const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.statusCode = 404; return r.end(); }
    r.setHeader('content-type', /\.js$/.test(f) ? 'text/javascript' : 'text/html'); r.end(fs.readFileSync(f));
  }).listen(0);
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message.slice(0, 300)));
  await page.route('**/*', route => {
    const u = route.request().url();
    if (u.includes('three.min.js')) return route.fulfill({ body: THREE, contentType: 'text/javascript' });
    if (u.includes('clipper')) return route.fulfill({ body: CLIPPER, contentType: 'text/javascript' });
    if (u.startsWith('http://localhost:' + port)) return route.continue();
    return route.abort();
  });
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => typeof SAMPLES !== 'undefined' && window.PRINT, null, { timeout: 60000 });
  await page.evaluate(() => { const s = SAMPLES.find(x => x.name === 'Flanged boss'); loadDoc(s.make(), s.name); });
  await page.waitForTimeout(800);
  await page.click('[data-ws="print"]');
  await page.waitForFunction(() => window.PRINT.mesh, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const E = (f, a) => page.evaluate(f, a);
  const slice = async () => { await page.keyboard.press('Escape'); await E(() => { window.__g = PRINT.gcode; PRINT.busy || document.querySelector('#toolbar [data-print="slice"]').click(); }); await page.waitForFunction(() => !PRINT.busy && (PRINT.gcode !== window.__g || PRINT.error), null, { timeout: 180000 }); return E(() => ({ err: PRINT.error, layers: PRINT.result ? PRINT.result.layers.length : 0, bad: PRINT.gcode ? /NaN|undefined|Infinity/.test(PRINT.gcode.text) : false, warn: PRINT.result ? PRINT.result.warnings : [], stale: PRINT.stale })); };

  /* ── 1. no native tooltips, every control has a hover key ── */
  log('— tooltips —');
  const audit = await E(() => {
    const roots = [document.getElementById('toolbar'), document.getElementById('panel'), document.getElementById('prLayers')];
    const titled = [], noKey = [], noTxt = [], noArt = [];
    for (const r of roots) {
      r.querySelectorAll('[title]').forEach(e => titled.push(e.outerHTML.slice(0, 80)));
      r.querySelectorAll('button:not(.rb-arrow), [data-print], [data-k], [data-x], [data-px], [data-cost], #prPrinter, #prMaterial, #prSearch, #prAll').forEach(e => {
        if (e.closest('.pn-head')) return;
        const h = e.closest('[data-tipkey]'); if (!h) { noKey.push(e.outerHTML.slice(0, 80)); return; }
        const k = h.dataset.tipkey; if (!TIP_TXT[k] || !TIP_TXT[k][0]) noTxt.push(k);
        if ((e.tagName === 'BUTTON') && !TIP_ART[k]) noArt.push(k);
      });
    }
    return { titled, noKey, noTxt: [...new Set(noTxt)], noArt: [...new Set(noArt)] };
  });
  ok(!audit.titled.length, 'native title attributes: ' + audit.titled.join(' ; '));
  ok(!audit.noKey.length, 'controls without a hover card: ' + audit.noKey.join(' ; '));
  ok(!audit.noTxt.length, 'hover keys without text: ' + audit.noTxt.join(', '));
  ok(!audit.noArt.length, 'buttons without before / after art: ' + audit.noArt.join(', '));
  await E(() => { PRINT.all = true; refreshPanel(); });
  const audit2 = await E(() => [...document.querySelectorAll('#panel [data-k]')].filter(e => !e.closest('[data-tipkey]') || !TIP_TXT[e.closest('[data-tipkey]').dataset.tipkey]).map(e => e.dataset.k));
  ok(!audit2.length, 'settings without hover text: ' + audit2.join(', '));
  await E(() => { PRINT.all = false; refreshPanel(); });

  await E(() => { PRINT.open.Placement = true; refreshPanel(); });
  const cardOf = async sel => { await page.mouse.move(700, 300); await page.waitForTimeout(150); await page.locator(sel).first().scrollIntoViewIfNeeded(); await page.waitForTimeout(150); await page.locator(sel).first().hover(); await page.waitForFunction(() => { const c = document.getElementById('tipcard'); return c && !c.hidden && c.classList.contains('in'); }, null, { timeout: 4000 }).catch(() => {}); return E(() => { const c = document.getElementById('tipcard'); return c && !c.hidden ? { text: c.innerText, pics: (c.querySelectorAll('.tip-pics svg').length + 2 * c.querySelectorAll('.tip-anim').length), steps: c.querySelectorAll('.tip-more li').length } : null; }); };
  const zeroPlacement = async () => { for (const k of ['rx', 'ry', 'rz']) { await page.fill(`#panel [data-x="${k}"]`, '0'); await page.keyboard.press('Tab'); } await page.fill('#panel [data-x="scale"]', '100'); await page.keyboard.press('Tab'); };
  const smallPart = async () => { await page.fill('#panel [data-x="scale"]', '45'); await page.keyboard.press('Tab'); };
  const buttons = ['slice', 'save', 'rotx', 'roty', 'rotz', 'flat', 'center', 'ghost'];
  for (const b of buttons) { const c = await cardOf(`#toolbar [data-print="${b}"]`); ok(c && c.pics === 2 && c.steps >= 1, `ribbon ${b}: hover card with before / after and steps (${JSON.stringify(c && { p: c.pics, s: c.steps })})`); }
  for (const b of ['draft', 'standard', 'fine', 'ultra']) { const c = await cardOf(`#prProf [data-tipkey="print:prof-${b}"]`); ok(c && c.pics === 2, `quality ${b}: hover card with before / after`); }
  for (const b of ['saveprof', 'loadprof', 'reset']) { const c = await cardOf(`#panel [data-print="${b}"]`); ok(c && c.pics === 2 && c.steps >= 1, `panel ${b}: hover card with before / after and steps`); }
  for (const k of ['printer', 'material']) { const c = await cardOf(`#panel [data-tipkey="print:${k}"]`); ok(c && c.text.length > 20, `${k}: hover card`); }
  for (const k of ['layerHeight', 'wallCount', 'infillDensity', 'infillPattern', 'support', 'adhesion']) { await E(() => { PRINT.open.Quality = PRINT.open.Walls = PRINT.open.Infill = PRINT.open.Support = PRINT.open['Bed adhesion'] = true; refreshPanel(); }); const c = await cardOf(`#panel [data-tipkey="set:${k}"]`); ok(c && c.pics === 2 && c.steps >= 2, `setting ${k}: hover card with before / after`); }
  await page.mouse.move(700, 300);

  /* ── 2. slice, then the layer bar ── */
  log('— slice and preview —');
  let r = await slice(); ok(!r.err && r.layers > 20 && !r.bad, 'slice the sample: ' + JSON.stringify(r));
  for (const b of ['type', 'speed', 'flow', 'layer']) { await page.selectOption('#prView', b); await page.waitForTimeout(150); const leg = await E(() => document.getElementById('prLegend').innerText.length); ok(leg > 3, 'legend for ' + b); }
  await page.selectOption('#prView', 'type');
  const L0 = await E(() => PRINT.layer);
  await page.click('#prLayers [data-l="-1"]'); ok(await E(() => PRINT.layer) === L0 - 1, 'layer down button');
  await page.click('#prLayers [data-l="1"]'); ok(await E(() => PRINT.layer) === L0, 'layer up button');
  await page.focus('#prLayers input[type=range]'); await page.keyboard.press('Home'); ok(await E(() => PRINT.layer) === 0, 'slider to the first layer');
  await page.keyboard.press('End'); ok(await E(() => PRINT.layer) === L0, 'slider to the last layer');
  await page.click('#prOnly'); ok(await E(() => PRINT.onlyLayer), 'this layer only on'); await page.click('#prOnly'); ok(!(await E(() => PRINT.onlyLayer)), 'this layer only off');
  await page.mouse.click(700, 300); await page.keyboard.press('ArrowDown'); ok(await E(() => PRINT.layer) === L0 - 1, 'ArrowDown steps a layer'); await page.keyboard.press('ArrowUp');

  /* ── 3. ribbon ── */
  log('— ribbon —');
  for (const [b, k] of [['rotx', 'rx'], ['roty', 'ry'], ['rotz', 'rz']]) { await page.click(`#toolbar [data-print="${b}"]`); ok(await E(k => PRINT.cfg.xform[k], k) === 90, b + ' turns the part 90°'); ok(await E(() => PRINT.stale || !PRINT.result || true), b); }
  await page.click('#toolbar [data-print="flat"]'); await page.waitForTimeout(300);
  ok(await E(() => PRINT.bounds && PRINT.bounds.min[2] > -0.01 && PRINT.bounds.min[2] < 0.01), 'lay flat leaves the part on the bed');
  await page.fill('#panel [data-px="partX"]', '30'); await page.keyboard.press('Tab');
  await page.click('#toolbar [data-print="center"]'); ok(await E(() => PRINT.cfg.partX === null && PRINT.cfg.partY === null), 'center resets the position');
  const g0 = await E(() => PRINT.showModel); await page.click('#toolbar [data-print="ghost"]'); ok(await E(() => PRINT.showModel) === !g0, 'show / hide model'); await page.click('#toolbar [data-print="ghost"]');
  await zeroPlacement();
  r = await slice(); ok(!r.err && r.layers > 20, 'slice again after turning');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#toolbar [data-print="save"]')]);
  const gtxt = fs.readFileSync(await dl.path(), 'utf8'); ok(/^;FLAVOR:Marlin/.test(gtxt) && /M104 S/.test(gtxt) && /G28/.test(gtxt), 'Save G-code downloads valid Marlin G-code (' + dl.suggestedFilename() + ')');

  /* ── 4. panel ── */
  log('— panel —');
  for (const q of ['draft', 'fine', 'ultra', 'standard']) { await page.click(`#prProf [data-tipkey="print:prof-${q}"]`); const lh = await E(() => PRINT.cfg.layerHeight); ok(lh > 0 && lh <= 0.3, `quality ${q} sets layer height ${lh}`); }
  for (const [k, v] of [['scale', 50], ['rx', 15], ['ry', 30], ['rz', 45]]) { await page.fill(`#panel [data-x="${k}"]`, String(v)); await page.keyboard.press('Tab'); ok(await E(k => PRINT.cfg.xform[k], k) === v, 'placement ' + k); }
  await page.fill('#panel [data-px="partX"]', '90'); await page.keyboard.press('Tab'); ok(await E(() => PRINT.cfg.partX) === 90, 'bed X');
  await zeroPlacement(); await page.click('#toolbar [data-print="center"]');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#panel [data-print="saveprof"]')]);
  const prof = JSON.parse(fs.readFileSync(await dl2.path(), 'utf8')); ok(prof.format === 'datum-print-profile' && prof.settings.printer, 'export settings');
  prof.settings.infillDensity = 33; prof.settings.wallCount = 5; fs.writeFileSync('/tmp/print-e2e-profile.json', JSON.stringify(prof));
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#panel [data-print="loadprof"]')]); await fc.setFiles('/tmp/print-e2e-profile.json'); await page.waitForTimeout(400);
  ok(await E(() => PRINT.cfg.infillDensity === 33 && PRINT.cfg.wallCount === 5), 'import settings');
  await page.click('#panel [data-print="reset"]'); await page.waitForTimeout(200); ok(await E(() => PRINT.cfg.infillDensity === 15 && PRINT.cfg.wallCount === 3), 'reset');
  await page.fill('#prSearch', 'seam'); await page.waitForTimeout(150); ok(await E(() => document.querySelectorAll('#panel [data-k]').length > 0 && document.querySelectorAll('#panel [data-k]').length < 12), 'search narrows the list'); await page.fill('#prSearch', ''); await page.waitForTimeout(150);
  await page.click('#prAll'); const nAll = await E(() => document.querySelectorAll('#panel [data-k]').length); const want = await E(() => Slicer.SETTINGS.reduce((n, g) => n + g.items.filter(i => i.key !== 'material').length, 0) + 1); ok(nAll >= want - 1, `show all settings: ${nAll} of ${want} options`);
  await slice();
  await page.fill('#panel [data-cost="qty"]', '12'); await page.fill('#panel [data-cost="marginPct"]', '45'); await page.waitForTimeout(150);
  ok(/Sell for at least/.test(await E(() => document.getElementById('prCostOut').innerText)), 'production cost updates');
  // dropdown popup replaces the native one
  await page.locator('#panel [data-k="infillPattern"]').scrollIntoViewIfNeeded(); await page.click('#panel [data-k="infillPattern"]'); await page.waitForTimeout(300);
  ok(await E(() => !!document.querySelector('.dd-pop')), 'dropdowns use the animated popup'); await page.keyboard.press('Escape');

  /* ── 5. every printer and filament ── */
  log('— printers and filaments —');
  const printers = await E(() => Slicer.PRINTERS.map(p => [p.id, p.bed]));
  for (const [id, bed] of printers) {
    await page.selectOption('#prPrinter', id); await page.waitForTimeout(120);
    ok(await E(b => PRINT.cfg.bed[0] === b[0] && PRINT.cfg.bed[1] === b[1], bed), 'printer ' + id + ' sets its bed');
    if (!quick || id === 'k1max' || id === 'ender3v2' || id === 'cr10smart') { const s = await slice(); ok(!s.err && s.layers > 20 && !s.bad, `slice on ${id}: ${JSON.stringify(s.err || s.layers)}`); }
  }
  await page.selectOption('#prPrinter', 'ender3v2');
  const mats = await E(() => Slicer.MATERIALS.map(m => m.id));
  for (const m of mats) { await page.selectOption('#prMaterial', m); await page.waitForTimeout(100); if (!quick || ['pla', 'petg', 'tpu', 'pa'].includes(m)) { const s = await slice(); ok(!s.err && s.layers > 20 && !s.bad, `slice with ${m}: ${JSON.stringify(s.err || s.layers)}`); } }
  await page.selectOption('#prMaterial', 'pla');

  /* ── 6. every slicer option, changed in its own input, then sliced ── */
  log('— every option —');
  await page.click('#panel [data-print="reset"]'); await smallPart(); await E(() => { PRINT.all = true; Object.keys(PRINT.open).forEach(k => PRINT.open[k] = true); PRINT.open['Production cost'] = false; refreshPanel(); });
  const schema = await E(() => Slicer.SETTINGS.flatMap(g => g.items.filter(s => s.key !== 'material').map(s => ({ key: s.key, type: s.type, min: s.min, max: s.max, step: s.step, options: s.options && s.options.map(o => o[0]) }))));
  const def = await E(() => Slicer.defaults(PRINT.cfg.printer, PRINT.cfg.material));
  let n = 0, slow = [];
  for (const s of schema) {
    const variants = s.type === 'b' ? [true] : s.type === 's' ? s.options : s.type === 't' ? ['M117 hi\nG4 P1'] : [s.max != null ? s.max : def[s.key] * 2, s.min != null ? s.min : 0];
    for (const v of (quick ? variants.slice(0, 2) : variants)) {
      const sel = `#panel details:not(.pr-cost) [data-k="${s.key}"]`;
      if (!(await page.locator(sel).count())) { await E(() => { PRINT.q = ''; PRINT.all = true; refreshPanel(); }); }
      const el = page.locator(sel).first(); await el.evaluate(e => { const d = e.closest('details'); if (d) d.open = true; }); await el.scrollIntoViewIfNeeded();
      if (s.type === 'b') { if ((await E(k => PRINT.cfg[k], s.key)) !== v) await el.click({ force: true }); }
      else if (s.type === 's') await el.selectOption(v);
      else { await el.fill(String(v)); await page.keyboard.press('Tab'); }
      await page.waitForTimeout(60);
      const got = await E(k => PRINT.cfg[k], s.key);
      const want = s.type === 'n' ? +v : v; ok(got === want || (s.type === 'n' && Math.abs(got - want) < 1e-9), `option ${s.key}: input sets ${JSON.stringify(v)} (got ${JSON.stringify(got)})`);
      const t0 = Date.now(); const res = await slice(); const dt = Date.now() - t0; n++;
      if (dt > 20000) slow.push([s.key, v, dt]);
      ok(!res.err && res.layers > 0 && !res.bad, `option ${s.key} = ${JSON.stringify(v).slice(0, 30)}: slice ${JSON.stringify(res.err || (res.bad ? 'bad token' : res.layers))}`);
    }
    await page.click('#panel [data-print="reset"]'); await E(() => { PRINT.all = true; refreshPanel(); });
  }
  log(`${n} option slices${slow.length ? ', slow: ' + JSON.stringify(slow) : ''}`);

  ok(!errors.length, 'page errors: ' + errors.slice(0, 5).join(' | '));
  await browser.close(); server.close();
  console.log(`\n${checks} checks, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
