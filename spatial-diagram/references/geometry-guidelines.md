# Geometry Guidelines

Three authoring levels. Always use the **lowest level that reads correctly**.

## Level 1 — Primitives

| kind | params | notes |
|---|---|---|
| `box` | `size: [x,y,z]` | workhorse |
| `chamferBox` | `size`, `radius` | beveled edges catch light — prefer over raw box for housings |
| `roundedBox` | `size`, `radius` | consumer/soft look |
| `cylinder` | `radius` or `radiusTop/radiusBottom`, `height`, `segments` | axis = local **+Y** |
| `cone` | `radius`, `height` | |
| `sphere` | `radius` | |
| `torus` | `radius` (ring), `tube`, `arc` (deg) | lies in XY plane, axis +Z |
| `plane` | `width`, `depth` | ground/shelf |
| `extrude` | `profile: [[x,y,z]…]`, `depth`, `bevel` | closed 2D polygon extruded along +Z |
| `lathe` | `profile: [[r,y]…]`, `segments` | revolved around +Y |
| `tube` | `path: [pts]`, `radius` | swept tube — cables, conduits |
| `loft` | `sections: [{z, width, top, bottom, x?, exponent?}]`, `exponent`, `segments`, `subdivisions`, `arc`, `thickness` | superellipse cross-sections along local **+Z** — body shells, hulls, fuselages, ducts (see below) |
| `compound` | `parts: [{geometry, material, transform, name}]` | **Level 3 escape hatch** — nested defs are built recursively |
| `import` | unsupported | rejected; use built-in recipes/primitives/compounds |

Axis conventions: cylinders/lathes/motors speak **+Y**. Rotate with
`transform.rotation` (Euler degrees XYZ). E.g. `rotation: [90, 0, 0]` aims a
motor along +Z.

### Lofts and panel slicing

A loft sweeps superellipse sections (`exponent` 2 = ellipse, 3–4 = car-body
boxy) along +Z. `subdivisions` Catmull-Rom-smooths between authored sections
(use 1 when you sample sections densely yourself). Without `arc` the loft is a
closed solid; `thickness` alone makes a hollow tube.

`arc: [startDeg, endDeg]` keeps part of the ring (0° = +X side, 90° = top,
180° = −X, 270° = bottom) as a **closed shell panel** (`thickness` defaults to
0.6% of the section size). Panels sliced from the *same* sections with adjacent
arcs tile seamlessly when assembled and explode apart cleanly — a bonnet
`[70, 110]` between fenders `[0, 69.4]` and `[110.6, 180]` (leave ~0.5° seams).
An open-topped tub is an arc that wraps through the bottom, e.g. `[121, 419]`.

Wheel arches without booleans: keep `top` fixed and raise the section centre
(`(top + bottom) / 2`) along the arch curve near each axle; the panel's side
edge (θ = 0) then follows the arch. Sample sections every ~40–60 mm around the
arch ends. See `examples/track-car-exploded` (its sections are generated, but
the shipped scene.json is plain data an agent can edit).

## Level 2 — Recipes (preferred)

Recipes are parametric compounds with sane defaults. `params` override.
`references/recipe-gallery.png` shows every recipe at its defaults (each
normalized to its cell, labelled with its real size); open
`examples/recipe-gallery/index.html` to orbit and inspect them. Rebuild both with
`npm run gallery` after adding a recipe.

| Recipe | Key params | Builds |
|---|---|---|
| `board` | `width, depth, thickness` | rounded PCB + trace texture |
| `chip-package` | `width, depth, substrateH, dieH, lidH` | substrate + die + lid + pin-1 dot |
| `finned-heatsink` | `width, depth, baseH, finH, fins, finT, heatPipes` | base + fin array (+ copper pipes) |
| `fan` | `size, depth, blades, hubRatio` | frame + hub + curved blades |
| `rack` | `width, depth, height, postW, sidePanels` | posts + rails (+ vented panels) |
| `server-blade` | `width, height, depth` | chassis + bezel + drive bays + handles + LEDs |
| `connector-port` | `width, height, depth, pins` | shell + cavity + gold pins |
| `port-row` | `count, spacing` + port params | bank of ports |
| `dimm` | `length, height, thickness, chips` | PCB + DRAM chips + gold fingers |
| `capacitor` | `radius, height` | can + scored top |
| `screw` / `bolt` | `radius, length, headR…` | fasteners |
| `flange` | `radius, thickness, bolts, boltCircle, neckR, neckH` | disc + bolt circle + neck |
| `pipe` | `radius, length, flanges` | straight run with end flanges |
| `pipe-elbow` | `radius, tubeR, angle` | torus segment |
| `gauge` | `radius, depth` | body + dial + needle + glass |
| `motor` | `radius, length, fins, shaftR, shaftL, feet` | body + fins + cowl + shaft + terminal box |
| `impeller` | `radius, hubR, blades, height, shroud` | hub + curved vanes + shroud ring |
| `pump-housing` | `radius, width, inletR, outletR` | volute casing + inlet/outlet necks (**casing only** — covers, bolts, flanges are scene components so they can explode) |
| `vapor-chamber` | `width, depth, height` | copper spreader |
| `thermal-pad` | `width, depth, height` | translucent TIM |
| `handle` | `width, height, depth` | bent grip |
| `led-row` | `count, spacing, size` | emissive indicators |
| `inductor` | `width, depth, height` | VRM choke |
| `badge` | `width, depth, height` | nameplate |
| `bracket` | `width, height, thickness` | L-bracket with slot |
| `gpu-card` | `length, depth, thickness` | PCB + package + HBM + fingers |
| `ssd` | `length, width, height` | case + label + connector |
| `duct` | `width, height, depth, wall` | open duct with flanges |
| `battery-cell` | `radius, height` | can + terminal |
| `generic-recipe` | `size` | chamfered box fallback |

### Vehicle & motorsport recipes (`kit/engine/recipes-vehicle.js`)

| Recipe | Key params | Builds · axis |
|---|---|---|
| `wheel` | `radius, width, rimRadius, spokes, twin, centerLock, tireMaterial, rimMaterial, nutMaterial` | tyre + rim barrel + (twin) spokes + hub + centre-lock nut · axis +Y, outer face +Y |
| `brake-assembly` | `radius, thickness, hatRadius, hatHeight, holes, caliperAngle, caliperMaterial, discMaterial` | disc + bell + cross-drilling + monoblock caliper · axis +Y |
| `coilover` | `length, radius, coils, wire, damperRadius, springMaterial` | damper, shaft, perch, top mount, helical spring (component material) · axis +Y |
| `control-arm` | `span, depth, radius, shape: a-arm\|link` | wishbone or single link with bushings · lies in XZ, inner pivots x = 0, ball joint at +x |
| `steering-rack` | `length, radius` | housing, bellows, tie rods, pinion tower · along X |
| `bucket-seat` | `width, height, depth, padMaterial, accentMaterial` | shell, cushion, bolsters, harness slots · faces +Z, origin at base |
| `steering-wheel` | `radius, grip, markerMaterial` | rim, three spokes, hub, 12 o'clock marker, paddles · faces +Y, 12 o'clock +Z |
| `roll-cage` | `width, height, length, radius, topRatio, doorBars` | main hoop, A-pillar/roof bars, stays, diagonals, door bars · origin floor centre, front +Z |
| `airfoil-wing` | `span, chord, thickness, camber, angle, elements, endplates, endplateHeight, mounts` | inverted (downforce) cambered main plane + slotted flap + endplates · span X, leading edge +Z |
| `flat-engine` | `cylinders, length, width, height, coverMaterial, headerMaterial` | horizontally opposed block, barrels, heads, cam covers, runners, headers, accessory drive · crank along Z, flywheel +Z |
| `intake-plenum` | `length, width, height, runners` | plenum, throttle bodies (+Z), runner stubs · base at y = 0 |
| `transaxle` | `length, width, height` | bell housing (−Z), differential across X, gearcase, actuator, cooler |
| `radiator` | `width, height, depth, tanks, coreMaterial` | vented core, frame, side tanks, fittings · core faces +Z |
| `headlamp` | `radius, depth, modules, ledMaterial, housingMaterial` | cup housing, body-colour bezel, LED modules, DRL ring, lens · lens faces +Y |
| `exhaust` | `span, mufflerRadius, length, tips, tipRadius, tipLength, tipMaterial` | transverse silencer, centre tips (+Y), inlet pipes (−Y) |

Rotate +Y-axis recipes into place with `transform.rotation` (wheels on a car
facing +Z: `[0, 0, -90]` for the +X side, `[0, 0, 90]` for −X).

Recipe philosophy: a recipe owns the **canonical, inseparable** form of a part.
Anything a viewer might want to see exploded separately (covers, gaskets,
fasteners, flanges) is authored as its **own component** in the scene — see
`assembly-rules.md`. When a domain needs a new canonical part (turbine wheel,
valve body…), add a recipe to `kit/engine/geometry.js` and a row to the table.

## Level 3 — Compound

```json
{
  "kind": "compound",
  "parts": [
    { "geometry": { "kind": "cylinder", "radius": 24, "height": 34 }, "material": "steel-dark" },
    { "geometry": { "kind": "cylinder", "radius": 28, "height": 5 }, "material": "brushed-steel",
      "transform": { "position": [0, 17, 0] } }
  ]
}
```
`parts[].transform` uses position/rotation/scale, with Euler XYZ degrees.
Nested transforms compose exactly, including nonuniform scale. Do not put
position/rotation/scale directly on a part.

Use when a *single selectable component* needs multi-material detail and no
recipe fits. Keep compounds under ~8 parts; if bigger, it's probably an
assembly of components, not one part.

## Detail budget

- A 30-component diagram built from good recipes beats a 200-mesh scene built
  from noise. Meaningful > detailed.
- Silhouette first: if the part isn't recognizable in matte gray from 5 m away,
  more detail won't save it.
- Chamfers/rounds on anything > 30 units; bevels catch the key light and sell
  the object.

## Package layers and fidelity

For explanatory GPU package diagrams, make the die, HBM envelopes, interposer,
organic substrate and PCB separate selectable components. The chip-package
recipe includes a substrate, die and lid; using it for every HBM stack does not
model stacked DRAM dies or TSVs. Thin boxes are appropriate package envelopes.
Record exaggerated thicknesses and omitted solder joints or internal bores.
Source claims about a named product; a generic composite should not imply an
exact capacity, process, board form factor or thermal rating.
