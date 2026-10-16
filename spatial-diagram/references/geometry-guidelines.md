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
| `compound` | `parts: [{geometry, material, transform, name}]` | **Level 3 escape hatch** — nested defs are built recursively |
| `import` | unsupported | rejected; use built-in recipes/primitives/compounds |

Axis conventions: cylinders/lathes/motors speak **+Y**. Rotate with
`transform.rotation` (Euler degrees XYZ). E.g. `rotation: [90, 0, 0]` aims a
motor along +Z.

## Level 2 — Recipes (preferred)

Recipes are parametric compounds with sane defaults. `params` override.

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
