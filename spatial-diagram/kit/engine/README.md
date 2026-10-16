# Engine modules

Deterministic runtime for Scene Specs. No agent logic lives here — this is the
reliability half of the product.

| Module | Responsibility |
|---|---|
| `spec-math.js` | pure-JS spec math: transforms, AABBs, camera projection, explode vectors, `validateSceneSpec`, `auditScene` (no external dependencies; CLI and engine inject bounds from the real geometry builders) |
| `schema-data.js` / `schema-validation.js` | generated Scene Schema and offline evaluator for its JSON Schema vocabulary |
| `materials.js` | presets, finishes, procedural textures (pcb-traces, brushed, vents, carbon, knurl) |
| `geometry.js` | Level-1 primitives + Level-2 recipes → part lists |
| `assembly.js` | object hierarchy, explode interpolation, bounds, anchors |
| `annotations.js` | SVG overlay projected from 3D anchors (labels, dimensions, leaders, occlusion dimming) |
| `interactions.js` | orbit rig, raycast picking, mode state machine (xray/section/isolate/ghost/flow) |
| `renderer.js` | WebGL stage: switchable cameras, lighting, ground, tone mapping |
| `blueprint.js` | vector isometric faces/feature edges/silhouettes, drawing sheet, connectors and SVG serialization |
| `ui.js` | title plate, toolbar, inspect card, legend, toasts |
| `scene-compiler.js` | spec → materials + geometry parts bridge |
| `index.js` | `createEngine()` public API |

## Entry

```js
import { createEngine } from 'kit/engine/index.js';
const engine = createEngine({ THREE, container, spec, onEvent });
```

`THREE` is injected (any r1xx build with `MeshStandardMaterial`,
`TubeGeometry`, `ClippingPlane`, `WebGLRenderer`). The bundled export inlines a
pinned Three.js r147 and the GLTFExporter.

## Module style contract (bundling)

`scripts/export-scene.mjs` naively concatenates these files into one IIFE. To
keep that working:

1. **Single-line named imports** from `./sibling.js` only:
   `import { foo, bar } from './spec-math.js';`
2. **`export function|const|class`** declarations only — no default exports,
   no `export { a, b }` re-export blocks.
3. **Unique top-level names** across ALL modules (shared scope when bundled).
4. No imports from `three` — receive `THREE` via factory parameter.

Violating these breaks the self-contained HTML build. The export script strips
imports/exports mechanically; it is not a real bundler.

## Edits and bounds

Component groups are reconciled by ID; unchanged geometry is retained. Geometry
or material changes replace only the affected component meshes. Mode controller
snapshots restore base materials before reconciliation; replaced GPU resources
and connector geometry are disposed. Stage settings can require a new renderer.

`geometry.partBounds(def)` derives local per-mesh bounds from actual built
vertices and caches them. `engine.validate()` and `scripts/scene-validation.mjs`
pass this resolver to `auditScene(spec, { partBounds })`. Calling the pure
`geometryAABB` helper directly supplies only approximate spec-level bounds.
Parent/component transforms compose in sequence with Three-compatible Euler XYZ
semantics. Compound transforms are baked into vertices, preserving nested
rotation and nonuniform scaling exactly.

The bundled schema evaluator implements the keywords used in scene.schema.json;
it is not a general-purpose JSON Schema package. Extend it when adding a new
schema keyword, then regenerate schema-data.js and run the regression suite.
