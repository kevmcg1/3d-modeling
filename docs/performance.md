# Performance notes and budget

Measured in headless Chromium (SwiftShader, 1500x900) with `test/perf.idle.test.js`: a page is loaded, left alone for 2 s,
then `requestAnimationFrame` callbacks per second and main-thread CPU are read from the DevTools Performance domain.

Run: `NODE_PATH=<dir with playwright-core, three, clipper-lib> node test/perf.idle.test.js`
(`PAGES=house.html` limits it; `IDLE_RAF_BUDGET` sets the allowed callbacks per second, default 4.)

## Budget

An idle page (no input, no animation running) must stay at or under 4 rAF callbacks/s. The test fails above that.

## Before / after

| Change | Metric | Before | After |
| --- | --- | --- | --- |
| House Design: frame loop sleeps until a dirty flag, view tween or input wakes it | idle rAF callbacks/s | 60.5 | 0.0 |
| House Design: same | idle main-thread CPU | 2.5 % | 0.1 % |
| Tip card animation capped at 30 fps (slow orbit and morph, no visible change) | card animation frames/s | 60 | 30 |

Already on demand before this work (idle 0 rAF/s): Design/Manufacture (`index.html`), Graphics, 2D Drawing, Setup Sheet.
The Design viewport already lowers its pixel ratio when frames run long and raises it again when there is room.
