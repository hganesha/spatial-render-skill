---
name: spatial-diagram
description: >
  Reusable 3D diagramming capability for agents. Generate, edit, validate, and
  export interactive 3D technical diagrams (exploded assemblies, systems
  topologies, cutaways) from a declarative JSON Scene Spec. WebGL/Three.js
  rendering with SVG precision annotations, isometric blueprint and
  publication-style vector illustration (balloons, parts lists, hatched sections,
  detail views, journal-sized SVG/PDF, drawing sheets, assembly instructions),
  guided tours, and rendered-view audits. Use when the user wants a technical
  diagram, exploded view, assembly visualization, rack/system view, a figure for a
  paper or manual, or an interactive 3D explanation of how something is built or
  connected.
---

# Spatial Diagram Skill

You do not write Three.js. You describe **what exists, how it is assembled, how
components relate, and what happens on interaction** — the engine renders it.

Two products live here:

1. **Spatial Diagram Engine** (`kit/`) — deterministic runtime that consumes a
   Scene Spec and renders geometry, assemblies, annotations, and interactions.
2. **Spatial Diagram Skill** (this file + `references/`) — the workflow,
   vocabulary, and quality bar for producing excellent diagrams with it.

## The contract: Scene Spec

Everything is driven by `schemas/scene.schema.json`. Your primary output is a
`scene.json` — a structured, editable, diffable artifact. Never hand-write
rendering code for a diagram; write or patch the spec.

Supported geometry is limited to the built-in primitives, recipes and compounds.
External GLB/glTF import and non-explode scheduled behaviors are rejected.

The ten primitives: **Solid, Assembly, Connector, Relationship (parent/anchor),
Anchor, Material, Camera, Annotation, Behavior, State**.

Every component declares **semantic identity** (stable `id`, `label`,
`properties`) and the scene declares **fidelity** — `actual`,
`representative`, `schematic`, or `illustrative`. Never present representative
geometry as engineering-accurate.

## Workflow

Follow this loop every time. Do not skip the evaluation step.

### 1. Understand
Identify the subject, audience, and purpose. Decide:
- **Scene type**: `technical-assembly`, `exploded-view`, `systems-topology`,
  `cutaway`, `schematic-3d`, `editorial-scene`.
- **Fidelity**: how true to life must proportions be? Default `representative`.
- **Interaction needs**: explode? x-ray? flow? selection?
- **Render mode**: shaded `webgl` (default), isometric `blueprint`, or
  publication line art `illustration`. Read `references/design-grammar.md`.
- **Deliverable**: interactive page, or a figure (journal SVG/PDF, drawing sheet,
  assembled ⎮ exploded comparison, assembly instructions)? Figures want
  `labelLayout: "margins"` and usually balloons + a parts list.
- **Story**: will a reader need a guided tour (`tour.steps`) or step-by-step
  assembly (derived from explode order — see `references/assembly-rules.md`)?

### 2. Decompose
List components before writing JSON:
- What are the 15–40 meaningful parts? (A good technical diagram has
  *meaningful* components, not decorative noise.)
- Hierarchy: which components are children of others (semantic `parent`)?
- Attachment points: where do parts touch? Where do connectors attach?
- What should explode where? (Cover comes off +Z, internals slide out along
  the shaft, fasteners lift away radially…)

### 3. Compose
Write the Scene Spec (see `references/geometry-guidelines.md` for the recipe
catalog and `references/assembly-rules.md` for transform semantics):

```bash
node scripts/new-scene.mjs my-scene --type exploded-view   # optional valid starter (also technical-assembly | systems-topology | cutaway)
# author or edit examples/.../scene.json (or any path), then:
node scripts/validate-scene.mjs path/to/scene.json --strict
```
Look at `references/recipe-gallery.png` to pick recipes by sight.

Key rules:
- `transform.position/rotation/scale` are authored in **assembly space** —
  flat and predictable. `parent` is **semantic** (explode direction, inspect
  tree, detach audits); it does not rescale the child transform.
- Use Level-2 recipes (`chip-package`, `finned-heatsink`, `fan`, `motor`,
  `impeller`, `rack`, `server-blade`, `wheel`, `brake-assembly`, `coilover`,
  `flat-engine`, `airfoil-wing`, `roll-cage`, …) before composing primitives by hand.
  Smooth shells (car bodies, hulls) are `loft`s; slice adjacent panels from the
  same sections with `arc` so they tile when assembled.
  Reserve Level-3 (`compound` with custom parts) for shapes recipes can't
  express.
- For contacting stacks, assign explicit `explode.order` values: outer covers
  and fasteners leave before the layers they cover. Review intermediate poses.
- Give explicit `explode` vectors for anything that matters visually; the
  engine only derives them as a fallback.
- Attach labels to **anchors** (`"target": {"anchor": "gpu.top"}`), not to raw
  coordinates, so they track components through explode/rotate.
- Small decorative parts (badges, LEDs) ride with their host: copy its explode
  vector instead of flying them off unlabeled.
- Use `explode.stops` for the meaningful intermediate pose, `detailViews` for
  parts too small to read, and `properties.partNumber/qty` if a parts list ships.

Fix every error and every warning you can justify; see
`references/quality-standards.md` for what each audit means.

### 4. Render
```bash
node scripts/export-scene.mjs path/to/scene.json -o out/index.html
node scripts/serve.mjs . --port 8080     # optional live preview
```
The export is a **self-contained HTML** (Three.js + runtime + spec inlined)
that runs from `file://` with no network — that is the shareable deliverable.

Figures straight from the spec (headless; needs puppeteer or playwright):
```bash
node scripts/export-figure.mjs scene.json --kind svg --figure double-column --labels margins --balloons -o fig.svg
node scripts/export-figure.mjs scene.json --kind pdf --figure single-column -o fig.pdf
node scripts/export-figure.mjs scene.json --kind sheet -o sheet.svg          # front/top/right/iso + title block + dimensions
node scripts/export-figure.mjs scene.json --kind sheet --views front,left,back,top -o strip.svg   # poster-style view strip
node scripts/export-figure.mjs scene.json --kind comparison -o ab.svg        # assembled | exploded
node scripts/export-figure.mjs scene.json --kind instructions -o steps.svg
node scripts/export-figure.mjs scene.json --kind video --video turntable -o spin.webm
```

### 5. Evaluate (mandatory)
```bash
node scripts/capture-scene.mjs out/index.html -o out/capture.png \
     --contact-sheet out/sheet.png --audit out/audit.json --strict
# requires: npm i puppeteer (or playwright)
```
Look at the **contact sheet** (assembled, 50%, exploded, Blueprint,
Illustration, four azimuths) — not just the hero capture. Check against
`references/quality-standards.md`. Fix every rendered-view audit warning
(`label:over-geometry`, `frame:underfilled`, `part:stranded`,
`part:unlabeled-emissive`, crossing leaders…); the audit is the machine-readable
half of "look at it". For figures, also open the exported SVG/PDF itself.

### 6. Refine
Patch the **spec**, re-validate, re-render, re-capture. Never regenerate from
scratch when a targeted edit suffices — stable `id`s exist precisely so scenes
can be revised. In embedded/runtime contexts use `engine.updateSpec(patch)` or
`engine.patchComponents([{ id, ...changes }])`. Component/material edits retain
the canvas, view, selection, explode position and annotation group visibility.
Stage configuration changes (style, lights, background, ground or projection)
replace the stage while restoring those interaction choices.

## Editing an existing scene

Read the current `scene.json`, apply minimal JSON edits, keep ids stable.
Before handing a revision back, run
`node scripts/scene-diff.mjs before.json after.json --html diff.html` and check
that only the intended parts changed (added green, moved/changed amber, removed
red).
Typical edits:
- reposition: change `transform.position` of one component
- re-annotate: adjust `offset` / `side` / `group`
- change explode: edit the component's `explode` vector
- restyle: change `scene.style` or a named material

`updateSpec` deep-merges objects and replaces arrays. Prefer `patchComponents`
for edits by stable component ID; it rejects unknown IDs. Invalid patches are
rejected before changing the displayed scene.

For semiconductor assemblies, distinguish the GPU die, HBM stack envelopes,
silicon interposer, organic substrate and PCB. Use `chip-package` only when
those internals should be one selectable object. State omitted bonds/bores and
exaggerated thicknesses in metadata, and source any product-specific claims.

## Output modes

| Mode | How |
|---|---|
| Interactive HTML | `scripts/export-scene.mjs` (primary deliverable; share links via `#sd=`) |
| Embed in docs/MDX | `npm run build:element` → `<spatial-diagram src="scene.json">` |
| PNG (screen or print dpi) | capture script, Export ▾ → PNG, `exportPNG({figure, dpi})` |
| Vector SVG / PDF | Blueprint or Illustration, Export ▾ → SVG / Journal SVG, `export-figure --kind svg|pdf` |
| Comparison, drawing sheet, instructions | Export ▾, or `export-figure --kind comparison|sheet|instructions` |
| Contact sheet | Export ▾, `capture-scene --contact-sheet` |
| Video (WebM) | Export ▾ → Turntable video, `exportVideo({kind})` |
| GLB | Export ▾ → GLB (`GLTFExporter`) |
| Scene JSON | Export ▾ → JSON — the editable source of truth |

The toolbar switches **3D / Blueprint / Illustration** without rebuilding
component geometry; set `scene.renderMode` to start in a vector mode. Blueprint
is locked isometric on navy paper; Illustration is orbitable orthographic line
art on white paper with weighted silhouettes, one spot colour and hatched section
caps. JSON saves the render mode. See `references/design-grammar.md` for figure
presets and illustration limitations.

## Runtime API (for embedded use)

```js
const engine = SpatialDiagram.createEngine({ THREE, container, spec, onEvent, urlState });
engine.explode(0.75, { duration: 900, stagger: true });
engine.explodeSubtree('vapor-chamber');  // local explode
engine.select('gpu');                    // inspect card
engine.setRenderMode('illustration');    // webgl | blueprint | illustration
engine.setAnnotationStyle('balloon'); engine.setLabelLayout('margins');
engine.toggleMode('xray');               // xray | section | isolate | ghost | flow | traces | measure
engine.updateSpec({ scene: { title: 'Rev B' } });
engine.validate();                       // { structural, audits, layout }
engine.auditVisual();                    // rendered-view audit at assembled + exploded
engine.compare(previousSpec);            // revision diff overlay
engine.tour.start(); engine.tour.start('instructions'); engine.tour.setProgress(1.5);
engine.exportSVG({ figure: 'double-column' });
await engine.exportComparison(); await engine.exportSheet(); await engine.exportInstructions();
await engine.exportContactSheet(); await engine.exportVideo({ kind: 'turntable' });
await engine.exportPNG({ figure: 'single-column', dpi: 300 });
await engine.exportGLB(); engine.exportJSON(); engine.shareURL();
```

## Hard rules

1. **Spec first.** If you find yourself writing rendering code, stop and extend
   the spec or the recipe library instead.
2. **Fidelity honesty.** Declare it; respect it in labels and metadata.
3. **Reuse before invention.** Second diagram of a new kind must reuse schema,
   recipes, interactions — no bespoke renderer. If a recipe is missing, add one
   to `kit/engine/geometry.js` and document it in `references/geometry-guidelines.md`.
4. **Validate + look.** Never ship a diagram you haven't seen a contact sheet of,
   and fix the rendered-view audit warnings.
5. **Editability is a feature.** Keep ids stable and specs clean enough that a
   later agent can modify them without full regeneration.

## File map

```
SKILL.md                     ← you are here
references/                  ← read before authoring: grammar, geometry, assembly, interactions, quality
schemas/scene.schema.json    ← the Scene Spec contract; run npm run sync-schema after edits
kit/engine/                  ← runtime modules (bundled by export-scene.mjs)
kit/vendor/                  ← pinned Three.js r147 + GLTFExporter (MIT)
scripts/validate-scene.mjs   ← structural validation + geometry audits (zero-dep)
scripts/export-scene.mjs     ← scene.json → self-contained interactive HTML
scripts/capture-scene.mjs    ← screenshot + contact sheet + rendered-view audit
scripts/export-figure.mjs    ← headless SVG/PDF/PNG/sheet/instructions/video from a spec
scripts/scene-diff.mjs       ← revision diff (text, JSON, HTML viewer)
scripts/new-scene.mjs        ← valid starter scene per scene type
scripts/build-gallery.mjs    ← recipe catalog scene + references/recipe-gallery.png
scripts/build-element.mjs    ← <spatial-diagram> web component bundle (dist/)
scripts/serve.mjs            ← local preview server
examples/                    ← gpu-exploded, data-center-rack, mechanical-pump, track-car-exploded, recipe-gallery
```

When adding a recipe or interaction, update the matching reference file in the
same change. The engine and the documentation are one product.
