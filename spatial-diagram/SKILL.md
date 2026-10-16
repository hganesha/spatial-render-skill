---
name: spatial-diagram
description: >
  Reusable 3D diagramming capability for agents. Generate, edit, validate, and
  export interactive 3D technical diagrams (exploded assemblies, systems
  topologies, cutaways) from a declarative JSON Scene Spec. WebGL/Three.js
  rendering with SVG precision annotations, plus isometric architectural SVG
  blueprint rendering. Use when the user wants a technical
  diagram, exploded view, assembly visualization, rack/system view, or an
  interactive 3D explanation of how something is built or connected.
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
- **Render mode**: shaded `webgl` (default) or isometric architectural `blueprint`.
  Read `references/design-grammar.md` for blueprint projection and export limits.

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
# author or edit examples/.../scene.json (or any path), then:
node scripts/validate-scene.mjs path/to/scene.json --strict
```

Key rules:
- `transform.position/rotation/scale` are authored in **assembly space** —
  flat and predictable. `parent` is **semantic** (explode direction, inspect
  tree, detach audits); it does not rescale the child transform.
- Use Level-2 recipes (`chip-package`, `finned-heatsink`, `fan`, `motor`,
  `impeller`, `rack`, `server-blade`, …) before composing primitives by hand.
  Reserve Level-3 (`compound` with custom parts) for shapes recipes can't
  express.
- For contacting stacks, assign explicit `explode.order` values: outer covers
  and fasteners leave before the layers they cover. Review intermediate poses.
- Give explicit `explode` vectors for anything that matters visually; the
  engine only derives them as a fallback.
- Attach labels to **anchors** (`"target": {"anchor": "gpu.top"}`), not to raw
  coordinates, so they track components through explode/rotate.

Fix every error and every warning you can justify; see
`references/quality-standards.md` for what each audit means.

### 4. Render
```bash
node scripts/export-scene.mjs path/to/scene.json -o out/index.html
node scripts/serve.mjs . --port 8080     # optional live preview
```
The export is a **self-contained HTML** (Three.js + runtime + spec inlined)
that runs from `file://` with no network — that is the shareable deliverable.

### 5. Evaluate (mandatory)
```bash
node scripts/capture-scene.mjs out/index.html -o out/capture.png --wait 4500
# requires: npm i puppeteer (or playwright)
```
Look at the screenshot. Check against `references/quality-standards.md`:
framing, interpenetration, detached parts, label placement/occlusion,
material readability, explode legibility. Also run the engine's own audit
(`validate()` in the runtime = the same schema/geometry checks as the CLI,
plus live annotation layout checks).

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
| Interactive HTML | `scripts/export-scene.mjs` (primary deliverable) |
| PNG | capture script, or the in-app **PNG** button |
| Vector SVG blueprint | Switch to **Blueprint**, then **SVG** (`engine.exportSVG()`) |
| GLB | in-app **GLB** button (`GLTFExporter`) |
| Scene JSON | in-app **JSON** button — the editable source of truth |

The toolbar switches **3D / Blueprint** without rebuilding component geometry.
For a blueprint-first document set `scene.renderMode: "blueprint"`. Blueprint
uses orthographic isometry (45° azimuth, 35.264° elevation), blue drawing paper,
feature edges, silhouettes and projected annotations. Drag pans; wheel/pinch
zooms. **SVG** exports actual vector faces, lines and labels; **PNG** captures
the active renderer. JSON saves the render mode. WebGL itself remains a raster
view. See `references/design-grammar.md` for illustration limitations.

## Runtime API (for embedded use)

```js
const engine = SpatialDiagram.createEngine({ THREE, container, spec, onEvent });
engine.explode(0.75, { duration: 900, stagger: true });
engine.select('gpu');            // inspect card
engine.setRenderMode('blueprint'); // webgl | blueprint; keeps assembly/selection
engine.exportSVG();              // blueprint geometry + annotations
engine.toggleMode('xray');       // xray | section | isolate | ghost | flow
engine.updateSpec({ scene: { title: 'Rev B' } });
engine.validate();               // { structural, audits }
await engine.exportPNG(); // active WebGL/blueprint image + labels; UI excluded
await engine.exportGLB(); engine.exportJSON();
```

## Hard rules

1. **Spec first.** If you find yourself writing rendering code, stop and extend
   the spec or the recipe library instead.
2. **Fidelity honesty.** Declare it; respect it in labels and metadata.
3. **Reuse before invention.** Second diagram of a new kind must reuse schema,
   recipes, interactions — no bespoke renderer. If a recipe is missing, add one
   to `kit/engine/geometry.js` and document it in `references/geometry-guidelines.md`.
4. **Validate + look.** Never ship a diagram you haven't seen a capture of.
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
scripts/capture-scene.mjs    ← screenshot for the evaluation loop
scripts/serve.mjs            ← local preview server
examples/                    ← gpu-exploded, data-center-rack, mechanical-pump
```

When adding a recipe or interaction, update the matching reference file in the
same change. The engine and the documentation are one product.
