# Spatial Diagram

**A reusable 3D diagramming capability for agents** — not another
graphics-generation prompt. Agents describe *what exists and how it behaves* in
a declarative **Scene Spec**; the engine handles geometry, rendering,
annotations, and interaction.

- **Foundation:** shared Three.js scene graph with WebGL and vector SVG renderers
- **Contract:** JSON Scene Spec (`schemas/scene.schema.json`) — structured,
  editable, agent-to-agent
- **Annotations:** SVG projected from 3D anchors (labels, dimensions, callouts)
- **Output:** interactive self-contained HTML · PNG · blueprint SVG · GLB · scene JSON

## Quick start

```bash
# validate a scene (zero dependencies)
node scripts/validate-scene.mjs examples/gpu-exploded/scene.json

# build a self-contained interactive HTML (Three.js + runtime + spec inlined)
node scripts/export-scene.mjs examples/gpu-exploded/scene.json

# screenshot for the evaluation loop (needs: npm i puppeteer)
node scripts/capture-scene.mjs examples/gpu-exploded/index.html -o shot.png

# local preview server
node scripts/serve.mjs . --port 8080
```

The built `examples/*/index.html` files run from `file://` with no network.

## Examples (the reusability proof)

| Scene | Domain | Proves |
|---|---|---|
| `examples/gpu-exploded` | compute hardware | 38-component exploded assembly, separate package layers, materials, dimensions |
| `examples/data-center-rack` | data center | systems topology, connectors + animated flow |
| `examples/mechanical-pump` | rotating equipment | *different object, same engine* — the second-scene test |

Same schema, same recipe library, same interaction vocabulary, same validation
pipeline for all three.

## Architecture

```
AGENT INTENT
     │
     ▼
SKILL.md + references/            ← how to think in diagrams
     │
     ▼
SCENE SPEC  (schemas/)            ← what exists · assembled how · behaves how
     │
     ▼
ENGINE (kit/engine/)              ← geometry · materials · assembly ·
     │                              annotations · interactions · renderer
     ▼
RENDER + OVERLAY                  ← WebGL or isometric blueprint SVG + annotations
     │
     ▼
VALIDATE & EXPORT                 ← audits · HTML · PNG · SVG · GLB · JSON
```

The **engine provides reliability**; the **skill provides composition**. Any
agent can target the spec without knowing Three.js.

## Design decisions

1. **Scene Spec is the product.** Rendering technology is replaceable; the
   spec decouples agent reasoning from it.
2. **One geometry model, two renderers.** Shaded WebGL or architectural SVG
   blueprint, with annotations projected through the active camera.
3. **Exploded assembly is a native capability** (hierarchy + explode vectors +
   staggered interpolation), not bespoke animation code.
4. **Semantic identity + fidelity contract.** Every component has a stable id
   and properties; every scene declares `actual | representative | schematic |
   illustrative`.
5. **Three geometry levels**: primitives → parametric recipes (30+) → bounded
   compounds — so diagrams don't degrade into boxes-of-boxes.
6. **Engine/skill separation** — the runtime is deterministic and agent-agnostic.

## Repo map

```
SKILL.md                  agent workflow & hard rules
references/               design grammar · geometry · assembly · interactions · quality
schemas/scene.schema.json Scene Spec contract
kit/engine/               runtime modules (ES modules; bundled for export)
kit/vendor/               pinned Three.js r147 + GLTFExporter (MIT)
scripts/                  validate · export · capture · serve
examples/                 three domains, one engine
```

## Validation and regression tests

```bash
npm test
node scripts/validate-scene.mjs --all --strict
npm run test:browser -- --out /absolute/path/to/a/separate/test-folder
npm run test:blueprint -- --out /absolute/path/to/a/separate/blueprint-test-folder
```

The browser suite uses Puppeteer; set `PUPPETEER_EXECUTABLE_PATH` when its cached
browser is unavailable. Capture also accepts `--browser-path` and can fall back
to installed Chrome on macOS or Playwright. Browser exceptions fail capture.

Schema validation runs offline in both the engine and CLI. After editing
`schemas/scene.schema.json`, run `npm run sync-schema`; the regression suite
checks the generated runtime schema for drift. Geometry audits use the same
recipe builders as rendering and conservative bounds per mesh, not CAD solids.

Live component/material/annotation edits reconcile the existing stage.
`patchComponents([{ id, ...changes }])` is the ID-based convenience API.
`updateSpec` replaces arrays; stage-level changes still require a new renderer
and preserve interaction state. `engine.setRenderMode('blueprint')` switches
renderer without replacing the canvas or component meshes; the toolbar offers
**3D / Blueprint**. Blueprint uses fixed, equal-scale orthographic isometry;
drag pans and wheel/pinch zooms. Set `scene.renderMode: "blueprint"` for startup.
Switching back restores the previous 3D camera. Selection, explode and annotation
choices persist. Component edits affect both views.

`engine.exportSVG()` returns vector blueprint geometry, connectors and labels.
It requires Blueprint mode; the **SVG** button appears there. The PNG API is
asynchronous and captures the active render mode: `await engine.exportPNG()`.
Use `{ annotations: false }` to omit labels, or `{ download: false }` to return
data without downloading. JSON preserves the selected render mode. Blueprint
is an illustration renderer with painter-sorted faces, not a CAD hidden-line
solver; intersecting surfaces can be ambiguous and clipping cuts are uncapped.
SVG appearance uses linework rather than photorealistic material finishes.

External mesh import and scheduled rotate/slide/reveal/highlight/pulse/flow
behaviors are unsupported and rejected. Connector flow pulses are supported.
Section uses uncapped clipping planes.

## Extending

- **New canonical part?** Add a recipe in `kit/engine/geometry.js`, document it
  in `references/geometry-guidelines.md`.
- **New interaction?** Add a mode in `kit/engine/interactions.js`, document it
  in `references/interaction-patterns.md`.
- **New domain?** Write a domain asset pack as a scene + a named material set.
  The geometry engine stays domain-agnostic.

Module style contract for the bundler (see `kit/engine/README.md`): single-line
named imports from `./sibling.js`, `export function/const/class` only, unique
top-level names.
