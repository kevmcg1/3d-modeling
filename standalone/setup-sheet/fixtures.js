/* Workholding fixture library for the Setup Sheet.
 *
 * Every fixture is a small parametric 3D model (convex solids, in inches) that is projected to a top, front and
 * isometric SVG view. Add your own by calling Fixtures.register({...}) or Fixtures.registerCustom(json).
 *
 * Local frame of one fixture: origin at the centre of its footprint on the table, +X to the right, +Y toward the
 * work (the "toe" side), +Z up. The placed item is then rotated about Z and moved to (x, y, z) on the plate.
 *
 * Works in the browser (window.Fixtures) and in Node (require('./fixtures.js')) so it can be unit tested.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Fixtures = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MM = 1 / 25.4;
  const LIMIT = 1000;                                   // no dimension may exceed this many inches
  const fin = v => typeof v === 'number' && Number.isFinite(v);
  const clampN = (v, a, b) => Math.min(b, Math.max(a, v));
  const r2 = v => Math.round(v * 100) / 100;

  /* ---------- Reading what people type: 3.5, 1/2, 1 3/8, 12mm, 0.5" ... ---------- */
  function parseDim(text, unit) {
    unit = unit || 'in';
    if (typeof text === 'number') return fin(text) ? text : null;
    const s = String(text == null ? '' : text).trim().toLowerCase().replace(/,/g, '.');
    if (!s || s.length > 40) return null;
    const m = s.match(/^([+-]?)\s*(?:(\d+)\s+(\d+)\/(\d+)|(\d+)\/(\d+)|((?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?))\s*(mm|cm|in|"|″)?$/);
    if (!m) return null;
    let v;
    if (m[2] !== undefined) { if (+m[4] === 0) return null; v = +m[2] + +m[3] / +m[4]; }
    else if (m[5] !== undefined) { if (+m[6] === 0) return null; v = +m[5] / +m[6]; }
    else v = parseFloat(m[7]);
    if (m[1] === '-') v = -v;
    if (!fin(v)) return null;
    if (m[8]) { const inch = m[8] === 'mm' ? v / 25.4 : m[8] === 'cm' ? v / 2.54 : v; v = unit === 'mm' ? inch * 25.4 : inch; }
    return v;
  }
  const fmtIn = v => (fin(v) ? String(Math.round(v * 1000) / 1000) : '0') + '"';
  const fmtMm = v => (fin(v) ? String(Math.round(v * 10) / 10) : '0') + ' mm';

  /* ---------- Tiny safe expression evaluator for custom fixtures: numbers, $names, + - * / ( ) ---------- */
  function evalExpr(src, vars) {
    if (typeof src === 'number') { if (!fin(src) || Math.abs(src) > LIMIT) throw new Error('value out of range'); return src; }
    if (typeof src !== 'string' || src.length > 120) throw new Error('bad expression');
    src = src.trim();
    const toks = src.match(/\s*(\d+\.?\d*|\.\d+|\$[A-Za-z_]\w*|[-+*/()])/gy);
    if (!toks || toks.join('').length !== src.length) throw new Error('bad expression: ' + src);
    const t = toks.map(x => x.trim());
    let i = 0;
    const prim = () => {
      const x = t[i++];
      if (x === undefined) throw new Error('unfinished expression');
      if (x === '(') { const v = sum(); if (t[i++] !== ')') throw new Error('missing )'); return v; }
      if (x === '-') return -prim();
      if (x === '+') return prim();
      if (x[0] === '$') { const k = x.slice(1); if (!vars || !(k in vars) || !fin(vars[k])) throw new Error('unknown ' + x); return vars[k]; }
      const v = parseFloat(x); if (!fin(v)) throw new Error('bad number'); return v;
    };
    const prod = () => { let v = prim(); while (t[i] === '*' || t[i] === '/') { const o = t[i++], b = prim(); if (o === '/' && b === 0) throw new Error('divide by zero'); v = o === '*' ? v * b : v / b; } return v; };
    const sum = () => { let v = prod(); while (t[i] === '+' || t[i] === '-') { const o = t[i++], b = prod(); v = o === '+' ? v + b : v - b; } return v; };
    const out = sum();
    if (i !== t.length) throw new Error('unexpected ' + t[i]);
    if (!fin(out) || Math.abs(out) > LIMIT) throw new Error('value out of range');
    return out;
  }

  /* ---------- Solids: lists of polygon faces, outward-facing ---------- */
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  function newell(pts) {                                // polygon normal (unnormalised)
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      x += (a[1] - b[1]) * (a[2] + b[2]); y += (a[2] - b[2]) * (a[0] + b[0]); z += (a[0] - b[0]) * (a[1] + b[1]);
    }
    return [x, y, z];
  }
  const centroid = pts => pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length, s[2] + p[2] / pts.length], [0, 0, 0]);
  // Map a 2D profile (a, b) plus a position along the axis into 3D. Axis z: (x, y); y: (x, z); x: (y, z).
  const lift = (axis, a, b, c) => (axis === 'z' ? [a, b, c] : axis === 'y' ? [a, c, b] : [c, a, b]);

  function makeSolid(faces, role, name, extra) {
    const verts = faces.flatMap(f => f.pts);
    const c = centroid(verts);
    faces.forEach(f => {                                // turn every face outward (the solids are convex)
      if (f.fixed) return;
      const nrm = newell(f.pts);
      if (dot(nrm, sub(centroid(f.pts), c)) < 0) { f.pts = f.pts.slice().reverse(); if (f.holes) f.holes = f.holes.map(h => h.slice().reverse()); }
    });
    return Object.assign({ name: name || '', role: role || 'steel', faces }, extra || {});
  }
  // Extrude a convex 2D profile along an axis from a0 to a1
  function prism(profile, axis, a0, a1, role, name, extra) {
    if (a1 < a0) { const t = a0; a0 = a1; a1 = t; }
    const n = profile.length, lo = profile.map(p => lift(axis, p[0], p[1], a0)), hi = profile.map(p => lift(axis, p[0], p[1], a1));
    const faces = [{ pts: lo }, { pts: hi }];
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; faces.push({ pts: [lo[i], lo[j], hi[j], hi[i]] }); }
    return makeSolid(faces, role, name, extra);
  }
  const box = (x0, y0, z0, x1, y1, z1, role, name, extra) => {
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1), ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    return prism([[xa, ya], [xb, ya], [xb, yb], [xa, yb]], 'z', z0, z1, role, name, extra);
  };
  const circle = (cx, cy, r, sides) => { const n = sides || 28; return Array.from({ length: n }, (_, i) => [cx + r * Math.cos(2 * Math.PI * i / n), cy + r * Math.sin(2 * Math.PI * i / n)]); };
  const cyl = (cx, cy, r, a0, a1, axis, role, name, extra) => prism(circle(cx, cy, r), axis || 'z', a0, a1, role, name, extra);
  const hex = (cx, cy, r, a0, a1, role, name) => prism(circle(cx, cy, r, 6), 'z', a0, a1, role, name);
  // Cut a round hole through the top and bottom faces of a z-extruded solid (draws the hole and its inner wall)
  function drill(solid, cx, cy, r, z0, z1) {
    const ring = circle(cx, cy, r, 24);
    solid.faces.forEach(f => {
      if (f.fixed) return;
      const nrm = newell(f.pts);
      if (Math.abs(nrm[0]) < 1e-9 && Math.abs(nrm[1]) < 1e-9 && nrm[2] !== 0 && f.pts.every(p => p[2] >= z0 - 1e-9 && p[2] <= z1 + 1e-9)) {
        const z = f.pts[0][2]; (f.holes = f.holes || []).push(ring.map(p => [p[0], p[1], z]));
      }
    });
    for (let i = 0; i < ring.length; i++) {             // inner wall: faces point toward the hole's axis
      const a = ring[i], b = ring[(i + 1) % ring.length];
      solid.faces.push({ pts: [[b[0], b[1], z0], [a[0], a[1], z0], [a[0], a[1], z1], [b[0], b[1], z1]], fixed: true });
    }
    return solid;
  }
  // A flat patch drawn on a surface (T-slot, hole); visible only from above
  const decal = (pts, z, role, name) => ({ name: name || '', role: role || 'slot', decal: true, faces: [{ pts: pts.map(p => [p[0], p[1], z]), fixed: true }] });

  /* ---------- Parameters ---------- */
  const num = (key, label, def, o) => Object.assign({ key, label, type: 'num', unit: 'in', def, min: 0.05, max: 60, tip: '' }, o);
  const pick = (key, label, def, options, o) => Object.assign({ key, label, type: 'select', def, options, tip: '' }, o);
  const toInch = (par, v) => (par.unit === 'mm' ? v * MM : v);
  function sanitizeParams(def, p) {
    const out = {};
    (def.params || []).forEach(par => {
      let v = p && p[par.key];
      if (par.type === 'select') out[par.key] = par.options.some(o => String(o.v) === String(v)) ? String(v) : String(par.def);
      else {
        v = typeof v === 'string' ? parseDim(v, par.unit) : v;
        out[par.key] = fin(v) ? clampN(v, par.min, par.max) : par.def;
      }
    });
    return out;
  }
  const defaultParams = def => sanitizeParams(def, {});

  /* ---------- The built-in library ---------- */
  const LIB = Object.create(null);               // no inherited keys: a fixture called __proto__ or constructor must not exist
  const order = [];
  function register(def) {
    if (!def || typeof def.id !== 'string' || !/^[\w-]{1,40}$/.test(def.id)) throw new Error('A fixture needs an id of letters, digits, - or _');
    if (typeof def.build !== 'function') throw new Error('A fixture needs a build(p, ctx) function');
    if (!LIB[def.id]) order.push(def.id);
    LIB[def.id] = Object.assign({ name: def.id, category: 'Other', desc: '', params: [], toe: () => 0, spec: () => '' }, def);
    return LIB[def.id];
  }
  const get = id => LIB[id] || null;
  const list = () => order.map(id => LIB[id]);
  const unregister = id => { if (LIB[id] && LIB[id].custom) { delete LIB[id]; order.splice(order.indexOf(id), 1); return true; } return false; };

  // Vise: fixed jaw at the back (+Y), movable jaw in front, clamping across Y. The bed (top of the body) is VISE_BED high.
  const VISE_BED = 1.5;
  register({
    id: 'vise', name: 'Machine vise', short: 'Vise', category: 'Workholding', side: false,
    desc: 'Kurt-style milling vise. Fit it to the stock and the stock drops between the jaws.',
    params: [
      pick('size', 'Jaw width', '6', [{ v: '4', l: '4"' }, { v: '6', l: '6"' }, { v: '8', l: '8"' }]),
      num('gap', 'Jaw opening (clamped)', 3, { min: 0.1, max: 12, tip: 'Distance between the jaws holding the part. "Fit to stock" sets it to the stock depth.' }),
      num('jawH', 'Jaw height', 1.75, { min: 0.5, max: 4 }),
    ],
    build(p) {
      const w = +p.size, g = p.gap, hb = VISE_BED, jt = 1.1, bw = w / 2 + 0.4, back = g / 2 + jt + 0.5, front = -(g / 2 + jt + w * 0.5 + 1.2);
      const parts = [
        box(-bw, front, 0, bw, back, hb, 'vise', 'Body'),
        box(-w / 2, g / 2, hb, w / 2, g / 2 + jt, hb + p.jawH, 'jaw', 'Fixed jaw'),
        box(-w / 2, -g / 2 - jt, hb, w / 2, -g / 2, hb + p.jawH, 'jaw', 'Movable jaw'),
        box(-bw + 0.3, front + 0.1, hb, -bw + 0.3 + 0.7, -g / 2 - jt, hb + 0.45, 'vise', 'Way cover'),
        box(bw - 1.0, front + 0.1, hb, bw - 0.3, -g / 2 - jt, hb + 0.45, 'vise', 'Way cover'),
        cyl(0, front + 0.6, 0.55, hb, hb + 0.9, 'z', 'dark', 'Screw boss'),
        prism(circle(0, 0.75, 0.28), 'y', front - 2.6, front + 0.1, 'dark', 'Handle shaft'),
      ];
      return parts;
    },
    spec: p => `${p.size}" jaws, ${fmtIn(p.gap)} open`,
    fit(item, ctx) {                                    // sit the stock in the jaws, on any parallels lying on the bed
      const s = ctx.stock, z = item.z || 0;
      const lift = (ctx.items || []).filter(i => i.type === 'parallels' && Math.abs(i.x - s.x) < 2 && Math.abs(i.y - s.y) < 2).reduce((m, i) => Math.max(m, +(i.p && i.p.height) || 0), 0);
      return { item: { x: s.x, y: s.y, rot: 0, p: { gap: clampN(s.d, 0.1, 12) } }, stock: { z: z + VISE_BED + lift } };
    },
  });

  register({
    id: 'parallels', name: 'Parallels (pair)', category: 'Workholding', side: false,
    desc: 'Ground parallels the stock sits on. Raise the stock to their height.',
    params: [
      num('length', 'Length', 6, { max: 24 }), num('width', 'Thickness', 0.375, { max: 2 }), num('height', 'Height', 0.5, { max: 4 }),
      pick('count', 'How many', '2', [{ v: '1', l: '1' }, { v: '2', l: '2' }]),
      num('spacing', 'Spacing (centre to centre)', 2.5, { min: 0.2, max: 20, tip: 'Distance between the two parallels, measured across the vise.' }),
    ],
    footprint: p => ({ hw: p.length / 2, hd: (+p.count === 2 ? p.spacing / 2 : 0) + p.width / 2 }),
    build(p) {
      const ys = +p.count === 2 ? [-p.spacing / 2, p.spacing / 2] : [0];
      return ys.map((y, i) => box(-p.length / 2, y - p.width / 2, 0, p.length / 2, y + p.width / 2, p.height, 'parallel', 'Parallel ' + (i + 1)));
    },
    spec: p => `${+p.count}× ${fmtIn(p.length)} × ${fmtIn(p.width)} × ${fmtIn(p.height)}`,
    fit(item, ctx) {                                    // lie on the vise bed when there is a vise, and lift the stock to their top
      const v = (ctx.items || []).find(i => i.type === 'vise'), h = +item.p.height || 0;
      if (!v) return { stock: { z: (item.z || 0) + h } };
      const bed = (v.z || 0) + VISE_BED;
      return { item: { x: v.x, y: v.y, z: bed, rot: v.rot }, stock: { z: bed + h } };
    },
  });

  register({
    id: 'vblock', name: 'V-block', category: 'Locating', side: true,
    desc: 'Cradles round stock. Place one on each side of the work, or use a pair under a shaft.',
    params: [
      num('length', 'Length (along the V)', 2.5, { max: 12 }), num('width', 'Width', 2, { max: 8 }), num('height', 'Height', 2, { min: 0.5, max: 8 }),
      num('vee', 'V opening at the top', 1.5, { min: 0.2, max: 6 }),
      pick('angle', 'V angle', '90', [{ v: '90', l: '90°' }, { v: '120', l: '120°' }]),
      pick('count', 'How many', '1', [{ v: '1', l: '1' }, { v: '2', l: '2 (matched pair)' }]),
      num('spacing', 'Pair spacing', 4, { min: 0.5, max: 24, tip: 'Centre-to-centre distance between the two blocks of a pair, along the V.' }),
    ],
    footprint: p => ({ hw: p.width / 2, hd: p.length / 2 + (+p.count === 2 ? p.spacing / 2 : 0) }),
    build(p) {
      const w = p.width, h = p.height, vee = Math.min(p.vee, w - 0.2), ang = (+p.angle * Math.PI) / 180;
      const depth = Math.min(h - 0.2, vee / 2 / Math.tan(ang / 2));
      const ys = +p.count === 2 ? [-p.spacing / 2, p.spacing / 2] : [0];
      return ys.flatMap((y, i) => [
        prism([[-w / 2, 0], [0, 0], [0, h - depth], [-vee / 2, h], [-w / 2, h]], 'y', y - p.length / 2, y + p.length / 2, 'vblock', 'V-block ' + (i + 1)),
        prism([[0, 0], [w / 2, 0], [w / 2, h], [vee / 2, h], [0, h - depth]], 'y', y - p.length / 2, y + p.length / 2, 'vblock', 'V-block ' + (i + 1)),
      ]);
    },
    toe: () => 0,
    spec: p => `${+p.count === 2 ? '2× ' : ''}${fmtIn(p.width)} × ${fmtIn(p.length)} × ${fmtIn(p.height)}, ${p.angle}° V`,
  });

  // The stainless wire-EDM pressure-plate clamp used as the toe clamp: a flat stainless strap, a bolt through its
  // hole, and a step block under the heel. Size (70/80/90 mm long, 8/12 mm thick, M8/M10) follows the supplier's range.
  register({
    id: 'toe-clamp', name: 'Toe clamp (stainless pressure plate)', short: 'Toe clamp', category: 'Clamps', side: true,
    desc: 'Stainless wire-EDM style pressure plate: 70/80/90 mm long, 8 or 12 mm thick, M8 or M10 bolt. The toe presses the stock; the heel rests on a step block.',
    params: [
      pick('length', 'Length', '80', [{ v: '70', l: '70 mm' }, { v: '80', l: '80 mm' }, { v: '90', l: '90 mm' }], { tip: 'Strap length. A longer strap reaches farther over the stock and puts the bolt farther from the toe.' }),
      pick('thick', 'Thickness', '8', [{ v: '8', l: '8 mm' }, { v: '12', l: '12 mm' }], { tip: 'Thicker straps are stiffer, so use 12 mm for heavier cuts.' }),
      pick('thread', 'Bolt', 'M10', [{ v: 'M8', l: 'M8' }, { v: 'M10', l: 'M10' }], { tip: 'Size of the clamping bolt and the hole in the strap. M10 clamps harder.' }),
      num('width', 'Strap width', 20, { unit: 'mm', min: 10, max: 60, tip: 'Width of the plate. Common stock is about 20 mm.' }),
      num('rise', 'Strap height (0 = match the stock)', 0, { unit: 'mm', min: 0, max: 300, tip: 'Height of the underside of the strap above the table. 0 uses the top of the stock, so the toe sits on the work.' }),
      pick('heel', 'Heel support', 'step', [{ v: 'step', l: 'Step block' }, { v: 'none', l: 'None' }], { tip: 'A step block under the heel keeps the strap level. Choose None if something else supports it.' }),
    ],
    footprint: p => ({ hw: Math.max(0.5, p.width * MM / 2), hd: +p.length * MM / 2 }),
    toe: p => 0.28,
    build(p, ctx) {
      const L = +p.length * MM, t = +p.thick * MM, w = p.width * MM, d = (p.thread === 'M8' ? 8 : 10) * MM;
      const top = ctx && ctx.stock ? ctx.stock.z + ctx.stock.h : 1;
      const rise = p.rise > 0 ? p.rise * MM : Math.max(0.1, top);
      const bevel = Math.min(t * 0.7, 0.2), hole = d * 1.1;
      const strap = prism([[-L / 2, rise], [L / 2 - bevel * 1.2, rise], [L / 2, rise + bevel], [L / 2, rise + t], [-L / 2, rise + t]], 'x', -w / 2, w / 2, 'stainless', 'Pressure plate');
      drill(strap, 0, 0, hole / 2, rise, rise + t);
      const parts = [strap,
        cyl(0, 0, d / 2, 0, rise + t + 0.05, 'z', 'dark', p.thread + ' bolt'),
        cyl(0, 0, d * 1.1, rise + t, rise + t + 2 * MM, 'z', 'dark', 'Washer'),
        hex(0, 0, d * 0.92, rise + t + 2 * MM, rise + t + 2 * MM + d * 0.65, 'dark', p.thread + ' bolt head'),
      ];
      if (p.heel === 'step') parts.push(box(-w / 2, -L / 2, 0, w / 2, -L / 2 + 25 * MM, rise, 'step', 'Step block'));
      return parts;
    },
    spec: p => `${p.length}×${fmtMm(p.width).replace(' mm', '')}×${p.thick} mm, ${p.thread}`,
  });

  register({
    id: 'step-block', name: 'Step block', category: 'Clamps', side: true,
    desc: 'Stepped riser under the heel of a strap clamp. Pick the step that matches the work height.',
    params: [
      pick('steps', 'Steps', '4', [{ v: '3', l: '3' }, { v: '4', l: '4' }, { v: '5', l: '5' }]),
      num('rise', 'Height of each step', 0.5, { min: 0.1, max: 2 }), num('tread', 'Step depth', 0.75, { min: 0.2, max: 3 }), num('width', 'Width', 1.5, { max: 6 }),
    ],
    footprint: p => ({ hw: p.width / 2, hd: (+p.steps * p.tread) / 2 }),
    build(p) {
      const n = +p.steps, parts = [];
      for (let i = 0; i < n; i++) parts.push(box(-p.width / 2, -n * p.tread / 2 + i * p.tread, 0, p.width / 2, -n * p.tread / 2 + (i + 1) * p.tread, (i + 1) * p.rise, 'step', 'Step ' + (i + 1)));
      return parts;
    },
    spec: p => `${+p.steps} steps × ${fmtIn(p.rise)}, ${fmtIn(p.width)} wide`,
  });

  register({
    id: 'block-123', name: '1-2-3 block', category: 'Locating', side: false,
    desc: 'Precision 1 × 2 × 3 block. Change the size for 2-4-6 blocks and so on.',
    params: [num('l', 'Length', 3, { max: 12 }), num('w', 'Width', 2, { max: 8 }), num('h', 'Height', 1, { max: 8 })],
    footprint: p => ({ hw: p.l / 2, hd: p.w / 2 }),
    build(p) {
      const b = box(-p.l / 2, -p.w / 2, 0, p.l / 2, p.w / 2, p.h, 'block', '1-2-3 block');
      return [b];
    },
    spec: p => `${fmtIn(p.l)} × ${fmtIn(p.w)} × ${fmtIn(p.h)}`,
  });

  register({
    id: 'angle-plate', name: 'Angle plate', category: 'Workholding', side: false,
    desc: 'Right-angle plate with gussets for holding work on its side.',
    params: [num('w', 'Width', 5, { max: 20 }), num('d', 'Base depth', 4, { max: 16 }), num('h', 'Height', 5, { max: 20 }), num('t', 'Thickness', 0.75, { min: 0.2, max: 2 })],
    footprint: p => ({ hw: p.w / 2, hd: p.d / 2 }),
    build(p) {
      const t = Math.min(p.t, p.d - 0.1, p.h - 0.1), gx = p.w / 2 - t / 2;
      const rib = x => prism([[-p.d / 2 + t, t], [p.d / 2, t], [-p.d / 2 + t, p.h]], 'x', x - t / 4, x + t / 4, 'block', 'Gusset');
      return [box(-p.w / 2, -p.d / 2, 0, p.w / 2, p.d / 2, t, 'block', 'Base'), box(-p.w / 2, -p.d / 2, 0, p.w / 2, -p.d / 2 + t, p.h, 'block', 'Upright'), rib(-gx), rib(gx)];
    },
    spec: p => `${fmtIn(p.w)} × ${fmtIn(p.d)} × ${fmtIn(p.h)}`,
  });

  register({
    id: 'edge-stop', name: 'Edge stop', category: 'Locating', side: true,
    desc: 'Dowelled stop block the work is pushed against.',
    params: [num('l', 'Length', 2, { max: 12 }), num('w', 'Thickness', 0.75, { max: 3 }), num('h', 'Height', 0.75, { max: 4 }), num('dowel', 'Dowel diameter', 0.25, { min: 0.1, max: 0.5 })],
    footprint: p => ({ hw: p.l / 2, hd: p.w / 2 }),
    build(p) {
      const parts = [box(-p.l / 2, -p.w / 2, 0, p.l / 2, p.w / 2, p.h, 'block', 'Stop block')];
      [-1, 1].forEach(s => parts.push(cyl(s * p.l * 0.3, 0, p.dowel / 2, p.h, p.h + 0.2, 'z', 'dark', 'Dowel')));
      return parts;
    },
    spec: p => `${fmtIn(p.l)} × ${fmtIn(p.w)} × ${fmtIn(p.h)}`,
  });

  register({
    id: 'custom-block', name: 'Block / round bar', category: 'Other', side: false,
    desc: 'Any plain rectangular block or round bar: risers, subplates, a second part.',
    params: [
      pick('shape', 'Shape', 'box', [{ v: 'box', l: 'Rectangular' }, { v: 'round', l: 'Round' }]),
      num('l', 'Length / diameter', 2, { max: 40 }), num('w', 'Width (rectangular)', 2, { max: 40 }), num('h', 'Height', 1, { max: 40 }),
    ],
    footprint: p => (p.shape === 'round' ? { hw: p.l / 2, hd: p.l / 2 } : { hw: p.l / 2, hd: p.w / 2 }),
    build(p) {
      return [p.shape === 'round' ? cyl(0, 0, p.l / 2, 0, p.h, 'z', 'block', 'Round bar') : box(-p.l / 2, -p.w / 2, 0, p.l / 2, p.w / 2, p.h, 'block', 'Block')];
    },
    spec: p => (p.shape === 'round' ? `Ø${fmtIn(p.l)} × ${fmtIn(p.h)}` : `${fmtIn(p.l)} × ${fmtIn(p.w)} × ${fmtIn(p.h)}`),
  });

  /* ---------- Custom fixtures from JSON ---------- */
  // {id, name, category?, desc?, params:[{key,label,unit?,def,min?,max?}], parts:[{shape:'box'|'cylinder'|'prism', ...}]}
  // Numbers may be written as expressions of the parameters, e.g. "$L/2".
  const KEY_RE = /^[A-Za-z_]\w{0,15}$/, ROLES = ['plate', 'stock', 'steel', 'stainless', 'dark', 'jaw', 'vise', 'parallel', 'vblock', 'step', 'block', 'slot'];
  function validateCustom(d) {
    const errs = [];
    if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, errors: ['The definition must be a JSON object.'] };
    if (typeof d.id !== 'string' || !/^[\w-]{1,40}$/.test(d.id)) errs.push('"id" must be 1-40 letters, digits, - or _.');
    if (LIB[d.id] && !LIB[d.id].custom) errs.push('"' + d.id + '" is a built-in fixture; pick another id.');
    if (typeof d.name !== 'string' || !d.name.trim() || d.name.length > 60) errs.push('"name" must be 1-60 characters.');
    const params = Array.isArray(d.params) ? d.params : [];
    if (params.length > 12) errs.push('At most 12 parameters.');
    const vars = {};
    params.slice(0, 12).forEach((p, i) => {
      if (!p || typeof p !== 'object' || !KEY_RE.test(String(p.key))) return errs.push(`Parameter ${i + 1}: "key" must be a name like L or width.`);
      if (!fin(p.def)) return errs.push(`Parameter ${p.key}: "def" must be a number.`);
      if (p.unit != null && p.unit !== 'in' && p.unit !== 'mm') errs.push(`Parameter ${p.key}: unit must be "in" or "mm".`);
      vars[p.key] = toInch({ unit: p.unit }, p.def);
    });
    if (!Array.isArray(d.parts) || !d.parts.length) errs.push('"parts" must list at least one part.');
    else if (d.parts.length > 60) errs.push('At most 60 parts.');
    else d.parts.forEach((pt, i) => { try { buildCustomPart(pt, vars); } catch (e) { errs.push(`Part ${i + 1}: ${e.message}`); } });
    return { ok: !errs.length, errors: errs };
  }
  function buildCustomPart(pt, vars) {
    if (!pt || typeof pt !== 'object') throw new Error('must be an object');
    const role = ROLES.includes(pt.role) ? pt.role : 'steel', name = String(pt.name || pt.shape || 'Part').slice(0, 40);
    const rng = (a, k) => { if (!Array.isArray(a) || a.length !== 2) throw new Error(`"${k}" must be [from, to]`); const x = evalExpr(a[0], vars), y = evalExpr(a[1], vars); if (x === y) throw new Error(`"${k}" has no size`); return [x, y]; };
    if (pt.shape === 'box') { const x = rng(pt.x, 'x'), y = rng(pt.y, 'y'), z = rng(pt.z, 'z'); return box(x[0], y[0], z[0], x[1], y[1], z[1], role, name); }
    if (pt.shape === 'cylinder') {
      const axis = pt.axis || 'z'; if (!['x', 'y', 'z'].includes(axis)) throw new Error('"axis" must be x, y or z');
      const r = evalExpr(pt.r, vars); if (r <= 0) throw new Error('"r" must be positive');
      const a = rng(pt.len, 'len');
      return cyl(evalExpr(pt.cx == null ? 0 : pt.cx, vars), evalExpr(pt.cy == null ? 0 : pt.cy, vars), r, a[0], a[1], axis, role, name);
    }
    if (pt.shape === 'prism') {
      const axis = pt.axis || 'z'; if (!['x', 'y', 'z'].includes(axis)) throw new Error('"axis" must be x, y or z');
      if (!Array.isArray(pt.profile) || pt.profile.length < 3 || pt.profile.length > 24) throw new Error('"profile" needs 3-24 [a, b] points');
      const prof = pt.profile.map(q => { if (!Array.isArray(q) || q.length !== 2) throw new Error('profile points are [a, b]'); return [evalExpr(q[0], vars), evalExpr(q[1], vars)]; });
      const a = rng(pt.len, 'len');
      return prism(prof, axis, a[0], a[1], role, name);
    }
    throw new Error('"shape" must be box, cylinder or prism');
  }
  function registerCustom(d) {
    const v = validateCustom(d);
    if (!v.ok) throw new Error(v.errors[0]);
    const params = (d.params || []).map(p => num(String(p.key), String(p.label || p.key).slice(0, 40), p.def, { unit: p.unit === 'mm' ? 'mm' : 'in', min: fin(p.min) ? p.min : 0, max: fin(p.max) ? p.max : LIMIT }));
    const vars = p => { const o = {}; params.forEach(q => { o[q.key] = toInch(q, p[q.key]); }); return o; };
    const copy = JSON.parse(JSON.stringify(d));
    const def = register({
      id: d.id, name: d.name.trim(), category: String(d.category || 'Custom').slice(0, 30), desc: String(d.desc || '').slice(0, 200), custom: copy, side: false, params,
      build: p => copy.parts.map(pt => buildCustomPart(pt, vars(p))),
      spec: p => params.map(q => `${q.label} ${q.unit === 'mm' ? fmtMm(p[q.key]) : fmtIn(p[q.key])}`).join(', '),
    });
    def.footprint = p => footprintOfParts(def.build(p));
    return def;
  }

  /* ---------- Placing items ---------- */
  const rotZ = (pt, deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [pt[0] * c - pt[1] * s, pt[0] * s + pt[1] * c, pt[2]]; };
  function footprintOfParts(parts) {
    let hw = 0, hd = 0;
    parts.forEach(pt => pt.faces.forEach(f => f.pts.forEach(q => { hw = Math.max(hw, Math.abs(q[0])); hd = Math.max(hd, Math.abs(q[1])); })));
    return { hw, hd };
  }
  const norm360 = d => { const v = Math.round(+d); return Number.isFinite(v) ? ((v % 360) + 360) % 360 : 0; };
  function footprint(def, p) { try { return def.footprint ? def.footprint(p) : footprintOfParts(def.build(p, {})); } catch (e) { return { hw: 1, hd: 1 }; } }

  // Build one placed item into world-space parts. item: {type, p, x, y, z, rot}; ctx: {stock:{x,y,z,w,d,h}}
  function buildItem(item, ctx) {
    const def = LIB[item.type];
    if (!def) return [];
    const p = sanitizeParams(def, item.p), rot = norm360(item.rot), x = fin(item.x) ? item.x : 0, y = fin(item.y) ? item.y : 0, z = fin(item.z) ? item.z : 0;
    let parts;
    try { parts = def.build(p, ctx || {}); } catch (e) { return []; }
    return parts.map(part => Object.assign({}, part, { faces: part.faces.map(f => ({
      fixed: f.fixed,
      pts: f.pts.map(q => { const r = rotZ(q, rot); return [r[0] + x, r[1] + y, r[2] + z]; }),
      holes: f.holes && f.holes.map(h => h.map(q => { const r = rotZ(q, rot); return [r[0] + x, r[1] + y, r[2] + z]; })),
    })) }));
  }
  function bounds(parts) {
    const b = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
    parts.forEach(pt => pt.faces.forEach(f => f.pts.forEach(q => {
      b.x0 = Math.min(b.x0, q[0]); b.x1 = Math.max(b.x1, q[0]); b.y0 = Math.min(b.y0, q[1]); b.y1 = Math.max(b.y1, q[1]); b.z0 = Math.min(b.z0, q[2]); b.z1 = Math.max(b.z1, q[2]);
    })));
    return b.x0 === Infinity ? null : b;
  }
  // Where an item goes when it is placed against one side of the stock. side: left | right | front | back
  // The local +Y of the item faces the stock; the toe overlaps the stock edge by def.toe().
  function placeAtSide(def, p, stock, side) {
    const fp = footprint(def, p), ov = def.toe ? def.toe(p) : 0, rot = { front: 0, back: 180, left: 270, right: 90 }[side] || 0;
    const gapC = fp.hd - ov, hwS = stock.w / 2, hdS = stock.d / 2;
    if (side === 'front') return { x: stock.x, y: stock.y - hdS - gapC, rot };
    if (side === 'back') return { x: stock.x, y: stock.y + hdS + gapC, rot };
    if (side === 'left') return { x: stock.x - hwS - gapC, y: stock.y, rot };
    return { x: stock.x + hwS + gapC, y: stock.y, rot };
  }
  const SIDES = ['front', 'back', 'left', 'right'];

  // World-space footprint rectangle (x0,y0,x1,y1) of an item
  function worldRect(item) {
    const def = LIB[item.type]; if (!def) return null;
    const p = sanitizeParams(def, item.p), fp = footprint(def, p), rot = norm360(item.rot);
    const swap = rot === 90 || rot === 270, hw = swap ? fp.hd : fp.hw, hd = swap ? fp.hw : fp.hd;
    return { x0: item.x - hw, x1: item.x + hw, y0: item.y - hd, y1: item.y + hd };
  }
  const rectsOverlap = (a, b, m) => a.x0 < b.x1 - (m || 0) && b.x0 < a.x1 - (m || 0) && a.y0 < b.y1 - (m || 0) && b.y0 < a.y1 - (m || 0);
  // Find a free spot on the plate for a new item (a grid scan, nearest to the plate centre first)
  function freeSpot(def, p, plate, items, stock) {
    const fp = footprint(def, p), taken = items.map(worldRect).filter(Boolean);
    if (stock) taken.push({ x0: stock.x - stock.w / 2, x1: stock.x + stock.w / 2, y0: stock.y - stock.d / 2, y1: stock.y + stock.d / 2 });
    const cands = [];
    for (let gx = fp.hw; gx <= plate.w - fp.hw + 1e-6; gx += 0.25) for (let gy = fp.hd; gy <= plate.d - fp.hd + 1e-6; gy += 0.25) cands.push([gx, gy]);
    cands.sort((a, b) => Math.hypot(a[0] - plate.w / 2, a[1] - plate.d / 2) - Math.hypot(b[0] - plate.w / 2, b[1] - plate.d / 2));
    for (const [x, y] of cands) {
      const r = { x0: x - fp.hw, x1: x + fp.hw, y0: y - fp.hd, y1: y + fp.hd };
      if (!taken.some(t => rectsOverlap(r, t, 0.02))) return { x, y };
    }
    return { x: plate.w / 2, y: plate.d / 2 };
  }
  // Warnings about a layout: off the plate, or two items on top of each other
  function checkLayout(plate, stock, items) {
    const out = [];
    const rects = items.map(worldRect);
    items.forEach((it, i) => {
      const r = rects[i]; if (!r) { out.push({ i, msg: 'Unknown fixture type "' + it.type + '"' }); return; }
      const parts = buildItem(it, { stock }), b = bounds(parts);
      if (b && (b.x0 < -0.01 || b.y0 < -0.01 || b.x1 > plate.w + 0.01 || b.y1 > plate.d + 0.01)) out.push({ i, msg: 'Hangs off the edge of the plate' });
      for (let j = i + 1; j < items.length; j++) {
        if (!rects[j]) continue;
        const bj = bounds(buildItem(items[j], { stock }));
        if (b && bj && b.x0 < bj.x1 - 0.02 && bj.x0 < b.x1 - 0.02 && b.y0 < bj.y1 - 0.02 && bj.y0 < b.y1 - 0.02 && b.z0 < bj.z1 - 0.02 && bj.z0 < b.z1 - 0.02) {
          out.push({ i, msg: `Overlaps #${j + 1}` }); out.push({ i: j, msg: `Overlaps #${i + 1}` });
        }
      }
    });
    return out;
  }

  /* ---------- Views and drawing ---------- */
  // A view looks from azimuth a (toward +X) and elevation e. front: (0, 0), top: (0, 90), iso: (35, 30).
  function makeView(aDeg, eDeg) {
    const a = aDeg * Math.PI / 180, e = eDeg * Math.PI / 180;
    const v = [Math.sin(a) * Math.cos(e), -Math.cos(a) * Math.cos(e), Math.sin(e)];
    const r = [Math.cos(a), Math.sin(a), 0], u = [-Math.sin(a) * Math.sin(e), Math.cos(a) * Math.sin(e), Math.cos(e)];
    return { v, proj: q => [dot(q, r), -dot(q, u)] };
  }
  const VIEW = { top: makeView(0, 90), front: makeView(0, 0), iso: makeView(35, 28) };
  const LIGHT = (() => { const l = [-0.35, -0.55, 0.76], m = Math.hypot(l[0], l[1], l[2]); return l.map(x => x / m); })();
  const ROLE_COLOR = { plate: '#e4e8ee', slot: '#aeb7c3', stock: '#e8e8ea', steel: '#cfd5dd', stainless: '#dde2e9', dark: '#59616c', jaw: '#d5dae1', vise: '#bcc6d2', parallel: '#aab4c0', vblock: '#a7bdd2', step: '#b9c3d0', block: '#c4ccb8' };
  function shade(hex, k) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return hex;
    const n = parseInt(m[1], 16);
    const ch = s => Math.round(clampN(((n >> s) & 255) * k, 0, 255));
    return '#' + [16, 8, 0].map(s => ch(s).toString(16).padStart(2, '0')).join('');
  }
  // Project every face of every part and return {polys, bounds} (painter's order: plate, decals, then far to near)
  function projectScene(parts, view) {
    const polys = [];
    parts.forEach((pt, pi) => pt.faces.forEach(f => {
      const nrm = newell(f.pts), len = Math.hypot(nrm[0], nrm[1], nrm[2]);
      if (len < 1e-12) return;
      const n = nrm.map(x => x / len), facing = dot(n, view.v);
      if (facing <= 1e-6) return;                       // back face
      const c = centroid(f.pts), depth = dot(c, view.v);
      polys.push({
        pts: f.pts.map(view.proj), holes: (f.holes || []).map(h => h.map(view.proj)), role: pt.role, part: pi,
        light: 0.58 + 0.42 * Math.max(0, dot(n, LIGHT)), layer: pt.role === 'plate' ? 0 : pt.decal ? 1 : 2, depth, name: pt.name, tag: pt.tag,
      });
    }));
    polys.sort((a, b) => a.layer - b.layer || a.depth - b.depth);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    polys.forEach(p => p.pts.forEach(q => { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }));
    return { polys, bounds: x0 === Infinity ? null : { x0, y0, x1, y1 } };
  }
  // SVG markup for projected polygons. o: {scale, ox, oy, colors: {role: hex}, line, lineW}
  function polysToSvg(polys, o) {
    const s = o.scale || 1, ox = o.ox || 0, oy = o.oy || 0, colors = o.colors || {}, line = o.line || '#1f2328', lw = o.lineW || 1.5;
    const P = pts => pts.map(q => r2(q[0] * s + ox) + ' ' + r2(q[1] * s + oy)).join('L');
    return polys.map(p => {
      const base = colors[p.role] || ROLE_COLOR[p.role] || '#cccccc';
      const d = 'M' + P(p.pts) + 'Z' + p.holes.map(h => 'M' + P(h) + 'Z').join('');
      const flat = p.layer === 1, sel = o.select && p.tag !== undefined && p.tag === o.select;
      return `<path d="${d}" fill="${shade(base, p.light)}" fill-rule="evenodd" stroke="${sel ? o.selectColor || '#2563eb' : flat ? 'none' : line}" stroke-width="${sel ? lw * 1.8 : flat ? 0 : lw}" stroke-linejoin="round"${o.attr ? o.attr(p) : ''}/>`;
    }).join('');
  }

  // The plate itself, with optional T-slots or a hole grid drawn on its top face
  function plateParts(plate) {
    const parts = [box(0, 0, -plate.t, plate.w, plate.d, 0, 'plate', 'Plate')];
    if (plate.pattern === 'tslots') {
      const n = Math.max(1, Math.min(7, Math.round(plate.d / 2.5) - 0)), pitch = plate.d / (n + 1);
      for (let i = 1; i <= n; i++) parts.push(decal([[0, i * pitch - 0.2], [plate.w, i * pitch - 0.2], [plate.w, i * pitch + 0.2], [0, i * pitch + 0.2]], 0, 'slot', 'T-slot'));
    } else if (plate.pattern === 'holes') {
      for (let x = 1; x < plate.w - 0.4; x += 1) for (let y = 1; y < plate.d - 0.4; y += 1) parts.push(decal(circle(x, y, 0.16, 10), 0, 'slot', 'Hole'));
    }
    return parts;
  }
  const stockPart = st => box(st.x - st.w / 2, st.y - st.d / 2, st.z, st.x + st.w / 2, st.y + st.d / 2, st.z + st.h, 'stock', 'Stock');
  // Every part of a layout, in painter's order
  function sceneParts(plate, stock, items) {
    const ctx = { stock };
    const tag = (parts, t) => parts.map(pt => Object.assign(pt, { tag: t }));
    return [...plateParts(plate), ...items.flatMap((it, i) => tag(buildItem(it, ctx), it.id !== undefined ? 'i' + it.id : 'n' + i)), ...tag([stockPart(stock)], 'stock')];
  }

  // Bill of materials rows for a layout: {n, name, spec, at}
  function bom(plate, stock, items) {
    const rows = [
      { n: '', name: 'Plate', spec: `${fmtIn(plate.w)} × ${fmtIn(plate.d)} × ${fmtIn(plate.t)}`, at: '' },
      { n: '', name: 'Stock', spec: `${fmtIn(stock.w)} × ${fmtIn(stock.d)} × ${fmtIn(stock.h)}`, at: `${r2(stock.x)}, ${r2(stock.y)}${stock.z ? ` · up ${fmtIn(stock.z)}` : ''}` },
    ];
    items.forEach((it, i) => {
      const def = LIB[it.type];
      if (!def) return rows.push({ n: i + 1, name: String(it.type), spec: 'unknown fixture', at: '' });
      const p = sanitizeParams(def, it.p);
      rows.push({ n: i + 1, name: String(it.name || def.name), spec: def.spec(p), at: `${r2(it.x)}, ${r2(it.y)}${norm360(it.rot) ? ` · ${norm360(it.rot)}°` : ''}` });
    });
    return rows;
  }

  return {
    MM, LIMIT, parseDim, evalExpr, fmtIn, fmtMm,
    register, registerCustom, validateCustom, unregister, get, list,
    defaultParams, sanitizeParams, footprint, buildItem, bounds, placeAtSide, freeSpot, worldRect, checkLayout, SIDES, norm360,
    VIEW, makeView, projectScene, polysToSvg, sceneParts, plateParts, stockPart, bom, ROLE_COLOR, shade,
    geom: { box, prism, cyl, hex, circle, drill, decal },
  };
});
