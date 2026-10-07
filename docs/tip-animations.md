# Hover tip animations

Every tip card that shows a picture plays the tool **being used**: a profile being extruded, a cutter following a chain with the cut stock appearing behind it, a cursor drawing the line, the nozzle laying a layer. Nothing morphs or crossfades from one drawing to another. Each picture is drawn from scratch every frame from a single progress number.

One shared player (`tip-anim.js`) draws on one canvas, starts when a card opens, stops when it closes (about 33 fps, nothing runs while idle). Scenes live in `tip-scenes-*.js`.

| File | Scenes | Pages that load it |
|---|---|---|
| `tip-anim.js` | the player and the drawing toolkit (`g`) | all |
| `tip-scenes-sketch.js` | 2D drawing and sketch tools | Design, 2D Drawing |
| `tip-scenes-model.js` | Fusion-style 3D modeling | Design |
| `tip-scenes-cam.js` | Mastercam-style toolpaths, drilling, 3D finishing, setup, simulate, post | Manufacture |
| `tip-scenes-print.js` | slicer settings and printer actions | 3D Print |
| `tip-scenes-house.js` | House Design (`h:` keys) | House |
| `tip-scenes-gfx.js` | Graphics tools (`g:tool:`), layers, filters (`g:fx:`) | Graphics |
| `tip-scenes-ui.js` | main window controls | Design |
| `tip-anim-legacy.js` | the old before / after morph, kept only as a fallback, **not allowed for tools** (the test fails on it) | all |

## Adding a scene for a new tool

1. Find the key the tip card uses. In the main app it is the `data-tipkey` / `data-act` of the button (the same key as `TIP_TXT`); 2D Drawing uses the command name; House uses `'h:' + key`; Graphics uses `g:tool:<id>`.
2. Register a scene. `g.t` runs 0 to 1 over the loop (4.4 s). Draw the *action*, not two states.

```js
TipAnim.scene('f:newtool', g => {
  g.view(120, 138, 3);                         // isometric: centre x, centre y, pixels per unit
  const p = g.seg(0.2, 0.65);                  // 0 → 1 (eased) between 20 % and 65 % of the loop
  g.plane(0, 18, 'a');                         // ground plane
  g.prism(PROFILE, 0, 14 * p, 'a');            // the solid grows as the tool works
  g.arrow([0, 0, 14 * p], [0, 0, 14 * p + 10]);
  g.cursorAt([0, 0, 14 * p + 10], 0);          // the mouse doing it
});
```

3. Add its row to the audit (`node test/tip-anim.audit.js --write-doc`), and run `node test/tip-anim.e2e.js`. The test fails if a tip card that shows a picture has no scene.

### Toolkit (`g`)

- Time: `g.t`, `g.time` (seconds), `g.seg(a, b)` eased 0→1, `g.lin(a, b)` linear, `g.mem` (state, wiped each loop).
- Views: `g.view(ox, oy, s)` isometric, `g.view2d()` flat board (y up), `g.in2d(0, 0, 1, fn)` screen pixels (y down) for panels and sheets.
- Solids: `box`, `prism(outline, z, h, colour, {holes})`, `cyl`, `cone`, `sphere`, `rev(profile, …)`, `loft`, `tube(path, r)`, `axisPrism`. Colours: `'n'` neutral, `'a'` accent, `'s'` stock, `'c'` orange, `'g'` green, `'r'` red, `'k'` dark, `'m'` metal.
- Moving things: `g.turn(axis, deg, centre, draw)`, `g.move(dx, dy, dz, draw)`, `g.scale3(...)`.
- Drawing: `line`, `fill`, `dot`, `arrow`, `ring`, `text`, `chip` (caption), `cursorAt`, `click`.
- Machining: `g.stock('id', {…})` is a height map; `g.mill(stock, path, f, radius, profile)` moves a cutter along `path` up to fraction `f` and removes material on the way; `stock.draw()`; `g.tool('end'|'ball'|'drill'|'spot'|'cham'|'face'|'thread'|'tap'|'engrave'|'dove'|'wire'|'nozzle', x, y, z, {r})`.

### Rules

- Show the tool acting. A scene that interpolates one drawing into another is rejected in review and by the test (no `TipAnim.pics`, no `<svg>` or `<img>` inside the picture, frames must change over time).
- Keep it light: no timers, no allocation per frame beyond the scene's own geometry. The player handles start, stop and reduced motion (a still of the finished action).
