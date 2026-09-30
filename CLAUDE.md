# Datum: notes for Claude

`index.html` is the whole app (design, CAM, simulation, G-code post). `datum*.html` and `datum.pre-*.html` are old copies: do not edit them.
Preview with `node .claude/serve.js` (port 8765). The app loads three.js and clipper-lib from CDNs; in a sandbox without those hosts, fetch
`three@0.128.0` and `clipper-lib@6.4.2` from npm and serve them with Playwright `page.route`.

## Haas output: always check the Haas documentation first

G-code this app writes is for **Haas mills (NGC)**. Before changing anything the post emits, or adding an operation that changes what the
machine does, look it up in Haas's own documentation and say what you confirmed and what you could not:

- Mill Programming Workbook: https://www.haascnc.com/content/dam/haascnc/en/service/reference/programming-workbooks/mill---programming-workbook.pdf
- Mill operator's manual (G-codes, M-codes, settings, programming): https://www.haascnc.com/service/online-operator-s-manuals/mill-operator-s-manual/mill---basic-programming.html
- UMC supplement (5-axis, G234, rotary limits): https://www.haascnc.com/service/online-operator-s-manuals/umc-series-operator-s-manual-supplement/umc---g-codes.html
- Code pages: `https://www.haascnc.com/service/codes-settings.type=gcode.machine=mill.value=G234.html` (same pattern for `mcode`, `setting`)

`www.haascnc.com` can be blocked by the sandbox's network policy (WebFetch returns EGRESS_BLOCKED). `WebSearch` with
`allowed_domains: ["haascnc.com"]` still returns short excerpts. If neither works, tell the user the rule could not be checked. Never present
an unchecked Haas rule as confirmed.

Confirmed so far (excerpts from haascnc.com):
- Setting 77 decides what a bare `F10` means; Haas recommends always writing the decimal point. The post writes `F900.`.
- O09000-O09999 are macro programs (9000-9019 are for aliasing); the post keeps program numbers out of that range.
- G234 (TCPC): `G234 H01`, needs an active work offset, rotary axes at 0 when it is commanded, then a rapid XYZ; cancelled by G49.
  Haas's example order: rotaries to zero, linear axes to the work-offset centre, `G234 H..`, rapid XYZ.
- UMC-750: tilt axis is **B** (-35 to +120 deg), C rotates 360 deg (the UMC-750P has A instead).

Not confirmed (docs not reachable): G68.2 / G53.1 syntax and angle conventions, the recommended tool-change sequence (`G91 G28 Z0.` is
used), comment character rules, positive directions of B and C, inverse-time (G93) use for simultaneous 5-axis.

## Conventions

- Operation panels have Basic / Advanced modes: Basic shows only what the operation needs, Advanced lists every parameter. Use `A(html)` in
  the op panel code for advanced-only fields. New operations must do the same.
- Verify generated G-code with a lint over many sample parts (ASCII-only upper-case comments without nested brackets, F words with a decimal
  point, `G43 H` equal to `T`, Z home before each tool change, `%`, `O`, `M30`, `%`).
