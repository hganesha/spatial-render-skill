# Interaction Patterns

Generic, reusable interaction primitives. Declare them in `interactions` +
`behaviors`; the engine implements them. Never hand-roll bespoke animation for
something on this list.

## The inspection modes

| Mode | Behavior | Authoring notes |
|---|---|---|
| **Explode** | Components translate along their explode vectors with stagger + easing | **Assembled ⎮ Exploded** toggle, slider (snaps to `explode.stops`), key E |
| **Traces** | Dash-dot lines from each moved part back to its assembled position | `explode.traces` (default on); trimmed to run between the part's silhouettes; key T |
| **Peek** | In the assembled pose, hovering slides a part (and what rides on it) 18% out | `explode.peek`; skipped for parts whose subtree is most of the scene |
| **Local explode** | Double-click explodes only that part's sub-assembly | `explode.local`; `engine.explodeSubtree(id)`; inspect card "Explode here" |
| **X-Ray** | Outer layers fade to reveal internals | mark enclosures `"xray": "outer"` (auto-heuristic: `pump-housing`, `rack`, `server-blade`, `fan`, `duct`, large boxes) |
| **Section** | Clipping plane with **hatched caps** | `interactions.section.axis`: `x|y|z`; caps off with `scene.drawing.sectionCaps: false` |
| **Isolate** | Selected component at full opacity, rest at ~6% | requires a selection |
| **Ghost** | Same at ~22% — keeps context readable | requires a selection |
| **Flow** | Emissive pulses travel along connectors | per-connector `flow` block |
| **Measure** | Two clicks → dimension in scene units ("≈" unless fidelity is `actual`); snaps to anchors within 12 px | `interactions.measure`; key M; `engine.getMeasurements()` |
| **Select/Inspect** | Raycast pick → highlight + card with properties, parent, children and actions (Focus · Isolate · Explode here · Hide) | `properties` in the spec feed the card |

Modes compose: X-Ray + Section + Isolate are independent toggles; clipping
persists when highlight/ghost materials change.

### Assembled view behaviour

- The camera **follows the explode** (`scene.camera.followExplode`, default on):
  framing fits the parts actually on screen, so the assembled object fills the
  frame and the view widens as parts leave. Panning or zooming hands control to
  the user until Reset View (R).
- Labels whose anchors are inside the assembled object collapse into one
  "+N internal parts · explode to reveal" chip; clicking it explodes.

### Linked UI

- Hovering a part shows a tooltip and highlights its label; hovering or
  clicking a label highlights/selects its part.
- **Parts tree** (Parts button, key P): the semantic hierarchy with filter,
  click to select, double-click to focus, eye toggle to hide (runtime only —
  `engine.setComponentVisible(id, bool)`; hidden parts drop out of framing).
- Keyboard: `1 2 3` modes · `E` explode · `T` traces · `X S I G O` inspection
  modes · `M` measure · `F` focus · `[ ]` previous/next part · `P` tree ·
  `← →` tour · `R` reset · `Esc` clear · `?` help. The container is focusable and
  announces selections through an aria-live region; reduced-motion users get
  instant transitions.
- **Share links**: the exported HTML mirrors mode, camera, explode, selection,
  active modes, hidden parts/label groups and tour step into `#sd=…`
  (Export ▾ → Copy share link, `engine.shareURL()`), and restores it on load.
  Embedders opt in with `createEngine({urlState: true})`.

## Tours and assembly steps

```json
"tour": { "autoStart": false, "loop": false, "steps": [
  { "id": "cooling", "title": "Cooling stack", "caption": "Fans push air through…",
    "camera": { "azimuth": 30, "elevation": 18 }, "explode": 0.45,
    "highlight": ["fan-left", "fin-stack-left"], "modes": { "traces": true } },
  { "id": "cut", "title": "Section", "camera": "auto", "explode": 0,
    "modes": { "section": true }, "section": { "axis": "x", "position": 0.5 } },
  { "id": "drawing", "title": "As a drawing", "renderMode": "illustration" }
]}
```

- `camera`: `"auto"` (follow framing from the scene camera angle), a pose
  (`azimuth/elevation` keep auto distance; `distance`/`target` pin it) or
  `{ "focus": "componentId" }`.
- `explode`: number or per-assembly map. `highlight` emphasises parts and ghosts
  the rest. `modes`, `section`, `select`, `annotationGroups`, `renderMode` and
  `duration` (ms) are optional.
- UI: **Tour** button, caption card with prev/next/dots, ← →. API:
  `engine.tour.start() / next() / prev() / goTo(i) / stop()`.
- Scroll-driven embeds: `engine.tour.setProgress(1.5)` interpolates explode and
  camera halfway between steps 1 and 2 — call it from an IntersectionObserver or
  scroll handler.
- **Steps** button / `engine.tour.start('instructions')` plays the derived
  assembly sequence interactively (later parts hidden, new parts fly in).
  `exportInstructions()` renders the same sequence as panels.

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

`engine.setRenderMode('webgl' | 'blueprint' | 'illustration')` swaps
presentation of the same scene. Blueprint locks isometric rotation (drag pans);
Illustration is orthographic but orbitable and starts from the current 3D angle.
Zoom, selection, inspection, explode, x-ray, ghost, isolate, section, annotation
groups and connector flow remain available in all three. A natural-language
change is still a targeted spec/component patch; every renderer consumes it.
Full mode-specific guidance is in `design-grammar.md`.

## Programmatic control

```js
engine.explode(0.75, { duration: 900, stagger: true });
engine.select('impeller');        // inspect card + highlight
engine.focus('motor');            // fly camera to component
engine.toggleMode('section');
engine.setSectionAxis('z', 0.4); // plane position 0..1
engine.setAnnotationGroup('thermal', false);
engine.setCamera({ azimuth: 120, elevation: 15, distance: 400 });
engine.explodeSubtree('vapor-chamber');   // local explode
engine.setComponentVisible('fan-right', false);
engine.setAnnotationStyle('balloon'); engine.setLabelLayout('margins');
engine.tour.start(); engine.tour.goTo(2); engine.tour.setProgress(1.5);
engine.compare(previousSpec);   // diff overlay; engine.clearDiff()
engine.auditVisual();           // rendered-view audit, see quality-standards.md
```

`updateSpec(patch)` deep-merges objects and replaces arrays. Component/material
edits keep the stage and reconcile components by ID; unchanged geometry stays
intact. Use `patchComponents([{ id: "impeller", transform: { position: [0,0,20] } }])`
for targeted edits without replacing the assemblies array. Both preserve view,
selection, explode amount and annotation visibility. Stage settings (style,
lighting, background, environment, ground, projection) replace the renderer
while restoring interaction choices. Validation errors leave the scene untouched.

`await engine.exportPNG()` captures the active view with visible annotations;
UI chrome is excluded. `engine.exportSVG()` returns vector geometry in Blueprint
or Illustration mode. Figure, sheet, instruction, contact-sheet and video exports
are listed in `design-grammar.md`. Use `{ annotations: false }` to omit labels;
all export methods accept `{ download: false }` for embedding/tests.

## Interaction design rules

- Every mode must **teach something** about the object. If a toggle doesn't
  change understanding, cut it.
- Defaults: orbit+zoom on; select on for assemblies; flow only when
  connectors exist.
- The toolbar is generated from `interactions` — a diagram with 3 modes shows
  3 buttons. Don't enable modes "just in case".
