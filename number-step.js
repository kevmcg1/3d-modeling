// ═══════════════════════════════════════════════════════════════════
//  Number fields: hold ↑ / ↓ and the value keeps stepping.
//
//  Browsers differ on whether a held arrow key in a number box reaches the app before the field is left, and several panels
//  rebuild themselves on every change (which drops the focus and ends the hold). So the arrows are handled here, once, for
//  every <input type="number"> and for the ƒ / parameter expression fields while they hold a plain number: each key
//  auto-repeat steps the value, fires `input` then `change` as if it had been typed, and puts the focus back if the panel
//  was rebuilt. Shift steps ×10, Ctrl or Alt steps ×0.1.
// ═══════════════════════════════════════════════════════════════════
(function () {
  const PLAIN = /^\s*-?(\d+\.?\d*|\.\d+)\s*$/;
  const eligible = el => !!el && el.tagName === 'INPUT' && !el.disabled && !el.readOnly &&
    (el.type === 'number' || ((el.type === 'text') && (el.hasAttribute('data-fx-edit') || el.dataset.par === 'expr') && PLAIN.test(el.value)));
  const baseStep = el => {
    const s = parseFloat(el.getAttribute('step'));
    if (isFinite(s) && s > 0) return s;
    return typeof isIn === 'function' && isIn() ? 0.05 : 1;       // step="any" or none
  };
  const decimals = x => { const m = String(+x.toFixed(10)).split('.')[1]; return m ? m.length : 0; };
  function next(el, dir, e) {
    const cur = parseFloat(el.value), st = baseStep(el) * (e.shiftKey ? 10 : e.ctrlKey || e.altKey ? 0.1 : 1);
    let v = (isFinite(cur) ? cur : 0) + dir * st;
    v = +v.toFixed(Math.min(10, Math.max(decimals(st), decimals(isFinite(cur) ? cur : 0))));
    const lo = parseFloat(el.min), hi = parseFloat(el.max);
    if (isFinite(lo) && v < lo) v = lo;
    if (isFinite(hi) && v > hi) v = hi;
    return v;
  }
  // a panel that rebuilds on change replaces the field: find its twin and focus it
  function sig(el) {
    let q = 'input';
    if (el.id) q = '#' + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id);
    else for (const a of el.attributes) if (/^data-/.test(a.name) && a.name !== 'data-live') q += '[' + a.name + '="' + String(a.value).replace(/["\\]/g, '\\$&') + '"]';
    let idx = 0; try { idx = [...document.querySelectorAll(q)].indexOf(el); } catch (e) { /* odd id */ }
    return { q, idx: Math.max(0, idx) };
  }
  function refocus(s) {
    const ae = document.activeElement;
    if (ae && ae.tagName === 'INPUT' && ae.isConnected) return;
    let c; try { c = document.querySelectorAll(s.q); } catch (e) { return; }
    const n = c[s.idx] || c[0]; if (n) n.focus({ preventScroll: true });
  }
  let watch = null;
  window.addEventListener('pointerdown', () => { watch = null; }, true);
  new MutationObserver(() => { if (watch && Date.now() < watch.until) refocus(watch.s); }).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('keydown', e => {
    if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || e.isComposing || e.metaKey) return;
    const el = e.target;
    if (!eligible(el)) return;
    e.preventDefault(); e.stopImmediatePropagation();               // the browser's own single step would double up
    const v = next(el, e.key === 'ArrowUp' ? 1 : -1, e), s = sig(el);
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    if (el.type === 'number' || el.dataset.par === 'expr') el.dispatchEvent(new Event('change', { bubbles: true }));
    watch = { s, until: Date.now() + 500 };                          // a rebuild can land a moment later (debounced refresh)
    refocus(s); requestAnimationFrame(() => refocus(s));
  }, true);
  window.NumStep = { next, eligible };
})();
