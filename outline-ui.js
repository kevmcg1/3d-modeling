// ═══════════════════════════════════════════════════════════════════
//  Every button is an outline, never a fill: ordinary buttons, primary buttons, the selected one of a group of options, toggles, the play
//  button, ribbon icons, the buttons inside the embedded House / Drawing / Graphics / Setup Sheet pages.
//    resting     a thin outline in a quiet tone of the text color
//    hover       the outline and the text turn to the accent (a smooth fade)
//    selected    (.on, aria-pressed, aria-selected, .primary, .sel) a stronger accent outline and accent text, still no fill
//    focus       a clear accent ring
//    disabled    dimmed
//  Colour swatches and color inputs keep their fill: the fill is the color they show.
//  Buttons that have their own border keep it (it becomes the outline); the rest get a drawn outline that takes no room, so nothing moves.
// ═══════════════════════════════════════════════════════════════════
const OUTLINES = (() => {
  const BTN = 'button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"], .btn, .tb, .vbtn, .rb-btn, .icon-btn, .mini, .chip, .tl-play, .cat-btn';
  const KEEP = '.swatch, [data-swatch], [data-color], .cf-swatch, .sw, input[type="color"], [data-keepfill]';
  const SELECTED = '.on, .sel, .active, .primary, [aria-pressed="true"], [aria-selected="true"], [aria-current="true"], [aria-checked="true"]';
  const CSS = `
:root { --ol-line: color-mix(in srgb, currentColor 30%, transparent); --ol-accent: var(--accent, #4f8cff); }
:is(${BTN}):not(${KEEP}) {
  background: transparent !important; background-image: none !important;
  transition: color .18s ease, border-color .18s ease, box-shadow .18s ease, opacity .18s ease, transform .18s ease !important; }
/* no border of its own: a drawn outline that takes no room */
:is(${BTN})[data-ol]:not(${KEEP}) { box-shadow: inset 0 0 0 1px var(--ol-line) !important; }
/* a border of its own is the outline */
:is(${BTN}):not([data-ol]):not(${KEEP}) { border-color: var(--ol-line); }
:is(${BTN})[data-ol]:not(${KEEP}):hover:not(:disabled):not([aria-disabled="true"]) { box-shadow: inset 0 0 0 1px var(--ol-accent) !important; color: var(--ol-accent); }
:is(${BTN}):not([data-ol]):not(${KEEP}):hover:not(:disabled):not([aria-disabled="true"]) { border-color: var(--ol-accent); color: var(--ol-accent); }
:is(${BTN})[data-ol]:is(${SELECTED}):not(${KEEP}) { box-shadow: inset 0 0 0 1.5px var(--ol-accent) !important; color: var(--ol-accent); }
:is(${BTN}):not([data-ol]):is(${SELECTED}):not(${KEEP}) { border-color: var(--ol-accent); box-shadow: inset 0 0 0 .5px var(--ol-accent); color: var(--ol-accent); }
:is(${BTN}):not(${KEEP}):focus-visible { outline: 2px solid var(--ol-accent) !important; outline-offset: 1px; }
:is(${BTN}):not(${KEEP}):disabled, :is(${BTN})[aria-disabled="true"]:not(${KEEP}) { opacity: .5; }
:is(${BTN}).danger:not(${KEEP}), :is(${BTN})[data-danger]:not(${KEEP}) { --ol-line: color-mix(in srgb, var(--danger, #e5534b) 70%, transparent); color: var(--danger, #e5534b); }`;
  const tag = b => {
    if (!b.matches || !b.matches(BTN) || b.matches(KEEP)) return;
    const cs = (b.ownerDocument.defaultView || window).getComputedStyle(b);
    const bordered = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none' && !/rgba?\([^)]*,\s*0\)$/.test(cs.borderTopColor) && cs.borderTopColor !== 'transparent';
    if (bordered) b.removeAttribute('data-ol'); else if (!b.hasAttribute('data-ol')) b.setAttribute('data-ol', '');
  };
  const sweep = root => { if (!root || root.nodeType !== 1) return; tag(root); root.querySelectorAll && root.querySelectorAll(BTN).forEach(tag); };
  const attached = new WeakSet();
  function attach(doc) {
    if (!doc || attached.has(doc) || !doc.head || doc.getElementById('outline-ui')) return; attached.add(doc);
    const st = doc.createElement('style'); st.id = 'outline-ui'; st.textContent = CSS; doc.head.appendChild(st);
    let q = new Set(), raf = 0; const win = doc.defaultView || window;
    const flush = () => { raf = 0; const s = q; q = new Set(); s.forEach(n => { if (n.isConnected) sweep(n); }); };
    new win.MutationObserver(ms => { for (const m of ms) m.addedNodes.forEach(n => n.nodeType === 1 && q.add(n)); if (!raf) raf = win.requestAnimationFrame(flush); })
      .observe(doc.body || doc.documentElement, { subtree: true, childList: true });
    sweep(doc.body); setTimeout(() => sweep(doc.body), 500);
  }
  attach(document);
  // the pages inside frames (same origin only)
  const frame = f => { const go = () => { try { attach(f.contentDocument); } catch (e) { /* another origin */ } }; go(); f.addEventListener('load', go); };
  document.querySelectorAll('iframe').forEach(frame);
  new MutationObserver(ms => { for (const m of ms) m.addedNodes.forEach(n => { if (n.tagName === 'IFRAME') frame(n); }); }).observe(document.body, { childList: true, subtree: true });
  return { attach, sweep, BTN, KEEP };
})();
window.OUTLINES = OUTLINES;
