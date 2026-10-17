// Early-access release configuration.
// Everything hidden here is hidden, not removed: add a name back to a list (or open the app
// with ?dev=1, or run localStorage.setItem('datum.dev', '1') once) and it returns.
window.DATUM_RELEASE = {
  // workspace tabs shown in the top bar (data-ws values). 'sheet' (Setup Sheet) is still opened
  // from inside Manufacture; only its tab is hidden.
  tabs: ['design', 'cam'],
  // 3D export formats offered by Export and the right-click body menu (keys of EXPORT_FORMATS)
  exportFormats: ['step', 'stl', 'obj'],
  // drawing sheet exports (data-bpx values) shown on the drawing view
  drawingExports: ['print'],
  earlyAccessNotice: 'This software is in early access. You will experience many bugs or glitches, but it will receive consistent improvements over the coming days.',
  // dev mode: ?dev=1 in the address, or localStorage 'datum.dev' = '1'
  dev: (() => { try { return /[?&]dev=1\b/.test(location.search) || localStorage.getItem('datum.dev') === '1'; } catch (e) { return false; } })(),
};
