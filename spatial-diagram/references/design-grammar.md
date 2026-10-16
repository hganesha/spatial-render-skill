# Design Grammar

The visual language that makes a Spatial Diagram read as a *technical* document
rather than a 3D demo. Precision-editorial is the default; other styles are
declared per scene (`scene.style`).

## Styles

| Style | Use when | Character |
|---|---|---|
| `precision-editorial` | default: hardware, assemblies, systems | dark navy stage, slate/steel materials, amber+cyan accents, glass UI |
| `blueprint` | schematics, layouts, revisions | deep blue WebGL background and accents |
| `studio-light` | product/editorial, print-adjacent, posters | light gray stage, soft shadows; labels, balloons and legends switch to the paper (ink-on-white) theme |
| `schematic` | symbolic/abstract systems | flat colors, basic materials, minimal shading |
| `holographic` | data-driven, live telemetry | near-black, emissive cyan, glowing flow |

A style sets: background gradient, ground/grid color, default lighting mood,
and accent palette. It never changes geometry.

## Render modes

`scene.renderMode` selects **`webgl`** (default), **`blueprint`** or
**`illustration`**, independent of `scene.style` (the WebGL palette). Every
viewer has **3D / Blueprint / Illustration** buttons (keys 1/2/3). Switching
keeps component IDs, meshes, selection, explode amounts and annotation
visibility; each mode remembers its own camera for the session. JSON persists the
mode; camera/explode session state lives in share links, not the spec.

Both vector modes project the actual transformed mesh faces through one pipeline
(`kit/engine/blueprint.js`): painter-sorted front faces, coplanar triangulation
suppressed, feature creases and view silhouettes stroked separately.

| | `blueprint` | `illustration` |
|---|---|---|
| Paper | navy, fine/major grid, sheet border | white (`illustration.paper`) |
| Camera | locked isometric (az 45°, el 35.264°) | orthographic, **orbitable** — starts from the 3D view's angle |
| Lines | light blue; silhouettes 1.3, creases 0.85 | near-black ink; silhouettes 1.45, creases 0.55 |
| Fills | three blue tones by face orientation | `shading: tonal` (three light greys) · `flat` · `none` |
| Highlight | cyan | one spot colour (`illustration.spotColor`, default Okabe-Ito vermillion `#D55E00`) |
| Labels | square monospace cards | plain text with a paper halo, thin ink leaders |
| Triad / footer | on / on | off / on (`drawing.triad`, `drawing.footer`) |
| UI chrome | blueprint monospace | light theme |

`scene.drawing` applies to both vector modes:
- `lineWeight` multiplies every stroke (use 1.3–1.6 for figures printed small).
- `hiddenLines: true` overlays every feature edge as a thin dashed layer under the
  visible linework — the classic hidden-line convention. It is approximate (no
  per-edge visibility solve) and gets busy on dense scenes; prefer it for 5–20 parts.
- `sectionCaps` (default on): when Section is active, each cut component gets a
  **hatched cap** built from the actual cross-section loops (WebGL and vector).
  Open recipe surfaces produce no cap rather than a wrong one.

Annotations whose anchors are cut away by the section, or whose parts are hidden,
are hidden too. Occluded anchors keep legible text with dashed leaders.

## Publication annotations

- **Balloons** — `scene.annotationStyle: "balloon"` (or per-annotation
  `style: "balloon"`) replaces cards with numbered circles. Numbers follow
  annotation order, are shared per component, and can be pinned with `item`.
- **Parts list** — balloons automatically produce a table (`#`, description,
  qty, material, part no.) from the annotation text and component
  `properties.qty` / `properties.partNumber` / `properties.materialName`.
  Configure with top-level `partsList` (`position: right|left|bottom`,
  `columns`, `title`, `enabled: false`). In figure exports the drawing is framed
  into the space beside the table so they never overlap.
- **Poster legend** — `partsList: {style: "legend", position: "split", materialKey: true}`
  lists the balloons as a numbered legend (badge · NAME · material subtitle) down
  both sides of the frame like an exploded-systems poster, plus a material swatch
  key built from `properties.materialName` and the material colours. Rows shrink
  (dropping the subtitle) when the frame is short. On screen the drawing is
  framed into the space between the columns (the projection is offset, so
  picking and labels stay aligned); the label-groups panel starts folded.
- **Margin columns** — `scene.labelLayout: "margins"` stacks labels/balloons in
  left and right columns beside the subject (inside any parts-list strip and
  above the toolbar), compressing to fit, routing around insets, and swapping
  equal slots until no leaders cross. Use it for every figure meant for print.
- **Detail views** — top-level `detailViews: [{id, label, target, magnification |
  radius, size, placement, caption}]` circle a small region on the main view and
  draw a magnified inset ("DETAIL A · 4:1") in every mode and export.
- **Conditional labels** — `visibleWhen: {explodeMin, explodeMax, renderModes}`.
- On phones (< 600 px wide) on-screen cards become balloons automatically and
  insets are hidden; exports are unaffected.

## Figure exports

| Export | API / CLI | Notes |
|---|---|---|
| Current view, vector | `exportSVG()` · `export-figure --kind svg` | Blueprint/Illustration only; adds a heading in Blueprint |
| Journal figure | `exportSVG({figure:'double-column'})` | presets `single-column` 89 mm, `one-and-half-column` 120 mm, `double-column` 183 mm, `full-page` 247 mm; `fontPt` (default 7) sets label size at print scale; width/height written in mm |
| PDF | `export-figure --kind pdf` | the SVG printed by headless Chrome at its mm size |
| Raster at print resolution | `exportPNG({figure, dpi:300})` | any mode |
| Assembled ⎮ exploded | `exportComparison()` | two panels, captions (a)/(b) |
| Drawing sheet | `exportSheet()` | third-angle TOP / ISO over FRONT / RIGHT at one shared scale + title block (title, drawing no., units, NTS scale, fidelity, rev, date, author) and overall dimension lines (`dimensions: false` to omit) |
| View strip | `exportSheet({views: ['front','left','back','top']})` · `export-figure --kind sheet --views front,left,back,top` | one row of orthographic views at one scale, each panel as wide as its view; plan views turn to align with the side view |
| Assembly instructions | `exportInstructions()` | one panel per derived step; new parts highlighted with arrows from their offset |
| Contact sheet | `exportContactSheet()` | 3D assembled / 50% / exploded, Blueprint, Illustration, three more azimuths |
| Video | `exportVideo({kind:'turntable'|'explode'|'tour'})` | WebM via MediaRecorder (no GIF encoder bundled) |

Figure exports omit UI-only overlays (the "+N internal parts" chip, toolbar,
inspect card). Fonts are referenced by family (Helvetica/Arial for
illustration); text is not converted to outlines, so embed fonts at the
publisher or accept substitution.

This is technical illustration, not CAD drawing: dimensions are authored labels,
scale is not certified ("NTS"), intersecting/transparent faces use approximate
painter ordering. SVG face counts grow with mesh detail; use modest recipe
detail for dense scenes. The interactive HTML needs WebGL even when it starts in
a vector mode; exported SVG/PDF need neither.

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
- `framing: "fit-padded"` fits the projected box of whatever is on screen with a
  margin (≈ 80% of the limiting dimension); `fit` is tighter. With
  `followExplode` (default) the frame tracks the explode until the user pans or
  zooms; Reset View re-enables it. Use `manual` only when the author pins
  `distance`/`target` deliberately.
- Leave negative space in the direction labels live. If every label needs a
  long leader, the camera is too tight.

## Annotations (the SVG layer)

Annotations are projected from 3D anchors through the live camera and stay
attached as it moves. Types: `label`, `callout`, `dimension`, `note`.

Rules:
- **Label the concept, not the mesh.** "Finned stack · heat pipes", not "part 7".
- 6–14 annotations per scene. Beyond that, use `group`s and toggles.
- Labels use automatic vertical collision avoidance; authored offsets still
  determine their preferred placement. Card widths are measured from the
  rendered text. Check narrow viewports and dimensions, and run the visual
  audit — `label:over-geometry` means the offset puts the card on the subject.
- In the assembled pose, labels whose anchors are hidden inside the object
  collapse into one "+N internal parts · explode to reveal" chip
  (`interactions.explode.collapseHidden`).
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
