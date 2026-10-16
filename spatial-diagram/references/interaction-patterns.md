# Interaction Patterns

Generic, reusable interaction primitives. Declare them in `interactions` +
`behaviors`; the engine implements them. Never hand-roll bespoke animation for
something on this list.

## The inspection modes

| Mode | Behavior | Authoring notes |
|---|---|---|
| **Explode** | Components translate along their explode vectors with stagger + easing | slider + Auto toggle built in |
| **X-Ray** | Outer layers fade to reveal internals | mark enclosures `"xray": "outer"` (auto-heuristic: `pump-housing`, `rack`, `server-blade`, `fan`, `duct`, large boxes) |
| **Section** | Clipping plane through the scene; no capped cut faces | `interactions.section.axis`: `x|y|z` |
| **Isolate** | Selected component at full opacity, rest at ~6% | requires a selection |
| **Ghost** | Same at ~22% — keeps context readable | requires a selection |
| **Flow** | Emissive pulses travel along connectors | per-connector `flow` block |
| **Select/Inspect** | Raycast pick → highlight + semantic info card | `properties` in the spec feed the card |

Modes compose: X-Ray + Section + Isolate are independent toggles; clipping
persists when highlight/ghost materials change. Appearance toggles apply
immediately; explode motion and connector pulses animate per frame.

## Behaviors

```json
"behaviors": [
  { "type": "explode", "assembly": "gpu-module", "amount": 0.72,
    "stagger": true, "duration": 2200, "easing": "ease-in-out", "autoPlay": true }
]
```

Scheduled behavior type: `explode`. Other types are rejected until implemented.
Connector flow animation is configured by `connectors[].flow`; it is not a
scheduled behavior.
- `autoPlay: true` runs on load — use it to *preview the story* (start the
  diagram mid-explode), not to annoy.
- `stagger: true` sequences by hierarchy depth or explicit `explode.order`.
- Easings: `ease-in-out` (default), `ease-out`, `back-out` (playful), `linear`.

## Connectors and flow

```json
{
  "id": "net-1",
  "from": { "anchor": "server-1.front" },
  "to":   { "anchor": "tor-cage" },
  "geometry": { "kind": "cable", "radius": 3, "sag": 60, "style": "flow" },
  "material": "cable-cyan",
  "flow": { "enabled": true, "speed": 1.2, "direction": "from-to", "color": "#3ce0ff" }
}
```

- `kind`: `cable | pipe | bus | line | arrow` — the tube radius and default
  behavior change; `arrow` adds a directional head.
- `sag` droops the mid point (cables hang); `via` gives explicit control points
  for routing around obstacles.
- Endpoints are **anchors** (`"componentId.anchorName"` or `"componentId"` for
  centroid) or absolute `position`. Prefer anchors — they follow explode.
- Flow pulses = moving emissive spheres along the same curve. `speed` is
  relative; `direction: to-from` reverses. Flow means **energy/data/material
  movement** — don't animate decoration.

## Semantic zoom (composition pattern)

For deep systems, stack scenes rather than overloading one:
1. Scene A: the rack as one object.
2. Scene B: inside the rack — servers as components.
3. Scene C: inside a server — GPU module.
Each level is its own Scene Spec; the same engine renders all of them. A
resolver layer (outside this skill) can pick the level. Within one scene, the
`ghost`/`isolate` modes are the poor-man's zoom.

## Render mode switch

`engine.setRenderMode('blueprint')` or `engine.setRenderMode('webgl')` swaps
presentation of the same scene. Blueprint locks isometric rotation; drag pans
instead. Zoom, selection, inspection, explode, x-ray, ghost, isolate, section,
annotation groups and connector flow remain available. A natural-language
change is still a targeted spec/component patch; both renderers consume it.
The old 3D camera returns when switching back. Render mode is saved in JSON.
Use `scene.renderMode: "blueprint"` to start there. Full mode-specific guidance
and vector fidelity limits are in `design-grammar.md`.

## Programmatic control

```js
engine.explode(0.75, { duration: 900, stagger: true });
engine.select('impeller');        // inspect card + highlight
engine.focus('motor');            // fly camera to component
engine.toggleMode('section');
engine.setSectionAxis('z', 0.4); // plane position 0..1
engine.setAnnotationGroup('thermal', false);
engine.setCamera({ azimuth: 120, elevation: 15, distance: 400 });
```

`updateSpec(patch)` deep-merges objects and replaces arrays. Component/material
edits keep the stage and reconcile components by ID; unchanged geometry stays
intact. Use `patchComponents([{ id: "impeller", transform: { position: [0,0,20] } }])`
for targeted edits without replacing the assemblies array. Both preserve view,
selection, explode amount and annotation visibility. Stage settings (style,
lighting, background, environment, ground, projection) replace the renderer
while restoring interaction choices. Validation errors leave the scene untouched.

`await engine.exportPNG()` captures the active WebGL or blueprint image with
visible annotations. UI chrome is excluded. `engine.exportSVG()` returns actual
vector geometry in Blueprint mode. Use `{ annotations: false }` to omit labels;
all export methods accept `{ download: false }` for embedding/tests.

## Interaction design rules

- Every mode must **teach something** about the object. If a toggle doesn't
  change understanding, cut it.
- Defaults: orbit+zoom on; select on for assemblies; flow only when
  connectors exist.
- The toolbar is generated from `interactions` — a diagram with 3 modes shows
  3 buttons. Don't enable modes "just in case".
