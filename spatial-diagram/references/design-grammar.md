# Design Grammar

The visual language that makes a Spatial Diagram read as a *technical* document
rather than a 3D demo. Precision-editorial is the default; other styles are
declared per scene (`scene.style`).

## Styles

| Style | Use when | Character |
|---|---|---|
| `precision-editorial` | default: hardware, assemblies, systems | dark navy stage, slate/steel materials, amber+cyan accents, glass UI |
| `blueprint` | schematics, layouts, revisions | deep blue WebGL background and accents |
| `studio-light` | product/editorial, print-adjacent | light gray stage, soft shadows |
| `schematic` | symbolic/abstract systems | flat colors, basic materials, minimal shading |
| `holographic` | data-driven, live telemetry | near-black, emissive cyan, glowing flow |

A style sets: background gradient, ground/grid color, default lighting mood,
and accent palette. It never changes geometry.

## Architectural blueprint renderer

`scene.renderMode` selects **`webgl`** (default) or **`blueprint`**. This is
independent of `scene.style`, which controls the WebGL palette. Every viewer has
**3D / Blueprint** buttons. Switching preserves the same component IDs, mesh
geometry, selection, explode amounts and annotation visibility. Each mode
remembers its camera during the session. JSON persists the mode; camera/explode
session state is not automatically written back to authored specs.

Blueprint uses an **orthographic** camera at azimuth 45°, elevation
35.26438968°: all three world axes have equal projected length and horizontal
axes meet the sheet at 30°. It overrides authored camera angles/projection for
this mode. Drag pans, wheel/pinch zooms, and Reset View fits the assembled plus
fully exploded bounds. The 3D camera is restored on returning to WebGL.

The renderer projects actual transformed mesh faces, feature edges and view
silhouettes into SVG. It suppresses coplanar triangulation, shades surfaces
with restrained blue fills, and adds fine/major grid lines, sheet border,
orientation triad, drawing identity, units and a **NOT TO SCALE** note.
Annotations use square cards and monochrome technical type. Hidden anchors
use dashed leaders while their label text stays legible. Named materials
still define WebGL appearance and opacity; their textures/PBR finishes are not
reproduced as SVG effects. Selection/highlights, transparency, section cuts,
connectors and flow pulses apply to the vector drawing too. Connector strokes
are overlaid as diagram routes so their full path remains readable.

**SVG** (`engine.exportSVG()`) exports pure vector geometry and optional
annotations, with a drawing heading and without toolbar/inspector controls.
**PNG** rasterizes the active renderer. The export option
`{ annotations: false }` removes annotation groups. WebGL does not export vector
geometry; switch to Blueprint first.

This is a technical illustration, not a CAD drawing: dimensions are authored
labels, scale is not certified, intersecting/transparent faces use approximate
painter ordering, and section cuts have no caps or construction hatching. SVG
face counts grow with mesh detail; use modest recipe detail for dense scenes.
A viewer currently initializes the shared WebGL stage even when starting in
Blueprint, so the interactive HTML still needs WebGL. The exported SVG opens
independently without Three.js or WebGL.

## Materials

Materials are **named** (`materials` block) or **presets** (`aluminum`,
`brushed-steel`, `copper`, `gold`, `pcb-green`, `silicon`, `glass`,
`plastic-black`, `emissive-amber`, …). Prefer presets; override only what
matters. `finish` (`matte | satin | polished | anodized | brushed | cast`)
gives micro-surface character without fiddling with roughness numbers.

Rules of thumb:
- Metals for structure and heat; plastics for enclosures and shrouds;
  emissive colors reserved for **energy, data, and status** — never decoration.
- Glass/transmission for instruments and inspection windows.
- At most 3 dominant hues per scene plus 1–2 accents.
- Procedural textures (`pcb-traces`, `brushed`, `vents`, `carbon`, `knurl`)
  add realism cheaply; use `vents` on enclosures, `pcb-traces` on boards.

## Lighting

`scene.lighting`:
- `studio` — key + fill + rim + hemisphere. Default; readable from all angles.
- `dramatic` — strong key + rim, low fill. Editorial mood; risks dark faces.
- `flat` — even, shadow-light. Schematic reading.
- `technical` — studio + top light. Dense assemblies.

Tone mapping is ACES with exposure ~0.92 by default. If metals look blown out,
lower exposure before touching materials.

## Camera

- `isometric` (azimuth 42–45°, elevation 25–32°) is the workhorse: depth reads
  clearly, annotations have room on both sides.
- `orthographic` for dimensionally-stressed diagrams; `perspective` for
  presence (default).
- `framing: "fit-padded"` lets the engine frame assembled ∪ fully exploded bounds —
  use `manual` only when the author pins `distance`/`target` deliberately.
- Leave negative space in the direction labels live. If every label needs a
  long leader, the camera is too tight.

## Annotations (the SVG layer)

Annotations are projected from 3D anchors through the live camera and stay
attached as it moves. Types: `label`, `callout`, `dimension`, `note`.

Rules:
- **Label the concept, not the mesh.** "Finned stack · heat pipes", not "part 7".
- 6–14 annotations per scene. Beyond that, use `group`s and toggles.
- Labels use automatic vertical collision avoidance; authored offsets still
  determine their preferred placement. Check narrow viewports and dimensions.
- `offset` is screen-space px `[x, y, 0]`; `side: left|right|auto` flips the card.
- Leaders (`leader: true`) for distant labels; drop them for on-anchor chips.
- `emphasis`: `primary` (amber, the thesis of the diagram), `warning` (red-ish,
  limits/loads/danger), `secondary` (muted). At most one `primary`.
- `dimension` annotations take `target` + `targetB` and a `value` string
  ("267 mm"). Place them along the silhouette, not across the object.
- Group annotations by story thread (`thermal`, `power`, `io`…) so the legend
  can toggle whole threads.

## Composition checklist

- The subject fills ~60–75% of the frame at rest.
- Exploded parts form readable columns/streams, not confetti.
- One clear reading path: title → primary label → details.
- Contrast: dark materials need rim light; light materials need shadow.
