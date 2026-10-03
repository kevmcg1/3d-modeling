/* ══════════════════════════════════════════════════════════════════════
   Costing — production cost and price for a job (3D printing or machining)
   ----------------------------------------------------------------------
   Pure arithmetic, no DOM. Costing.quote(job, rates) → { lines, total, price, profit… }

     job   = { materialCost, machineHours, setupMin, handMin, qty }
             materialCost  $ of material in ONE part
             machineHours  machine run time of ONE part
             setupMin      one-off setup for the whole batch (spread over qty)
             handMin       hands-on minutes per part (cleanup, support removal, deburring)
     rates = { shopRate, laborRate, powerW, kwh, overheadPct, failurePct, marginPct }

   shopRate is what an hour of the shop costs you (rent, utilities, insurance,
   machine wear), charged for every machine hour. laborRate is the hourly cost
   of the person for setup and hands-on minutes. The price is the one that
   leaves marginPct of the sale price as profit.
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';
const DEFAULTS = { shopRate: 25, laborRate: 30, setupMin: 10, handMin: 10, qty: 1, powerW: 150, kwh: 0.15, overheadPct: 10, failurePct: 5, marginPct: 30 };
const n = (x, d = 0) => (isFinite(+x) && x !== '' && x != null ? +x : d);

function quote(job, rates) {
  const r = Object.assign({}, DEFAULTS, rates || {});
  const qty = Math.max(1, Math.round(n(job.qty, n(r.qty, 1)))), hrs = Math.max(0, n(job.machineHours));
  const setup = n(job.setupMin, r.setupMin), hand = n(job.handMin, r.handMin);
  const material = Math.max(0, n(job.materialCost));
  const machine = hrs * n(r.shopRate);
  const energy = hrs * n(r.powerW) / 1000 * n(r.kwh);
  const laborHours = (setup / qty + hand) / 60;
  const labor = laborHours * n(r.laborRate);
  const direct = material + machine + energy + labor;
  const overhead = direct * n(r.overheadPct) / 100;
  const failure = (direct + overhead) * n(r.failurePct) / 100;
  const total = direct + overhead + failure;
  const m = Math.min(0.95, Math.max(0, n(r.marginPct) / 100));
  const price = total / (1 - m), profit = price - total;
  const lines = [
    ['Material', material], ['Machine time', machine], ['Electricity', energy], ['Labor', labor],
    ['Overhead', overhead], ['Failed-part allowance', failure],
  ];
  return {
    qty, lines, direct, total, price, profit, margin: m, markup: total > 0 ? price / total - 1 : 0,
    batchTotal: total * qty, batchPrice: price * qty, batchProfit: profit * qty,
    machineHours: hrs, laborHours, profitPerMachineHour: hrs > 0 ? profit / hrs : 0,
    // the lowest price that does not lose money
    breakEven: total,
  };
}
const api = { DEFAULTS, quote };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Costing = api;
})(typeof window !== 'undefined' ? window : globalThis);
