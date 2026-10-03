# 3D Print workspace

Datum has a **3D Print** workspace (next to Design and Manufacture) that slices the model and writes G-code for Creality printers.

- `slicer.js` is the slicing engine. It has no DOM or THREE dependency, so it runs in Node too. Units are millimeters, Z up.
- `print-ui.js` is the workspace: printer and filament pickers, the settings panel, bed placement, the layer preview and the G-code download. It plugs into the app by wrapping a few top-level functions, so the modeler's code is otherwise untouched.
- `costing.js` is the production-cost calculator (pure arithmetic, also usable for machining jobs: feed it material cost, machine hours and hands-on minutes). `node test/costing.test.js`.
- `test/slicer.test.js` checks the engine (`npm i --no-save clipper-lib@6.4.2 && node test/slicer.test.js`).

## What it does

**Printers** (bed, nozzle, speed and temperature limits, direct drive or Bowden, auto-leveling): Ender-3 / Pro / V2 / V2 Neo / S1 / S1 Pro / S1 Plus / V3 SE / V3 KE / V3 / V3 Plus / Max, Ender-2 Pro, Ender-5 / S1 / Plus, Ender-6, CR-10 / V2 / Smart Pro / S5, CR-6 SE, CR-M4, CR-200B, K1 / K1C / K1 SE / K1 Max, Creality Hi, Sermoon D1, and a custom Marlin printer. Check the bed size of your exact machine under Placement if it differs.

**Filament presets**: PLA, PLA+, PETG, ABS, ASA, TPU, Nylon, PC, Silk PLA, wood PLA. They set temperatures, retraction, fan, minimum layer time and a flow ceiling.

**Settings** (the panel is generated from `Slicer.SETTINGS`; "Show all settings" reveals the advanced ones, and there is a search box):

| Group | Options |
| --- | --- |
| Quality | layer height, first layer height, line widths, horizontal expansion, elephant-foot compensation, slicing tolerance, path simplification |
| Walls | wall count, outer wall first, Z seam (sharpest corner, aligned side, nearest, random) |
| Top / bottom | top and bottom layers, lines or concentric skin, skin overlap, ironing, bridges |
| Infill | density, lines, grid, triangles, cubic, gyroid, honeycomb, concentric; angle, overlap, combine every N layers, infill before walls, minimum area |
| Material | filament, nozzle and bed temperature (and first layer), filament diameter, flow, density and cost |
| Speed | print, outer wall, inner wall, infill, top, support, bridge, first layer, travel; maximum flow rate; acceleration, travel acceleration, jerk, linear advance |
| Travel / retraction | retraction distance and speed, extra prime, minimum travel, Z hop, wipe, avoid retracting inside the part |
| Cooling | fan speed, minimum fan, fan-off layers and ramp, bridge fan, minimum layer time with slow-down |
| Support | touching build plate or everywhere, overhang angle, lines / grid / triangles, density, XY distance, Z gap, roof layers and density |
| Bed adhesion | skirt, brim, raft |
| Special modes | spiral vase, fuzzy skin, G-code at chosen layers (for example a filament change) |
| Machine | relative or absolute extrusion, editable start and end G-code |

**Preview**: a layer-by-layer view of rounded extruded beads (smooth tubes with rounded ends; very large jobs get fewer facets, and the very largest fall back to lines) with a slider, colored by feature type, speed, flow or layer. **Output**: Marlin-flavor G-code (`;FLAVOR:Marlin`, Cura-style `;LAYER` / `;TYPE` comments, Creality-style purge line and end sequence) with a print-time, filament and weight estimate. Part scale, rotation, position and lay-flat are in the ribbon and the Placement section; settings can be exported and imported as JSON.

**Production cost** (appears after slicing): material, machine time at your shop's cost per hour, electricity, labor for setup and hands-on time (setup is spread over the quantity), overhead percent and a failed-print allowance give the cost per part. Enter a profit margin and it shows the price to charge, the profit, the markup and the profit per machine hour, and warns below which price you lose money. The rates are saved in the browser.

**Safety limits**: the slicer lowers temperatures to what the chosen printer allows, warns when the part, skirt, brim or raft reaches past the bed, and refuses parts more than four times larger than the bed (usually a scale mistake).

**Stress test**: `NODE_PATH=<dir with clipper-lib> node test/slicer.stress.js` (add `--quick` to sample) slices 20 awkward parts (thin walls, overhangs, open or degenerate meshes, floating bodies), about 100 extreme setting combinations, every printer with every material and a 2000-layer job, and checks each G-code file for bad numbers, moves outside the bed, absurd extrusion, temperatures above printer limits and speeds above machine limits.

## Not included

Tree support, adaptive layer height, per-model settings and modifier meshes, multi-part arrangement, multi-color printing, and sending the file to the printer over the network (copy the `.gcode` to a USB stick or microSD card instead). Print-time estimates are approximate. The K1 family runs Klipper but accepts the same G-code.
