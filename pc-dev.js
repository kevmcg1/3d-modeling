// ═══ PC hardware: fans, a graphics card, a motherboard, and a gaming PC built from them ═══
var PCC = {
  pcb: '#1b1e22', pcbEdge: '#2a2e33', hs: '#3d434b', hsLite: '#8c949d', steel: '#b9c0c7', gold: '#c9a54c', copper: '#b8733d',
  black: '#17191c', plastic: '#24272c', slot: '#2e3238', rgbA: '#8a5cff', rgbB: '#2ec8ff', rgbC: '#ff4f9a', white: '#eef0f2', usb: '#2f6fd6', red: '#c8423c',
};
// Fan blades in the local x–z plane: n blades from radius r0 to r1, swept forward, as plan outlines.
function fanBlades(n, r0, r1, spread = 0.62, sweep = 0.5, rot = 0) {
  const out = [];
  for (let b = 0; b < n; b++) {
    const th = rot + TAU * b / n, lead = [], trail = [], N = 6;
    for (let i = 0; i <= N; i++) {
      const t = i / N, r = r0 + (r1 - r0) * t, s = sweep * t, w = TAU / n * spread * (0.75 + 0.25 * t);
      lead.push([r * Math.cos(th + s), r * Math.sin(th + s)]);
      trail.push([r * Math.cos(th + s + w), r * Math.sin(th + s + w)]);
    }
    out.push([...lead, ...trail.reverse()]);
  }
  return out;
}
// A square case fan, axis along local +y, face at y = 0…t, centered on the local origin.
function caseFan(B, size = 120, ring = PCC.rgbA, nm = 'Fan') {
  const h = size / 2, t = 25, rh = h - 3.5;
  B.plan(B.rect(-h, -h, h, h), 0, t, PCC.black, nm + ' frame', 7, [B.circ(0, 0, rh, 48)]);
  B.plan([B.circ(0, 0, rh, 48)], 1, 4, ring, nm + ' RGB ring', 0, [B.circ(0, 0, rh - 3, 48)]);
  B.cylY(0, 0, size * 0.17, 3, t - 2, PCC.plastic, nm + ' hub');
  B.plan(fanBlades(9, size * 0.16, rh - 2), 9, 15, '#2a2d33', nm + ' blades');
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.cylY(x * (h - 7.5), z * (h - 7.5), 2.2, t, t + 0.3, PCC.hs, 'Screw');
}

// ── Graphics card (triple-fan, 310 × 125 mm, three slots) ─────────────
// Local frame: x from the bracket (x = 0) toward the far end, z from the edge-connector line
// (z = 0, the fingers hang below it) to the top edge, y out of the PCB face toward the backplate;
// the cooler and fans are on −y.
function gpuModel(B) {
  const Lc = 312, Hc = 122, fanX = [60, 158, 256], fanR = 47;
  // PCB, gold fingers, components peeking out at the bracket end
  B.box(4, 250, 0, 1.6, 0, 112, PCC.pcb, 'GPU PCB');
  B.box(66, 155, 0, 1.6, -8, 0, PCC.gold, 'PCIe x16 fingers');
  // backplate with vent slots and a flow-through window over the fin stack
  const vents = []; for (let i = 0; i < 7; i++) vents.push(B.rect(30 + i * 22, 22, 42 + i * 22, 90));
  B.plan(B.rect(2, 2, Lc, Hc), 1.6, 4.6, '#2c3036', 'Backplate', 4, [...vents, B.rect(254, 16, 302, 106)].map(r => r.map(([x, z]) => [x, z])));
  B.box(40, 140, 4.6, 5.1, 96, 104, PCC.hsLite, 'Backplate logo');
  // heatsink: one fin stack across the whole cooler, fins standing across the card
  const fins = [];
  for (let x = 8; x < Lc - 6; x += 2.2) fins.push([x, -8], [x, -46], [x + 0.6, -46], [x + 0.6, -8]);
  fins.push([Lc - 6, -8], [Lc - 6, -2], [8, -2]);
  B.elevX(fins, 6, 114, '#9aa3ac', 'Fin stack');
  // heat pipes over the top edge of the fins
  for (let i = 0; i < 5; i++) B.cylX(116, -12 - i * 8, 3, 20, 300, PCC.copper, 'Heat pipe');
  // shroud: face plate with three fan openings, skirt along the bottom edge and both ends (top edge open)
  const face = [[0, 3], [Lc - 20, 3], [Lc, 20], [Lc, Hc], [30, Hc], [0, Hc - 25]];
  B.plan(face, -60, -52, '#2b2f35', 'Shroud', 0, fanX.map(x => B.circ(x, 62, fanR + 2, 48)));
  B.box(0, Lc, -60, -2, 0, 3, '#2b2f35', 'Shroud skirt');
  B.box(Lc - 3, Lc, -60, -2, 3, Hc, '#2b2f35', 'Shroud end');
  // accent lines on the face between the fans
  for (const x of [116, 216]) B.plan([[x - 2, 10], [x + 2, 10], [x + 2, 114], [x - 2, 114]], -60.6, -60, PCC.hsLite, 'Face accent');
  B.box(20, 110, -60.6, -60, 114, 117, PCC.rgbB, 'RGB light bar');
  // fans in the openings
  fanX.forEach((x, i) => {
    B.cylY(x, 62, 14, -59, -44, '#1e2126', 'Fan hub');
    B.cylY(x, 62, 9, -59.4, -59, PCC.hsLite, 'Hub badge');
    B.plan(fanBlades(11, 13, fanR - 1, 0.7, 0.55, i * 0.3).map(o => o.map(([a, b]) => [x + a, 62 + b])), -56, -50, '#23262b', 'Fan blades');
  });
  // bracket: three slots tall, with DisplayPort ×3 and HDMI
  const br = [[-18, -54], [Hc, -54], [Hc, 12], [-18, 12]];
  const ports = [[20, -44], [20, -24], [52, -44], [52, -24]];
  const bvents = []; for (let i = 0; i < 5; i++) bvents.push(B.rect(76 + i * 8, -50, 81 + i * 8, 6));
  B.elevZ([br.map(([z, y]) => [z, y])], -1.5, 0, PCC.steel, 'I/O bracket', [...ports.map(([z, y]) => B.rect(z - 8, y - 4, z + 8, y + 4)), ...bvents]);
  for (const [z, y] of ports) B.elevZ([B.rect(z - 7, y - 3, z + 7, y + 3)], -1, 12, PCC.black, 'Display port');
  // 12V-2x6 power socket on the top edge
  B.box(206, 228, -12, 0, 108, 122, PCC.black, '12V-2x6 socket');
}

// ── ATX motherboard (305 × 244 mm) ─────────────────────────────────
// Board coordinates: u right along the board (rear I/O on the u = 0 edge), v up it, h out of the
// component side. B is a kit whose local x = u, y = h, z = −v.
function moboModel(B, opts = {}) {
  const bx = (u0, u1, v0, v1, h0, h1, col, nm, rad) => B.box(u0, u1, h0, h1, -v1, -v0, col, nm, rad);
  const uv = o => o.map(([u, v]) => [u, -v]);
  const cyl = (u, v, r, h0, h1, col, nm) => B.cylY(u, -v, r, h0, h1, col, nm);
  const T = 1.6;
  // board, mounting holes, silver pads around them
  const holes = [[6.5, 297], [157, 297], [238, 297], [6.5, 140], [210, 140], [238, 140], [6.5, 10], [157, 10], [238, 10]];
  B.plan(uv(B.rect(0, 0, 244, 305)), 0, T, PCC.pcb, 'Motherboard PCB', 0, holes.map(([u, v]) => uv(B.circ(u, v, 2, 16))));
  B.plan(holes.map(([u, v]) => uv(B.circ(u, v, 4, 16))), T, T + 0.1, PCC.steel, 'Mounting pads', 0, holes.map(([u, v]) => uv(B.circ(u, v, 2, 16))));
  // CPU socket (LGA1700): housing, load plate, lever, and the CPU
  const SU = 110, SV = 235;
  bx(SU - 30, SU + 30, SV - 30, SV + 30, T, 5, PCC.plastic, 'CPU socket', 2);
  B.plan([uv(B.rect(SU - 28, SV - 28, SU + 28, SV + 28))], 5, 6.4, PCC.steel, 'Load plate', 0, [uv(B.rect(SU - 23, SV - 20, SU + 23, SV + 20))]);
  bx(SU + 31, SU + 33, SV - 28, SV + 27, 3, 5.5, PCC.steel, 'Socket lever'); bx(SU + 30, SU + 36, SV + 27, SV + 30, 3, 6, PCC.black, 'Lever tab');
  bx(SU - 22.5, SU + 22.5, SV - 18.75, SV + 18.75, 5, 6.2, '#244233', 'CPU substrate');
  bx(SU - 17, SU + 17, SV - 14.5, SV + 14.5, 6.2, 9.5, '#c7cbd0', 'CPU heat spreader', 2.5);
  // VRM: chokes along the top and left of the socket, finned heatsinks over the power stages
  const chokes = [];
  for (let u = 66; u <= 150; u += 10.5) chokes.push(uv(B.rect(u, 268, u + 9, 277)));
  for (let v = 180; v <= 258; v += 10.5) chokes.push(uv(B.rect(64, v, 73, v + 9)));
  B.plan(chokes, T, 8, '#5d6269', 'VRM chokes');
  const caps = []; for (let u = 70; u <= 146; u += 8) caps.push(uv(B.circ(u, 264, 2.6, 12)));
  B.plan(caps, T, 9, '#7c858e', 'Solid capacitors');
  const topFins = [[40, T], [40, 18]]; for (let u = 42; u < 148; u += 4) topFins.push([u, 18], [u, 30], [u + 2, 30], [u + 2, 18]);
  topFins.push([150, 18], [150, T]);
  B.elevX(topFins, -300, -281, PCC.hs, 'VRM heatsink (top)');
  bx(40, 150, 281, 300, 30, 32, PCC.hsLite, 'Heatsink cap', 1.5);
  const leftFins = [[-175, T], [-175, 20]]; for (let v = 177; v < 278; v += 4) leftFins.push([-v, 20], [-v, 34], [-v - 2, 34], [-v - 2, 20]);
  leftFins.push([-280, 20], [-280, T]);
  B.elevZ(leftFins.map(([z, y]) => [z, y]), 40, 61, PCC.hs, 'VRM heatsink (left)');
  bx(40, 61, 175, 280, 34, 36, PCC.hsLite, 'Heatsink cap', 1.5);
  B.cylX(-278, 26, 3.2, 44, 58, PCC.copper, 'Heat pipe');
  // rear I/O shroud with an RGB strip, and the port stack behind it
  B.plan([uv([[0, 150], [36, 150], [36, 272], [28, 285], [0, 285]])], T, 42, PCC.black, 'I/O shroud');
  bx(36, 36.6, 180, 270, 12, 34, PCC.rgbA, 'Shroud RGB');
  bx(-3, 30, 156, 170, T, 36, PCC.plastic, 'USB-C / USB 3 stack');
  bx(-3, 30, 174, 190, T, 36, PCC.usb, 'USB 3 stack');
  bx(-3, 30, 194, 210, T, 30, '#c9a45a', 'Ethernet');
  bx(-3, 30, 214, 232, T, 18, PCC.black, 'HDMI / DP');
  bx(-3, 20, 236, 262, T, 40, PCC.plastic, 'Audio block');
  for (const [v, h, c] of [[243, 12, '#3a7d44'], [243, 24, '#e0e0e0'], [243, 35, '#d45a86'], [255, 12, '#f2c23a'], [255, 24, '#6a8fd6'], [255, 35, '#2b2b2b']]) B.cylX(-v, h, 3.2, -3.5, -2, c, 'Audio jack');
  bx(-3, 25, 266, 282, T, 32, PCC.plastic, 'Wi-Fi antenna ports');
  // 8-pin EPS power
  bx(6, 28, 288, 302, T, 13, PCC.black, 'EPS 8-pin');
  // DIMM slots with latches, and RAM when populated
  const dimms = [160, 170.5, 184, 194.5];
  dimms.forEach((u, i) => {
    B.plan([uv(B.rect(u - 3, 150, u + 3, 284))], T, 8.5, i % 2 ? PCC.slot : '#40464e', 'DIMM slot', 0, [uv(B.rect(u - 0.9, 153, u + 0.9, 281))]);
    bx(u - 3.4, u + 3.4, 145, 150, T, 12, PCC.plastic, 'DIMM latch'); bx(u - 3.4, u + 3.4, 284, 289, T, 12, PCC.plastic, 'DIMM latch');
    if (opts.ram) {
      bx(u - 3.5, u + 3.5, 151, 283, 5, 40, '#2a2d33', 'DDR5 module', 1);
      bx(u - 3.6, u + 3.6, 153, 281, 40, 46, i % 2 ? PCC.rgbB : PCC.rgbA, 'RAM RGB bar', 1.5);
    }
  });
  // 24-pin ATX, USB 3 header, fan / RGB headers
  bx(231, 243, 172, 226, T, 19, PCC.black, 'ATX 24-pin');
  bx(233, 243, 148, 166, T, 11, PCC.usb, 'USB 3 header');
  bx(150, 160, 295, 302, T, 8, PCC.white, 'CPU fan header'); bx(170, 180, 295, 302, T, 8, PCC.white, 'Pump header');
  bx(212, 222, 295, 302, T, 8, PCC.white, 'ARGB header');
  // M.2 heatsinks and the chipset heatsink
  const m2 = (u0, u1, v0, v1, nm) => { bx(u0, u1, v0, v1, T, 8, PCC.hs, nm, 1.5); for (let u = u0 + 6; u < u1 - 8; u += 7) bx(u, u + 3, v0 + 3, v1 - 3, 8, 8.6, PCC.hsLite, 'Heatsink rib'); };
  m2(46, 140, 183, 200, 'M.2 heatsink (CPU)');
  m2(72, 140, 124, 140, 'M.2 heatsink 2');
  m2(72, 140, 62, 78, 'M.2 heatsink 3');
  B.plan([uv([[150, 22], [226, 22], [226, 108], [196, 108], [186, 98], [150, 98]])], T, 11, PCC.hs, 'Chipset heatsink');
  B.plan([uv([[156, 28], [220, 28], [220, 102], [198, 102], [188, 92], [156, 92]])], 11, 12, PCC.hsLite, 'Chipset cover');
  bx(160, 214, 34, 36, 12, 12.6, PCC.rgbA, 'Chipset accent');
  // PCIe: reinforced x16, an x1, and two more x16-length slots
  const slot = (v, u0, u1, armor, nm) => {
    B.plan([uv(B.rect(u0, v - 3.75, u1, v + 3.75))], T, 12.5, armor ? PCC.steel : PCC.slot, nm, 0, [uv(B.rect(u0 + 1.5, v - 0.9, u1 - 1.5, v + 0.9))]);
    bx(u1, u1 + 6, v - 3.75, v + 3.75, T, 13, PCC.plastic, 'Slot latch');
  };
  slot(165, 42, 131, true, 'PCIe 5.0 x16');
  slot(145, 42, 67, false, 'PCIe x1');
  slot(105, 42, 131, false, 'PCIe x16 (x4)');
  slot(45, 42, 131, false, 'PCIe x16 (x4)');
  // audio: codec shield and audio capacitors, isolated corner
  bx(6, 34, 14, 48, T, 3.5, PCC.hsLite, 'Audio codec shield');
  const acap = []; for (const u of [10, 20, 30]) for (const v of [56, 68]) acap.push(uv(B.circ(u, v, 3.5, 14)));
  B.plan(acap, T, 12, PCC.gold, 'Audio capacitors');
  // SATA ports on the right edge, front-panel headers on the bottom edge, CMOS battery
  for (const v of [40, 52, 66, 78]) { bx(230, 244, v, v + 8, T, 9, PCC.black, 'SATA port'); bx(230, 244, v, v + 8, 9, 16.5, PCC.black, 'SATA port'); }
  for (const [u0, u1] of [[60, 80], [96, 116], [130, 150], [196, 222]]) bx(u0, u1, 3, 9, T, 9, PCC.black, 'Header');
  cyl(214, 124, 10, T, 5, PCC.steel, 'CMOS battery');
  bx(226, 236, 262, 270, T, 4, PCC.red, 'Power button'); bx(226, 236, 250, 258, T, 4, PCC.hsLite, 'Reset button');
  bx(226, 240, 236, 246, T, 3.5, PCC.black, 'Debug LEDs');
}

// ── Samples ───────────────────────────────────────────────────────
function sGPU() {
  const K = modelKit();
  gpuModel(blockKit(K).at([-156, 4.6, 61], [1, 0, 0], [0, -1, 0]));      // fans up, card lying flat
  return K.doc();
}
function sMotherboard() {
  const K = modelKit();
  moboModel(blockKit(K).at([-122, 0, 152.5], [1, 0, 0], [0, 1, 0]), { ram: false });
  return K.doc();
}

// ── Gaming PC: a mid-tower on a desk with a monitor, keyboard and mouse ──
// Case coordinates: x from the glass side (−x) to the motherboard tray (+x), y up, z from the rear
// (−z) to the front (+z); the case is 230 × 480 × 460 mm. In the world it stands with its glass
// facing the viewer (+Z) and its front to the right (+X), at the right end of the desk.
function sGamingPC() {
  const K = modelKit(), W = blockKit(K);
  const C = W.at([150, 0, -120], [0, 0, -1], [0, 1, 0]);
  const hide = {};
  const CASE = '#1a1c20', CASE2 = '#24272c';
  // chassis panels
  C.box(112, 115, 0, 480, -230, 230, CASE, 'Right panel');
  C.box(-115, 115, 0, 3, -230, 230, CASE, 'Bottom panel');
  for (const [x, z] of [[-95, -200], [95, -200], [-95, 200], [95, 200]]) C.box(x - 15, x + 15, -12, 0, z - 20, z + 20, '#101114', 'Foot', 5);
  const topSlots = []; for (let i = 0; i < 13; i++) topSlots.push(C.rect(-96 + i * 10, -195, -90 + i * 10, 85));
  C.plan(C.rect(-115, -230, 115, 230), 477, 480, CASE, 'Top panel', 0, topSlots);
  C.cylY(-80, 205, 7, 480, 482, PCC.hsLite, 'Power button'); C.box(-50, -38, 480, 481, 196, 212, PCC.black, 'USB-C'); C.box(-30, -18, 480, 481, 196, 212, PCC.black, 'USB-A');
  // front: a mesh panel (vertical slots)
  const frontSlots = []; for (let i = 0; i < 20; i++) frontSlots.push(C.rect(-95 + i * 9.8, 30, -90 + i * 9.8, 450));
  C.elevX([C.rect(-115, 0, 115, 480)], 227, 232, CASE2, 'Front mesh panel', frontSlots);
  // rear: I/O opening, exhaust fan grille, expansion opening, PSU opening
  const grill = []; for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) if (i * i + j * j <= 18) grill.push(C.circ(-40 + i * 12, 390 + j * 12, 4.5, 12));
  C.elevX([C.rect(-115, 0, 112, 477)], -230, -227, CASE, 'Rear panel', [[[-58, 170], [76, 170], [76, 457], [28, 457], [28, 328], [-58, 328]], C.rect(-82, 8, 72, 94), ...grill]);
  for (const k of [4, 5, 6]) { const y = 315.8 - 20.32 * k; C.elevX([C.rect(-56, y - 9, 70, y + 9)], -229.5, -228, PCC.steel, 'Slot cover', [C.rect(-40, y - 2.5, 50, y + 2.5)]); }
  const glass = C.box(-115, -111, 3, 477, -227, 227, '#39424c', 'Tempered glass');
  hide[glass.id] = true;
  // PSU shroud and the PSU
  const sv = []; for (let i = 0; i < 9; i++) sv.push(C.rect(-100 + i * 18, 120, -92 + i * 18, 160));
  C.plan(C.rect(-112, -227, 81, 166), 97, 100, CASE2, 'PSU shroud top', 0, sv);
  C.box(-112, -109, 3, 97, -227, 166, CASE2, 'PSU shroud side');
  C.box(-80, 70, 5, 91, -227, -67, '#202226', 'Power supply');
  const psuG = []; for (let i = 0; i < 9; i++) psuG.push(C.rect(-70 + i * 15, 18, -62 + i * 15, 80));
  C.elevX([C.rect(-80, 5, 70, 91)], -229, -227, '#2c2f34', 'PSU grille', psuG);
  // motherboard tray, the motherboard (standoffs 6 mm off the tray), RAM installed
  C.box(81, 84, 60, 474, -225, 175, CASE2, 'Motherboard tray', 0);
  const MB = C.at([75, 150, -205], [0, 0, 1], [-1, 0, 0]);
  moboModel(MB, { ram: true });
  // graphics card in the top x16 slot: fans down, backplate up, bracket in the rear panel
  gpuModel(C.at([62.4, 314.2, -228], [0, 0, 1], [0, 1, 0]));
  // 360 mm radiator at the front, three intake fans in front of it
  const slits = []; for (let y = 86; y < 454; y += 7) slits.push(C.rect(-56, y, 56, y + 3));
  C.elevX([C.rect(-60, 80, 60, 460)], 172, 199, '#2a2d31', 'Radiator core', slits);
  C.box(-62, 62, 62, 80, 170, 201, '#1f2226', 'Radiator end tank'); C.box(-62, 62, 460, 475, 170, 201, '#1f2226', 'Radiator end tank');
  for (const y of [140, 260, 380]) caseFan(C.at([0, y, 200], [1, 0, 0], [0, 0, 1]), 120, PCC.rgbA, 'Intake fan');
  caseFan(C.at([-40, 390, -227], [1, 0, 0], [0, 0, 1]), 120, PCC.rgbB, 'Exhaust fan');
  for (const z of [-145, 5]) caseFan(C.at([-30, 452, z], [1, 0, 0], [0, 1, 0]), 140, PCC.rgbB, 'Top fan');
  // AIO pump on the CPU, tubes swept to the radiator's top tank
  MB.cylY(110, -235, 33, 9.5, 44, '#1e2126', 'AIO pump');
  MB.plan([MB.circ(110, -235, 32, 48)], 44, 46, PCC.rgbC, 'Pump RGB ring', 0, [MB.circ(110, -235, 27, 48)]);
  MB.cylY(110, -235, 27, 44, 47, '#2a2e34', 'Pump cap');
  MB.box(96, 124, 47, 47.6, -241, -229, PCC.hsLite, 'Pump logo');
  for (const h of [54, 67]) {
    const path = K.sketch(MB.PLAN(h), []), r = 34, u0 = 120, u1 = 332, v0 = 235, vT = 318;
    const l1 = K.L(u0, v0, u1, v0), ar = K.Ar(u1, v0 + r, r, -Math.PI / 2, 0), l2 = K.L(u1 + r, v0 + r, u1 + r, vT);
    path.ents.push(l1, ar, l2);
    const prof = K.sketch(MB.pl([u0, h, -v0], [0, 0, 1], [0, 1, 0]), [K.C(0, 0, 5.5), K.C(0, 0, 3)]);
    const tube = K.sweep(prof, [P2(4.2, 0)], path, [l1, ar, l2], 'new');
    K.color(tube, '#15171a'); K.name(tube, 'AIO tube');
  }
  // cables: 24-pin bundle into the tray, GPU power lead
  MB.box(230, 262, 19, 30, -226, -172, '#101114', '24-pin cable', 3);
  C.box(-72, -58, 300, 318, -22, -2, '#101114', 'GPU power cable', 3); C.box(-72, -60, 100, 300, -20, -4, '#101114', 'GPU power cable', 3);

  // ═══ the desk ═══
  W.box(-1350, 460, -42, -12, -460, 400, '#7d5f45', 'Desk');
  W.box(-1180, -140, -12, -9, 20, 360, '#1d2024', 'Desk mat', 18);
  // monitor: 27-inch panel on a stand, a wallpaper on the screen
  const MX = -660, pw = 615, ph = 365, py = 140, pz = -250;
  W.plan([[MX - 130, -300], [MX + 130, -300], [MX + 110, -170], [MX - 110, -170]], -12, -4, '#2b2e33', 'Monitor base', 20);
  W.box(MX - 30, MX + 30, -4, py + 120, pz - 38, pz - 14, '#2b2e33', 'Monitor stand', 8);
  W.box(MX - 110, MX + 110, py + 60, py + 250, pz - 40, pz - 12, '#2b2e33', 'Monitor back');
  W.box(MX - pw / 2, MX + pw / 2, py, py + ph, pz - 12, pz, '#15171a', 'Monitor panel', 4);
  const sx0 = MX - pw / 2 + 8, sx1 = MX + pw / 2 - 8, sy0 = py + 18, sy1 = py + ph - 8;
  W.elevX([W.rect(sx0, sy0 + 130, sx1, sy1)], pz, pz + 0.5, '#3d6fb5', 'Screen: sky');
  W.elevX([W.rect(sx0, sy0, sx1, sy0 + 130)], pz, pz + 0.5, '#2f6b3f', 'Screen: ground');
  W.elevX([[[sx0, sy0 + 130], [sx0 + 150, sy0 + 230], [sx0 + 250, sy0 + 170], [sx0 + 380, sy0 + 270], [sx1 - 60, sy0 + 150], [sx1, sy0 + 180], [sx1, sy0 + 130]]], pz + 0.5, pz + 1, '#54606e', 'Screen: mountains');
  W.elevX([W.circ(sx1 - 120, sy1 - 70, 30, 32)], pz + 0.5, pz + 1, '#ffd36b', 'Screen: sun');
  W.elevX([[[MX - 20, sy0 + 20], [MX + 20, sy0 + 20], [MX + 10, sy0 + 45], [MX - 10, sy0 + 45]]], pz + 1, pz + 1.5, '#e24b3b', 'Screen: player');
  W.box(MX - 40, MX + 40, py + 4, py + 10, pz, pz + 1, '#3a3e45', 'Monitor logo');
  // keyboard (tenkeyless): case and keycaps
  const KX = -842, KZ = 130, U = 19.05, cap = 17.2;
  W.plan([W.rect(KX, KZ, KX + 364, KZ + 138)], -6, 14, '#2a2d33', 'Keyboard case', 8);
  W.plan([W.rect(KX - 2.5, KZ - 2.5, KX + 366.5, KZ + 140.5)], -9, -6, PCC.rgbA, 'Underglow', 9);
  const rows = [
    [1, -1, 1, 1, 1, 1, -0.5, 1, 1, 1, 1, -0.5, 1, 1, 1, 1, -0.25, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, -0.25, 1, 1, 1],
    [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5, -0.25, 1, 1, 1],
    [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25],
    [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.75, -1.25, 1],
    [1.25, 1.25, 1.25, 6.25, 1.25, 1.25, 1.25, 1.25, -0.25, 1, 1, 1],
  ];
  const keys = [], accent = [];
  rows.forEach((row, r) => {
    let x = KX + 8; const z = KZ + 8 + r * U + (r > 0 ? 4 : 0);
    row.forEach((w, i) => {
      if (w < 0) { x += -w * U; return; }
      const k = W.rect(x + (U - cap) / 2, z + (U - cap) / 2, x + w * U - (U - cap) / 2, z + U - (U - cap) / 2);
      ((r === 0 && i === 0) || (r === 2 && i === 13) || (r === 3 && i === 12)) ? accent.push(k) : keys.push(k);
      x += w * U;
    });
  });
  W.plan(keys, 14, 24, '#33373e', 'Keycaps', 2);
  W.plan(accent, 14, 24, PCC.rgbC, 'Accent keycaps', 2);
  // mouse
  const mouse = W.plan([[-330, 180], [-270, 180], [-262, 300], [-338, 300]], -9, 30, '#23262b', 'Mouse', 30);
  K.fillet(K.capEdges(mouse, 'top'), 14);
  W.box(-301, -299, 30, 31, 190, 235, '#101114', 'Mouse button split');
  W.cylY(-300, 205, 5, 20, 34, PCC.rgbB, 'Scroll wheel');
  // headphones stand and a mug
  W.cylY(-1240, -250, 60, -12, -2, '#2b2e33', 'Headphone stand base'); W.cylY(-1240, -250, 10, -2, 280, '#2b2e33', 'Headphone stand');
  W.revY(-60, 230, [[0, -12], [42, -12], [45, 95], [0, 95]], '#e8e2d6', 'Mug');
  const d = K.doc();
  d.hidden = hide;
  return d;
}
