// ── Honda Civic sedan (11th generation, 2024 Touring), exterior and interior ──
// Published dimensions: length 4674 mm (184.0 in), width 1801 mm (70.9 in), height 1415 mm (55.7 in),
// wheelbase 2736 mm (107.7 in), track 1537 / 1565 mm (60.5 / 61.6 in, Sport/Touring),
// ground clearance 134 mm (5.28 in), tires 235/40R18 (Ø 645 mm), 9-inch touchscreen,
// 10.2-inch driver display, front legroom 1074 mm (42.3 in), rear 950 mm (37.4 in).
// World: car centered on X, front toward +Z, ground at y = 0. The body is built the way a
// designer blocks one out: side view ∩ top view ∩ front view, each an extruded outline.
function sCivic(opts = {}) {
  const K = modelKit(), W = blockKit(K), { comb, rect } = W;
  const L = 4674, HW = 1801 / 2, WB = 2736, zF = L / 2, zFA = zF - 945, zRA = zFA - WB;
  const tR = (18 * 25.4 + 2 * 235 * 0.40) / 2, tW = 235, trF = 1537 / 2, trR = 1565 / 2;
  const PAINT = '#27508e', BLACK = '#141518', GLASS = '#1d2731', TRIM = '#2a2c30', CHROME = '#c3c8ce', CABIN = '#1d1e21', FABRIC = '#3b3e44', LIGHT = '#e9eef2', RED = '#a3131d';
  const hide = [];
  // outward offset of a closed outline (vertices moved along the corner bisectors)
  function off(pts, d) {
    if (!d) return pts;
    let a = 0; pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; });
    const s = a > 0 ? 1 : -1, n = pts.length;
    const nor = i => { const p = pts[i], q = pts[(i + 1) % n], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy); return [s * dy / l, -s * dx / l]; };
    return pts.map((p, i) => { const n1 = nor((i + n - 1) % n), n2 = nor(i), k = d / (1 + n1[0] * n2[0] + n1[1] * n2[1]); return [p[0] + (n1[0] + n2[0]) * k, p[1] + (n1[1] + n2[1]) * k]; });
  }
  const offR = (r, d) => Array.isArray(r) ? r.map(x => (x > 0 ? x + d : 0)) : r > 0 ? r + d : 0;
  const mir = o => o.map(([x, y]) => [-x, y]).reverse();
  // the three views of the lower body ([z, y] side, [x, z] plan, [x, y] section)
  const SIDE = [[2250, 175], [2322, 280], [2342, 450], [2330, 600], [2290, 690], [2200, 745], [1800, 800], [1400, 850], [1080, 902], [600, 945], [0, 975], [-700, 1000], [-1300, 1030], [-1720, 1055], [-2150, 1068], [-2300, 1082], [-2342, 1040], [-2340, 850], [-2320, 560], [-2280, 330], [-2200, 220], [-1900, 175], [-1400, 150], [1400, 150], [1950, 165]];
  const SIDE_R = [40, 60, 80, 60, 50, 120, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 25, 60, 80, 60, 50, 60, 0, 0, 40];
  const PLAN = [[-640, 2342], [640, 2342], [860, 2200], [HW, 1700], [HW, -1700], [870, -2200], [680, -2342], [-680, -2342], [-870, -2200], [-HW, -1700], [-HW, 1700], [-860, 2200]];
  const PLAN_R = [150, 150, 300, 400, 400, 300, 150, 150, 300, 400, 400, 300];
  const SEC = [[-860, 140], [860, 140], [HW, 480], [895, 780], [850, 1000], [790, 1120], [-790, 1120], [-850, 1000], [-895, 780], [-HW, 480]];
  const SEC_R = [40, 40, 80, 80, 60, 30, 30, 60, 80, 80];
  // the greenhouse: windshield, roof, backlight over the beltline
  const GH = [[1085, 885], [130, 1378], [-300, 1415], [-850, 1385], [-1740, 1040], [-1300, 1015], [0, 960], [600, 930]];
  const GH_R = [0, 260, 900, 320, 0, 0, 0, 0];
  const GHP = [[-835, 1100], [835, 1100], [862, 700], [862, -1500], [700, -1800], [-700, -1800], [-862, -1500], [-862, 700]];
  const GHP_R = [150, 150, 300, 200, 150, 150, 200, 300];
  const GHS = [[-852, 800], [852, 800], [722, 1440], [-722, 1440]];
  const GHS_R = [0, 0, 170, 170];
  const vSide = (d, pts = SIDE, r = SIDE_R) => W.elevZ(off(pts, d), -1100, 1100, null, null, [], offR(r, d));
  const vPlan = (d, pts = PLAN, r = PLAN_R) => W.plan(off(pts, d), -10, 1600, null, null, offR(r, d));
  const vSec = (d, pts = SEC, r = SEC_R) => W.elevX(off(pts, d), -2600, 2600, null, null, [], offR(r, d));
  const solid = (d, col, nm) => { const s = vSide(d); comb(s, [vPlan(d), vSec(d)], 'intersect', nm); if (col) K.color(s, col); K.name(s, nm); return s; };
  const gh = (d, extra = [], col, nm) => { const s = vSide(d, GH, GH_R); comb(s, [vPlan(d, GHP, GHP_R), vSec(d, GHS, GHS_R), ...extra], 'intersect', nm); if (col) K.color(s, col); K.name(s, nm); return s; };
  // a thin skin of the body inside an outline: the outline's prism ∩ the body grown by d, hollowed
  const skin = (prism, d, col, nm, core = true) => {
    comb(prism, [vSide(d), vPlan(d), vSec(d)], 'intersect', nm);
    if (core) comb(prism, [W.plan(off(PLAN, -30), -10, 1600, null, null, offR(PLAN_R, -30))], 'cut');
    K.color(prism, col); K.name(prism, nm); return prism;
  };

  // ════ Body shell: lower body, wheel openings, the cabin hollowed out ════
  const body = solid(0, PAINT, 'Body');
  const wells = [];
  for (const [z, s] of [[zFA, 1], [zFA, -1], [zRA, 1], [zRA, -1]]) wells.push(W.cylX(z, tR, tR + 45, s > 0 ? 600 : -1000, s > 0 ? 1000 : -600));
  comb(body, wells, 'cut', 'Wheel openings');
  const cabin = W.elevZ([[1000, 300], [1000, 1400], [-1480, 1400], [-1480, 300]], -800, 800);
  comb(body, [cabin], 'cut', 'Cabin');
  // wheel-well liners
  for (const [z, s] of [[zFA, 1], [zFA, -1], [zRA, 1], [zRA, -1]]) {
    const x0 = s > 0 ? 610 : -895, x1 = s > 0 ? 895 : -610, liner = W.cylX(z, tR, tR + 44, x0, x1, BLACK, 'Wheel-well liner');
    comb(liner, [W.cylX(z, tR, tR + 25, x0 - 1, x1 + 1), W.box(-1000, 1000, -50, 170, z - 600, z + 600)], 'cut');
  }

  // ════ Greenhouse: glass, roof, pillars, moonroof ════
  const glass = gh(0, [], GLASS, 'Glass');
  const band = (pts) => W.elevZ(pts, -1100, 1100);
  const roof = gh(4, [band([[180, 1300], [180, 1500], [-800, 1500], [-800, 1300]])], PAINT, 'Roof');
  const aBand = band([[1120, 870], [150, 1402], [30, 1402], [990, 870]]);
  const aStrip = W.plan([[[760, 1120], [920, 1120], [920, 140], [650, 140]], mir([[760, 1120], [920, 1120], [920, 140], [650, 140]])], -10, 1600);
  const aPil = gh(2, [aBand, aStrip], PAINT, 'A-pillars');
  const bPil = gh(2, [band([[-120, 900], [-120, 1450], [-215, 1450], [-215, 900]]), W.plan([[[640, -100], [920, -100], [920, -240], [640, -240]], [[-920, -100], [-640, -100], [-640, -240], [-920, -240]]], -10, 1600)], BLACK, 'B-pillars');
  const cStrip = [[620, -780], [920, -780], [920, -1820], [705, -1820]];
  const cPil = gh(2, [band([[-950, 900], [-950, 1450], [-1820, 1450], [-1820, 900]]), W.plan([cStrip, mir(cStrip)], -10, 1600)], PAINT, 'C-pillars');
  const moon = gh(7, [W.box(-420, 420, 1300, 1500, -380, 120)], '#0f1216', 'Moonroof');
  const trimLine = gh(1, [band([[1085, 884], [-1740, 1039], [-1740, 1060], [1085, 905]].map(([z, y]) => [z, y]))], TRIM, 'Window trim');
  hide.push(glass, roof, aPil, bPil, cPil, moon);

  // ════ Lights, grille, badges: skins on the body surface ════
  const HL = [[455, 668], [830, 700], [868, 668], [820, 640], [470, 646]];
  skin(W.elevX([HL, mir(HL)], 1900, 2400), 3, LIGHT, 'Headlights');
  const DRL = [[480, 650], [815, 676], [818, 668], [482, 657]];
  skin(W.elevX([DRL, mir(DRL)], 1900, 2400), 5, '#ffffff', 'Daytime running lights');
  const GR = [[-560, 450], [560, 450], [610, 610], [-610, 610]];
  skin(W.elevX(GR, 1900, 2400), 3, BLACK, 'Upper grille');
  const LI = [[-620, 210], [620, 210], [700, 400], [-700, 400]];
  skin(W.elevX(LI, 1900, 2400), 3, BLACK, 'Lower intake');
  const FOG = [[680, 250], [790, 250], [820, 380], [720, 380]];
  skin(W.elevX([FOG, mir(FOG)], 1900, 2400), 3, TRIM, 'Bumper corners');
  const TL = [[330, 985], [880, 1010], [893, 960], [420, 948]];
  skin(W.elevX([TL, mir(TL)], -2400, -1900), 3, RED, 'Taillights');
  const TLb = [[-330, 985], [330, 985], [330, 975], [-330, 975]];
  skin(W.elevX(TLb, -2400, -1900), 3, '#5b0a10', 'Trunk light bar');
  const RD = [[-700, 210], [700, 210], [760, 330], [-760, 330]];
  skin(W.elevX(RD, -2400, -1900), 3, BLACK, 'Rear diffuser');
  // side marker lamps and the lower side sill
  skin(W.elevZ([[[2160, 610], [2250, 640], [2255, 600], [2170, 585]]], -1100, 1100), 3, '#f0a030', 'Side markers', false);
  skin(W.elevZ([[1010, 150], [1010, 262], [-960, 262], [-960, 150]], -1100, 1100), 3, BLACK, 'Side sills', false);
  // door seams
  const seam = (pts) => { const p = []; for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]], dz = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dz, dy), nz = -dy / l * 2, ny = dz / l * 2; p.push([[a[0] + nz, a[1] + ny], [b[0] + nz, b[1] + ny], [b[0] - nz, b[1] - ny], [a[0] - nz, a[1] - ny]]); } return p; };
  const seams = [...seam([[1030, 880], [1000, 600], [1000, 280]]), ...seam([[-165, 960], [-160, 280]]), ...seam([[-1030, 1005], [-1000, 700], [-980, 620]]), ...seam([[1000, 280], [-160, 280]]), ...seam([[-160, 280], [-920, 280]])];
  seams.forEach(s => skin(W.elevZ(s, -1100, 1100), 1.5, '#0c0d0f', 'Door seam'));
  // door handles, mirrors, plates, badges, antenna
  for (const s of [1, -1]) for (const z of [360, -620]) W.box(s > 0 ? 872 : -888, s > 0 ? 888 : -872, 880, 905, z - 75, z + 75, CHROME, 'Door handle', 8);
  for (const s of [1, -1]) {
    const m = [[s * 800, 1000], [s * 1010, 960], [s * 1030, 890], [s * 820, 930]];
    W.plan(s > 0 ? m : m.slice().reverse(), 950, 1070, BLACK, 'Mirror', 30);
    W.box(s > 0 ? 790 : -860, s > 0 ? 860 : -790, 960, 1000, 920, 990, BLACK, 'Mirror arm');
  }
  W.box(-260, 260, 330, 440, zF - 2, zF + 10, LIGHT, 'Front plate');
  W.box(-260, 260, 600, 710, -zF - 10, -zF + 4, LIGHT, 'Rear plate');
  W.revY(0, zF + 2, [[0, 590], [42, 590], [48, 560], [42, 530], [0, 530]], CHROME, 'Badge');
  W.elevX([W.circ(0, 1025, 36, 24)], -zF - 12, -zF + 5, CHROME, 'Rear badge');
  W.plan([[-25, -1050], [25, -1050], [15, -870], [-15, -870]], 1400, 1470, BLACK, 'Antenna fin', 15);

  // ════ Wheels: 235/40R18 on 18-inch twin-spoke alloys, brakes behind ════
  const wheel = (xc, zc, s) => {
    const B = W.at([xc, tR, zc], [0, 0, s], [s, 0, 0]);
    B.revY(0, 0, [[229, -112], [300, -117], [318, -100], [tR, -60], [tR, 60], [318, 100], [300, 117], [229, 112]], '#18191b', 'Tire');
    B.plan([B.circ(0, 0, 230, 64)], -105, 72, '#3a3d42', 'Rim barrel', 0, [B.circ(0, 0, 212, 64)]);
    B.cylY(0, 0, 165, -20, 8, '#9aa0a6', 'Brake disc');
    B.box(-55, 55, -40, 20, 120, 182, RED, 'Caliper', 12);
    B.cylY(0, 0, 70, -20, 72, '#2a2d31', 'Hub');
    const win = [];
    for (let k = 0; k < 5; k++) {
      const th = TAU * k / 5, sec = (c, a, r1, r2) => [...W.arcPts(0, 0, r2, c - a, c + a, 8), ...W.arcPts(0, 0, r1, c + a * 0.7, c - a * 0.7, 4)];
      win.push(sec(th, 0.36, 82, 206), sec(th + Math.PI / 5, 0.06, 95, 206));
    }
    B.plan([B.circ(0, 0, 226, 64)], 72, 92, '#7d838b', 'Wheel face', 0, win);
    B.cylY(0, 0, 38, 92, 97, BLACK, 'Center cap');
  };
  wheel(trF, zFA, 1); wheel(-trF, zFA, -1); wheel(trR, zRA, 1); wheel(-trR, zRA, -1);

  // ════ Interior ════
  W.box(-790, 790, 300, 318, -1480, 1000, CABIN, 'Carpet');
  // dashboard with the honeycomb vent strip across its face
  W.elevZ([[1000, 318], [1000, 965], [880, 1010], [720, 998], [640, 915], [632, 700], [690, 600], [760, 600], [960, 318]], -792, 792, CABIN, 'Dashboard', [], 30);
  W.box(-770, 770, 900, 912, 780, 900, FABRIC, 'Dash soft pad');
  const hex = []; for (let i = 0; i < 44; i++) for (let j = 0; j < 3; j++) { const x = -740 + i * 34 + (j % 2) * 17, y = 842 + j * 14; if (Math.abs(x) < 745) hex.push(W.circ(x, y, 6.5, 6)); }
  W.elevX([W.rect(-765, 830, 765, 882)], 626, 634, '#6a6f77', 'Honeycomb vent strip', hex);
  // 9-inch touchscreen (199 × 112 mm active) standing on the dash, 10.2-inch driver display
  W.elevX([W.rect(-112, 988, 112, 1128)], 712, 724, BLACK, 'Touchscreen bezel', [], 8);
  W.elevX([W.rect(-99.5, 996, 99.5, 1108)], 711, 712, '#2f5d88', 'Touchscreen');
  W.elevX([W.rect(-99.5, 1060, -20, 1108)], 710.5, 711, '#6fa8d8', 'Map tile'); W.elevX([W.rect(0, 1000, 99.5, 1050)], 710.5, 711, '#3a3e46', 'Audio tile');
  W.box(-20, 20, 950, 992, 720, 740, BLACK, 'Screen stand');
  W.cylZ(128, 1010, 11, 700, 712, CHROME, 'Volume knob');
  W.elevX([W.rect(262, 1005, 478, 1092)], 740, 746, '#243a52', 'Driver display');
  W.box(245, 495, 1092, 1110, 730, 830, CABIN, 'Display hood', 10); W.box(250, 490, 995, 1092, 746, 800, CABIN, 'Display housing');
  // steering wheel: rim, hub, spokes and column, tilted toward the driver
  const tilt = 24 * Math.PI / 180, SW = W.at([370, 850, 560], [1, 0, 0], [0, Math.sin(tilt), -Math.cos(tilt)]);
  SW.revY(0, 0, [...W.arcPts(185, 0, 17, -Math.PI / 2, Math.PI * 1.5, 16).slice(0, -1)], '#101113', 'Steering wheel');
  SW.cylY(0, 0, 72, -25, 22, '#1a1b1e', 'Airbag hub'); SW.cylY(0, 0, 18, 22, 25, CHROME, 'H badge');
  for (const [x0, x1, z0, z1] of [[-172, -60, -18, 18], [60, 172, -18, 18], [-16, 16, -172, -60]]) SW.box(x0, x1, -8, 8, z0, z1, '#1a1b1e', 'Spoke');
  SW.cylY(0, 0, 36, -320, -25, CABIN, 'Steering column');
  // front seats: cushion, backrest and headrest with fabric inserts
  const seat = (xc, w, zH, yH, nm) => {
    const x0 = xc - w / 2, x1 = xc + w / 2, cz = zH, cy = yH;
    W.elevZ([[cz + 480, cy - 40], [cz + 470, cy + 30], [cz - 60, cy + 10], [cz - 70, cy - 150]], x0, x1, CABIN, nm + ' cushion', [], 40);
    const back = [[cz - 40, cy - 30], [cz - 320, cy + 640], [cz - 440, cy + 610], [cz - 170, cy - 40]];
    W.elevZ([back], x0, x1, CABIN, nm + ' backrest', [], 40);
    W.elevZ([[[cz + 420, cy + 34], [cz - 30, cy + 16], [cz - 30, cy + 20], [cz + 420, cy + 38]].map(([z, y]) => [z, y])], x0 + 70, x1 - 70, FABRIC, nm + ' insert');
    W.elevZ([[[cz - 40, cy + 20], [cz - 290, cy + 610], [cz - 296, cy + 607], [cz - 46, cy + 17]]], x0 + 70, x1 - 70, FABRIC, nm + ' back insert');
    return back;
  };
  for (const xc of [370, -370]) {
    seat(xc, 520, 60, 480, xc > 0 ? 'Driver seat' : 'Passenger seat');
    W.elevZ([[[-270, 1150], [-300, 1330], [-400, 1320], [-370, 1140]]], xc - 130, xc + 130, CABIN, 'Headrest', [], 30);
    for (const d of [-60, 60]) W.box(xc + d - 6, xc + d + 6, 1110, 1160, -335, -320, CHROME, 'Headrest post');
  }
  // rear bench: three places, 60/40 backs
  W.elevZ([[-470, 490], [-480, 560], [-1000, 540], [-1010, 380]], -700, 700, CABIN, 'Rear cushion', [], 40);
  const rb = [[-980, 530], [-1260, 1150], [-1380, 1120], [-1110, 470]];
  W.elevZ([rb], -700, 120, CABIN, 'Rear seatback 60'); W.elevZ([rb], 125, 700, CABIN, 'Rear seatback 40');
  for (const xc of [-470, 0, 470]) W.elevZ([[[-1200, 1120], [-1225, 1200], [-1315, 1190], [-1290, 1110]]], xc - 110, xc + 110, CABIN, 'Rear headrest', [], 25);
  for (const xc of [-470, 470]) W.elevZ([[[-500, 562], [-990, 542], [-990, 546], [-500, 566]]], xc - 200, xc + 200, FABRIC, 'Rear insert');
  W.box(-790, 790, 1030, 1050, -1740, -1400, CABIN, 'Parcel shelf');
  // rear wheel tubs inside the cabin
  for (const s of [1, -1]) W.cylX(zRA, tR, tR + 60, s > 0 ? 620 : -800, s > 0 ? 800 : -620, CABIN, 'Wheel tub');
  // center console, shifter, cupholders, armrest
  W.elevZ([[640, 318], [650, 560], [300, 600], [-350, 620], [-360, 318]], -95, 95, CABIN, 'Center console', [], 30);
  W.box(-90, 90, 620, 680, -360, -40, FABRIC, 'Armrest', 30);
  W.revY(0, 420, [[0, 600], [22, 600], [24, 660], [30, 700], [0, 712]], '#26282c', 'Shifter');
  for (const x of [-40, 40]) W.cylY(x, 180, 36, 600, 606, '#0c0c0e', 'Cupholder');
  // door trims with armrests, pedals
  for (const s of [1, -1]) {
    W.box(s > 0 ? 770 : -800, s > 0 ? 800 : -770, 330, 1040, -1460, 990, FABRIC, 'Door trim');
    for (const [z0, z1] of [[-150, 620], [-1100, -250]]) W.box(s > 0 ? 700 : -770, s > 0 ? 770 : -700, 640, 690, z0, z1, CABIN, 'Door armrest', 20);
  }
  for (const [x, w, h] of [[420, 40, 180], [310, 70, 70]]) W.box(x - w / 2, x + w / 2, 340, 340 + Math.min(h, 140), 845, 860, '#44474d', 'Pedal');
  W.box(-12, 12, 1340, 1370, 190, 215, BLACK, 'Mirror stem');
  W.box(-130, 130, 1290, 1340, 180, 205, BLACK, 'Rear-view mirror', 12);

  const d = K.doc();
  d.hidden = {};
  if (opts.cutaway) for (const f of hide) d.hidden[f.id] = true;
  return d;
}
