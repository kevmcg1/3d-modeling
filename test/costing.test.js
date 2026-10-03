// node test/costing.test.js
const assert = require('assert');
const C = require('../costing.js');
const near = (a, b, e = 1e-6) => assert(Math.abs(a - b) < e, `${a} != ${b}`);
// 2 h on a $25/h shop, $2 material, 0.15 kWh·$ at 150 W, no labor, no overhead, no failures, 30% margin
let q = C.quote({ materialCost: 2, machineHours: 2, setupMin: 0, handMin: 0, qty: 1 }, { shopRate: 25, powerW: 150, kwh: 0.15, overheadPct: 0, failurePct: 0, marginPct: 30 });
near(q.total, 2 + 50 + 0.045); near(q.price, q.total / 0.7); near(q.profit / q.price, 0.3);
// setup is shared across the batch, hands-on time is per part
q = C.quote({ materialCost: 0, machineHours: 0, setupMin: 60, handMin: 6, qty: 10 }, { laborRate: 30, overheadPct: 0, failurePct: 0, marginPct: 0 });
near(q.total, (60 / 10 + 6) / 60 * 30); near(q.batchTotal, q.total * 10);
// overhead and failures compound on the direct cost
q = C.quote({ materialCost: 10, machineHours: 0, setupMin: 0, handMin: 0 }, { overheadPct: 10, failurePct: 5, marginPct: 0 });
near(q.total, 10 * 1.1 * 1.05);
// a margin of 100% is capped, never infinite
assert(isFinite(C.quote({ materialCost: 1, machineHours: 1 }, { marginPct: 100 }).price));
console.log('costing tests passed');
