// Early-access release configuration.
// Everything hidden here is hidden, not removed: add a name back to a list (or open the app
// with ?dev=1, or run localStorage.setItem('datum.dev', '1') once) and it returns.
window.DATUM_RELEASE = {
  // workspace tabs shown in the top bar (data-ws values). 'sheet' (Setup Sheet) is still opened
  // from inside Manufacture when 'cam' is shown; only its tab is hidden.
  tabs: ['design'],
  // Sketching and 3D modeling only, for now. Physics, hardware, fixtures, drawings, stress and the rest are hidden, not removed: set this to false (or open the
  // app with ?dev=1) and they come back, with the Manufacture tab if 'cam' is added to tabs above.
  modelingOnly: true,
  // what modelingOnly hides in the Design ribbon: groups (by name), buttons (data-act) and the same tools inside the ribbon menus
  hideGroups: ['Hardware', 'Fixture'],
  hideActions: ['stress', 'blueprint', 'f:joint', 'f:mate', 'f:fixture', 'hw:fast', 'hw:shop', 'hw:drive', 'hw:phys'],
  // top-bar buttons hidden by modelingOnly (element ids)
  hideButtons: ['btnGuided'],
  // 3D export formats offered by Export and the right-click body menu (keys of EXPORT_FORMATS)
  exportFormats: ['step', 'stl', 'obj'],
  // drawing sheet exports (data-bpx values) shown on the drawing view
  drawingExports: ['print'],
  earlyAccessNotice: 'This software is in early access. You will experience many bugs or glitches, but it will receive consistent improvements over the coming days.',
  // dev mode: ?dev=1 in the address, or localStorage 'datum.dev' = '1'
  dev: (() => { try { return /[?&]dev=1\b/.test(location.search) || localStorage.getItem('datum.dev') === '1'; } catch (e) { return false; } })(),
};
