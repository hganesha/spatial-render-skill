# Quality Standards

The evaluation loop is what separates a diagram from a 3D doodle. **Never ship
a scene you haven't seen rendered.**

## The loop

```bash
node scripts/validate-scene.mjs scene.json --strict      # 1. structural + spatial audits
node scripts/export-scene.mjs scene.json        # 2. build self-contained HTML
node scripts/capture-scene.mjs index.html -o capture.png --wait 4500   # 3. LOOK at it
```

Step 3 is not optional. Rerun after every meaningful edit.

## Automated audits (validate-scene.mjs)

**Errors — always fix:**
- `component:dup` / `assembly:dup` — duplicate ids
- `parent:missing` / `parent:cycle` — broken hierarchy references
- `geometry:size|radius|nan` — degenerate geometry
- `connector:anchor` / `annotation:anchor` — dangling references
- `annotation:dimension` — dimension without `targetB`

**Warnings — fix unless you can justify:**
- `audit:intersecting` — siblings overlap >35% of the smaller part. Attachments
  touch; parts must not pass through each other. (Parent-child contact is fine.)
- `audit:detached` — child sits far from its parent. Either reposition, reparent
  to the part it actually touches, or drop the parent claim.
- `audit:out-of-frame` — only fires when camera is pinned (`manual`/`distance`);
  the auto-framed case reports `audit:camera-auto` as a note.

**Notes:** `audit:summary` (component/part counts, bounds radius) and
`audit:explode-derived` (no explicit vectors — engine derived them).

The same schema and rendered-mesh bounds audits run in-browser via
`engine.validate()`, which also returns `layout` warnings for visible annotation
collisions. The CLI cannot assess a live label layout. `--strict` exits nonzero
for unacknowledged warnings as well as errors.

Overlaps use conservative per-mesh boxes, not triangle/solid collision tests.
Document verified intentional envelope/contact exceptions by exact component
pair and reason in metadata; never use exceptions to conceal an unexplained
collision. Parent-child intersections are treated as attachment contact, not
proof of correct clearance.

## Visual review checklist (from the capture)

### Framing
- [ ] Subject fills 60–75% of frame; no large dead zones
- [ ] Exploded parts stay in frame at the resting explode amount
- [ ] Camera angle shows the *story* (insertion axis visible, labels' side clear)
- [ ] Ground shadow anchors the object; nothing floats unmoored

### Geometry
- [ ] No interpenetration (the "mesh soup" test: can you trace each part's outline?)
- [ ] No detached components (assembled state forms coherent objects)
- [ ] Contact surfaces actually touch (gaskets between faces, screws in holes)
- [ ] Silhouettes read at a glance: casing looks like a casing, a fan like a fan

### Explode
- [ ] Motion vectors explain assembly/disassembly logic
- [ ] Columns stay aligned; no part drifts laterally into another's lane
- [ ] Stagger reads as sequence (fasteners → covers → internals), not confetti
- [ ] Assembled ↔ exploded transitions don't pass parts *through* each other

### Annotations
- [ ] Labels attached to the right anchors and track them (orbit the view live)
- [ ] No labels obscuring the subject; no labels stacked on each other
- [ ] Occlusion dimming behaves: readable labels not falsely dimmed
- [ ] Spelling, units, and terminology are correct and consistent
- [ ] Dimension lines run along the object, values match spec
- [ ] ≤ 1 `primary` emphasis; groups map to story threads

### Materials & light
- [ ] Metals read as metal (highlights move when you orbit)
- [ ] Dark-on-dark parts have rim separation
- [ ] Emissive colors used only for energy/data/status
- [ ] No blown-out whites; no crushed blacks on meaningful detail

### Interaction (test in-page or via engine API)
- [ ] Select → correct highlight + inspect card with meaningful properties
- [ ] X-Ray reveals what it should (mark enclosures `xray: outer`)
- [ ] Section plane cuts cleanly; no inverted clipping
- [ ] Flow pulses travel the right direction
- [ ] Reset View returns to the framed pose
- [ ] Resize the window: anchors still align and labels remain readable
- [ ] Combine Section with X-Ray/selection: clipping remains active
- [ ] Apply a component patch: view/selection persist and connectors follow
- [ ] PNG includes labels and dimensions; it excludes toolbar/inspect chrome

## Scoring bar

A diagram is **done** when:
1. `validate-scene.mjs` reports zero errors and zero unexplained warnings,
2. the capture passes the checklist above,
3. a domain reader would recognize the object and its assembly logic in <5 s,
4. the scene.json is clean enough for another agent to edit without regenerating.

## Known limits (be honest about them)

- WebGL is raster; vector SVG geometry export requires Blueprint mode.
- Blueprint is an illustration: approximate painter ordering for intersecting
  faces, authored dimension strings, no certified drawing scale or capped cuts.
- Check Blueprint and 3D after live edits; verify the mode switch preserves
  explode/selection, isometric axes stay at 30°, and exported SVG contains paths.
- `fidelity: representative` means representative — say so in `metadata.notes`.
- Physics (drops, collisions) is out of scope; collisions are audited, not
  simulated.
- External CAD/GLB/glTF import and non-explode scheduled behaviors are not
  implemented; the schema/runtime reject them explicitly.
- Section planes do not generate capped cut faces.
- Bounds are conservative and do not certify mechanical fit, bores, thermal
  performance or collision-free intermediate motion.
