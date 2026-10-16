# Assembly Rules

How to author assemblies, transforms, parents, and explode behavior so diagrams
stay predictable and editable.

## Transform semantics (normative)

- `component.transform` is authored in **assembly space** — the assembly
  group's local frame. The object graph is deliberately flat:
  `root → assembly group → component group → part meshes`.
- `component.parent` is **semantic**. It drives:
  1. explode-direction derivation (child flies away from parent),
  2. the inspect tree (`inspect()` reports `parent`),
  3. detach audits (child should touch or overlap its parent).
  It does **not** rescale, re-orient, or re-parent the child's transform.
- Assembly-level `transform` offsets every component in that assembly.
- Rotations use Three.js intrinsic Euler XYZ in degrees.

Why flat? Agents author coordinates in one consistent frame; a wrong parent
can never silently double-transform geometry. Hierarchical motion is expressed
through explicit transforms and explode vectors instead.

## Anatomy of a good assembly

```json
{
  "id": "pump-module",
  "label": "Pump Assembly",
  "explode": { "direction": [0, 0, 1], "distance": 90, "order": "hierarchy" },
  "components": [ … ]
}
```

- `explode.direction/distance` = fallback for children without explicit vectors.
- `order`: `hierarchy` (depth-based stagger) is the default; use explicit
  per-component `explode.order` when the reveal sequence is special.

## Authoring explode

Every component that should move gets an explicit `explode` vector (displacement
at amount = 1):

```json
"explode": [0, 112, -10]          // array form
"explode": { "direction": [0,1,0], "distance": 120, "order": 3 }  // object form
```

Good explosions *explain* the assembly:
- **Fasteners and outer covers first** (lowest order leaves first), radially out.
- For a contacting stack, assign explicit orders from the top cover inward.
  The hierarchy fallback can move a lower layer through a still-closed cover.
- **Covers/gaskets** along the opening axis (+Z toward the viewer is classic).
- **Internals** along the insertion axis (impeller out the front, shaft along
  its own axis, cards out of slots).
- **Cables/connectors** bend away from their ports.
- Keep columns of parts aligned with their assembled positions — a part that
  drifts sideways reads as "broken", not "exploded".

Guideline magnitudes: minor parts 30–80 units, sub-assemblies 100–200,
outer shells 150–350, for typical scene radius 150–400. Auto-framing follows the
pose on screen (`scene.camera.followExplode`, default on): the assembled object is
framed tightly and the camera widens as parts leave. One part with a huge vector
still sets the zoom of the whole exploded view — `part:stranded` in the visual
audit catches it. Small decorative parts (badges, LEDs) should ride with the part
they sit on (copy its vector) rather than fly off unlabeled
(`part:unlabeled-emissive`).

Derived vectors (fallback only): away from parent's position, or assembly
`explode.direction`. Author explicitly whenever the derived direction would be
wrong (e.g. radial fastener patterns).

## What the explode order also drives

The same semantics feed four features, so get them right once:

- **Stagger** — lower `explode.order` leaves first.
- **Assembly instructions** (`engine.instructionSteps()`, **Steps** button,
  `exportInstructions()`): parts with a zero vector are the base (step 1); the
  rest are installed in *reverse* explode order, at most six per step. If the
  steps read wrongly, the explode order is wrong.
- **Local explode** (double-click, `engine.explodeSubtree(id)`): separates the
  semantic descendants of a part (or of its parent, for a leaf). Parent links
  therefore decide what comes apart together.
- **Peek** (hover in the assembled pose): slides the part *and its descendants*
  18% along its vector. Parts whose subtree is most of the scene do not peek.

## Contact discipline

- Assembled parts should **touch or slightly overlap at attachments**, not
  interpenetrate through each other. The audit flags overlap > 35% of
  a smaller mesh bound and parent-child gaps > ~12% of scene radius. Mesh bounds
  are conservative: hollow parts can overlap in bounding boxes without colliding.
  If verified intentional, record an exact pair and reason in
  `metadata.auditExceptions` (code `audit:intersecting`, `components: [idA,idB]`,
  `reason`). This produces an explicit acknowledged note, not a clearance claim.
- Fasteners: shaft embedded in the joint, head proud of the surface.
- Thermal pads/gaskets: thin, exactly between the mating faces.

## Parent selection

Parent to the part that *explains the motion*:
- heatsink → gpu (it came off the GPU)
- screws → the cover they hold
- impeller → housing (it comes out of the housing)
- motor → coupling (drive train narrative) or baseplate (structure narrative)
  — pick one story and stay consistent.

## Multi-assembly scenes

Assemblies are the unit of explode (`behaviors[].assembly`) and of visual
grouping. For systems diagrams, prefer one assembly for the structure
(`rack`) and connectors between components over nested assemblies.

## Stability

Ids are API. Never rename a component id during revision — downstream
annotations, connectors, saved states, and `updateSpec` patches reference them.
