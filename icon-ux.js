// ═══════════════════════════════════════════════════════════════════
//  Icon buttons: a CSS tooltip and a hover animation of their own.
//  The label is drawn by CSS alone (::after with content: attr(data-ctip)): it fades in at once, with no script and no HTML element. The
//  script only writes the label text into data-ctip. Holding the hover on for about a second and a half lets the rich animated card take
//  over (and the CSS label steps aside).
//  Every icon animates on hover with a motion that fits what the button does: Revolve turns, Extrude lifts, Mirror flips, Undo nudges
//  back, Delete shakes, Save drops, Fit grows, Sketch draws itself, and so on. Icons with no obvious meaning get a motion chosen from
//  their name, so each one still moves its own way, and always the same way.
//  Reduced motion turns the animations off; the tooltip stays.
// ═══════════════════════════════════════════════════════════════════
(() => {
  const css = document.createElement('style');
  css.textContent = `
[data-ctip] { --ctip-bg: var(--panel, #1d2128); --ctip-ink: var(--ink, #e8ecf2); }
[data-ctip-rel] { position: relative; }
[data-ctip]::after {
  content: attr(data-ctip); position: absolute; z-index: 2147483000; left: 50%; top: calc(100% + 9px); transform: translate(-50%, 4px); white-space: nowrap; max-width: 260px; overflow: hidden; text-overflow: ellipsis;
  padding: 5px 9px; border-radius: 6px; border: 1px solid var(--rule, rgba(255,255,255,.14)); background: var(--ctip-bg); color: var(--ctip-ink); font: 500 12px/1.3 Inter, system-ui, sans-serif; letter-spacing: 0; text-transform: none; text-align: center;
  box-shadow: 0 6px 20px rgba(0,0,0,.35); opacity: 0; visibility: hidden; pointer-events: none; transition: opacity .16s ease .12s, transform .16s ease .12s, visibility 0s linear .28s; }
[data-ctip]:hover::after, [data-ctip]:focus-visible::after { opacity: 1; visibility: visible; transform: translate(-50%, 0); transition: opacity .16s ease .12s, transform .16s ease .12s, visibility 0s linear .12s; }
[data-ctip].ctip-up::after { top: auto; bottom: calc(100% + 9px); transform: translate(-50%, -4px); }
[data-ctip].ctip-up:hover::after, [data-ctip].ctip-up:focus-visible::after { transform: translate(-50%, 0); }
/* placed by coordinates (--ctx, --cty set when the pointer arrives): fixed, so no container can clip it and it stays inside the window */
[data-ctip].ctip-fx::after { position: fixed; left: var(--ctx); top: var(--cty); bottom: auto; transform: translate(-50%, 4px); }
[data-ctip].ctip-fx:hover::after, [data-ctip].ctip-fx:focus-visible::after { transform: translate(-50%, 0); }
[data-ctip].ctip-fx.ctip-up::after { transform: translate(-50%, calc(-100% - 4px)); }
[data-ctip].ctip-fx.ctip-up:hover::after, [data-ctip].ctip-fx.ctip-up:focus-visible::after { transform: translate(-50%, -100%); }
body.card-open [data-ctip]::after { opacity: 0 !important; visibility: hidden !important; transition: none !important; }       /* the rich card has taken over */

[data-ico] svg { transform-box: fill-box; transform-origin: 50% 50%; }
@keyframes ico-spin { to { transform: rotate(360deg); } }
@keyframes ico-lift { 0%,100% { transform: translateY(0) scaleY(1); } 45% { transform: translateY(calc(-3px * var(--s,1))) scaleY(1.1); } }
@keyframes ico-flip { 0%,100% { transform: scaleX(1); } 50% { transform: scaleX(-1); } }
@keyframes ico-left { 0%,100% { transform: translateX(0); } 40% { transform: translateX(calc(-3.5px * var(--s,1))); } }
@keyframes ico-right { 0%,100% { transform: translateX(0); } 40% { transform: translateX(calc(3.5px * var(--s,1))); } }
@keyframes ico-pulse { 0%,100% { transform: scale(1); } 45% { transform: scale(calc(1 + .2 * var(--s,1))); } }
@keyframes ico-slash { 0%,100% { transform: rotate(0) translate(0,0); } 35% { transform: rotate(-16deg) translate(-1px,-1px); } 65% { transform: rotate(9deg) translate(1px,1px); } }
@keyframes ico-shake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-2.5px); } 40% { transform: translateX(2.5px); } 60% { transform: translateX(-2px); } 80% { transform: translateX(1.5px); } }
@keyframes ico-drop { 0%,100% { transform: translateY(0); } 45% { transform: translateY(calc(3.5px * var(--s,1))); } }
@keyframes ico-rise { 0%,100% { transform: translateY(0); } 45% { transform: translateY(calc(-3.5px * var(--s,1))); } }
@keyframes ico-grow { 0%,100% { transform: scale(1); } 50% { transform: scale(calc(1 + .28 * var(--s,1))); } }
@keyframes ico-stretch { 0%,100% { transform: scaleX(1); } 50% { transform: scaleX(calc(1 + .3 * var(--s,1))); } }
@keyframes ico-bounce { 0%,100% { transform: translateY(0); } 25% { transform: translateY(-4px); } 50% { transform: translateY(0); } 70% { transform: translateY(-2px); } }
@keyframes ico-blink { 0%,100% { transform: scaleY(1); } 45% { transform: scaleY(.12); } }
@keyframes ico-wiggle { 0%,100% { transform: rotate(0); } 25% { transform: rotate(-11deg); } 75% { transform: rotate(11deg); } }
@keyframes ico-swing { 0%,100% { transform: rotate(0); } 30% { transform: rotate(14deg); } 65% { transform: rotate(-8deg); } }
@keyframes ico-tilt { 0%,100% { transform: rotate(0); } 50% { transform: rotate(calc(13deg * var(--s,1))); } }
@keyframes ico-pop { 0% { transform: scale(.78); } 55% { transform: scale(1.18); } 100% { transform: scale(1); } }
@keyframes ico-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2.5px); } }
@keyframes ico-orbit { 0% { transform: translate(0,0); } 25% { transform: translate(2px,-2px); } 50% { transform: translate(0,-3px); } 75% { transform: translate(-2px,-1px); } 100% { transform: translate(0,0); } }
@keyframes ico-fade { 0%,100% { opacity: 1; } 45% { opacity: .35; } }
@keyframes ico-draw { from { stroke-dasharray: 40; stroke-dashoffset: 40; } to { stroke-dasharray: 40; stroke-dashoffset: 0; } }
@keyframes ico-stagger { 0%,100% { opacity: 1; transform: scale(1); } 40% { opacity: .35; transform: scale(.85); } }
[data-ico]:hover svg, [data-ico]:focus-visible svg { animation: var(--ico-anim) var(--d, .6s) cubic-bezier(.4,.1,.3,1) both; }
[data-ico="spin"] { --ico-anim: ico-spin; } [data-ico="lift"] { --ico-anim: ico-lift; } [data-ico="flip"] { --ico-anim: ico-flip; } [data-ico="left"] { --ico-anim: ico-left; }
[data-ico="right"] { --ico-anim: ico-right; } [data-ico="pulse"] { --ico-anim: ico-pulse; } [data-ico="slash"] { --ico-anim: ico-slash; } [data-ico="shake"] { --ico-anim: ico-shake; }
[data-ico="drop"] { --ico-anim: ico-drop; } [data-ico="rise"] { --ico-anim: ico-rise; } [data-ico="grow"] { --ico-anim: ico-grow; } [data-ico="stretch"] { --ico-anim: ico-stretch; }
[data-ico="bounce"] { --ico-anim: ico-bounce; } [data-ico="blink"] { --ico-anim: ico-blink; } [data-ico="wiggle"] { --ico-anim: ico-wiggle; } [data-ico="swing"] { --ico-anim: ico-swing; }
[data-ico="tilt"] { --ico-anim: ico-tilt; } [data-ico="pop"] { --ico-anim: ico-pop; } [data-ico="float"] { --ico-anim: ico-float; } [data-ico="orbit"] { --ico-anim: ico-orbit; }
[data-ico="fade"] { --ico-anim: ico-fade; }
[data-ico="draw"]:hover svg > *, [data-ico="draw"]:focus-visible svg > * { animation: ico-draw var(--d, .7s) ease both; }
[data-ico="draw"]:hover svg, [data-ico="draw"]:focus-visible svg { animation: none; }
[data-ico="stagger"]:hover svg > *, [data-ico="stagger"]:focus-visible svg > * { transform-box: fill-box; transform-origin: 50% 50%; animation: ico-stagger var(--d, .7s) ease both; }
[data-ico="stagger"]:hover svg > *:nth-child(2n), [data-ico="stagger"]:focus-visible svg > *:nth-child(2n) { animation-delay: .12s; }
[data-ico="stagger"]:hover svg > *:nth-child(3n), [data-ico="stagger"]:focus-visible svg > *:nth-child(3n) { animation-delay: .24s; }
[data-ico="stagger"]:hover svg, [data-ico="stagger"]:focus-visible svg { animation: none; }
@media (prefers-reduced-motion: reduce) { [data-ico]:hover svg, [data-ico]:focus-visible svg, [data-ico]:hover svg > *, [data-ico]:focus-visible svg > * { animation: none !important; } [data-ctip]::after { transition: none !important; } }`;
  document.head.appendChild(css);

  // what each icon does decides how it moves: first match wins
  const RULES = [
    [/revolve|rotate|spin|orbit|coil|helix|thread|theme|refresh|reload|reset|turn|gear|setting|cog|wheel|lathe/, 'spin'],
    [/extrude|push|pull|boss|raise|up$|lift|height|stack|layer|emboss/, 'lift'],
    [/mirror|flip|swap|reverse|symmetr|opposite/, 'flip'],
    [/undo|back|prev|previous|left|step.?back|start|rewind|home\b/, 'left'],
    [/redo|next|forward|right|step.?fwd|fwd|end\b|skip/, 'right'],
    [/fillet|round|circle|hole|ring|cylinder|sphere|torus|bore|drill|pocket|dimple|radius|arc|disc/, 'pulse'],
    [/chamfer|cut|split|trim|knife|slice|break|deburr|bevel|clip|scissor/, 'slash'],
    [/delete|trash|remove|close|clear|erase|discard|cancel|×|\bx\b/, 'shake'],
    [/save|export|download|output|post\b|gcode|g-code|print/, 'drop'],
    [/import|open|upload|load|insert|file\b|folder/, 'rise'],
    [/zoom|fit|expand|explode|enlarge|maximi|scale|size|resize|full/, 'grow'],
    [/pattern|array|copy|duplicate|grid|repeat|instance|clone|multiple/, 'stagger'],
    [/sketch|line|pencil|draw|trace|polyline|spline|curve|path|pen\b|text|engrave|dxf|freehand/, 'draw'],
    [/measure|ruler|dimension|distance|length|width|inspect|calipers?/, 'stretch'],
    [/play|run|sim|start sim|animate|motion|go\b/, 'right'],
    [/pause|stop|hold|freeze/, 'blink'],
    [/help|info|question|keys|about|hint|\?/, 'bounce'],
    [/lock|premium|key\b|secure/, 'wiggle'],
    [/eye|show|hide|visible|view|look|display|vis\b|preview|section/, 'blink'],
    [/search|find|select|pick|cursor|pointer|target|snap|point/, 'orbit'],
    [/shell|hollow|wall|thin|offset|box|body|solid|combine|join|union|merge|fuse|boolean|intersect/, 'pop'],
    [/tool|wrench|edit|modify|move|align|stretch|draft|adjust|tweak|change/, 'tilt'],
    [/stock|material|setup|origin|plane|axis|work|fixture|vise|jaw|clamp/, 'swing'],
    [/fade|ghost|transparent|opacity|dissolve/, 'fade'],
  ];
  const POOL = ['tilt', 'bounce', 'pop', 'wiggle', 'swing', 'float', 'pulse', 'orbit'];
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const keyOf = b => [b.dataset.cam, b.dataset.act, b.dataset.tipkey, b.dataset.ws && 'ws ' + b.dataset.ws, b.dataset.vis, b.dataset.sb, b.dataset.selmode, b.dataset.phy, b.dataset.tool, b.id && b.id.replace(/^btn/, ''), b.dataset.ctipName]
    .filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[:_\-]+/g, ' ').replace(/\s+/g, ' ').slice(0, 120);
  // a rule matches a word that starts with one of its stems (so 'cut' never fires inside 'shortcuts', 'up' never inside 'setup')
  const WORD = RULES.map(([re, kind]) => [new RegExp('(?:^|[^a-z])(?:' + re.source.replace(/\\b/g, '') + ')', 'i'), kind]);
  const kindOf = key => { for (const [re, kind] of WORD) if (re.test(key)) return kind; return POOL[hash(key) % POOL.length]; };

  const labelOf = b => {
    let name = '', k = '';
    try { const i = typeof tipInfoFor === 'function' ? tipInfoFor(b, b.dataset.tipkey || b.dataset.act || b.dataset.cam || '') : null; if (i) { name = i.name || ''; k = i.key || ''; } } catch (e) { /* not ready */ }
    if (!name) name = b.getAttribute('aria-label') || (b.dataset.tip || '').split('\n')[0].replace(/\s*\(.*\)$/, '') || (b.dataset.tipTitle || '').replace(/\s*\(.*\)$/, '') || b.textContent.trim();
    const m = /\(([^)]+)\)\s*$/.exec((b.dataset.tip || b.dataset.tipTitle || '').split('\n')[0]); if (!k && m) k = m[1];
    name = name.replace(/\s+/g, ' ').trim().split(/:\s/)[0].slice(0, 60);
    b.dataset.ctipName = name;
    return name ? (k && !name.includes(k) ? name + '  ·  ' + k : name) : '';
  };
  const SEL = 'button, [role="button"], .tb, .rb-btn, .vbtn, .icon-btn, .mini, [data-tip]';
  const iconish = b => b.querySelector('svg, img, i') || !b.textContent.trim() || b.dataset.tip;
  function tag(b) {
    if (!b.matches || !b.matches(SEL) || b.closest('#tipcard, #ctxmenu, .cf-pane input') || b.tagName === 'INPUT' || b.tagName === 'LABEL') return;
    if (!iconish(b)) return;
    const label = labelOf(b); if (!label) return;
    if (b.dataset.ctip !== label) b.dataset.ctip = label;
    if (!b.hasAttribute('data-ctip-rel') && getComputedStyle(b).position === 'static') b.setAttribute('data-ctip-rel', '');
    const key = keyOf(b), kind = kindOf(key), h = hash(key);
    if (b.dataset.ico !== kind) b.dataset.ico = kind;
    if (!b.style.getPropertyValue('--d')) { b.style.setProperty('--d', (0.45 + (h % 40) / 100).toFixed(2) + 's'); b.style.setProperty('--s', (0.85 + ((h >> 6) % 35) / 100).toFixed(2)); }
  }
  const sweep = root => { if (!root || root.nodeType !== 1) return; tag(root); root.querySelectorAll && root.querySelectorAll(SEL).forEach(tag); };
  // where the label has room: below the control, above it when it sits low, and kept inside the window; the numbers go to CSS as variables
  const transformed = el => { for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { const c = getComputedStyle(n); if (c.transform !== 'none' || c.filter !== 'none' || c.contain.includes('paint') || c.willChange.includes('transform')) return true; } return false; };
  function place(b) {
    const r = b.getBoundingClientRect(), w = Math.min(262, b.dataset.ctip.length * 6.8 + 22), up = r.bottom + 46 > innerHeight;
    b.classList.toggle('ctip-up', up);
    if (transformed(b)) { b.classList.remove('ctip-fx'); return; }
    b.classList.add('ctip-fx');
    b.style.setProperty('--ctx', Math.round(Math.min(Math.max(r.left + r.width / 2, w / 2 + 6), innerWidth - w / 2 - 6)) + 'px');
    b.style.setProperty('--cty', Math.round(up ? r.top - 9 : r.bottom + 9) + 'px');
  }
  document.addEventListener('pointerenter', e => { const b = e.target && e.target.closest && e.target.closest('[data-ctip]'); if (b) place(b); }, true);
  document.addEventListener('focusin', e => { const b = e.target && e.target.closest && e.target.closest('[data-ctip]'); if (b) place(b); });
  let queued = new Set(), raf = 0;
  const flush = () => { raf = 0; const q = queued; queued = new Set(); q.forEach(n => { if (n.isConnected) sweep(n); }); };
  new MutationObserver(ms => { for (const m of ms) { if (m.type === 'attributes') queued.add(m.target); else m.addedNodes.forEach(n => n.nodeType === 1 && queued.add(n)); } if (!raf) raf = requestAnimationFrame(flush); })
    .observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-tip', 'aria-label', 'data-tip-title'] });
  const first = () => sweep(document.body);
  first(); setTimeout(first, 600);
  window.ICONUX = { kindOf, keyOf, sweep, RULES };
})();
