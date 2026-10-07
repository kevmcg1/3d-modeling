# Hover tip animation audit

Every tip card that shows a picture, opened with the real mouse in a real browser (`node test/tip-anim.audit.js --write-doc`). **Scene** is the action scene that plays; **Verified** lists what was measured: frames sampled while hovering (the picture changed between them), and nine offline frames across the loop (how many steps changed, and that the middle frame is not a blend of the ends, i.e. no crossfade or morph).

| Tab | Tool | Key | Scene | Verified |
|---|---|---|---|---|
| 2D Drawing | File | `menu` | action | yes · hover 4% changed · 7/8 steps · blend 0% |
| 2D Drawing | Undo | `undo` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| 2D Drawing | Redo | `redo` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| 2D Drawing | Help | `help` | action | yes · hover 4% changed · 7/8 steps · blend 0% |
| 2D Drawing | Line | `line` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| 2D Drawing | Polyline | `pline` | action | yes · hover 1% changed · 8/8 steps · blend 0% |
| 2D Drawing | Circle | `circle` | action | yes · hover 1% changed · 6/8 steps · blend 0% |
| 2D Drawing | Arc | `arc` | action | yes · hover 0% changed · 8/8 steps · blend 0% |
| 2D Drawing | Rectangle | `rectangle` | action | yes · hover 2% changed · 6/8 steps · blend 0% |
| 2D Drawing | Polygon | `polygon` | action | yes · hover 3% changed · 6/8 steps · blend 3% |
| 2D Drawing | Ellipse | `ellipse` | action | yes · hover 0% changed · 8/8 steps · blend 0% |
| 2D Drawing | Spline | `spline` | action | yes · hover 1% changed · 8/8 steps · blend 0% |
| 2D Drawing | Construction line | `xline` | action | yes · hover 1% changed · 6/8 steps · blend 0% |
| 2D Drawing | Point | `point` | action | yes · hover 1% changed · 5/8 steps · blend 0% |
| 2D Drawing | Hatch | `hatch` | action | yes · hover 0% changed · 6/8 steps · blend 0% |
| 2D Drawing | Donut | `donut` | action | yes · hover 11% changed · 7/8 steps · blend 3% |
| 2D Drawing | Move | `move` | action | yes · hover 9% changed · 6/8 steps · blend 10% |
| 2D Drawing | Copy | `copy` | action | yes · hover 4% changed · 6/8 steps · blend 0% |
| 2D Drawing | Rotate | `rotate` | action | yes · hover 1% changed · 5/8 steps · blend 0% |
| 2D Drawing | Mirror | `mirror` | action | yes · hover 1% changed · 6/8 steps · blend 0% |
| 2D Drawing | Scale | `scale` | action | yes · hover 1% changed · 5/8 steps · blend 0% |
| 2D Drawing | Stretch | `stretch` | action | yes · hover 2% changed · 8/8 steps · blend 0% |
| 2D Drawing | Trim | `trim` | action | yes · hover 1% changed · 6/8 steps · blend 0% |
| 2D Drawing | Extend | `extend` | action | yes · hover 0% changed · 7/8 steps · blend 0% |
| 2D Drawing | Offset | `offset` | action | yes · hover 1% changed · 6/8 steps · blend 0% |
| 2D Drawing | Fillet | `fillet` | action | yes · hover 0% changed · 7/8 steps · blend 0% |
| 2D Drawing | Chamfer | `chamfer` | action | offline only · 7/8 steps · blend 0% (the live hover run measured it just under the limit before the pointer was added to the scene; not re-hovered yet) |
| 2D Drawing | Array | `array` | action | yes · hover 3% changed · 7/8 steps · blend 0% |
| 2D Drawing | Break | `break` | action | yes · hover 1% changed · 6/8 steps · blend 0% |
| 2D Drawing | Join | `join` | action | yes · hover 3% changed · 4/8 steps · blend 0% |
| 2D Drawing | Explode | `explode` | action | yes · hover 0% changed · 6/8 steps · blend 0% |
| 2D Drawing | Lengthen | `lengthen` | action | yes · hover 1% changed · 8/8 steps · blend 0% |
| 2D Drawing | Edit polyline | `pedit` | action | yes · hover 0% changed · 5/8 steps · blend 0% |
| 2D Drawing | Erase | `erase` | action | yes · hover 7% changed · 5/8 steps · blend 0% |
| 2D Drawing | Multiline text | `mtext` | action | yes · hover 1% changed · 8/8 steps · blend 0% |
| 2D Drawing | Text | `text` | action | yes · hover 1% changed · 6/8 steps · blend 0% |
| 2D Drawing | Linear dimension | `dimlinear` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| 2D Drawing | Aligned dimension | `dimaligned` | action | yes · hover 1% changed · 5/8 steps · blend 0% |
| 2D Drawing | Radius dimension | `dimradius` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| 2D Drawing | Diameter dimension | `dimdiameter` | action | yes · hover 0% changed · 5/8 steps · blend 0% |
| 2D Drawing | Angular dimension | `dimangular` | action | yes · hover 0% changed · 4/8 steps · blend 0% |
| 2D Drawing | Leader | `leader` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| 2D Drawing | Layers | `layer` | action | yes · hover 0% changed · 5/8 steps · blend 0% |
| 2D Drawing | Colour | `color` | action | yes · hover 1% changed · 5/8 steps · blend 0% |
| 2D Drawing | Match properties | `matchprop` | action | yes · hover 0% changed · 6/8 steps · blend 1% |
| 2D Drawing | Make current | `layerCur` | action | yes · hover 0% changed · 5/8 steps · blend 0% |
| 2D Drawing | Layer on | `layerOn` | action | yes · hover 0% changed · 5/8 steps · blend 0% |
| 2D Drawing | Freeze layer | `layerFrz` | action | yes · hover 0% changed · 5/8 steps · blend 0% |
| 2D Drawing | Lock layer | `layerLock` | action | yes · hover 0% changed · 5/8 steps · blend 0% |
| 2D Drawing | Zoom in | `zin` | action | yes · hover 1% changed · 8/8 steps · blend 1% |
| 2D Drawing | Zoom out | `zout` | action | yes · hover 3% changed · 5/8 steps · blend 1% |
| 2D Drawing | Zoom extents | `zext` | action | yes · hover 3% changed · 5/8 steps · blend 12% |
| 2D Drawing | Snap to grid | `snap` | action | yes · hover 1% changed · 6/8 steps · blend 0% |
| 2D Drawing | Grid | `gridS` | action | yes · hover 1% changed · 4/8 steps · blend 0% |
| 2D Drawing | Ortho | `ortho` | action | yes · hover 1% changed · 6/8 steps · blend 0% |
| 2D Drawing | Polar tracking | `polar` | action | yes · hover 0% changed · 6/8 steps · blend 0% |
| 2D Drawing | Object snap | `osnap` | action | yes · hover 1% changed · 8/8 steps · blend 0% |
| 2D Drawing | Show lineweights | `lwt` | action | yes · hover 3% changed · 5/8 steps · blend 0% |
| 2D Drawing | Dynamic input | `dyn` | action | yes · hover 1% changed · 6/8 steps · blend 0% |
| 2D Drawing | Drawing units | `dist` | action | yes · hover 1% changed · 6/8 steps · blend 0% |
| 2D Drawing | Zoom level | `zoom` | action | yes · hover 1% changed · 8/8 steps · blend 1% |
| 2D Drawing | Command history | `list` | action | yes · hover 2% changed · 6/8 steps · blend 0% |
| Graphics | Undo | `g:undo` | action | yes · hover 1% changed · 8/8 steps · blend 2% |
| Graphics | Redo | `g:redo` | action | yes · hover 1% changed · 7/8 steps · blend 1% |
| Graphics | Light / dark theme | `g:light / dark theme` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| Graphics | Auto-select shapes | `g:auto-select shapes` | action | yes · hover 0% changed · 4/8 steps · blend 0% |
| Graphics | Move / Select | `g:tool:move` | action | yes · hover 1% changed · 5/8 steps · blend 3% |
| Graphics | Rectangular Marquee | `g:tool:rect` | action | yes · hover 2% changed · 6/8 steps · blend 0% |
| Graphics | Elliptical Marquee | `g:tool:ell` | action | yes · hover 1% changed · 6/8 steps · blend 0% |
| Graphics | Lasso | `g:tool:lasso` | action | yes · hover 1% changed · 8/8 steps · blend 0% |
| Graphics | Polygonal Lasso | `g:tool:plasso` | action | yes · hover 1% changed · 4/8 steps · blend 0% |
| Graphics | Magic Wand | `g:tool:wand` | action | yes · hover 0% changed · 6/8 steps · blend 0% |
| Graphics | Crop | `g:tool:crop` | action | yes · hover 6% changed · 6/8 steps · blend 0% |
| Graphics | Eyedropper | `g:tool:pick` | action | yes · hover 0% changed · 5/8 steps · blend 0% |
| Graphics | Brush | `g:tool:brush` | action | yes · hover 2% changed · 8/8 steps · blend 2% |
| Graphics | Pencil | `g:tool:pencil` | action | yes · hover 1% changed · 8/8 steps · blend 0% |
| Graphics | Eraser | `g:tool:eraser` | action | yes · hover 4% changed · 7/8 steps · blend 7% |
| Graphics | Clone Stamp | `g:tool:clone` | action | yes · hover 0% changed · 6/8 steps · blend 0% |
| Graphics | Smudge | `g:tool:smudge` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| Graphics | Blur | `g:tool:blur` | action | yes · hover 5% changed · 7/8 steps · blend 0% |
| Graphics | Sharpen | `g:tool:sharpen` | action | yes · hover 3% changed · 7/8 steps · blend 0% |
| Graphics | Dodge | `g:tool:dodge` | action | yes · hover 6% changed · 7/8 steps · blend 2% |
| Graphics | Burn | `g:tool:burn` | action | yes · hover 6% changed · 7/8 steps · blend 2% |
| Graphics | Paint Bucket | `g:tool:bucket` | action | yes · hover 0% changed · 5/8 steps · blend 0% |
| Graphics | Gradient | `g:tool:grad` | action | yes · hover 18% changed · 6/8 steps · blend 9% |
| Graphics | Direct Select | `g:tool:direct` | action | yes · hover 1% changed · 5/8 steps · blend 0% |
| Graphics | Pen | `g:tool:pen` | action | yes · hover 1% changed · 3/8 steps · blend 0% |
| Graphics | Freehand Path | `g:tool:free` | action | yes · hover 1% changed · 8/8 steps · blend 0% |
| Graphics | Shape | `g:tool:shape` | action | yes · hover 11% changed · 8/8 steps · blend 0% |
| Graphics | Text | `g:tool:text` | action | yes · hover 1% changed · 8/8 steps · blend 0% |
| Graphics | Hand | `g:tool:hand` | action | yes · hover 9% changed · 6/8 steps · blend 1% |
| Graphics | Zoom | `g:tool:zoom` | action | yes · hover 2% changed · 6/8 steps · blend 1% |
| Graphics | Foreground color | `g:foreground color` | action | yes · hover 1% changed · 6/8 steps · blend 0% |
| Graphics | Background color | `g:background color` | action | yes · hover 1% changed · 6/8 steps · blend 0% |
| Graphics | Swap | `g:swap` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| Graphics | Default colors | `g:default colors` | action | yes · hover 1% changed · 7/8 steps · blend 1% |
| Graphics | Blend mode | `g:blend mode` | action | yes · hover 1% changed · 3/8 steps · blend 0% |
| Graphics | Opacity | `g:opacity` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| Graphics | Show / hide | `g:show / hide` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| Graphics | Lock | `g:lock` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| Graphics | New raster layer | `g:new raster layer` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| Graphics | New vector layer | `g:new vector layer` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| Graphics | New adjustment layer | `g:new adjustment layer` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| Graphics | Add layer mask | `g:add layer mask` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| Graphics | Duplicate layer | `g:duplicate layer` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| Graphics | Merge down | `g:merge down` | action | yes · hover 4% changed · 5/8 steps · blend 1% |
| Graphics | Delete layer | `g:delete layer` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| House Design | New | `h:new` | action | yes · hover 1% changed · 4/8 steps · blend 0% |
| House Design | Open | `h:open` | action | yes · hover 1% changed · 5/8 steps · blend 0% |
| House Design | Save | `h:save` | action | yes · hover 1% changed · 5/8 steps · blend 0% |
| House Design | Export | `h:export` | action | yes · hover 1% changed · 5/8 steps · blend 0% |
| House Design | Sample | `h:sample` | action | yes · hover 1% changed · 5/8 steps · blend 0% |
| House Design | Undo | `h:undo` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| House Design | Redo | `h:redo` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| House Design | Levels panel | `h:left` | action | yes · hover 10% changed · 7/8 steps · blend 1% |
| House Design | Tool panel | `h:right` | action | yes · hover 10% changed · 7/8 steps · blend 0% |
| House Design | Plan only | `h:layout:plan` | action | yes · hover 10% changed · 5/8 steps · blend 0% |
| House Design | Plan + 3D | `h:layout:split` | action | yes · hover 3% changed · 7/8 steps · blend 6% |
| House Design | 3D only | `h:layout:3d` | action | yes · hover 12% changed · 5/8 steps · blend 0% |
| House Design | Light / dark | `h:theme` | action | yes · hover 0% changed · 7/8 steps · blend 0% |
| House Design | Help | `h:help` | action | yes · hover 5% changed · 4/8 steps · blend 0% |
| House Design | Select | `h:select` | action | yes · hover 1% changed · 6/8 steps · blend 1% |
| House Design | Wall | `h:wall` | action | yes · hover 1% changed · 8/8 steps · blend 0% |
| House Design | Room Box | `h:rect` | action | yes · hover 2% changed · 6/8 steps · blend 0% |
| House Design | Door | `h:door` | action | yes · hover 1% changed · 8/8 steps · blend 0% |
| House Design | Window | `h:window` | action | yes · hover 1% changed · 6/8 steps · blend 0% |
| House Design | Room | `h:room` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| House Design | Roof | `h:roof` | action | yes · hover 9% changed · 6/8 steps · blend 1% |
| House Design | Stair | `h:stair` | action | yes · hover 3% changed · 6/8 steps · blend 0% |
| House Design | Dimension | `h:dim` | action | yes · hover 1% changed · 6/8 steps · blend 0% |
| House Design | Text | `h:text` | action | yes · hover 0% changed · 6/8 steps · blend 0% |
| House Design | Split Wall | `h:split` | action | yes · hover 1% changed · 5/8 steps · blend 0% |
| House Design | Trim / Extend | `h:trim` | action | yes · hover 1% changed · 5/8 steps · blend 0% |
| House Design | Add level | `h:addlv` | action | yes · hover 0% changed · 4/8 steps · blend 1% |
| House Design | Copy level up | `h:copylv` | action | yes · hover 4% changed · 5/8 steps · blend 13% |
| House Design | Delete level | `h:dellv` | action | yes · hover 1% changed · 8/8 steps · blend 14% |
| House Design | Switch level | `h:lvl` | action | yes · hover 4% changed · 8/8 steps · blend 1% |
| House Design | Zoom in | `h:zoomin` | action | yes · hover 8% changed · 6/8 steps · blend 0% |
| House Design | Zoom out | `h:zoomout` | action | yes · hover 8% changed · 6/8 steps · blend 0% |
| House Design | Fit | `h:zoomfit` | action | yes · hover 8% changed · 6/8 steps · blend 0% |
| House Design | Isometric view | `h:v:iso` | action | yes · hover 5% changed · 6/8 steps · blend 3% |
| House Design | Top view | `h:v:top` | action | yes · hover 8% changed · 6/8 steps · blend 10% |
| House Design | Front view | `h:v:front` | action | yes · hover 4% changed · 6/8 steps · blend 17% |
| House Design | Right view | `h:v:right` | action | yes · hover 11% changed · 6/8 steps · blend 6% |
| House Design | Back view | `h:v:back` | action | yes · hover 17% changed · 6/8 steps · blend 3% |
| House Design | Left view | `h:v:left` | action | yes · hover 9% changed · 6/8 steps · blend 3% |
| House Design | Fit 3D | `h:v:fit` | action | yes · hover 4% changed · 6/8 steps · blend 1% |
| House Design | Save PNG | `h:v:png` | action | yes · hover 0% changed · 7/8 steps · blend 0% |
| 3D Print | Guided Setup | `btnGuided` | action | yes · hover 1% changed · 4/8 steps · blend 0% |
| 3D Print | Design | `ws:design` | action | yes · hover 0% changed · 8/8 steps · blend 1% |
| 3D Print | Manufacture | `ws:cam` | action | yes · hover 1% changed · 8/8 steps · blend 1% |
| 3D Print | Setup Sheet | `ws:sheet` | action | yes · hover 1% changed · 8/8 steps · blend 1% |
| 3D Print | 2D Drawing: a separate AutoCAD-style drafting app | `ws:draw` | action | yes · hover 1% changed · 8/8 steps · blend 0% |
| 3D Print | House Design: a Revit-style app. Draw walls, doors, windows, rooms, stairs and roofs in 2D plans and see the house extruded live in 3D | `ws:house` | action | yes · hover 11% changed · 8/8 steps · blend 3% |
| 3D Print | 3D Print | `ws:print` | action | yes · hover 6% changed · 8/8 steps · blend 2% |
| 3D Print | Graphics: raster layers, brushes and filters plus vector pen, shapes and boolean ops in one editor | `ws:gfx` | action | yes · hover 2% changed · 8/8 steps · blend 2% |
| 3D Print | Undo | `btnUndo` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| 3D Print | Redo | `btnRedo` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| 3D Print | File | `btnFile` | action | yes · hover 1% changed · 5/8 steps · blend 0% |
| 3D Print | Theme | `btnTheme` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| 3D Print | Keys | `btnHelp` | action | yes · hover 3% changed · 7/8 steps · blend 0% |
| 3D Print | Settings | `btnSettings` | action | yes · hover 1% changed · 5/8 steps · blend 0% |
| 3D Print | Export log | `btnExportLog` | action | yes · hover 2% changed · 8/8 steps · blend 1% |
| 3D Print | Slice | `print:slice` | action | yes · hover 9% changed · 6/8 steps · blend 6% |
| 3D Print | Save G-code | `print:save` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| 3D Print | Rotate X | `print:rotx` | action | yes · hover 1% changed · 6/8 steps · blend 0% |
| 3D Print | Rotate Y | `print:roty` | action | yes · hover 2% changed · 6/8 steps · blend 23% |
| 3D Print | Rotate Z | `print:rotz` | action | yes · hover 2% changed · 6/8 steps · blend 4% |
| 3D Print | Lay flat | `print:flat` | action | yes · hover 1% changed · 6/8 steps · blend 7% |
| 3D Print | Center | `print:center` | action | yes · hover 2% changed · 6/8 steps · blend 8% |
| 3D Print | Hide model | `print:ghost` | action | yes · hover 6% changed · 6/8 steps · blend 10% |
| 3D Print | 3D | `btn3D` | action | yes · hover 0% changed · 6/8 steps · blend 16% |
| 3D Print | 2D | `btn2D` | action | yes · hover 0% changed · 6/8 steps · blend 5% |
| 3D Print | Home view | `btnHome` | action | yes · hover 0% changed · 6/8 steps · blend 4% |
| 3D Print | Fit all | `btnFit` | action | yes · hover 1% changed · 6/8 steps · blend 1% |
| 3D Print | Printer | `print:printer` | action | yes · hover 1% changed · 8/8 steps · blend 1% |
| 3D Print | Filament | `print:material` | action | yes · hover 1% changed · 8/8 steps · blend 0% |
| 3D Print | Draft: 0.3 mm layers | `print:prof-draft` | action | yes · hover 6% changed · 8/8 steps · blend 4% |
| 3D Print | Standard: 0.2 mm layers | `print:prof-standard` | action | yes · hover 8% changed · 8/8 steps · blend 3% |
| 3D Print | Fine: 0.12 mm layers | `print:prof-fine` | action | yes · hover 8% changed · 8/8 steps · blend 4% |
| 3D Print | Ultra: 0.08 mm layers | `print:prof-ultra` | action | yes · hover 8% changed · 8/8 steps · blend 3% |
| 3D Print | Search settings | `print:search` | action | yes · hover 1% changed · 6/8 steps · blend 0% |
| 3D Print | Show all settings | `print:all` | action | yes · hover 1% changed · 6/8 steps · blend 0% |
| 3D Print | Layer height | `set:layerHeight` | action | yes · hover 8% changed · 8/8 steps · blend 5% |
| 3D Print | First layer height | `set:firstLayerHeight` | action | yes · hover 8% changed · 8/8 steps · blend 4% |
| 3D Print | Line width | `set:lineWidth` | action | yes · hover 3% changed · 8/8 steps · blend 1% |
| 3D Print | Wall line count | `set:wallCount` | action | yes · hover 2% changed · 8/8 steps · blend 3% |
| 3D Print | Z seam alignment | `set:zSeam` | action | yes · hover 8% changed · 8/8 steps · blend 2% |
| 3D Print | Infill pattern | `set:infillPattern` | action | yes · hover 3% changed · 8/8 steps · blend 0% |
| 3D Print | Infill density | `set:infillDensity` | action | yes · hover 2% changed · 8/8 steps · blend 0% |
| 3D Print | Nozzle temperature | `set:nozzleTemp` | action | yes · hover 7% changed · 8/8 steps · blend 4% |
| 3D Print | Bed temperature | `set:bedTemp` | action | yes · hover 22% changed · 8/8 steps · blend 7% |
| 3D Print | Flow | `set:flow` | action | yes · hover 2% changed · 8/8 steps · blend 2% |
| 3D Print | Placement | `set:supportPlacement` | action | yes · hover 1% changed · 5/8 steps · blend 0% |
| 3D Print | Generate support | `set:support` | action | yes · hover 1% changed · 5/8 steps · blend 0% |
| 3D Print | Support pattern | `set:supportPattern` | action | yes · hover 1% changed · 5/8 steps · blend 0% |
| 3D Print | Support density | `set:supportDensity` | action | yes · hover 1% changed · 5/8 steps · blend 0% |
| 3D Print | Adhesion type | `set:adhesion` | action | yes · hover 7% changed · 8/8 steps · blend 2% |
| 3D Print | Export settings | `print:saveprof` | action | yes · hover 1% changed · 6/8 steps · blend 0% |
| 3D Print | Import settings | `print:loadprof` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| 3D Print | Reset | `print:reset` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| Design | Guided Setup | `btnGuided` | action | yes · hover 1% changed · 4/8 steps · blend 0% |
| Design | Design | `ws:design` | action | yes · hover 1% changed · 8/8 steps · blend 1% |
| Design | Manufacture | `ws:cam` | action | yes · hover 1% changed · 8/8 steps · blend 1% |
| Design | Setup Sheet | `ws:sheet` | action | yes · hover 1% changed · 8/8 steps · blend 1% |
| Design | 2D Drawing: a separate AutoCAD-style drafting app | `ws:draw` | action | yes · hover 1% changed · 8/8 steps · blend 0% |
| Design | House Design: a Revit-style app. Draw walls, doors, windows, rooms, stairs and roofs in 2D plans and see the house extruded live in 3D | `ws:house` | action | yes · hover 11% changed · 8/8 steps · blend 3% |
| Design | 3D Print | `ws:print` | action | yes · hover 6% changed · 8/8 steps · blend 2% |
| Design | Graphics: raster layers, brushes and filters plus vector pen, shapes and boolean ops in one editor | `ws:gfx` | action | yes · hover 2% changed · 8/8 steps · blend 2% |
| Design | Undo | `btnUndo` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| Design | Redo | `btnRedo` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| Design | File | `btnFile` | action | yes · hover 1% changed · 5/8 steps · blend 0% |
| Design | Theme | `btnTheme` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| Design | Keys | `btnHelp` | action | yes · hover 3% changed · 7/8 steps · blend 0% |
| Design | Settings | `btnSettings` | action | yes · hover 1% changed · 5/8 steps · blend 0% |
| Design | Export log | `btnExportLog` | action | yes · hover 2% changed · 8/8 steps · blend 1% |
| Design | Create Sketch | `sketch` | action | yes · hover 2% changed · 8/8 steps · blend 0% |
| Design | 3D | `btn3D` | action | yes · hover 0% changed · 6/8 steps · blend 16% |
| Design | 2D | `btn2D` | action | yes · hover 0% changed · 6/8 steps · blend 5% |
| Design | Home view | `btnHome` | action | yes · hover 0% changed · 6/8 steps · blend 4% |
| Design | Fit all | `btnFit` | action | yes · hover 1% changed · 6/8 steps · blend 1% |
| Design | Explode the model into its bodies, and put it back together | `btnExplode` | action | yes · hover 3% changed · 5/8 steps · blend 2% |
| Design | Extrude | `extrude` | action | yes · hover 7% changed · 6/8 steps · blend 1% |
| Design | Revolve | `f:revolve` | action | yes · hover 2% changed · 6/8 steps · blend 3% |
| Design | Sweep | `f:sweep` | action | yes · hover 1% changed · 7/8 steps · blend 1% |
| Design | Loft | `f:loft` | action | yes · hover 7% changed · 7/8 steps · blend 12% |
| Design | Coil | `f:coil` | action | yes · hover 2% changed · 7/8 steps · blend 0% |
| Design | Hole | `f:hole` | action | yes · hover 4% changed · 7/8 steps · blend 10% |
| Design | Gear | `f:gear` | action | yes · hover 4% changed · 5/8 steps · blend 1% |
| Design | Primitive | `f:primitive` | action | yes · hover 3% changed · 8/8 steps · blend 1% |
| Design | Pipe | `f:pipe` | action | yes · hover 1% changed · 7/8 steps · blend 1% |
| Design | Rib / Web | `f:rib` | action | yes · hover 1% changed · 7/8 steps · blend 3% |
| Design | Fillet | `fillet3` | action | yes · hover 2% changed · 7/8 steps · blend 0% |
| Design | Chamfer | `chamfer3` | action | yes · hover 2% changed · 7/8 steps · blend 2% |
| Design | Shell | `f:shell` | action | yes · hover 8% changed · 6/8 steps · blend 36% |
| Design | Thread | `thread` | action | yes · hover 1% changed · 6/8 steps · blend 1% |
| Design | Combine | `f:combine` | action | yes · hover 5% changed · 6/8 steps · blend 2% |
| Design | Split Body | `f:split` | action | yes · hover 3% changed · 6/8 steps · blend 0% |
| Design | Move / Copy | `f:move` | action | yes · hover 6% changed · 5/8 steps · blend 1% |
| Design | Rotate | `f:rotate` | action | yes · hover 2% changed · 6/8 steps · blend 4% |
| Design | Scale | `f:scale` | action | yes · hover 1% changed · 6/8 steps · blend 1% |
| Design | Stretch | `f:stretch` | action | yes · hover 1% changed · 6/8 steps · blend 2% |
| Design | Delete Body | `f:delbody` | action | yes · hover 8% changed · 5/8 steps · blend 1% |
| Design | Bend / Twist | `f:deform` | action | yes · hover 9% changed · 7/8 steps · blend 4% |
| Design | Push / Pull | `f:pushpull` | action | yes · hover 6% changed · 5/8 steps · blend 5% |
| Design | Draft | `f:draft` | action | yes · hover 1% changed · 8/8 steps · blend 0% |
| Design | Align | `f:align` | action | yes · hover 2% changed · 6/8 steps · blend 1% |
| Design | Rectangular | `p:rect` | action | yes · hover 3% changed · 7/8 steps · blend 1% |
| Design | Circular | `p:circ` | action | yes · hover 2% changed · 7/8 steps · blend 0% |
| Design | Mirror | `p:mirror` | action | yes · hover 1% changed · 8/8 steps · blend 0% |
| Design | On Path | `f:pathpat` | action | yes · hover 2% changed · 7/8 steps · blend 1% |
| Design | Offset Plane | `plane` | action | yes · hover 2% changed · 5/8 steps · blend 0% |
| Design | Point | `point` | action | yes · hover 0% changed · 5/8 steps · blend 0% |
| Design | Midplane | `f:midplane` | action | yes · hover 1% changed · 5/8 steps · blend 0% |
| Design | Plane at Angle | `f:planeang` | action | yes · hover 1% changed · 5/8 steps · blend 0% |
| Design | 3-Point Plane | `f:plane3` | action | yes · hover 1% changed · 4/8 steps · blend 0% |
| Design | Fasteners | `hw:fast` | action | yes · hover 1% changed · 6/8 steps · blend 5% |
| Design | Workholding | `hw:shop` | action | yes · hover 1% changed · 5/8 steps · blend 16% |
| Design | Axles & pulleys | `hw:drive` | action | yes · hover 1% changed · 8/8 steps · blend 0% |
| Design | Physics lab | `hw:phys` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| Design | Measure | `measure` | action | yes · hover 1% changed · 5/8 steps · blend 0% |
| Design | Properties | `i:props` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| Design | Interference | `i:interf` | action | yes · hover 2% changed · 5/8 steps · blend 1% |
| Design | Section | `i:section` | action | yes · hover 2% changed · 5/8 steps · blend 2% |
| Design | Stress | `stress` | action | yes · hover 1% changed · 6/8 steps · blend 3% |
| Design | Blueprint Drawing | `blueprint` | action | yes · hover 1% changed · 6/8 steps · blend 0% |
| Design | Import | `import` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| Design | Export | `export` | action | yes · hover 3% changed · 5/8 steps · blend 4% |
| Design | Fixture Maker | `f:fixture` | action | yes · hover 3% changed · 7/8 steps · blend 2% |
| Design | Bodies | `vis:part` | action | yes · hover 1% changed · 8/8 steps · blend 0% |
| Design | Sketches | `vis:sketches` | action | yes · hover 1% changed · 8/8 steps · blend 0% |
| Design | Origin planes | `vis:planes` | action | yes · hover 1% changed · 8/8 steps · blend 0% |
| Design | Bodies | `sel:body` | action | yes · hover 0% changed · 4/8 steps · blend 1% |
| Design | Faces | `sel:face` | action | yes · hover 1% changed · 4/8 steps · blend 0% |
| Manufacture | Guided Setup | `btnGuided` | action | yes · hover 1% changed · 4/8 steps · blend 0% |
| Manufacture | Design | `ws:design` | action | yes · hover 0% changed · 8/8 steps · blend 1% |
| Manufacture | Manufacture | `ws:cam` | action | yes · hover 1% changed · 8/8 steps · blend 1% |
| Manufacture | Setup Sheet | `ws:sheet` | action | yes · hover 1% changed · 8/8 steps · blend 1% |
| Manufacture | 2D Drawing: a separate AutoCAD-style drafting app | `ws:draw` | action | yes · hover 1% changed · 8/8 steps · blend 0% |
| Manufacture | House Design: a Revit-style app. Draw walls, doors, windows, rooms, stairs and roofs in 2D plans and see the house extruded live in 3D | `ws:house` | action | yes · hover 11% changed · 8/8 steps · blend 3% |
| Manufacture | 3D Print | `ws:print` | action | yes · hover 6% changed · 8/8 steps · blend 2% |
| Manufacture | Graphics: raster layers, brushes and filters plus vector pen, shapes and boolean ops in one editor | `ws:gfx` | action | yes · hover 2% changed · 8/8 steps · blend 2% |
| Manufacture | Undo | `btnUndo` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| Manufacture | Redo | `btnRedo` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| Manufacture | File | `btnFile` | action | yes · hover 1% changed · 5/8 steps · blend 0% |
| Manufacture | Theme | `btnTheme` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| Manufacture | Keys | `btnHelp` | action | yes · hover 3% changed · 7/8 steps · blend 0% |
| Manufacture | Settings | `btnSettings` | action | yes · hover 1% changed · 5/8 steps · blend 0% |
| Manufacture | Export log | `btnExportLog` | action | yes · hover 2% changed · 8/8 steps · blend 1% |
| Manufacture | Setup | `setup` | action | yes · hover 2% changed · 6/8 steps · blend 9% |
| Manufacture | Tool Library | `tools` | action | yes · hover 5% changed · 7/8 steps · blend 0% |
| Manufacture | Set Origin | `setorigin` | action | yes · hover 0% changed · 6/8 steps · blend 0% |
| Manufacture | Mill | `mach:mill` | action | yes · hover 8% changed · 8/8 steps · blend 5% |
| Manufacture | UMC-400 | `mach:umc400` | action | yes · hover 5% changed · 8/8 steps · blend 11% |
| Manufacture | Wire EDM | `mach:wire` | action | yes · hover 1% changed · 8/8 steps · blend 0% |
| Manufacture | Auto Program | `autoprog` | action | yes · hover 5% changed · 8/8 steps · blend 0% |
| Manufacture | Auto Detect | `auto` | action | yes · hover 1% changed · 8/8 steps · blend 0% |
| Manufacture | Verify | `verify` | action | yes · hover 8% changed · 8/8 steps · blend 2% |
| Manufacture | New Toolpath | `flow:new` | action | yes · hover 1% changed · 7/8 steps · blend 1% |
| Manufacture | Face | `add:face` | action | yes · hover 21% changed · 8/8 steps · blend 0% |
| Manufacture | 2D Contour | `add:contour` | action | yes · hover 8% changed · 8/8 steps · blend 1% |
| Manufacture | 2D Pocket | `add:pocket` | action | yes · hover 8% changed · 8/8 steps · blend 6% |
| Manufacture | Conical Swarf | `add:chamfer` | action | yes · hover 18% changed · 8/8 steps · blend 2% |
| Manufacture | Spot | `add:drill:spot` | action | yes · hover 4% changed · 8/8 steps · blend 1% |
| Manufacture | Peck | `add:drill:peck` | action | yes · hover 4% changed · 8/8 steps · blend 3% |
| Manufacture | Drill | `add:drill:drill` | action | yes · hover 5% changed · 8/8 steps · blend 3% |
| Manufacture | Tap | `add:drill:tap` | action | yes · hover 3% changed · 8/8 steps · blend 4% |
| Manufacture | Threads | `threads` | action | yes · hover 4% changed · 8/8 steps · blend 4% |
| Manufacture | Counterbore | `add:drill:cbore` | action | yes · hover 3% changed · 7/8 steps · blend 2% |
| Manufacture | Back Spot Face | `add:drill:bsf` | action | yes · hover 7% changed · 8/8 steps · blend 3% |
| Manufacture | 3D Parallel | `add:parallel` | action | yes · hover 8% changed · 8/8 steps · blend 4% |
| Manufacture | Chain | `add:chain` | action | yes · hover 4% changed · 8/8 steps · blend 1% |
| Manufacture | Waterline | `add:waterline` | action | yes · hover 8% changed · 8/8 steps · blend 3% |
| Manufacture | Engrave | `add:engrave` | action | yes · hover 3% changed · 8/8 steps · blend 0% |
| Manufacture | Clean-up | `add:clear` | action | yes · hover 5% changed · 8/8 steps · blend 0% |
| Manufacture | Thread mill | `add:thread` | action | yes · hover 4% changed · 8/8 steps · blend 4% |
| Manufacture | 3D Rough Pocket | `add:zrough` | action | yes · hover 8% changed · 8/8 steps · blend 1% |
| Manufacture | 3D Finish | `add:surf` | action | yes · hover 8% changed · 8/8 steps · blend 4% |
| Manufacture | Simulate | `sim` | action | yes · hover 9% changed · 8/8 steps · blend 3% |
| Manufacture | Post G-code | `post` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| Manufacture | Measure | `measure` | action | yes · hover 1% changed · 5/8 steps · blend 0% |
| Manufacture | Inspection Sheet | `inspect` | action | yes · hover 1% changed · 8/8 steps · blend 0% |
| Manufacture | Soft Jaws | `jaws` | action | yes · hover 3% changed · 8/8 steps · blend 1% |
| Manufacture | Haas VF & Touch-off | `lab:shop` | action | yes · hover 0% changed · 5/8 steps · blend 0% |
| Manufacture | Chips & Cutting | `lab:chips` | action | yes · hover 7% changed · 8/8 steps · blend 1% |
| Manufacture | Coolant Flow | `lab:fluid` | action | yes · hover 1% changed · 8/8 steps · blend 0% |
| Manufacture | Mechanics | `lab:mech` | action | yes · hover 4% changed · 8/8 steps · blend 0% |
| Manufacture | CNC Turning & Live Tooling | `lab:lathe` | action | yes · hover 4% changed · 8/8 steps · blend 6% |
| Manufacture | 3D | `btn3D` | action | yes · hover 0% changed · 6/8 steps · blend 16% |
| Manufacture | 2D | `btn2D` | action | yes · hover 0% changed · 6/8 steps · blend 5% |
| Manufacture | Home view | `btnHome` | action | yes · hover 0% changed · 6/8 steps · blend 4% |
| Manufacture | Stock box | `vis:stock` | action | yes · hover 1% changed · 8/8 steps · blend 0% |
| Manufacture | Toolpaths | `vis:paths` | action | yes · hover 1% changed · 8/8 steps · blend 0% |
| Manufacture | Rapids | `vis:rapids` | action | yes · hover 1% changed · 8/8 steps · blend 0% |
| Setup Sheet | Guided Setup | `btnGuided` | action | yes · hover 1% changed · 4/8 steps · blend 0% |
| Setup Sheet | Design | `ws:design` | action | yes · hover 1% changed · 8/8 steps · blend 1% |
| Setup Sheet | Manufacture | `ws:cam` | action | yes · hover 1% changed · 8/8 steps · blend 1% |
| Setup Sheet | Setup Sheet | `ws:sheet` | action | yes · hover 1% changed · 8/8 steps · blend 1% |
| Setup Sheet | 2D Drawing: a separate AutoCAD-style drafting app | `ws:draw` | action | yes · hover 1% changed · 8/8 steps · blend 0% |
| Setup Sheet | House Design: a Revit-style app. Draw walls, doors, windows, rooms, stairs and roofs in 2D plans and see the house extruded live in 3D | `ws:house` | action | yes · hover 11% changed · 8/8 steps · blend 3% |
| Setup Sheet | 3D Print | `ws:print` | action | yes · hover 6% changed · 8/8 steps · blend 2% |
| Setup Sheet | Graphics: raster layers, brushes and filters plus vector pen, shapes and boolean ops in one editor | `ws:gfx` | action | yes · hover 2% changed · 8/8 steps · blend 2% |
| Setup Sheet | Undo | `btnUndo` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| Setup Sheet | Redo | `btnRedo` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| Setup Sheet | File | `btnFile` | action | yes · hover 1% changed · 5/8 steps · blend 0% |
| Setup Sheet | Theme | `btnTheme` | action | yes · hover 1% changed · 7/8 steps · blend 0% |
| Setup Sheet | Keys | `btnHelp` | action | yes · hover 3% changed · 7/8 steps · blend 0% |
| Setup Sheet | Settings | `btnSettings` | action | yes · hover 1% changed · 5/8 steps · blend 0% |
| Setup Sheet | Export log | `btnExportLog` | action | yes · hover 2% changed · 8/8 steps · blend 1% |
| Setup Sheet | Rebuild from Program | `sheetfill` | action | yes · hover 1% changed · 6/8 steps · blend 0% |
| Setup Sheet | Manufacture | `tocam` | action | yes · hover 0% changed · 6/8 steps · blend 0% |
