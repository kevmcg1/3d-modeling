# Setup Sheet

A standalone setup sheet generator for CNC jobs, copied out of the 3D modeling app. Open `index.html` (or `npm start`). No build step.

- **Setup Sheet**: job, offset and tool tables, with a drawing area. Exports PDF, print, project JSON.
- **Orientation**: vise, lathe chuck, and the new **Table · Fixtures** drawing.

## Table · Fixtures

Pick *Orientation → Table · Fixtures*. Set the plate and stock, then add fixtures from the library. You get top, front and isometric views plus a numbered parts list, and you can send the drawing to the sheet, or export SVG / PNG.

Library: machine vise, parallels, V-blocks (single or pair), **toe clamp (stainless wire-EDM pressure plate: 70/80/90 mm, 8/12 mm thick, M8/M10)**, step block, 1-2-3 block, angle plate, edge stop, block / round bar.

- Clamps, stops and V-blocks snap to a side of the stock (*Place at stock*); vises and parallels have *Fit to Stock*.
- Drag any fixture or the stock in the top view. Warnings show for items off the plate or overlapping.
- Sizes accept `3.5`, `1/2`, `1 3/8`, `12mm`.

### Add your own fixture

In the UI, open *Add Your Own Fixture* and paste JSON (press *Insert Example* for a template):

```json
{ "id": "riser", "name": "Riser block",
  "params": [{ "key": "L", "label": "Length", "def": 3, "min": 0.5, "max": 24 },
             { "key": "H", "label": "Height", "def": 1.5 }],
  "parts": [{ "shape": "box", "role": "block", "x": ["-$L/2", "$L/2"], "y": [-1, 1], "z": [0, "$H"] },
            { "shape": "cylinder", "axis": "z", "cx": 0, "cy": 0, "r": 0.125, "len": ["$H", "$H+0.25"] }] }
```

Shapes: `box`, `cylinder`, `prism` (convex profile extruded along an axis). Numbers can be formulas of parameters (`$L/2`). Roles pick the colour: plate, stock, steel, stainless, dark, jaw, vise, parallel, vblock, step, block.

For built-in fixtures, call `Fixtures.register({ id, name, category, params, footprint, build(p, ctx) })` in `fixtures.js`. Local frame: origin at the footprint centre on the table, +Y toward the work, +Z up, inches.

## Tests

```
npm install
npm test          # unit tests (no browser) + browser tests (Chromium via playwright-core)
```

The browser test clicks every control, fuzzes every input, drags, undoes, exports, reloads, and loads hostile saved data.
