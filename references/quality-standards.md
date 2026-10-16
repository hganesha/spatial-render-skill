# Quality Standards

The evaluation loop is what separates a diagram from a 3D doodle. **Never ship
a scene you haven't seen rendered.**

## The loop

```bash
node scripts/validate-scene.mjs scene.json --strict      # 1. structural + spatial audits
node scripts/export-scene.mjs scene.json                 # 2. build self-contained HTML
node scripts/capture-scene.mjs index.html -o capture.png \
     --contact-sheet sheet.png --audit audit.json --strict  # 3. LOOK at every state + rendered-view audit
```

Step 3 is not optional. Rerun after every meaningful edit. **Look at the contact
sheet, not just the capture**: it shows 3D assembled, 50% and exploded,
Blueprint, Illustration and three more azimuths in one image, so a broken
assembled view or a back-side collision cannot hide behind a good hero shot.
`--strict` exits nonzero while the rendered-view audit has warnings.
`--mode` and `--explode` pick the pose for the hero capture.

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

Also validated: detail-view anchors (`detail:anchor`), tour step component and
assembly references (`tour:component`, `tour:assembly`; unknown label groups are
`tour:group` warnings) and `visibleWhen` ranges.

The same schema and rendered-mesh bounds audits run in-browser via
`engine.validate()`, which also returns `layout` warnings for visible annotation
collisions. `--strict` exits nonzero for unacknowledged warnings as well as errors.

## Rendered-view audit (`engine.auditVisual()`, `capture-scene --audit`)

Runs at the assembled and exploded poses (or `{explode: [..]}`) in the current
view and returns `{results: [{metrics, issues}], summary}`:

| Code | Meaning | Usual fix |
|---|---|---|
| `frame:underfilled` | subject spans < 50% of the frame | check stray parts / huge explode vectors; `framing: "fit"` |
| `frame:clipped` | part of the subject is outside the frame | camera angle, or pinned `distance` too small |
| `label:over-geometry` | ≥ 50% of a label's area sits on the subject | larger `offset`, `side`, or `labelLayout: "margins"` |
| `label:offscreen` | label box clipped by the frame | offset toward the centre |
| `annotation:overlap` / `annotation:overflow` | labels collide / text exceeds its card | offsets; shorter text |
| `annotation:leader-cross` | two leaders cross | swap sides or use margins layout |
| `annotation:displaced` | collision avoidance pushed a label far from its offset | give it its own space |
| `part:unlabeled-emissive` | small emissive part with no label in its parent chain | label it, or make it ride with its host part |
| `part:stranded` | a part sits far from every other part | shorten its explode vector |
| `label:collapsed` (info) | internal labels folded into the summary chip | expected when assembled |

Metrics include `frameFill` and `subjectRect`. Audits are view-dependent: run
them at the camera the reader will see (Reset View first).

## Revisions

`node scripts/scene-diff.mjs before.json after.json [--json] [--html diff.html]`
lists added/removed/moved/changed components, annotations, connectors,
materials and scene fields by id (exit 1 when different). The HTML viewer — or
`engine.compare(previousSpec)` live — tints added parts green, moved/changed
amber with a trace from the old position, and shows removed parts as red ghosts.
Live edits keep the comparison base, so the overlay updates as you patch.

Overlaps use conservative per-mesh boxes, not triangle/solid collision tests.
Hollow geometry is bounded by patches instead of one box: loft shells by
ring×arc patches, revolved parts (tyres, discs, cups) by angular sectors, tubes by
path chunks — each patch still encloses its solid, it just excludes the hollow
interior, so an engine inside a body shell or a disc inside a wheel is not a
false collision. Diagonal tubes beside thin panel edges can still trip the box
test; verify the clearance and record it as an exception.
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

### Assembled view
- [ ] Assembled pose fills the frame (contact sheet panel 1), not a speck
- [ ] Internal labels collapse into the chip; visible labels sit beside, not on, the object
- [ ] Hover peek moves a sensible sub-assembly; double-click explodes the right subtree
- [ ] Assembly steps (Steps button) read in a plausible build order

### Publication output
- [ ] Illustration: silhouettes heavier than creases; no grey "mesh soup"
- [ ] Balloons + margins: leaders don't cross the subject or each other; parts list does not cover the drawing
- [ ] Section caps hatched where solids are cut; labels of cut-away parts gone
- [ ] Journal export at the intended column width keeps labels ≥ 6 pt

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
2. the contact sheet passes the checklist above and `capture-scene --audit --strict`
   reports zero rendered-view warnings at the reader's camera,
3. a domain reader would recognize the object and its assembly logic in <5 s,
4. the scene.json is clean enough for another agent to edit without regenerating.

## Known limits (be honest about them)

- WebGL is raster; vector SVG/PDF export requires Blueprint or Illustration mode.
- The vector modes are illustrations: approximate painter ordering for intersecting
  faces, authored dimension strings, no certified drawing scale. Hidden lines are
  drawn for every feature edge (no per-edge visibility solve). Section caps need
  closed meshes; open recipe surfaces get none.
- SVG text uses font families, not outlines. Video export is WebM only.
- Check Blueprint and 3D after live edits; verify the mode switch preserves
  explode/selection, isometric axes stay at 30°, and exported SVG contains paths.
- `fidelity: representative` means representative — say so in `metadata.notes`.
- Physics (drops, collisions) is out of scope; collisions are audited, not
  simulated.
- External CAD/GLB/glTF import and non-explode scheduled behaviors are not
  implemented; the schema/runtime reject them explicitly.
- Bounds are conservative and do not certify mechanical fit, bores, thermal
  performance or collision-free intermediate motion.
