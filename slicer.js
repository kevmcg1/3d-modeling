/* ══════════════════════════════════════════════════════════════════════
   Slicer — FDM slicing engine for Creality (Marlin-flavor) printers
   ----------------------------------------------------------------------
   Pure JavaScript, no DOM and no THREE. Needs ClipperLib (a global in the
   browser, require('clipper-lib') in Node). Everything is millimeters,
   Z up, bed origin at the front-left corner (0,0).

     Slicer.PRINTERS      Creality printer profiles (bed, nozzle, limits, start/end G-code)
     Slicer.MATERIALS     filament presets (temperatures, retraction, cooling, density)
     Slicer.SETTINGS      the settings schema the UI is generated from
     Slicer.defaults(printerId, materialId)  → a full settings object
     Slicer.slice(mesh, cfg, {onProgress})   → Promise<{layers, bounds, stats, warnings}>
     Slicer.gcode(result, cfg)               → { text, time, filament, mass }

   mesh = { V: [[x,y,z]…], T: [i,j,k, …] }  (welded, indexed triangles)
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';
const CL = typeof ClipperLib !== 'undefined' ? ClipperLib : (typeof require === 'function' ? require('clipper-lib') : null);
const SC = 1000;                                            // Clipper integer units per mm
const TAU = Math.PI * 2;

/* ── Printers ─────────────────────────────────────────────────────── */
// bed [x,y,z] mm · speed = firmware travel limit mm/s · hotend/bed = max °C · dd = direct drive
const P = (id, name, family, bed, o = {}) => Object.assign({ id, name, family, bed, nozzle: 0.4, maxSpeed: 200, maxAccel: 2500, maxHotend: 260, maxBed: 100, dd: false, level: '', origin: 'corner', enclosed: false, heatedBed: true, filament: 1.75 }, o);
const PRINTERS = [
  P('ender3', 'Ender-3 / Ender-3 Pro', 'Ender', [220, 220, 250], { maxSpeed: 150, maxAccel: 1000, maxHotend: 260, maxBed: 100 }),
  P('ender3v2', 'Ender-3 V2', 'Ender', [220, 220, 250], { maxSpeed: 180, maxAccel: 1500, maxHotend: 260 }),
  P('ender3neo', 'Ender-3 V2 Neo', 'Ender', [220, 220, 250], { maxSpeed: 180, maxAccel: 2000, maxHotend: 260, level: 'G29' }),
  P('ender3s1', 'Ender-3 S1', 'Ender', [220, 220, 270], { maxSpeed: 200, maxAccel: 2000, dd: true, maxHotend: 260, level: 'G29' }),
  P('ender3s1pro', 'Ender-3 S1 Pro', 'Ender', [220, 220, 270], { maxSpeed: 200, maxAccel: 2000, dd: true, maxHotend: 300, maxBed: 110, level: 'G29' }),
  P('ender3s1plus', 'Ender-3 S1 Plus', 'Ender', [300, 300, 300], { maxSpeed: 200, maxAccel: 2000, dd: true, maxHotend: 260, level: 'G29' }),
  P('ender3v3se', 'Ender-3 V3 SE', 'Ender', [220, 220, 250], { maxSpeed: 250, maxAccel: 2500, dd: true, maxHotend: 260, level: 'G29' }),
  P('ender3v3ke', 'Ender-3 V3 KE', 'Ender', [220, 220, 240], { maxSpeed: 500, maxAccel: 8000, dd: true, maxHotend: 300, maxBed: 100, level: 'G29' }),
  P('ender3v3', 'Ender-3 V3', 'Ender', [220, 220, 250], { maxSpeed: 600, maxAccel: 20000, dd: true, maxHotend: 300, maxBed: 100, level: 'G29' }),
  P('ender3v3plus', 'Ender-3 V3 Plus', 'Ender', [300, 300, 330], { maxSpeed: 600, maxAccel: 20000, dd: true, maxHotend: 300, level: 'G29' }),
  P('ender3max', 'Ender-3 Max', 'Ender', [300, 300, 340], { maxSpeed: 150, maxAccel: 1000 }),
  P('ender2pro', 'Ender-2 Pro', 'Ender', [165, 165, 180], { maxSpeed: 150, maxAccel: 1000 }),
  P('ender5', 'Ender-5 / Ender-5 Pro', 'Ender', [220, 220, 300], { maxSpeed: 150, maxAccel: 1000 }),
  P('ender5s1', 'Ender-5 S1', 'Ender', [220, 220, 280], { maxSpeed: 200, maxAccel: 2000, dd: true, maxHotend: 300, level: 'G29' }),
  P('ender5plus', 'Ender-5 Plus', 'Ender', [350, 350, 400], { maxSpeed: 150, maxAccel: 1000, level: 'G29' }),
  P('ender6', 'Ender-6', 'Ender', [250, 250, 400], { maxSpeed: 200, maxAccel: 2000, enclosed: true }),
  P('cr10', 'CR-10 / CR-10S', 'CR', [300, 300, 400], { maxSpeed: 150, maxAccel: 1000 }),
  P('cr10v2', 'CR-10 V2 / V3', 'CR', [300, 300, 400], { maxSpeed: 180, maxAccel: 1500, dd: true }),
  P('cr10smart', 'CR-10 Smart Pro', 'CR', [300, 300, 400], { maxSpeed: 250, maxAccel: 3000, dd: true, maxHotend: 300, level: 'G29' }),
  P('cr10s5', 'CR-10 S5', 'CR', [500, 500, 500], { maxSpeed: 150, maxAccel: 1000 }),
  P('cr6se', 'CR-6 SE', 'CR', [235, 235, 250], { maxSpeed: 200, maxAccel: 2000, level: 'G29' }),
  P('crm4', 'CR-M4', 'CR', [450, 450, 470], { maxSpeed: 150, maxAccel: 1000, maxBed: 110, level: 'G29' }),
  P('cr200b', 'CR-200B', 'CR', [200, 200, 200], { maxSpeed: 150, maxAccel: 1000, enclosed: true }),
  P('k1', 'K1', 'K1', [220, 220, 250], { maxSpeed: 600, maxAccel: 20000, dd: true, maxHotend: 300, maxBed: 100, enclosed: true }),
  P('k1c', 'K1C', 'K1', [220, 220, 250], { maxSpeed: 600, maxAccel: 20000, dd: true, maxHotend: 300, maxBed: 100, enclosed: true }),
  P('k1se', 'K1 SE', 'K1', [220, 220, 250], { maxSpeed: 600, maxAccel: 20000, dd: true, maxHotend: 300, maxBed: 100 }),
  P('k1max', 'K1 Max', 'K1', [300, 300, 300], { maxSpeed: 600, maxAccel: 20000, dd: true, maxHotend: 300, maxBed: 100, enclosed: true }),
  P('hi', 'Creality Hi', 'K1', [260, 260, 300], { maxSpeed: 500, maxAccel: 10000, dd: true, maxHotend: 300, maxBed: 100 }),
  P('sermoon-d1', 'Sermoon D1', 'Sermoon', [300, 250, 300], { maxSpeed: 150, maxAccel: 1000, enclosed: true }),
  P('custom', 'Custom Marlin printer', 'Custom', [220, 220, 250], { maxSpeed: 200, maxAccel: 2000 }),
];
const printerById = id => PRINTERS.find(p => p.id === id) || PRINTERS[0];

/* ── Filament presets ─────────────────────────────────────────────── */
const M = (id, name, o) => Object.assign({ id, name, nozzle: 205, nozzle0: 210, bed: 60, bed0: 60, fan: 100, fanMin: 100, retract: 5, retractSpeed: 45, density: 1.24, flow: 100, maxFlow: 15, minLayerTime: 10, speedScale: 1 }, o);
const MATERIALS = [
  M('pla', 'PLA', {}),
  M('plaplus', 'PLA+ / Hyper PLA', { nozzle: 215, nozzle0: 220, bed: 60, maxFlow: 20 }),
  M('petg', 'PETG', { nozzle: 235, nozzle0: 240, bed: 75, bed0: 75, fan: 50, fanMin: 30, retract: 6, retractSpeed: 35, density: 1.27, maxFlow: 11, speedScale: 0.8, minLayerTime: 12 }),
  M('abs', 'ABS', { nozzle: 245, nozzle0: 250, bed: 100, bed0: 100, fan: 20, fanMin: 0, retract: 5, density: 1.04, maxFlow: 12, speedScale: 0.9, minLayerTime: 8 }),
  M('asa', 'ASA', { nozzle: 250, nozzle0: 255, bed: 100, bed0: 100, fan: 30, fanMin: 0, retract: 5, density: 1.07, maxFlow: 12, speedScale: 0.9 }),
  M('tpu', 'TPU (flexible)', { nozzle: 225, nozzle0: 230, bed: 50, bed0: 50, fan: 100, fanMin: 80, retract: 1.5, retractSpeed: 20, density: 1.21, maxFlow: 3.5, speedScale: 0.35, minLayerTime: 6 }),
  M('pa', 'Nylon (PA)', { nozzle: 265, nozzle0: 270, bed: 85, bed0: 85, fan: 20, fanMin: 0, retract: 5, density: 1.14, maxFlow: 10, speedScale: 0.8 }),
  M('pc', 'Polycarbonate (PC)', { nozzle: 275, nozzle0: 280, bed: 100, bed0: 100, fan: 20, fanMin: 0, retract: 5, density: 1.2, maxFlow: 8, speedScale: 0.7 }),
  M('silk', 'Silk PLA', { nozzle: 220, nozzle0: 225, bed: 60, maxFlow: 8, speedScale: 0.7 }),
  M('wood', 'Wood-filled PLA', { nozzle: 205, nozzle0: 210, bed: 60, density: 1.15, maxFlow: 8, speedScale: 0.7 }),
];
const materialById = id => MATERIALS.find(m => m.id === id) || MATERIALS[0];

/* ── Settings schema ──────────────────────────────────────────────── */
// type: n number · b boolean · s select · t text.  adv: only shown with "Show all settings".
const S_ = (key, label, type, o = {}) => Object.assign({ key, label, type }, o);
const PATTERNS = [['lines', 'Lines'], ['grid', 'Grid'], ['triangles', 'Triangles'], ['cubic', 'Cubic'], ['gyroid', 'Gyroid'], ['honeycomb', 'Honeycomb'], ['concentric', 'Concentric']];
const SETTINGS = [
  { group: 'Quality', items: [
    S_('layerHeight', 'Layer height', 'n', { unit: 'mm', min: 0.05, max: 0.6, step: 0.04, tip: 'Thickness of each layer. Lower is smoother and slower.' }),
    S_('firstLayerHeight', 'First layer height', 'n', { unit: 'mm', min: 0.1, max: 0.6, step: 0.05, tip: 'A thicker first layer sticks better.' }),
    S_('lineWidth', 'Line width', 'n', { unit: 'mm', min: 0.2, max: 1.2, step: 0.05, tip: 'Width of one extruded line. About the nozzle size, or a little more.' }),
    S_('firstLineWidth', 'First layer line width', 'n', { unit: 'mm', min: 0.2, max: 1.4, step: 0.05, adv: true, tip: 'Wider lines on the first layer squish flatter onto the bed.' }),
    S_('xyComp', 'Horizontal expansion', 'n', { unit: 'mm', min: -1, max: 1, step: 0.02, adv: true, tip: 'Grow (+) or shrink (−) the part outline to correct for dimensional error.' }),
    S_('elephantFoot', 'Elephant foot compensation', 'n', { unit: 'mm', min: 0, max: 1, step: 0.05, adv: true, tip: 'Pulls the first layer in so the squished bottom edge stays true.' }),
    S_('slicingTol', 'Slicing tolerance', 's', { adv: true, options: [['middle', 'Middle of layer'], ['inclusive', 'Inclusive (outer)'], ['exclusive', 'Exclusive (inner)']], tip: 'Where in each layer the model is cut. Middle is the most accurate on average.' }),
    S_('resolution', 'Path simplification', 'n', { unit: 'mm', min: 0.005, max: 0.3, step: 0.005, adv: true, tip: 'Drops points closer than this to a straight line. Smaller files vs. finer curves.' }),
  ] },
  { group: 'Walls', items: [
    S_('wallCount', 'Wall line count', 'n', { min: 0, max: 20, step: 1, tip: 'Perimeters around each layer. More walls = stronger.' }),
    S_('outerWallFirst', 'Outer wall first', 'b', { adv: true, tip: 'Print the outer wall before the inner ones. Better accuracy on some machines, worse surface on others.' }),
    S_('zSeam', 'Z seam alignment', 's', { options: [['sharpest', 'Sharpest corner'], ['aligned', 'Aligned (a side)'], ['nearest', 'Nearest'], ['random', 'Random']], tip: 'Where each wall loop starts and stops. Sharpest corners hide the seam.' }),
    S_('seamSide', 'Seam side', 's', { adv: true, options: [['back', 'Back'], ['front', 'Front'], ['left', 'Left'], ['right', 'Right']], tip: 'Which side of the part an aligned seam sits on.' }),
  ] },
  { group: 'Top / bottom', items: [
    S_('topLayers', 'Top layers', 'n', { min: 0, max: 50, step: 1, tip: 'Solid layers on top of the part.' }),
    S_('bottomLayers', 'Bottom layers', 'n', { min: 0, max: 50, step: 1, tip: 'Solid layers on the bottom.' }),
    S_('skinPattern', 'Top / bottom pattern', 's', { options: [['lines', 'Lines'], ['concentric', 'Concentric']], tip: 'How solid skin is filled.' }),
    S_('skinOverlap', 'Skin overlap', 'n', { unit: '%', min: 0, max: 50, step: 5, adv: true, tip: 'How far skin runs into the walls, as a percent of line width.' }),
    S_('ironing', 'Ironing', 'b', { adv: true, tip: 'Pass the hot nozzle over the top surface again for a smoother finish.' }),
  ] },
  { group: 'Infill', items: [
    S_('infillDensity', 'Infill density', 'n', { unit: '%', min: 0, max: 100, step: 5, tip: '0 = hollow, 100 = solid.' }),
    S_('infillPattern', 'Infill pattern', 's', { options: PATTERNS, tip: 'Shape of the internal fill. Gyroid is strong and prints quickly; lines is the fastest.' }),
    S_('infillAngle', 'Infill angle', 'n', { unit: '°', min: 0, max: 180, step: 5, adv: true, tip: 'Direction of the infill lines on the first layer.' }),
    S_('infillOverlap', 'Infill overlap', 'n', { unit: '%', min: 0, max: 50, step: 5, adv: true, tip: 'How far infill runs into the walls, as a percent of line width.' }),
    S_('infillLayerThickness', 'Combine infill every', 'n', { unit: 'layers', min: 1, max: 8, step: 1, adv: true, tip: 'Print infill as thicker layers, every N layers. Saves time.' }),
    S_('infillBeforeWalls', 'Infill before walls', 'b', { adv: true, tip: 'Print infill before the walls.' }),
    S_('minInfillArea', 'Minimum infill area', 'n', { unit: 'mm²', min: 0, max: 50, step: 0.5, adv: true, tip: 'Skip infill in regions smaller than this.' }),
  ] },
  { group: 'Material', items: [
    S_('material', 'Material', 's', { options: MATERIALS.map(m => [m.id, m.name]), tip: 'Loads temperatures, retraction and cooling for the filament.' }),
    S_('nozzleTemp', 'Nozzle temperature', 'n', { unit: '°C', min: 150, max: 320, step: 5 }),
    S_('firstNozzleTemp', 'First layer nozzle temperature', 'n', { unit: '°C', min: 150, max: 320, step: 5, adv: true }),
    S_('bedTemp', 'Bed temperature', 'n', { unit: '°C', min: 0, max: 120, step: 5 }),
    S_('firstBedTemp', 'First layer bed temperature', 'n', { unit: '°C', min: 0, max: 120, step: 5, adv: true }),
    S_('filamentDia', 'Filament diameter', 'n', { unit: 'mm', min: 1.5, max: 3, step: 0.05, adv: true }),
    S_('flow', 'Flow', 'n', { unit: '%', min: 50, max: 150, step: 1, tip: 'Scales how much plastic is pushed. Tune this if walls look thin or fat.' }),
    S_('density', 'Filament density', 'n', { unit: 'g/cm³', min: 0.8, max: 2.5, step: 0.01, adv: true, tip: 'Only used for the weight estimate.' }),
    S_('filamentCost', 'Filament cost', 'n', { unit: '$/kg', min: 0, max: 500, step: 1, adv: true, tip: 'Only used for the cost estimate.' }),
  ] },
  { group: 'Speed', items: [
    S_('printSpeed', 'Print speed', 'n', { unit: 'mm/s', min: 5, max: 800, step: 5, tip: 'Default speed for infill and walls unless set below.' }),
    S_('outerWallSpeed', 'Outer wall speed', 'n', { unit: 'mm/s', min: 5, max: 800, step: 5 }),
    S_('innerWallSpeed', 'Inner wall speed', 'n', { unit: 'mm/s', min: 5, max: 800, step: 5, adv: true }),
    S_('infillSpeed', 'Infill speed', 'n', { unit: 'mm/s', min: 5, max: 800, step: 5 }),
    S_('topSpeed', 'Top / bottom speed', 'n', { unit: 'mm/s', min: 5, max: 800, step: 5, adv: true }),
    S_('supportSpeed', 'Support speed', 'n', { unit: 'mm/s', min: 5, max: 800, step: 5, adv: true }),
    S_('bridgeSpeed', 'Bridge speed', 'n', { unit: 'mm/s', min: 5, max: 200, step: 5, adv: true }),
    S_('firstLayerSpeed', 'First layer speed', 'n', { unit: 'mm/s', min: 5, max: 200, step: 5 }),
    S_('travelSpeed', 'Travel speed', 'n', { unit: 'mm/s', min: 20, max: 1000, step: 10 }),
    S_('maxFlowRate', 'Maximum flow rate', 'n', { unit: 'mm³/s', min: 1, max: 40, step: 0.5, adv: true, tip: 'The hotend can only melt so fast: speeds are capped to stay under this.' }),
    S_('accel', 'Acceleration', 'n', { unit: 'mm/s²', min: 0, max: 30000, step: 100, adv: true, tip: '0 leaves the printer\'s own setting alone.' }),
    S_('travelAccel', 'Travel acceleration', 'n', { unit: 'mm/s²', min: 0, max: 30000, step: 100, adv: true }),
    S_('jerk', 'Jerk / junction deviation', 'n', { unit: 'mm/s', min: 0, max: 30, step: 1, adv: true, tip: 'M205 X/Y jerk. 0 leaves it alone.' }),
    S_('linearAdvance', 'Linear advance K', 'n', { min: 0, max: 2, step: 0.01, adv: true, tip: 'M900 K value for printers with linear advance. 0 = off.' }),
  ] },
  { group: 'Travel / retraction', items: [
    S_('retraction', 'Retraction', 'b', { tip: 'Pull filament back before travel moves to avoid stringing.' }),
    S_('retractDist', 'Retraction distance', 'n', { unit: 'mm', min: 0, max: 15, step: 0.1, tip: '≈ 0.5–1.5 mm for direct drive, 4–6 mm for Bowden.' }),
    S_('retractSpeed', 'Retraction speed', 'n', { unit: 'mm/s', min: 5, max: 120, step: 5 }),
    S_('retractExtra', 'Extra prime amount', 'n', { unit: 'mm³', min: 0, max: 5, step: 0.05, adv: true }),
    S_('retractMinTravel', 'Minimum travel for retraction', 'n', { unit: 'mm', min: 0, max: 20, step: 0.5, adv: true }),
    S_('zHop', 'Z hop when retracting', 'n', { unit: 'mm', min: 0, max: 3, step: 0.1, adv: true }),
    S_('wipeDist', 'Wipe distance', 'n', { unit: 'mm', min: 0, max: 10, step: 0.5, adv: true, tip: 'Keep moving along the wall while retracting.' }),
    S_('combing', 'Avoid retracting inside the part', 'b', { adv: true, tip: 'Skip retraction on travels that stay inside the part outline, where ooze is hidden. Retract on any that cross open air.' }),
  ] },
  { group: 'Cooling', items: [
    S_('fanSpeed', 'Fan speed', 'n', { unit: '%', min: 0, max: 100, step: 5 }),
    S_('fanMinSpeed', 'Minimum fan speed', 'n', { unit: '%', min: 0, max: 100, step: 5, adv: true, tip: 'Used on slow layers when layer time is long.' }),
    S_('fanStartLayer', 'Fan off for first', 'n', { unit: 'layers', min: 0, max: 20, step: 1 }),
    S_('fanFullLayer', 'Fan at full speed from layer', 'n', { min: 0, max: 40, step: 1, adv: true }),
    S_('bridgeFan', 'Bridge fan speed', 'n', { unit: '%', min: 0, max: 100, step: 5, adv: true }),
    S_('minLayerTime', 'Minimum layer time', 'n', { unit: 's', min: 0, max: 60, step: 1, tip: 'Slow down small layers so the plastic has time to cool.' }),
    S_('minSpeed', 'Minimum print speed', 'n', { unit: 'mm/s', min: 1, max: 50, step: 1, adv: true, tip: 'Slowing for layer time never goes below this.' }),
  ] },
  { group: 'Support', items: [
    S_('support', 'Generate support', 'b', { tip: 'Print scaffolding under overhangs.' }),
    S_('supportPlacement', 'Placement', 's', { options: [['plate', 'Touching build plate'], ['everywhere', 'Everywhere']], tip: 'Touching build plate keeps support off the part\'s own surfaces.' }),
    S_('supportAngle', 'Overhang angle', 'n', { unit: '°', min: 0, max: 89, step: 1, tip: 'Surfaces steeper than this from vertical get support.' }),
    S_('supportPattern', 'Support pattern', 's', { options: [['lines', 'Lines'], ['grid', 'Grid'], ['triangles', 'Triangles']] }),
    S_('supportDensity', 'Support density', 'n', { unit: '%', min: 5, max: 100, step: 1 }),
    S_('supportXY', 'Support horizontal distance', 'n', { unit: 'mm', min: 0, max: 5, step: 0.1, adv: true }),
    S_('supportZ', 'Support vertical gap', 'n', { unit: 'layers', min: 0, max: 5, step: 1, adv: true, tip: 'Empty layers between the support and the part so it can be pulled off.' }),
    S_('supportRoof', 'Support roof layers', 'n', { min: 0, max: 8, step: 1, adv: true, tip: 'Dense layers under the overhang for a smoother underside.' }),
    S_('supportRoofDensity', 'Roof density', 'n', { unit: '%', min: 20, max: 100, step: 5, adv: true }),
    S_('supportMinArea', 'Minimum support area', 'n', { unit: 'mm²', min: 0, max: 50, step: 0.5, adv: true }),
  ] },
  { group: 'Bed adhesion', items: [
    S_('adhesion', 'Adhesion type', 's', { options: [['skirt', 'Skirt'], ['brim', 'Brim'], ['raft', 'Raft'], ['none', 'None']] }),
    S_('skirtLines', 'Skirt line count', 'n', { min: 0, max: 20, step: 1, adv: true }),
    S_('skirtDist', 'Skirt distance', 'n', { unit: 'mm', min: 0, max: 30, step: 0.5, adv: true }),
    S_('skirtMinLength', 'Skirt minimum length', 'n', { unit: 'mm', min: 0, max: 2000, step: 10, adv: true }),
    S_('brimWidth', 'Brim width', 'n', { unit: 'mm', min: 0, max: 30, step: 0.5, adv: true }),
    S_('raftLayers', 'Raft top layers', 'n', { min: 1, max: 6, step: 1, adv: true }),
    S_('raftMargin', 'Raft margin', 'n', { unit: 'mm', min: 0, max: 20, step: 0.5, adv: true }),
    S_('raftGap', 'Raft air gap', 'n', { unit: 'mm', min: 0, max: 1, step: 0.02, adv: true, tip: 'Gap between the raft and the part so it peels away.' }),
  ] },
  { group: 'Special modes', items: [
    S_('vase', 'Spiral vase mode', 'b', { adv: true, tip: 'One continuous outer wall climbing smoothly, no infill or top. Hollow shapes only.' }),
    S_('fuzzy', 'Fuzzy skin', 'b', { adv: true, tip: 'Jitters the outer wall for a rough, grippy texture.' }),
    S_('fuzzyThickness', 'Fuzzy skin thickness', 'n', { unit: 'mm', min: 0.05, max: 1, step: 0.05, adv: true }),
    S_('layerGcode', 'G-code at layers', 't', { adv: true, rows: 3, tip: 'One per line, as  layer: command.  E.g. "20: M600" pauses for a filament change before layer 20.' }),
  ] },
  { group: 'Machine', items: [
    S_('relativeE', 'Relative extrusion (M83)', 'b', { adv: true }),
    S_('startGcode', 'Start G-code', 't', { adv: true, rows: 8, tip: 'Placeholders: {bed} {nozzle} {bed0} {nozzle0} {maxx} {maxy} {maxz}' }),
    S_('endGcode', 'End G-code', 't', { adv: true, rows: 6 }),
  ] },
];
const SETTING_BY_KEY = {}; for (const g of SETTINGS) for (const s of g.items) SETTING_BY_KEY[s.key] = s;

const START_GCODE = {
  basic: `; --- start ---
M413 S0 ; no power-loss recovery noise
M140 S{bed0} ; start heating bed
M104 S{nozzle_warm} ; warm the nozzle (below ooze temperature)
G90 ; absolute positioning
G28 ; home all axes
{level}M190 S{bed0} ; wait for bed
M109 S{nozzle0} ; wait for nozzle
G92 E0
G1 Z2 F1200 ; lift
G1 X0.4 Y20 Z0.3 F5000 ; purge line
G1 X0.4 Y{purge_end} Z0.3 F1500 E15
G1 X0.7 Y{purge_end} Z0.3 F5000
G1 X0.7 Y20 Z0.3 F1500 E30
G92 E0
G1 Z2 F1200 ; lift
`,
  k1: `; --- start (K1 family: Klipper firmware speaks Marlin G-code) ---
M140 S{bed0}
M104 S{nozzle_warm}
G90
G28
M190 S{bed0}
M109 S{nozzle0}
G92 E0
G1 Z2 F1200
G1 X5 Y10 Z0.3 F6000 ; purge line
G1 X5 Y{purge_end} Z0.3 F2400 E12
G1 X5.6 Y{purge_end} Z0.3 F6000
G1 X5.6 Y10 Z0.3 F2400 E24
G92 E0
G1 Z2 F1200
`,
};
const END_GCODE = `; --- end ---
G91 ; relative positioning
G1 E-2 F2700 ; retract
G1 E-2 Z0.2 F2400 ; retract and lift a little
G1 X5 Y5 F6000 ; wipe off the part
G1 Z10 ; raise the head
G90 ; absolute positioning
G1 X0 Y{maxy} F3000 ; present the print
M106 S0 ; fan off
M104 S0 ; hotend off
M140 S0 ; bed off
M84 X Y E ; release the X/Y/E motors (Z stays put)
`;

function defaults(printerId = 'ender3v2', materialId = 'pla') {
  const pr = printerById(printerId), mat = materialById(materialId), n = pr.nozzle;
  const fast = pr.maxSpeed >= 400, mid = pr.maxSpeed >= 200;
  const sp = (fast ? 200 : mid ? 70 : 50) * mat.speedScale;
  const cfg = {
    printer: pr.id, material: mat.id,
    bed: pr.bed.slice(), nozzle: n,
    layerHeight: +(n * 0.5).toFixed(2), firstLayerHeight: +(n * 0.75).toFixed(2), lineWidth: +(n * 1.05).toFixed(2), firstLineWidth: +(n * 1.2).toFixed(2),
    xyComp: 0, elephantFoot: 0.1, slicingTol: 'middle', resolution: 0.03,
    wallCount: 3, outerWallFirst: false, zSeam: 'sharpest', seamSide: 'back',
    topLayers: 5, bottomLayers: 4, skinPattern: 'lines', skinOverlap: 20, ironing: false,
    infillDensity: 15, infillPattern: 'gyroid', infillAngle: 45, infillOverlap: 15, infillLayerThickness: 1, infillBeforeWalls: false, minInfillArea: 3,
    nozzleTemp: mat.nozzle, firstNozzleTemp: mat.nozzle0, bedTemp: mat.bed, firstBedTemp: mat.bed0, filamentDia: pr.filament, flow: mat.flow, density: mat.density, filamentCost: 20,
    printSpeed: Math.round(sp), outerWallSpeed: Math.round(sp * 0.6), innerWallSpeed: Math.round(sp * 0.9), infillSpeed: Math.round(sp * 1.1), topSpeed: Math.round(sp * 0.6), supportSpeed: Math.round(sp * 0.9),
    bridgeSpeed: Math.round(Math.min(sp * 0.6, 60)), firstLayerSpeed: Math.round(Math.min(sp * 0.4, 30)), travelSpeed: Math.min(pr.maxSpeed, fast ? 500 : mid ? 150 : 120),
    maxFlowRate: mat.maxFlow * (fast ? 1.6 : 1), accel: 0, travelAccel: 0, jerk: 0, linearAdvance: 0,
    retraction: true, retractDist: pr.dd ? 0.8 : mat.retract, retractSpeed: pr.dd ? 40 : mat.retractSpeed, retractExtra: 0, retractMinTravel: 1.5, zHop: 0.2, wipeDist: 0, combing: true,
    fanSpeed: mat.fan, fanMinSpeed: mat.fanMin, fanStartLayer: 1, fanFullLayer: 3, bridgeFan: 100, minLayerTime: mat.minLayerTime, minSpeed: 10,
    support: false, supportPlacement: 'plate', supportAngle: 50, supportPattern: 'grid', supportDensity: 15, supportXY: 0.7, supportZ: 1, supportRoof: 2, supportRoofDensity: 70, supportMinArea: 2,
    adhesion: 'skirt', skirtLines: 2, skirtDist: 4, skirtMinLength: 250, brimWidth: 6, raftLayers: 2, raftMargin: 5, raftGap: 0.1,
    vase: false, fuzzy: false, fuzzyThickness: 0.2, layerGcode: '',
    relativeE: true, startGcode: pr.family === 'K1' ? START_GCODE.k1 : START_GCODE.basic, endGcode: END_GCODE,
    level: pr.level, partX: null, partY: null,
  };
  if (pr.maxSpeed >= 400) { cfg.accel = 5000; cfg.travelAccel = 8000; cfg.jerk = 0; }
  cfg.outerWallSpeed = Math.min(cfg.outerWallSpeed, pr.maxSpeed); cfg.printSpeed = Math.min(cfg.printSpeed, pr.maxSpeed);
  return cfg;
}
// switch material but keep every other setting the user changed
function applyMaterial(cfg, materialId) {
  const mat = materialById(materialId), pr = printerById(cfg.printer), d = defaults(pr.id, mat.id);
  for (const k of ['material', 'nozzleTemp', 'firstNozzleTemp', 'bedTemp', 'firstBedTemp', 'flow', 'density', 'retractDist', 'retractSpeed', 'fanSpeed', 'fanMinSpeed', 'minLayerTime', 'maxFlowRate',
    'printSpeed', 'outerWallSpeed', 'innerWallSpeed', 'infillSpeed', 'topSpeed', 'supportSpeed', 'bridgeSpeed', 'firstLayerSpeed']) cfg[k] = d[k];
  return cfg;
}
// switch printer: new bed, limits, start/end G-code and nozzle-sized defaults
function applyPrinter(cfg, printerId) {
  const d = defaults(printerId, cfg.material), keep = {};
  for (const k of ['material', 'support', 'infillDensity', 'infillPattern', 'wallCount', 'topLayers', 'bottomLayers', 'adhesion', 'supportAngle']) keep[k] = cfg[k];
  return Object.assign(cfg, d, keep);
}

/* ── Clipper helpers ──────────────────────────────────────────────── */
const toC = ring => ring.map(p => ({ X: Math.round(p.x * SC), Y: Math.round(p.y * SC) }));
const fromC = ring => ring.map(p => ({ x: p.X / SC, y: p.Y / SC }));
const area = ring => CL.Clipper.Area(ring);                      // scaled²; + for CCW
const clone = ps => ps.map(r => r.map(p => ({ X: p.X, Y: p.Y })));
function clipOp(type, subj, clip, fill = CL.PolyFillType.pftNonZero) {
  const c = new CL.Clipper(); c.AddPaths(subj, CL.PolyType.ptSubject, true);
  if (clip && clip.length) c.AddPaths(clip, CL.PolyType.ptClip, true);
  const out = new CL.Paths(); c.Execute(type, out, fill, fill); return out;
}
const union = (a, b) => clipOp(CL.ClipType.ctUnion, a, b);
const diff = (a, b) => (!b || !b.length) ? a : clipOp(CL.ClipType.ctDifference, a, b);
const inter = (a, b) => (!a.length || !b || !b.length) ? [] : clipOp(CL.ClipType.ctIntersection, a, b);
function offset(paths, mm, join = CL.JoinType.jtRound) {
  if (!paths.length) return [];
  if (mm === 0) return paths;
  const co = new CL.ClipperOffset(2, 8), out = new CL.Paths();
  co.AddPaths(paths, join, CL.EndType.etClosedPolygon); co.Execute(out, mm * SC);
  return out;
}
function dropSmall(paths, minMm2) { const m = minMm2 * SC * SC; return paths.filter(r => Math.abs(area(r)) >= m); }
function clean(paths, mm) { return CL.Clipper.CleanPolygons(clone(paths), mm * SC).filter(r => r.length > 2); }
// split a flat Paths list (from a union) into islands: each { outer, holes[] }
function islandsOf(paths) {
  if (!paths.length) return [];
  const c = new CL.Clipper(); c.AddPaths(paths, CL.PolyType.ptSubject, true);
  const tree = new CL.PolyTree(); c.Execute(CL.ClipType.ctUnion, tree, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero);
  const out = [];
  const walk = node => {
    for (const ch of node.Childs()) {
      if (!ch.IsHole()) out.push({ outer: ch.Contour(), holes: ch.Childs().map(h => h.Contour()) });
      for (const h of ch.Childs()) walk(h);
    }
  };
  walk(tree); return out;
}
const islandPaths = is => [is.outer, ...is.holes];

/* ── Mesh slicing ─────────────────────────────────────────────────── */
function transformMesh(mesh, cfg) {
  // returns Z-up mesh dropped on the bed (min z = 0), centred, with rotation/scale applied
  const t = cfg.xform || {}, sx = (t.scale || 100) / 100;
  const rx = (t.rx || 0) * Math.PI / 180, ry = (t.ry || 0) * Math.PI / 180, rz = (t.rz || 0) * Math.PI / 180;
  const cx = Math.cos(rx), sxr = Math.sin(rx), cy = Math.cos(ry), syr = Math.sin(ry), cz = Math.cos(rz), szr = Math.sin(rz);
  const V = mesh.V.map(v => {
    let [x, y, z] = v;
    let y1 = y * cx - z * sxr, z1 = y * sxr + z * cx; y = y1; z = z1;                     // about X
    let x2 = x * cy + z * syr, z2 = -x * syr + z * cy; x = x2; z = z2;                    // about Y
    let x3 = x * cz - y * szr, y3 = x * szr + y * cz; x = x3; y = y3;                     // about Z
    return [x * sx, y * sx, z * sx];
  });
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const v of V) for (let k = 0; k < 3; k++) { if (v[k] < mn[k]) mn[k] = v[k]; if (v[k] > mx[k]) mx[k] = v[k]; }
  const px = cfg.partX == null ? cfg.bed[0] / 2 : cfg.partX, py = cfg.partY == null ? cfg.bed[1] / 2 : cfg.partY;
  const ox = px - (mn[0] + mx[0]) / 2, oy = py - (mn[1] + mx[1]) / 2, oz = -mn[2];
  for (const v of V) { v[0] += ox; v[1] += oy; v[2] += oz; }
  return { V, T: mesh.T, min: [mn[0] + ox, mn[1] + oy, 0], max: [mx[0] + ox, mx[1] + oy, mx[2] + oz] };
}
// layer plane intersection → closed loops (oriented, so a NonZero union gives the solid)
function sliceLoops(M, buckets, li, z) {
  const { V, T } = M, segs = [];
  const zz = z;
  for (const t of buckets[li] || []) {
    const ia = T[t * 3], ib = T[t * 3 + 1], ic = T[t * 3 + 2], ids = [ia, ib, ic];
    const A = V[ia], B = V[ib], C = V[ic];
    const nz = [A[2] - zz, B[2] - zz, C[2] - zz];
    // sign classification with the plane nudged off any vertex
    const sg = nz.map(d => d > 0 ? 1 : (d < 0 ? -1 : 1));
    if (sg[0] === sg[1] && sg[1] === sg[2]) continue;
    const pts = [];
    for (let e = 0; e < 3; e++) {
      const a = e, b = (e + 1) % 3;
      if (sg[a] === sg[b]) continue;
      const pa = V[ids[a]], pb = V[ids[b]], tt = (zz - pa[2]) / (pb[2] - pa[2]);
      const lo = Math.min(ids[a], ids[b]), hi = Math.max(ids[a], ids[b]);
      pts.push({ x: pa[0] + (pb[0] - pa[0]) * tt, y: pa[1] + (pb[1] - pa[1]) * tt, k: lo * 4294967 + hi });
    }
    if (pts.length !== 2) continue;
    // outward normal gives direction: ẑ × n
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz;
    let [p, q] = pts;
    const dx = -ny, dy = nx;
    if ((q.x - p.x) * dx + (q.y - p.y) * dy < 0) [p, q] = [q, p];
    segs.push([p, q]);
  }
  // chain by position (10 µm grid, neighbours too): robust to T-junctions, tiny seams and meshes whose edges are not shared index-for-index
  const Q = 100, qk = (ix, iy) => (ix + 5e6) * 1e7 + (iy + 5e6);
  const cell = p => [Math.round(p.x * Q), Math.round(p.y * Q)];
  const next = new Map();
  for (const s of segs) { const [ix, iy] = cell(s[0]), k = qk(ix, iy); s.k0 = k; const l = next.get(k); l ? l.push(s) : next.set(k, [s]); }
  const find = (p, used) => {
    const [ix, iy] = cell(p);
    for (let dx = 0; dx <= 1; dx++) for (let dy = 0; dy <= 1; dy++) for (const sx of dx ? [-1, 1] : [0]) for (const sy of dy ? [-1, 1] : [0]) {
      const l = next.get(qk(ix + sx * dx, iy + sy * dy)); if (!l) continue;
      for (const c of l) if (!used.has(c)) return c;
    }
    return null;
  };
  const used = new Set(), loops = [];
  for (const s of segs) {
    if (used.has(s)) continue;
    const ring = []; let cur = s, ok = false;
    for (let guard = 0; guard < 1e7; guard++) {
      used.add(cur); ring.push(cur[0]);
      const cand = find(cur[1], used);
      if (!cand) { const [fx, fy] = cell(s[0]), [ex, ey] = cell(cur[1]); ok = Math.abs(fx - ex) <= 1 && Math.abs(fy - ey) <= 1; break; }
      cur = cand;
    }
    if (ok && ring.length >= 3) loops.push(ring); else if (ring.length >= 3) { (loops.openRings = loops.openRings || []).push(ring); loops.open = (loops.open || 0) + 1; }
  }
  return loops;
}
function sliceLayers(M, heights, tol, report) {
  // heights: [{z0, z1}] → Paths per layer (union of loops)
  const n = heights.length, buckets = Array.from({ length: n }, () => []);
  const zs = heights.map(h => tol === 'inclusive' ? h.z0 + 1e-4 : tol === 'exclusive' ? h.z1 - 1e-4 : (h.z0 + h.z1) / 2);
  const first = heights[0].z0, h0 = heights[0].z1 - heights[0].z0, h = n > 1 ? heights[1].z1 - heights[1].z0 : h0;
  const idx = z => z <= heights[0].z1 ? 0 : Math.min(n - 1, 1 + Math.floor((z - heights[0].z1) / h));
  for (let t = 0; t < M.T.length / 3; t++) {
    const a = M.V[M.T[t * 3]][2], b = M.V[M.T[t * 3 + 1]][2], c = M.V[M.T[t * 3 + 2]][2];
    const lo = Math.min(a, b, c), hi = Math.max(a, b, c);
    if (hi === lo) continue;
    let i0 = Math.max(0, idx(lo) - 1), i1 = Math.min(n - 1, idx(hi) + 1);
    for (let i = i0; i <= i1; i++) if (zs[i] > lo - 1e-9 && zs[i] < hi + 1e-9) buckets[i].push(t);
  }
  return zs.map((z, i) => {
    // nudge off exact-vertex heights so edges classify consistently
    const loops = sliceLoops(M, buckets, i, z + 3.7e-6);
    if (loops.openRings && report) for (const r of loops.openRings) { let len = 0; for (let k = 1; k < r.length; k++) len += Math.hypot(r[k].x - r[k - 1].x, r[k].y - r[k - 1].y); if (len > 1) report.open++; }
    return loops.length ? union(loops.map(r => toC(r)), []) : [];
  });
}

/* ── Infill ───────────────────────────────────────────────────────── */
const rot = (p, c, s) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c });
function bbox(paths) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of paths) for (const p of r) { if (p.X < x0) x0 = p.X; if (p.X > x1) x1 = p.X; if (p.Y < y0) y0 = p.Y; if (p.Y > y1) y1 = p.Y; }
  return { x0: x0 / SC, y0: y0 / SC, x1: x1 / SC, y1: y1 / SC };
}
// clip open polylines (mm) to region (Paths); returns polylines (mm)
function clipLines(lines, region) {
  if (!lines.length || !region.length) return [];
  const c = new CL.Clipper();
  for (const l of lines) {
    const q = toC(l).filter((p, i, a) => i === 0 || p.X !== a[i - 1].X || p.Y !== a[i - 1].Y);   // Clipper hangs on repeated points
    if (q.length > 1) c.AddPath(q, CL.PolyType.ptSubject, false);
  }
  c.AddPaths(region, CL.PolyType.ptClip, true);
  const tree = new CL.PolyTree(); c.Execute(CL.ClipType.ctIntersection, tree, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero);
  return CL.Clipper.OpenPathsFromPolyTree(tree).map(fromC).filter(l => l.length > 1);
}
function parallelLines(bb, spacing, angleDeg, phase = 0) {
  const a = angleDeg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2, R = Math.hypot(bb.x1 - bb.x0, bb.y1 - bb.y0) / 2 + spacing;
  const out = [], n0 = Math.ceil(R / spacing);
  for (let i = -n0; i <= n0; i++) {
    const d = i * spacing + (phase % spacing);
    out.push([{ x: cx + c * -R - s * d, y: cy + s * -R + c * d }, { x: cx + c * R - s * d, y: cy + s * R + c * d }]);
  }
  return out;
}
function honeycombLines(bb, side, phase) {
  const w = side * Math.sqrt(3), out = [];
  const x0 = bb.x0 - w * 2, x1 = bb.x1 + w * 2, y0 = bb.y0 - side * 4, y1 = bb.y1 + side * 4;
  let row = 0;
  for (let y = y0; y < y1; y += side * 1.5, row++) {
    const off = (row % 2) * (w / 2), zig = [];
    for (let x = x0 + off + (phase % w); x < x1; x += w) { zig.push({ x, y }, { x: x + w / 2, y: y + side * 0.5 }); }
    zig.push({ x: x1 + w, y });
    // chain the row as a slanted zig-zag + vertical stubs
    const line = [];
    for (let x = x0 + off + (phase % w) - w; x < x1; x += w) { line.push({ x, y: y + side * 0.5 }, { x: x + w / 2, y }); }
    out.push(line);
    for (let x = x0 + off + (phase % w) - w; x < x1; x += w) if (row % 2 === 0 || true) out.push([{ x, y: y + side * 0.5 }, { x, y: y + side * 1.5 }]);
  }
  return out;
}
// marching squares on sin(x)cos(y)+sin(y)cos(z)+sin(z)cos(x) = 0 → polylines
function gyroidLines(bb, pitch, z) {
  const k = TAU / pitch, step = pitch / 14, nx = Math.ceil((bb.x1 - bb.x0) / step) + 2, ny = Math.ceil((bb.y1 - bb.y0) / step) + 2;
  const x0 = bb.x0 - step, y0 = bb.y0 - step, sz = Math.sin(z * k), cz = Math.cos(z * k);
  const F = new Float32Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const X = (x0 + i * step) * k, Y = (y0 + j * step) * k;
    F[j * (nx + 1) + i] = Math.sin(X) * Math.cos(Y) + Math.sin(Y) * cz + sz * Math.cos(X);
  }
  const segs = [];
  const pt = (i0, j0, i1, j1) => {                       // zero crossing on a grid edge
    const a = F[j0 * (nx + 1) + i0], b = F[j1 * (nx + 1) + i1], t = a / (a - b);
    return { x: x0 + (i0 + (i1 - i0) * t) * step, y: y0 + (j0 + (j1 - j0) * t) * step, k: (i0 * 2 + (i1 - i0 > 0 ? 1 : 0)) + ',' + (j0 * 2 + (j1 - j0 > 0 ? 1 : 0)) };
  };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = F[j * (nx + 1) + i] > 0, b = F[j * (nx + 1) + i + 1] > 0, c = F[(j + 1) * (nx + 1) + i + 1] > 0, d = F[(j + 1) * (nx + 1) + i] > 0;
    const code = a * 1 + b * 2 + c * 4 + d * 8;
    if (code === 0 || code === 15) continue;
    const e = [() => pt(i, j, i + 1, j), () => pt(i + 1, j, i + 1, j + 1), () => pt(i, j + 1, i + 1, j + 1), () => pt(i, j, i, j + 1)];
    const tbl = { 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 0], [1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[0, 2]], 10: [[0, 1], [2, 3]], 11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[3, 0]] };
    for (const [p, q] of tbl[code]) segs.push([e[p](), e[q]()]);
  }
  return chainSegments(segs);
}
// drop points that lie within tol of the line through their neighbours (Douglas–Peucker)
function simplify(l, tol) {
  if (l.length < 3) return l;
  const keep = new Uint8Array(l.length); keep[0] = keep[l.length - 1] = 1;
  const stack = [[0, l.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let md = 0, mi = -1;
    const A = l[a], B = l[b], dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((l[i].x - A.x) * dy - (l[i].y - A.y) * dx) / L; if (d > md) { md = d; mi = i; } }
    if (md > tol && mi > 0) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return l.filter((p, i) => keep[i]);
}
// join loose segments sharing keyed endpoints into long polylines
function chainSegments(segs) {
  const at = new Map();
  segs.forEach((s, i) => { for (const e of [0, 1]) { const k = s[e].k; if (!at.has(k)) at.set(k, []); at.get(k).push([i, e]); } });
  const used = new Uint8Array(segs.length), out = [];
  const extend = (line, endKey, front) => {
    for (;;) {
      const nb = (at.get(endKey) || []).find(([i]) => !used[i]);
      if (!nb) return;
      const [i, e] = nb; used[i] = 1; const far = segs[i][1 - e];
      if (front) line.unshift({ x: far.x, y: far.y }); else line.push({ x: far.x, y: far.y });
      endKey = far.k;
    }
  };
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue; used[i] = 1;
    const line = [{ x: segs[i][0].x, y: segs[i][0].y }, { x: segs[i][1].x, y: segs[i][1].y }];
    extend(line, segs[i][1].k, false); extend(line, segs[i][0].k, true);
    out.push(line);
  }
  return out;
}
// infill polylines (mm) for region (Paths) at a given layer
function infillFor(region, pattern, density, lw, li, z, angle, solid) {
  if (!region.length) return [];
  const bb = bbox(region), d = Math.max(0.02, Math.min(1, density));
  let lines = [], sp = lw / d;
  const ph = z * 0.57735;                                    // cubic: lines slide with height
  switch (solid ? 'lines' : pattern) {
    case 'lines': {
      const a = solid ? (li % 2 ? angle + 90 : angle) : angle + (li % 2 ? 90 : 0);
      lines = parallelLines(bb, solid ? lw : sp, a); break;
    }
    case 'grid': sp *= 2; lines = parallelLines(bb, sp, angle).concat(parallelLines(bb, sp, angle + 90)); break;
    case 'triangles': sp *= 3; lines = [0, 60, 120].flatMap(a => parallelLines(bb, sp, angle + a)); break;
    case 'cubic': sp *= 3; lines = [0, 60, 120].flatMap((a, k) => parallelLines(bb, sp, angle + a, ph * (k + 1) * 1.7)); break;
    case 'honeycomb': { const side = sp * 0.5; lines = honeycombLines(bb, Math.max(side, lw * 2), 0); break; }
    case 'gyroid': lines = gyroidLines(bb, sp * 2.1, z).map(l => simplify(l, 0.03)); break;
    case 'concentric': {
      const out = []; let cur = offset(region, -lw / 2, CL.JoinType.jtMiter);
      for (let g = 0; g < 400 && cur.length; g++) { for (const r of cur) out.push(fromC(r).concat([fromC([r[0]])[0]])); cur = offset(cur, -sp, CL.JoinType.jtMiter); }
      return out;
    }
  }
  return clipLines(lines, region);
}

/* ── Planning one layer ───────────────────────────────────────────── */
function seamPick(loop, cfg, from, rnd) {
  // choose the index in loop (mm points) where printing starts
  const n = loop.length; let best = 0;
  switch (cfg.zSeam) {
    case 'random': best = Math.floor(rnd() * n); break;
    case 'nearest': { let bd = Infinity; for (let i = 0; i < n; i++) { const d = Math.hypot(loop[i].x - from.x, loop[i].y - from.y); if (d < bd) { bd = d; best = i; } } break; }
    case 'aligned': {
      const s = { back: p => p.y, front: p => -p.y, left: p => -p.x, right: p => p.x }[cfg.seamSide] || (p => p.y);
      let bs = -Infinity; for (let i = 0; i < n; i++) { const v = s(loop[i]); if (v > bs + 1e-6) { bs = v; best = i; } } break;
    }
    default: {                                                // sharpest: smallest interior turn angle (convex corners preferred)
      let bs = -Infinity;
      for (let i = 0; i < n; i++) {
        const a = loop[(i + n - 1) % n], b = loop[i], c = loop[(i + 1) % n];
        const ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y, lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
        if (lu < 1e-6 || lv < 1e-6) continue;
        const turn = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv))));
        const sc = turn + (b.y * 1e-6);                       // tie-break to the back
        if (sc > bs) { bs = sc; best = i; }
      }
    }
  }
  return best;
}
const rotateLoop = (loop, i) => loop.slice(i).concat(loop.slice(0, i));
function fuzz(loop, thick, rnd) {
  const out = [], step = 0.6;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length], L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1e-6) continue;
    const nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L, k = Math.max(1, Math.round(L / step));
    for (let j = 0; j < k; j++) { const t = j / k, o = (rnd() - 0.5) * thick; out.push({ x: a.x + (b.x - a.x) * t + nx * o, y: a.y + (b.y - a.y) * t + ny * o }); }
  }
  return out;
}
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/* ── The slicer ───────────────────────────────────────────────────── */
async function slice(meshIn, cfgIn, opts = {}) {
  const cfg = Object.assign({}, cfgIn), onProgress = opts.onProgress || (() => {}), yieldNow = () => new Promise(r => setTimeout(r, 0));
  const warnings = [];
  const M = transformMesh(meshIn, cfg);
  const sizeZ = M.max[2];
  if (!M.V.length || sizeZ <= 0) throw new Error('The model has no height to slice.');
  if (Math.max(M.max[0] - M.min[0], M.max[1] - M.min[1], sizeZ) > 4 * Math.max(...cfg.bed)) throw new Error('The part is far larger than the printer. Check the scale.');
  if (M.min[0] < -0.01 || M.min[1] < -0.01 || M.max[0] > cfg.bed[0] + 0.01 || M.max[1] > cfg.bed[1] + 0.01) warnings.push(`The part is outside the ${cfg.bed[0]} × ${cfg.bed[1]} mm bed.`);
  if (sizeZ > cfg.bed[2] + 0.01) warnings.push(`The part is ${sizeZ.toFixed(1)} mm tall; the printer's limit is ${cfg.bed[2]} mm.`);

  { const pr = printerById(cfg.printer);
    for (const k of ['nozzleTemp', 'firstNozzleTemp']) if (cfg[k] > pr.maxHotend) { warnings.push(`${pr.name} tops out at ${pr.maxHotend} °C, so the nozzle temperature was lowered from ${cfg[k]} °C.`); cfg[k] = pr.maxHotend; }
    for (const k of ['bedTemp', 'firstBedTemp']) if (cfg[k] > pr.maxBed) { warnings.push(`${pr.name} tops out at ${pr.maxBed} °C on the bed, so the bed temperature was lowered from ${cfg[k]} °C.`); cfg[k] = pr.maxBed; } }

  const lh = cfg.layerHeight, lh0 = Math.min(cfg.firstLayerHeight, sizeZ);
  const lw = cfg.lineWidth, lw0 = cfg.firstLineWidth;
  // raft shifts the model up
  const raftOn = cfg.adhesion === 'raft';
  const raftTop = raftOn ? Math.max(1, cfg.raftLayers | 0) : 0, raftBase = raftOn ? 1 : 0;
  const raftH = raftOn ? (lh0 + raftTop * lh + (raftBase ? 0.1 : 0)) : 0;     // base layer 0.3-ish + interface layers
  const baseOff = raftOn ? raftH + cfg.raftGap : 0;
  const heights = []; { let z = 0; heights.push({ z0: 0, z1: lh0 }); z = lh0; while (z < sizeZ - 1e-6) { const z1 = Math.min(sizeZ, z + lh); if (z1 - z < 0.02) break; heights.push({ z0: z, z1 }); z = z1; } }
  const nL = heights.length;
  onProgress(0, 'Slicing the mesh…'); await yieldNow();
  const rep = { open: 0 }, raw = sliceLayers(M, heights, cfg.slicingTol, rep);
  if (rep.open) warnings.push(`The model has gaps (${rep.open} open outlines across the layers), so parts of it may be missing. Repair or re-export it.`);
  onProgress(0.15, 'Building walls…');

  // outline: compensate, simplify
  const outline = raw.map((paths, i) => {
    let p = paths;
    const adj = cfg.xyComp - (i === 0 ? cfg.elephantFoot : 0);
    if (adj) p = offset(p, adj);
    p = clean(p, cfg.resolution);
    return dropSmall(p, 0.02);
  });

  // per layer: islands with wall rings + inner region
  const layers = [];
  const vase = !!cfg.vase;
  for (let i = 0; i < nL; i++) {
    const w = i === 0 ? lw0 : lw, isl = [];
    const wc = vase ? 1 : cfg.wallCount;
    for (const is of islandsOf(outline[i])) {
      const rings = [];                                      // rings[k] = Paths of wall k (0 = outer)
      let cur = islandPaths(is), ok = true;
      for (let k = 0; k < wc; k++) {
        const o = offset(cur, k === 0 ? -w / 2 : -w);
        const c = clean(o, cfg.resolution); if (!c.length) { ok = k > 0; break; }
        rings.push(c); cur = o;
      }
      let inner = rings.length ? offset(cur, -w / 2, CL.JoinType.jtMiter) : [];
      isl.push({ rings, inner: dropSmall(clean(inner, cfg.resolution), 0.02), outer: is });
    }
    layers.push({ i, z0: heights[i].z0, z1: heights[i].z1, h: heights[i].z1 - heights[i].z0, islands: isl, section: outline[i], paths: [] });
    if (i % 12 === 0) { onProgress(0.15 + 0.25 * i / nL, `Walls: layer ${i + 1} of ${nL}`); await yieldNow(); }
  }
  const innerAll = layers.map(L => L.islands.flatMap(x => x.inner));

  // skin/solid classification
  const T = cfg.topLayers, B = cfg.bottomLayers;
  const spread = (lw * (1 + cfg.skinOverlap / 100)) / 2;
  const skinOf = [];
  for (let i = 0; i < nL; i++) {
    const inn = innerAll[i];
    if (!inn.length) { skinOf.push({ solid: [], sparse: [], bridge: [], top: [] }); continue; }
    if (vase) { skinOf.push({ solid: i < B ? inn : [], sparse: [], bridge: [], top: [] }); continue; }
    let above = inn;
    for (let k = 1; k <= T && above.length; k++) { above = i + k < nL ? inter(above, innerAll[i + k]) : []; }
    let below = inn;
    for (let k = 1; k <= B && below.length; k++) { below = i - k >= 0 ? inter(below, innerAll[i - k]) : []; }
    const topSk = T > 0 ? diff(inn, above) : [], botSk = B > 0 ? diff(inn, below) : [];
    let solid = union(topSk, botSk);
    solid = dropSmall(solid, 0.1);
    // bridges: bottom skin not supported by the layer beneath
    let bridge = [];
    if (i > 0 && botSk.length) {
      const under = offset(outline[i - 1], 0.2);
      bridge = dropSmall(diff(inter(botSk, inn), under), 0.5);
    }
    const wide = solid.length ? offset(solid, spread) : [];
    const sparse = dropSmall(diff(inn, wide), cfg.minInfillArea);
    const topOnly = dropSmall(diff(inn, i + 1 < nL ? innerAll[i + 1] : []), 0.1);
    skinOf.push({ solid: inter(wide, offset(inn, (cfg.infillOverlap / 100) * lw, CL.JoinType.jtMiter)), sparse, bridge, top: i + 1 >= nL ? inn : topOnly });
    if (i % 12 === 0) { onProgress(0.4 + 0.15 * i / nL, `Skin: layer ${i + 1} of ${nL}`); await yieldNow(); }
  }

  // support
  let supportLayers = null, supportRoof = null;
  if (cfg.support) {
    onProgress(0.55, 'Planning support…'); await yieldNow();
    supportLayers = new Array(nL).fill(null).map(() => []);
    supportRoof = new Array(nL).fill(null).map(() => []);
    const slope = Math.tan((cfg.supportAngle * Math.PI) / 180), gap = Math.max(0, cfg.supportZ | 0);
    const xy = cfg.supportXY, over = new Array(nL).fill(null).map(() => []);
    for (let i = 1; i < nL; i++) {
      const reach = offset(outline[i - 1], slope * heights[i].z1 * 0 + slope * (heights[i].z1 - heights[i].z0));
      over[i] = dropSmall(diff(outline[i], reach), cfg.supportMinArea);
    }
    // top-down: carry support downwards, add overhangs `gap` layers below the part
    let carry = [];
    const modelXY = outline.map(o => offset(o, xy));
    for (let i = nL - 1; i >= 0; i--) {
      const inject = i + gap + 1 < nL ? over[i + gap + 1] : [];
      // overhang area above (i+gap+1) is supported starting at layer i
      carry = union(carry, inject);
      carry = diff(carry, modelXY[i]);
      supportLayers[i] = dropSmall(carry, cfg.supportMinArea);
      // roof: the top `supportRoof` support layers directly under each overhang
      if (cfg.supportRoof > 0) {
        let r = [];
        for (let k = 0; k < cfg.supportRoof; k++) { const j = i + gap + 1 + k; if (j < nL) r = union(r, over[j]); }
        supportRoof[i] = r.length ? inter(supportLayers[i], r) : [];
      }
    }
    if (cfg.supportPlacement === 'plate') {
      // keep only support columns that reach the bed: remove anything above model footprints beneath
      let blocked = [];
      for (let i = 0; i < nL; i++) {
        supportLayers[i] = diff(supportLayers[i], blocked);
        supportRoof[i] = diff(supportRoof[i], blocked);
        blocked = union(blocked, modelXY[i]);
      }
    }
    for (let i = 0; i < nL; i++) supportLayers[i] = dropSmall(supportLayers[i], cfg.supportMinArea);
    if (!supportLayers.some(s => s.length)) warnings.push('Support is on, but nothing in the model needs it at this overhang angle.');
  }

  // adhesion geometry (first layer)
  const foot = layers[0].section.length ? layers[0].section : [];
  const supFoot = supportLayers ? supportLayers[0] : [];
  const footAll = union(foot, supFoot);
  let adhesion = { skirt: [], brim: [], raft: null };
  if (cfg.adhesion === 'skirt' && cfg.skirtLines > 0 && footAll.length) {
    let guard = 0, ringsOut = [], base = offset(union(footAll, []), cfg.skirtDist + lw0 / 2), length = 0;
    // enlarge: hull of the footprint is not needed; the outer-most ring is fine
    let cur = base;
    const outerOnly = ps => ps.filter(r => area(r) > 0);
    for (let k = 0; k < cfg.skirtLines || (length < cfg.skirtMinLength && guard < 12); k++, guard++) {
      const oo = outerOnly(cur); if (!oo.length) break;
      ringsOut.push(oo); for (const r of oo) length += ringLen(r);
      cur = offset(cur, lw0, CL.JoinType.jtRound);
    }
    adhesion.skirt = ringsOut;
  }
  if (cfg.adhesion === 'brim' && cfg.brimWidth > 0 && footAll.length) {
    const rings = []; const n = Math.max(1, Math.round(cfg.brimWidth / lw0));
    for (let k = 0; k < n; k++) {
      const o = offset(footAll, lw0 * (k + 0.5), CL.JoinType.jtRound).filter(r => area(r) > 0);
      if (o.length) rings.push(o);
    }
    adhesion.brim = rings.reverse();                              // outermost first, so the part's edge grips last
  }
  let raftRegion = null;
  if (raftOn && footAll.length) raftRegion = clean(offset(footAll, cfg.raftMargin), 0.05).filter(r => area(r) > 0);
  { const rings = [].concat(...adhesion.skirt, ...adhesion.brim, raftRegion || []); let lo = [1e9, 1e9], hi = [-1e9, -1e9];
    for (const r of rings) for (const q of r) { lo = [Math.min(lo[0], q.X / SC), Math.min(lo[1], q.Y / SC)]; hi = [Math.max(hi[0], q.X / SC), Math.max(hi[1], q.Y / SC)]; }
    if (rings.length && (lo[0] < -0.01 || lo[1] < -0.01 || hi[0] > cfg.bed[0] + 0.01 || hi[1] > cfg.bed[1] + 0.01)) warnings.push(`The ${cfg.adhesion} reaches past the edge of the bed. Make it narrower, use no adhesion, or shrink the part.`); }

  // build per-layer plans
  const rnd = rng(12345);
  let pos = { x: cfg.partX == null ? cfg.bed[0] / 2 : cfg.partX, y: 5 };
  const planned = [];

  if (raftOn && raftRegion) {
    // raft layers: base (wide spaced, thick), then interface layers
    const bb = raftRegion;
    const baseLines = infillFor(bb, 'lines', 0.55, lw0 * 1.6, 0, 0, 0, false);
    planned.push({ raft: true, z: lh0 + 0.1, h: lh0 + 0.1, w: lw0 * 1.6, paths: orderLines(baseLines, pos).map(l => ({ type: 'raft', pts: l, closed: false, w: lw0 * 1.6, h: lh0 + 0.1 })), index: 0 });
    for (let k = 0; k < raftTop; k++) {
      const solidLines = infillFor(bb, 'lines', 1, lw, k + 1, 0, k % 2 ? 0 : 90, true);
      planned.push({ raft: true, z: lh0 + 0.1 + (k + 1) * lh, h: lh, w: lw, paths: orderLines(solidLines, pos).map(l => ({ type: 'raft', pts: l, closed: false, w: lw, h: lh })), index: k + 1 });
    }
  }
  const zOff = baseOff, nRaft = planned.length;

  for (let i = 0; i < nL; i++) {
    const L = layers[i], w = i === 0 ? lw0 : lw, sk = skinOf[i], paths = [], z = L.z1 + zOff;
    const isFirst = i === 0;
    const add = (type, pts, closed, o = {}) => paths.push(Object.assign({ type, pts, closed, w: o.w || w, h: o.h || L.h }, o));

    // adhesion on the first model layer (skirt/brim sit at the bed when no raft)
    if (isFirst && !raftOn) {
      for (const rings of adhesion.skirt) for (const r of rings) add('skirt', fromC(r), true, { w: lw0 });
      for (const rings of adhesion.brim) for (const r of rings) add('brim', fromC(r), true, { w: lw0 });
    }

    // support first (it is underneath what comes next)
    if (supportLayers) {
      const sp = supportLayers[i], roof = supportRoof[i] || [];
      if (sp.length) {
        const sparseSup = diff(sp, roof);
        const lines = infillFor(sparseSup, cfg.supportPattern, cfg.supportDensity / 100, lw, i, i * lh, 0, false);
        // support wall: one line around the sparse region so the pattern stands up
        for (const r of offset(sparseSup, -lw / 2)) if (Math.abs(area(r)) > 4 * SC * SC) add('support', fromC(r), true, { w: lw });
        for (const l of orderLines(lines, pos)) add('support', l, false, { w: lw });
        if (roof.length) for (const l of orderLines(infillFor(roof, 'lines', cfg.supportRoofDensity / 100, lw, i, 0, i % 2 ? 90 : 0, false), pos)) add('roof', l, false, { w: lw });
      }
    }

    const infillTasks = [];                                  // [{ type, lines }]
    for (const is of L.islands) {
      const inn = is.inner;
      {
        const solid = inter(inn, sk.solid), sparse = inter(inn, sk.sparse);
        const bridge = inter(inn, sk.bridge);
        const solidNoBridge = diff(solid, bridge);
        const topFace = inter(inn, sk.top);
        if (solidNoBridge.length) {
          const pat = cfg.skinPattern === 'concentric' ? 'concentric' : 'lines';
          const lines = infillFor(solidNoBridge, pat, 1, w, i, z, i % 2 ? 135 : 45, true);
          infillTasks.push({ type: pat === 'concentric' ? 'skin' : 'skin', lines, island: is, top: topFace.length > 0 && i > 0 });
        }
        if (bridge.length) {
          // bridge lines run across the gap in the direction of the longest span: use the layer's axis
          infillTasks.push({ type: 'bridge', lines: infillFor(bridge, 'lines', 1, w * 1.1, 0, z, bridgeAngle(bridge), true), island: is });
        }
        if (sparse.length && cfg.infillDensity > 0) {
          const comb = Math.max(1, cfg.infillLayerThickness | 0);
          if (comb === 1 || i % comb === comb - 1 || i === nL - 1) {
            const lines = cfg.infillDensity >= 100 ? infillFor(sparse, 'lines', 1, w, i, z, i % 2 ? 135 : 45, true) : infillFor(sparse, cfg.infillPattern, cfg.infillDensity / 100, w * (comb > 1 ? Math.sqrt(comb) : 1), i, z, cfg.infillAngle, false);
            infillTasks.push({ type: 'infill', lines, island: is, comb: comb > 1 ? comb : 1 });
          }
        }
      }
    }

    // walls per island, with infill ordered before/after
    for (const is of L.islands) {
      const myInfill = infillTasks.filter(t => t.island === is);
      const emitInfill = () => {
        for (const t of myInfill) {
          for (const l of orderLines(t.lines, pos)) add(t.type, l, false, { w: t.type === 'bridge' ? w * 1.1 : w, h: t.comb ? L.h * t.comb : L.h });
        }
      };
      if (cfg.infillBeforeWalls) emitInfill();
      const wallRings = is.rings;
      const order = cfg.outerWallFirst ? wallRings.map((r, k) => k) : wallRings.map((r, k) => wallRings.length - 1 - k);
      for (const k of order) {
        for (const ring of wallRings[k]) {
          let pts = fromC(ring);
          if (pts.length < 3) continue;
          if (k === 0 && cfg.fuzzy) pts = fuzz(pts, cfg.fuzzyThickness, rnd);
          const start = seamPick(pts, cfg, pos, rnd);
          pts = rotateLoop(pts, start);
          add(k === 0 ? 'outer' : 'inner', pts, true, { w, spiral: vase && i >= B });
          pos = pts[0];
        }
      }
      if (!cfg.infillBeforeWalls) emitInfill();
    }
    // top ironing
    if (cfg.ironing && !vase) {
      const topArea = layers[i].islands.flatMap(x => x.inner);
      const topFace = dropSmall(diff(topArea, i + 1 < nL ? innerAll[i + 1] : []), 1);
      if (topFace.length) for (const l of orderLines(infillFor(offset(topFace, -lw * 0.4), 'lines', 1, 0.1, 0, z, 45, true), pos)) add('iron', l, false, { w: lw * 0.4, h: L.h * 0.15 });
    }
    planned.push({ raft: false, index: nRaft + i, modelIndex: i, z, h: L.h, paths, section: L.section });
    if (i % 8 === 0) { onProgress(0.6 + 0.35 * i / nL, `Planning: layer ${i + 1} of ${nL}`); await yieldNow(); }
  }
  onProgress(0.97, 'Done');

  const stats = { layers: planned.length, modelLayers: nL, height: sizeZ, size: [M.max[0] - M.min[0], M.max[1] - M.min[1], M.max[2]], bounds: { min: M.min, max: M.max } };
  return { layers: planned, cfg, stats, warnings, vase, gaps: opts.vase };
}

function ringLen(r) { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += Math.hypot(a.X - b.X, a.Y - b.Y); } return s / SC; }
function bridgeAngle(region) { const bb = bbox(region); return (bb.x1 - bb.x0) > (bb.y1 - bb.y0) ? 90 : 0; }
// order polylines greedily by nearest end point, flipping so each starts near the head
function orderLines(lines, from) {
  const rest = lines.slice(), out = []; let cur = from;
  while (rest.length) {
    let bi = 0, bd = Infinity, flip = false;
    for (let i = 0; i < rest.length; i++) {
      const l = rest[i], a = l[0], b = l[l.length - 1];
      const da = (a.x - cur.x) ** 2 + (a.y - cur.y) ** 2, db = (b.x - cur.x) ** 2 + (b.y - cur.y) ** 2;
      if (da < bd) { bd = da; bi = i; flip = false; }
      if (db < bd) { bd = db; bi = i; flip = true; }
    }
    let l = rest.splice(bi, 1)[0]; if (flip) l = l.slice().reverse();
    out.push(l); cur = l[l.length - 1];
  }
  return out;
}

/* ── G-code ───────────────────────────────────────────────────────── */
const f3 = x => (+x.toFixed(3)).toString();
const f5 = x => (+x.toFixed(5)).toString();
function gcode(result, cfgIn = result.cfg) {
  const cfg = Object.assign({}, cfgIn), lim = printerById(cfg.printer);
  for (const k of ['nozzleTemp', 'firstNozzleTemp']) cfg[k] = Math.min(cfg[k], lim.maxHotend);
  for (const k of ['bedTemp', 'firstBedTemp']) cfg[k] = Math.min(cfg[k], lim.maxBed);
  const pr = printerById(cfg.printer), out = [];
  const fil = Math.PI * (cfg.filamentDia / 2) ** 2, flowK = cfg.flow / 100;
  const eFor = (len, w, h) => (len * w * h * flowK) / fil;          // mm of filament
  const st = result.stats;
  const cap = v => Math.min(v, pr.maxSpeed);
  let prevDir = null, x = 0, y = 0, z = 0, e = 0, totalE = 0, time = 0, retracted = false, lastF = -1, zHopped = false;
  const emit = s => out.push(s);
  const move = (nx, ny, nz, ne, fmm) => {
    const d = Math.hypot(nx - x, ny - y, nz - z), de = Math.abs(ne || 0);
    let line = 'G1';
    if (nx !== x) line += ' X' + f3(nx);
    if (ny !== y) line += ' Y' + f3(ny);
    if (nz !== z) line += ' Z' + f3(nz);
    if (ne !== undefined && ne !== null) line += ' E' + f5(cfg.relativeE ? ne : (e += ne));
    const F = Math.round(fmm * 60); if (F !== lastF) { line += ' F' + F; lastF = F; }
    emit(line);
    if (ne !== undefined && ne !== null && cfg.relativeE) e += ne;
    if (ne > 0) totalE += ne;
    const dist = d > 1e-9 ? d : de, printing = ne !== undefined && ne !== null && ne > 0;
    const dirx = nx - x, diry = ny - y, dl = Math.hypot(dirx, diry);
    const smooth = printing && prevDir && dl > 1e-9 && (dirx * prevDir.x + diry * prevDir.y) / dl > 0.8;   // nearly straight on: no stop
    time += smooth ? dist / Math.max(1, fmm) : segTime(dist, fmm, printing ? cfg.accel || pr.maxAccel : cfg.travelAccel || cfg.accel || pr.maxAccel);
    prevDir = printing && dl > 1e-9 ? { x: dirx / dl, y: diry / dl } : null;
    x = nx; y = ny; z = nz;
  };
  const segTime = (d, v, a) => {                                    // trapezoid with start/end rest
    if (d <= 0 || v <= 0) return 0;
    const ramp = v * v / a;                                         // total distance spent accelerating + decelerating
    return d >= ramp ? d / v + v / a : 2 * Math.sqrt(d / a);
  };
  const retract = () => {
    if (!cfg.retraction || retracted || cfg.retractDist <= 0) return;
    emit(`G1 E${f5(cfg.relativeE ? -cfg.retractDist : (e -= cfg.retractDist))} F${Math.round(cfg.retractSpeed * 60)}`);
    if (cfg.relativeE) e -= cfg.retractDist;
    lastF = -1; retracted = true; time += cfg.retractDist / cfg.retractSpeed;
  };
  const unretract = () => {
    if (!retracted) return;
    const amt = cfg.retractDist + cfg.retractExtra / fil;
    emit(`G1 E${f5(cfg.relativeE ? amt : (e += amt))} F${Math.round(cfg.retractSpeed * 60)}`);
    if (cfg.relativeE) e += amt;
    lastF = -1; retracted = false; time += amt / cfg.retractSpeed;
  };
  const speedOf = (t, first) => pathSpeed(cfg, t, first);

  const bb = st.bounds;
  const hdrIndex = out.length;
  // placeholder header, filled in at the end
  const fmt = s => s.replace(/\{(\w+)\}/g, (m, k) => ({
    bed: cfg.bedTemp, nozzle: cfg.nozzleTemp, bed0: cfg.firstBedTemp, nozzle0: cfg.firstNozzleTemp, nozzle_warm: Math.max(150, cfg.firstNozzleTemp - 40),
    maxx: f3(cfg.bed[0]), maxy: f3(cfg.bed[1]), maxz: f3(cfg.bed[2]), purge_end: f3(Math.min(200, cfg.bed[1] - 20)),
    level: cfg.level ? cfg.level + ' ; auto bed level\n' : '',
  })[k] ?? m);
  emit('');                                                          // header slot, filled in at the end
  emit('; printer: ' + pr.name + ' · ' + cfg.bed.join('×') + ' mm · nozzle ' + cfg.nozzle);
  for (const l of fmt(cfg.startGcode).split('\n')) emit(l);
  if (cfg.relativeE) emit('M83 ; relative extrusion'); else emit('M82 ; absolute extrusion');
  emit('G92 E0');
  if (cfg.accel) emit(`M204 P${Math.round(cfg.accel)} T${Math.round(cfg.travelAccel || cfg.accel)} ; print/travel acceleration`);
  if (cfg.jerk) emit(`M205 X${cfg.jerk} Y${cfg.jerk} ; jerk`);
  if (cfg.linearAdvance > 0) emit(`M900 K${cfg.linearAdvance} ; linear advance`);
  emit('M107');
  lastF = -1; x = cfg.partX == null ? 0 : 0; y = 20; z = 2; e = 0;

  // custom per-layer G-code
  const lg = {};
  for (const l of String(cfg.layerGcode || '').split('\n')) { const m = l.match(/^\s*(\d+)\s*:\s*(.+)$/); if (m) (lg[+m[1]] = lg[+m[1]] || []).push(m[2].trim()); }

  const layerTimes = [];
  let curTemp = cfg.firstNozzleTemp, curBed = cfg.firstBedTemp, curFan = -1;
  const nl = result.layers.length;
  const insideSection = (sec, px, py) => { let n = 0; const pt = { X: Math.round(px * SC), Y: Math.round(py * SC) }; for (const r of sec) if (CL.Clipper.PointInPolygon(pt, r) !== 0) n++; return n % 2 === 1; };
  const staysInside = (sec, x0, y0, x1, y1) => {
    if (!sec || !sec.length) return false;
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(d / 1.5));
    for (let k = 0; k <= n; k++) if (!insideSection(sec, x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n)) return false;
    return true;
  };
  let curSection = null;
  const travelTo = (nx, ny, nz, first, bridgeZ) => {
    const d = Math.hypot(nx - x, ny - y);
    const longEnough = d >= cfg.retractMinTravel && !(cfg.combing && d < 40 && staysInside(curSection, x, y, nx, ny));
    if (longEnough) retract();
    const lift = (cfg.retraction && longEnough && cfg.zHop > 0 && !first);
    if (lift) { move(x, y, nz + cfg.zHop, null, cap(cfg.travelSpeed * 0.5)); zHopped = true; }
    move(nx, ny, lift ? nz + cfg.zHop : nz, null, cap(cfg.travelSpeed));
    if (zHopped) { move(nx, ny, nz, null, cap(cfg.travelSpeed * 0.5)); zHopped = false; }
  };

  for (let li = 0; li < nl; li++) {
    const L = result.layers[li], first = li === 0, layerStartLine = out.length, layerStartTime = time;
    emit(`;LAYER:${li}`); emit(`;Z:${f3(L.z)}`); emit(`;HEIGHT:${f3(L.h)}`);
    if (lg[li]) for (const g of lg[li]) emit(g);
    const nz = L.z; curSection = L.section || null;
    // temps / bed after first layer
    if (li === 1 || (li === 0 && false)) {
      if (cfg.nozzleTemp !== curTemp) { emit(`M104 S${cfg.nozzleTemp} ; layer 2 nozzle temperature`); curTemp = cfg.nozzleTemp; }
      if (cfg.bedTemp !== curBed) { emit(`M140 S${cfg.bedTemp}`); curBed = cfg.bedTemp; }
    }
    // fan ramp
    const fanFor = () => {
      if (li < cfg.fanStartLayer) return 0;
      const full = Math.max(cfg.fanStartLayer + 1, cfg.fanFullLayer);
      const t = Math.min(1, (li - cfg.fanStartLayer + 1) / (full - cfg.fanStartLayer + 1));
      return cfg.fanSpeed * t;
    };
    // layer time scale (min layer time): pre-compute length/time at nominal speeds
    let nominal = 0;
    for (const p of L.paths) { const v = Math.min(speedOf(p.type, first && !L.raft), volCap(p)); nominal += pathLen(p) / v; }
    function volCap(p) { return Math.max(cfg.minSpeed, cfg.maxFlowRate / Math.max(0.01, p.w * p.h)); }
    let scale = 1;
    if (cfg.minLayerTime > 0 && nominal > 0 && nominal < cfg.minLayerTime && !first) scale = Math.max(cfg.minSpeed / Math.max(cfg.printSpeed, 1), nominal / cfg.minLayerTime);
    const slow = scale < 1;
    let fan = fanFor(); if (slow) fan = Math.max(fan, cfg.fanSpeed);
    const setFan = f => { f = Math.round(Math.max(0, Math.min(100, f)) / 100 * 255); if (f !== curFan) { emit(f === 0 ? 'M107' : `M106 S${f}`); curFan = f; } };
    setFan(fan);
    let lastType = null;
    for (const p of L.paths) {
      const pts = p.pts; if (pts.length < 2) continue;
      const a = pts[0], spiral = !!p.spiral;
      travelTo(a.x, a.y, spiral ? nz - L.h : nz, first, false);
      unretract();
      if (p.type !== lastType) { emit(`;TYPE:${typeLabel(p.type)}`); lastType = p.type; }
      const bridge = p.type === 'bridge';
      if (bridge) setFan(cfg.bridgeFan); else setFan(fan);
      const baseV = Math.min(speedOf(p.type, first && !L.raft), volCap(p)), v = cap(Math.max(cfg.minSpeed * 0.5, baseV * (p.type === 'outer' || p.type === 'inner' ? scale : scale)));
      const seq = p.closed ? pts.concat([pts[0]]) : pts, plen = spiral ? pathLen(p) : 0;
      let run = 0;
      for (let k = 1; k < seq.length; k++) {
        const b = seq[k], d = Math.hypot(b.x - x, b.y - y);
        if (d < 1e-4) continue;
        run += d;
        move(b.x, b.y, spiral ? nz - L.h + L.h * Math.min(1, run / plen) : nz, eFor(d, p.w, p.h) * (bridge ? 0.95 : 1), v);
      }
      // wipe along the path while retracting
      if (cfg.retraction && cfg.wipeDist > 0 && p.closed && seq.length > 2) {
        let rem = cfg.wipeDist, i0 = 1; retracted = false;
        const per = cfg.retractDist, sgm = [];
        while (rem > 0 && i0 < seq.length) { const b = seq[i0], d = Math.hypot(b.x - x, b.y - y); if (d < 1e-6) { i0++; continue; } const use = Math.min(d, rem); const t = use / d; sgm.push([x + (b.x - x) * t, y + (b.y - y) * t, use]); rem -= use; i0++; if (use < d) break; }
        const tot = sgm.reduce((s, q) => s + q[2], 0) || 1;
        for (const q of sgm) { const de = -per * q[2] / tot; emit(`G1 X${f3(q[0])} Y${f3(q[1])} E${f5(cfg.relativeE ? de : (e += de))} F${Math.round(cfg.travelSpeed * 60 * 0.5)}`); if (cfg.relativeE) e += de; time += q[2] / (cfg.travelSpeed * 0.5); x = q[0]; y = q[1]; }
        lastF = -1; retracted = true;
      }
    }
    layerTimes.push(time - layerStartTime);
  }

  // end
  retract();
  const endText = fmt(cfg.endGcode);
  for (const l of endText.split('\n')) emit(l);
  const mm = totalE, vol = totalE * fil;                              // filament mm, mm³
  const grams = vol / 1000 * cfg.density;
  const hdr = [
    ';FLAVOR:Marlin',
    ';TIME:' + Math.round(time),
    ';Filament used: ' + f3(mm / 1000) + 'm',
    ';Layer height: ' + f3(cfg.layerHeight),
    ';MINX:' + f3(bb.min[0]), ';MINY:' + f3(bb.min[1]), ';MINZ:' + f3(bb.min[2]),
    ';MAXX:' + f3(bb.max[0]), ';MAXY:' + f3(bb.max[1]), ';MAXZ:' + f3(bb.max[2] + (result.layers[0] && result.layers[0].raft ? 0 : 0)),
    `;Estimated weight: ${grams.toFixed(1)} g`,
    ';Generated by Datum (Creality · Marlin)',
    ';Printer: ' + pr.name,
    ';Material: ' + materialById(cfg.material).name,
    ';Settings: layer ' + cfg.layerHeight + ' · walls ' + cfg.wallCount + ' · infill ' + cfg.infillDensity + '% ' + cfg.infillPattern + (cfg.support ? ' · support' : '') + ' · ' + cfg.adhesion,
  ].join('\n');
  out[hdrIndex] = hdr;
  return { text: out.join('\n') + '\n', time, filament: mm / 1000, mass: grams, volume: vol, cost: grams / 1000 * (cfg.filamentCost || 0), layerTimes, lines: out.length };
}
function pathLen(p) {
  let s = 0; for (let i = 1; i < p.pts.length; i++) s += Math.hypot(p.pts[i].x - p.pts[i - 1].x, p.pts[i].y - p.pts[i - 1].y);
  if (p.closed && p.pts.length > 2) s += Math.hypot(p.pts[0].x - p.pts[p.pts.length - 1].x, p.pts[0].y - p.pts[p.pts.length - 1].y);
  return s;
}
function pathSpeed(cfg, t, first) {
  if (first && t !== 'raft') return cfg.firstLayerSpeed;
  switch (t) {
    case 'outer': return cfg.outerWallSpeed; case 'inner': return cfg.innerWallSpeed; case 'infill': return cfg.infillSpeed;
    case 'skin': return cfg.topSpeed; case 'bridge': return cfg.bridgeSpeed; case 'support': case 'roof': return cfg.supportSpeed;
    case 'skirt': case 'brim': case 'raft': return cfg.firstLayerSpeed; case 'iron': return 20; default: return cfg.printSpeed;
  }
}
const TYPE_LABEL = { outer: 'WALL-OUTER', inner: 'WALL-INNER', infill: 'FILL', skin: 'SKIN', bridge: 'SKIN', support: 'SUPPORT', roof: 'SUPPORT-INTERFACE', skirt: 'SKIRT', brim: 'SKIRT', raft: 'SKIRT', iron: 'SKIN' };
const typeLabel = t => TYPE_LABEL[t] || 'CUSTOM';

const api = { _t: { gyroidLines, clipLines, infillFor, offset, toC }, PRINTERS, MATERIALS, SETTINGS, SETTING_BY_KEY, printerById, materialById, pathSpeed, defaults, applyMaterial, applyPrinter, slice, gcode, pathLen, transformMesh };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Slicer = api;
})(typeof window !== 'undefined' ? window : globalThis);
