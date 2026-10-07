// Manufacture: rest machining from the in-process stock.
//
// The program is replayed against the stock as it is actually being cut (camOptimizeAll in index.html: a slab model, one slice per
// level the program cuts to). With "Only cut what earlier operations left" on, an operation leaves out every move that would run
// through ground an earlier operation (or this one) already cleared, and links what remains with hops that clear the material.
// It works for every toolpath, 2D or 3D, with no change to the toolpath itself, and the simulation, G-code, Verify and the heat
// map all see the shorter path.
(function () {
  'use strict';
  const eligible = op => op && op.type !== 'wire' && !isDrillOp(op) && !opAxis(op) && !op.safeLinks;

  const camPanel0 = camPanel;
  camPanel = function () {
    let h = camPanel0();
    if (CAMUI.view === 'op') {
      const op = opById(CAMUI.op);
      if (eligible(op) && h.includes('<div class="field"><span>Tool</span><select id="opTool">'))
        h = h.replace('<div class="field"><span>Tool</span><select id="opTool">', `<label class="chk" data-tipkey="mc:reststock"><input type="checkbox" id="opRestStock" ${op.restStock ? 'checked' : ''}> Only cut what earlier operations left</label>${op.restStock ? '<p class="note">Moves through ground that is already cleared are left out. Put this operation after the roughing it follows.</p>' : ''}<div class="field"><span>Tool</span><select id="opTool">`);
    }
    return h;
  };
  const bindCamPanel0 = bindCamPanel;
  bindCamPanel = function () {
    bindCamPanel0();
    const el = document.getElementById('opRestStock');
    if (el) el.addEventListener('change', () => { const op = opById(CAMUI.op); if (op) camEdit(op, 'restStock', el.checked); });
  };

  if (typeof TipArt === 'object' && typeof TIP_ART === 'object' && typeof TIP_TXT === 'object') {
    const { C, P, poly, line, box } = TipArt, iso = f => () => { TipArt.at(60, 48, 1.55); return f(); };
    const blk = () => box(-16, -12, 0, 32, 24, 12);
    const cleared = poly([P(-10, -7, 12), P(10, -7, 12), P(10, 7, 12), P(-10, 7, 12)], '#7d8896');
    const rect = (hx, hy, col, w) => line([P(-hx, -hy, 12.3), P(hx, -hy, 12.3), P(hx, hy, 12.3), P(-hx, hy, 12.3), P(-hx, -hy, 12.3)], col, w);
    const corners = col => [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([a, b]) => line([P(a * 9.2, b * 4.4, 12.3), P(a * 9.2, b * 6.2, 12.3), P(a * 7.4, b * 6.2, 12.3)], col, 2.2)).join('');
    TIP_ART['mc:reststock'] = [iso(() => blk() + cleared + rect(8.4, 5.4, '#9aa6b4', 1.1) + rect(6.2, 3.4, '#9aa6b4', 1.1) + rect(4, 1.4, '#9aa6b4', 1.1)), iso(() => blk() + cleared + corners(C.warn))];
    TIP_TXT['mc:reststock'] = ['The tool cuts only the material that is still there, and skips what an earlier operation already cleared.', ['Run the roughing first.', 'Tick this on the operation that follows it.', 'Check the simulation: the long passes through cleared ground are gone.']];
  }
})();
