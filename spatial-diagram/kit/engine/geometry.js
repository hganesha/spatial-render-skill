// geometry.js — geometry builders: Level-1 primitives and Level-2 parametric recipes.
// Every builder returns {kind:'compound', parts:[...]} or {kind:'single', geometry}.
// Parts: { geometry, position, rotation, scale, material, name }.
// geometry.userData.auditGroups = [[[firstVertex, endVertex], ...], ...] — each group is a
// list of vertex ranges bounded as one box — lets audits bound hollow shells, rings
// and tubes by conservative patches instead of one box that swallows their interior.
import { createVehicleRecipes } from './recipes-vehicle.js';

function part(geometry, opts) {
  opts = opts || {};
  return {
    geometry,
    position: opts.position || [0, 0, 0],
    rotation: opts.rotation || [0, 0, 0],
    scale: opts.scale || [1, 1, 1],
    material: opts.material || null,
    name: opts.name || null
  };
}

function roundedRectShape(THREE, w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2 - 0.01, h / 2 - 0.01);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

export function createGeometrySystem(THREE) {

  function single(geometry) { return { kind: 'single', geometry }; }
  function compound(parts) { return { kind: 'compound', parts }; }

  // ------------------------------------------------------------ primitives
  function buildBox(g) {
    const s = g.size || [10, 10, 10];
    return single(new THREE.BoxGeometry(s[0], s[1], s[2]));
  }

  function buildChamferBox(g) {
    const s = g.size || [10, 10, 10];
    const r = Math.max(0, Math.min(g.radius ?? Math.min(...s)*0.06, Math.min(...s)*0.45));
    const shape = roundedRectShape(THREE, s[0]-r*2, s[1]-r*2, r*0.35);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: s[2] - r * 2, bevelEnabled: true, bevelThickness: r, bevelSize: r,
      bevelSegments: 2, curveSegments: 4
    });
    geo.translate(0, 0, -(s[2] - r * 2) / 2);
    return single(geo);
  }

  function buildRoundedBox(g) {
    const s = g.size || [10, 10, 10];
    const r = Math.max(0, Math.min(g.radius ?? Math.min(...s)*0.18, Math.min(...s)*0.45));
    const shape = roundedRectShape(THREE, s[0] - r * 2, s[1] - r * 2, r * 0.9);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: s[2] - r * 2, bevelEnabled: true, bevelThickness: r, bevelSize: r,
      bevelSegments: 3, curveSegments: 6
    });
    geo.translate(0, 0, -(s[2] - r * 2) / 2);
    return single(geo);
  }

  function buildCylinder(g) {
    const rt = g.radiusTop != null ? g.radiusTop : (g.radius != null ? g.radius : 5);
    const rb = g.radiusBottom != null ? g.radiusBottom : (g.radius != null ? g.radius : 5);
    const h = g.height != null ? g.height : 10;
    return single(new THREE.CylinderGeometry(rt, rb, h, g.segments || 28, 1, false));
  }

  function buildCone(g) {
    const r = g.radius != null ? g.radius : 5;
    return single(new THREE.ConeGeometry(r, g.height != null ? g.height : 10, g.segments || 24));
  }

  function buildSphere(g) {
    return single(new THREE.SphereGeometry(g.radius != null ? g.radius : 5, g.segments || 28, g.segments ? Math.max(8, g.segments / 2) : 18));
  }

  function buildTorus(g) {
    const R = g.radius != null ? g.radius : 10;
    const t = g.tube != null ? g.tube : 2;
    const arc = g.arc != null ? (g.arc * Math.PI / 180) : Math.PI * 2;
    return single(new THREE.TorusGeometry(R, t, 12, Math.max(16, g.segments || 32), arc));
  }

  function buildPlane(g) {
    const geo = new THREE.PlaneGeometry(g.width != null ? g.width : 10, g.depth != null ? g.depth : 10);
    geo.rotateX(-Math.PI / 2);
    return single(geo);
  }

  function buildExtrude(g) {
    const pts = g.profile || [[-5, -5, 0], [5, -5, 0], [5, 5, 0], [-5, 5, 0]];
    const shape = new THREE.Shape();
    pts.forEach((p, i) => (i === 0 ? shape.moveTo(p[0], p[1]) : shape.lineTo(p[0], p[1])));
    shape.closePath();
    const bevel = g.bevel || 0;
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: g.depth != null ? g.depth : 5,
      bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 8
    });
    return single(geo);
  }

  function buildLathe(g) {
    const pts = (g.profile || [[2, 0, 0], [5, 0, 0], [5, 10, 0], [2, 10, 0]]).map((p) => new THREE.Vector2(Math.abs(p[0]), p[1]));
    const segments = g.segments || 28, geo = new THREE.LatheGeometry(pts, segments);
    geo.userData.auditGroups = chunkRanges(segments + 1, pts.length, Math.max(1, Math.round(segments / 24)));
    return single(geo);
  }

  function buildTube(g) {
    const path = new THREE.CatmullRomCurve3((g.path || [[0, 0, 0], [0, 10, 0]]).map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    const segments = g.segments || 32, geo = new THREE.TubeGeometry(path, segments, g.radius != null ? g.radius : 1, 10, false);
    geo.userData.auditGroups = chunkRanges(segments + 1, 11, Math.max(1, Math.round(segments / 16)));
    return single(geo);
  }

  // Groups covering `rings` consecutive rings of `perRing` vertices, `step` rings each (overlapping by one).
  function chunkRanges(rings, perRing, step) {
    const out = [];
    for (let i = 0; i < rings - 1; i += step) out.push([[i * perRing, Math.min(rings, i + step + 1) * perRing]]);
    return out.length ? out : [[[0, rings * perRing]]];
  }

  // Concatenate indexed/non-indexed geometries (position, normal, uv); audit groups are re-based.
  function mergeGeometries(list) {
    const positions = [], normals = [], uvs = [], indices = [], groups = [];
    let offset = 0;
    for (const geo of list) {
      const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal'), uv = geo.getAttribute('uv');
      for (let i = 0; i < pos.count; i++) {
        positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        normals.push(nor ? nor.getX(i) : 0, nor ? nor.getY(i) : 1, nor ? nor.getZ(i) : 0);
        uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      }
      if (geo.index) for (let i = 0; i < geo.index.count; i++) indices.push(geo.index.getX(i) + offset);
      else for (let i = 0; i < pos.count; i++) indices.push(i + offset);
      for (const group of geo.userData.auditGroups || [[[0, pos.count]]]) groups.push(group.map(([a, b]) => [a + offset, b + offset]));
      offset += pos.count;
      geo.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    out.setIndex(indices);
    out.userData.auditGroups = groups;
    return out;
  }

  // Grid surface from rows of points; every triangle is wound so its normal agrees
  // with expected(i, j) (an outward hint), which keeps arbitrary profiles closed and visible.
  function gridSurface(rows, expected, opts = {}) {
    const rowCount = rows.length, colCount = rows[0].length, positions = [], uvs = [], indices = [];
    rows.forEach((row, i) => row.forEach((p, j) => {positions.push(p[0], p[1], p[2]);uvs.push(j / Math.max(1, colCount - 1), i / Math.max(1, rowCount - 1));}));
    const at = (i, j) => i * colCount + j, v = k => new THREE.Vector3(positions[k * 3], positions[k * 3 + 1], positions[k * 3 + 2]);
    const add = (a, b, c, hint) => {
      const n = new THREE.Vector3().subVectors(v(b), v(a)).cross(new THREE.Vector3().subVectors(v(c), v(a)));
      if (n.lengthSq() < 1e-14) return;
      if (n.dot(hint) < 0) indices.push(a, c, b); else indices.push(a, b, c);
    };
    const cols = opts.wrap ? colCount : colCount - 1;
    for (let i = 0; i < rowCount - 1; i++) for (let j = 0; j < cols; j++) {
      const j1 = (j + 1) % colCount, hint = expected(i, j);
      add(at(i, j), at(i, j1), at(i + 1, j), hint);
      add(at(i, j1), at(i + 1, j1), at(i + 1, j), hint);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);geo.computeVertexNormals();
    geo.userData.auditGroups = opts.groups || [[[0, rowCount * colCount]]];
    return geo;
  }

  // Revolve a 2D profile [[r, y], ...] around +Y. closed: profile is a loop (solid ring);
  // smooth:false gives each profile edge its own normals (crisp discs, rims, cups).
  function revolveProfile(profile, segments = 32, opts = {}) {
    const pts = profile.map(p => [Math.max(0, p[0]), p[1]]);
    const closed = opts.closed !== false;
    if (closed && (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1])) pts.push(pts[0].slice());
    let area = 0;for (let i = 0; i < pts.length - 1; i++) area += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
    const sign = area >= 0 ? 1 : -1;
    const ring = (r, y, i) => {const a = i / segments * Math.PI * 2;return [r * Math.cos(a), y, r * Math.sin(a)];};
    const hintFor = (j0, j1, i) => {
      const dr = pts[j1][0] - pts[j0][0], dy = pts[j1][1] - pts[j0][1], a = (i + .5) / segments * Math.PI * 2;
      const nr = sign * dy, ny = -sign * dr;
      return new THREE.Vector3(nr * Math.cos(a), ny, nr * Math.sin(a));
    };
    const strips = [];
    if (opts.smooth) {
      const rows = [];
      for (let i = 0; i <= segments; i++) rows.push(pts.map(p => ring(p[0], p[1], i)));
      strips.push(gridSurface(rows, (i, j) => hintFor(j, Math.min(j + 1, pts.length - 1), i), {groups: chunkRanges(segments + 1, pts.length, Math.max(1, Math.round(segments / 32)))}));
    } else {
      for (let j = 0; j < pts.length - 1; j++) {
        if (Math.hypot(pts[j + 1][0] - pts[j][0], pts[j + 1][1] - pts[j][1]) < 1e-9) continue;
        const rows = [];
        for (let i = 0; i <= segments; i++) rows.push([ring(pts[j][0], pts[j][1], i), ring(pts[j + 1][0], pts[j + 1][1], i)]);
        strips.push(gridSurface(rows, i => hintFor(j, j + 1, i), {groups: chunkRanges(segments + 1, 2, Math.max(1, Math.round(segments / 32)))}));
      }
    }
    return strips.length === 1 ? strips[0] : mergeGeometries(strips);
  }

  // Cylinder whose axis runs from a to b (vertices baked; part position stays at origin).
  function cylinderBetween(a, b, radius, segments = 14, radiusB) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), dir = end.clone().sub(start), length = dir.length();
    const geo = new THREE.CylinderGeometry(radiusB ?? radius, radius, Math.max(length, 1e-3), segments, 1, false);
    geo.applyMatrix4(new THREE.Matrix4().compose(start.clone().add(end).multiplyScalar(.5),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()), new THREE.Vector3(1, 1, 1)));
    return geo;
  }

  // Loft: superellipse cross-sections along local +Z, e.g. body shells, hulls, fuselages.
  // Section {z, width, top, bottom, x?, exponent?}; exponent 2 = ellipse, higher = boxier.
  // arc [startDeg, endDeg] keeps part of the ring (0° = +X side, 90° = top) as a shell
  // panel; thickness makes a closed shell. Panels sliced from one loft tile seamlessly.
  function buildLoft(g) {
    const raw = (g.sections || []).map(s => ({x: s.x || 0, z: s.z, width: Math.max(0, s.width), top: s.top, bottom: s.bottom, exponent: s.exponent ?? g.exponent ?? 2.5})).sort((a, b) => a.z - b.z);
    if (raw.length < 2) throw new Error('Loft needs at least two sections.');
    const sub = Math.max(1, g.subdivisions ?? 2), keys = ['x', 'z', 'width', 'top', 'bottom', 'exponent'], sections = [];
    for (let k = 0; k < raw.length - 1; k++) for (let s = 0; s < sub; s++) {
      const t = s / sub, p0 = raw[Math.max(0, k - 1)], p1 = raw[k], p2 = raw[k + 1], p3 = raw[Math.min(raw.length - 1, k + 2)];
      const out = {};
      for (const key of keys) {
        const a = p0[key], b = p1[key], c = p2[key], d = p3[key];
        out[key] = .5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
      }
      out.width = Math.max(0, out.width);out.exponent = Math.max(1.2, out.exponent);
      if (out.top < out.bottom) out.top = out.bottom;
      sections.push(out);
    }
    sections.push({...raw[raw.length - 1]});
    const segments = Math.max(6, g.segments || 32), arc = Array.isArray(g.arc) ? g.arc.map(a => a * Math.PI / 180) : null;
    const size = Math.max(...sections.map(s => Math.max(s.width, s.top - s.bottom)));
    const thickness = g.thickness ?? (arc ? Math.max(.5, size * .006) : 0);
    const thetas = arc ? Array.from({length: segments + 1}, (_, j) => arc[0] + (arc[1] - arc[0]) * j / segments) : Array.from({length: segments}, (_, j) => j / segments * Math.PI * 2);
    const point = (s, th, inset) => {
      const c = Math.cos(th), sn = Math.sin(th), e = 2 / s.exponent;
      const hw = Math.max(0, s.width / 2 - inset), hh = Math.max(0, (s.top - s.bottom) / 2 - inset), cy = (s.top + s.bottom) / 2;
      return [s.x + hw * Math.sign(c) * Math.abs(c) ** e, cy + hh * Math.sign(sn) * Math.abs(sn) ** e, s.z];
    };
    const centre = s => new THREE.Vector3(s.x, (s.top + s.bottom) / 2, s.z);
    const radial = (rows, i, j, flip) => {
      const p = rows[i][j], q = rows[i + 1][(j + 1) % rows[i].length], c = centre(sections[i]);
      const h = new THREE.Vector3((p[0] + q[0]) / 2 - c.x, (p[1] + q[1]) / 2 - c.y, 0);
      if (h.lengthSq() < 1e-12) h.set(Math.cos(thetas[j]), Math.sin(thetas[j]), 0);
      return flip ? h.negate() : h;
    };
    const patch = Math.max(1, Math.round(segments / 12)), slab = 1, cols = thetas.length;
    const parts = [];
    const outerRows = sections.map(s => thetas.map(th => point(s, th, 0)));
    parts.push(gridSurface(outerRows, (i, j) => radial(outerRows, i, j, false), {wrap: !arc, groups: thickness ? groupPatches(sections.length, cols, slab, patch) : slabGroups(sections.length, cols, slab)}));
    if (thickness) {
      const innerRows = sections.map(s => thetas.map(th => point(s, th, thickness)));
      parts.push(gridSurface(innerRows, (i, j) => radial(innerRows, i, j, true), {wrap: !arc, groups: groupPatches(sections.length, cols, slab, patch)}));
      if (arc) for (const [j, sign] of [[0, -1], [cols - 1, 1]]) {
        const th = thetas[j], hint = new THREE.Vector3(-Math.sin(th) * sign, Math.cos(th) * sign, 0);
        parts.push(gridSurface(sections.map((s, i) => [outerRows[i][j], innerRows[i][j]]), () => hint.clone(), {groups: chunkRanges(sections.length, 2, slab)}));
      }
      for (const [i, z] of [[0, -1], [sections.length - 1, 1]]) {
        const rows = [outerRows[i], innerRows[i]].map(r => arc ? r : [...r, r[0]]);
        parts.push(gridSurface(rows.map(r => r), () => new THREE.Vector3(0, 0, z), {groups: Array.from({length: Math.ceil(rows[0].length / patch)}, (_, k) => [[k * patch, Math.min(rows[0].length, k * patch + patch + 1)], [rows[0].length + k * patch, rows[0].length + Math.min(rows[0].length, k * patch + patch + 1)]])}));
      }
    } else {
      for (const [i, z] of [[0, -1], [sections.length - 1, 1]]) {
        const c = centre(sections[i]).toArray(), ringPts = [...outerRows[i], outerRows[i][0]];
        parts.push(gridSurface([ringPts, ringPts.map(() => c)], () => new THREE.Vector3(0, 0, z)));
      }
    }
    return single(mergeGeometries(parts));
  }

  // Shell patches: blocks of `slab` rings × `patch` columns, as per-row vertex ranges.
  function groupPatches(rows, cols, slab, patch) {
    const groups = [];
    for (let i = 0; i < rows - 1; i += slab) for (let j = 0; j < cols; j += patch) {
      const ranges = [];
      for (let r = i; r <= Math.min(rows - 1, i + slab); r++) ranges.push([r * cols + j, r * cols + Math.min(cols, j + patch + 1)]);
      groups.push(ranges);
    }
    return groups;
  }
  // Solid lofts: whole cross-section slabs, which always enclose the solid.
  function slabGroups(rows, cols, slab) {
    const groups = [];
    for (let i = 0; i < rows - 1; i += slab) groups.push([[i * cols, Math.min(rows, i + slab + 1) * cols]]);
    return groups;
  }

  // ------------------------------------------------------------ recipes
  function recipeBoard(g) {
    const p = g.params || {};
    const w = p.width || 100, d = p.depth || 80, t = p.thickness != null ? p.thickness : 1.8;
    return compound([
      part(buildRoundedBox({ size: [w, t, d], radius: Math.min(1.6, t * 0.4) }).geometry, { name: 'board-substrate' })
    ]);
  }

  function recipeChipPackage(g) {
    const p = g.params || {};
    const w = p.width || 22, d = p.depth || 22;
    const subH = p.substrateH != null ? p.substrateH : 1.4;
    const dieH = p.dieH != null ? p.dieH : 1.2;
    const lidH = p.lidH != null ? p.lidH : 1.6;
    return compound([
      part(buildChamferBox({ size: [w, subH, d], radius: 0.4 }).geometry, { name: 'substrate', material: p.substrateMaterial || 'pcb-blue' }),
      part(buildBox({ size: [w * 0.55, dieH, d * 0.55] }).geometry, { position: [0, subH / 2 + dieH / 2, 0], name: 'die', material: p.dieMaterial || 'silicon' }),
      part(buildChamferBox({ size: [w * 0.72, lidH, d * 0.72], radius: 0.5 }).geometry, { position: [0, subH / 2 + dieH + lidH / 2, 0], name: 'lid', material: p.lidMaterial || 'aluminum' }),
      part(buildSphere({ radius: 0.6 }).geometry, { position: [-w * 0.28, subH / 2 + dieH + lidH + 0.2, -d * 0.28], name: 'pin1-dot', material: 'plastic-black' })
    ]);
  }

  function recipeFinnedHeatsink(g) {
    const p = g.params || {};
    const w = p.width || 90, d = p.depth || 80;
    const baseH = p.baseH != null ? p.baseH : 4;
    const finH = p.finH != null ? p.finH : 32;
    const fins = p.fins != null ? p.fins : 11;
    const finT = p.finT != null ? p.finT : 1.6;
    const parts = [
      part(buildChamferBox({ size: [w, baseH, d], radius: 0.8 }).geometry, { position: [0, baseH / 2, 0], name: 'heatsink-base' })
    ];
    const span = d - 8;
    for (let i = 0; i < fins; i++) {
      const z = -span / 2 + (i / Math.max(1, fins - 1)) * span;
      parts.push(part(buildBox({ size: [w, finH, finT] }).geometry, {
        position: [0, baseH + finH / 2, z], name: 'fin'
      }));
    }
    const pipes = p.heatPipes != null ? p.heatPipes : 0;
    for (let i = 0; i < pipes; i++) {
      const x = (i - (pipes - 1) / 2) * (w * 0.5 / Math.max(1, pipes - 0.001)) * 1.4;
      parts.push(part(buildCylinder({ radius: 3, height: d * 0.86, segments: 16 }).geometry, {
        position: [x, baseH + finH * 0.55, 0], rotation: [Math.PI / 2, 0, 0], name: 'heat-pipe', material: 'copper'
      }));
    }
    return compound(parts);
  }

  function recipeFan(g) {
    const p = g.params || {};
    const size = p.size || 60, depth = p.depth != null ? p.depth : 15;
    const blades = p.blades != null ? p.blades : 7;
    const hubR = size * (p.hubRatio != null ? p.hubRatio : 0.3);
    const frameT = p.frameT != null ? p.frameT : size * 0.09;
    const parts = [];
    // frame: four bars + corner pads
    parts.push(part(buildBox({ size: [size, depth, frameT] }).geometry, { position: [0, 0, -size / 2 + frameT / 2], name: 'frame', material: 'plastic-black' }));
    parts.push(part(buildBox({ size: [size, depth, frameT] }).geometry, { position: [0, 0, size / 2 - frameT / 2], name: 'frame', material: 'plastic-black' }));
    parts.push(part(buildBox({ size: [frameT, depth, size - frameT * 2] }).geometry, { position: [-size / 2 + frameT / 2, 0, 0], name: 'frame', material: 'plastic-black' }));
    parts.push(part(buildBox({ size: [frameT, depth, size - frameT * 2] }).geometry, { position: [size / 2 - frameT / 2, 0, 0], name: 'frame', material: 'plastic-black' }));
    for (const cx of [-1, 1]) for (const cz of [-1, 1]) {
      parts.push(part(buildCylinder({ radius: frameT * 0.7, height: depth * 1.02, segments: 12 }).geometry, {
        position: [cx * (size / 2 - frameT * 0.75), 0, cz * (size / 2 - frameT * 0.75)], name: 'corner', material: 'plastic-black'
      }));
    }
    // hub
    parts.push(part(buildCylinder({ radius: hubR, height: depth * 0.62, segments: 24 }).geometry, { name: 'hub', material: 'plastic-gray' }));
    parts.push(part(buildCylinder({ radius: hubR * 0.45, height: depth * 0.66, segments: 18 }).geometry, { name: 'hub-cap', material: 'rubber' }));
    // blades: crescent extrusions around hub
    const bladeOuter = size * 0.46;
    for (let i = 0; i < blades; i++) {
      const ang = (i / blades) * Math.PI * 2;
      const shape = new THREE.Shape();
      const r0 = hubR * 0.92, r1 = bladeOuter;
      const curve = 0.55;
      const a0 = -0.28, a1 = 0.28 + curve;
      shape.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
      for (let s = 0; s <= 8; s++) {
        const t = s / 8, r = r0 + (r1 - r0) * t, a = a0 + (a1 - a0) * t * 0.35 + curve * t * t;
        shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      for (let s = 8; s >= 0; s--) {
        const t = s / 8, r = r0 + (r1 - r0) * t, a = a0 + 0.52 + (a1 - a0) * t * 0.35 + curve * t * t;
        shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: depth * 0.11, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.3, bevelSegments: 1, curveSegments: 6 });
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, depth * 0.08, 0);
      parts.push(part(geo, {
        rotation: [0, ang, 0], name: 'blade', material: 'plastic-gray'
      }));
    }
    return compound(parts);
  }

  function recipeRack(g) {
    const p = g.params || {};
    const w = p.width || 600, d = p.depth || 900, h = p.height || 2000;
    const postW = p.postW != null ? p.postW : 12;
    const parts = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      parts.push(part(buildBox({ size: [postW, h, postW] }).geometry, {
        position: [sx * (w / 2 - postW / 2), h / 2, sz * (d / 2 - postW / 2)], name: 'post', material: 'steel-dark'
      }));
    }
    for (const y of [postW / 2, h - postW / 2]) {
      parts.push(part(buildBox({ size: [w, postW, postW] }).geometry, { position: [0, y, -d / 2 + postW / 2], name: 'rail', material: 'steel-dark' }));
      parts.push(part(buildBox({ size: [w, postW, postW] }).geometry, { position: [0, y, d / 2 - postW / 2], name: 'rail', material: 'steel-dark' }));
      parts.push(part(buildBox({ size: [postW, postW, d - postW * 2] }).geometry, { position: [-w / 2 + postW / 2, y, 0], name: 'rail', material: 'steel-dark' }));
      parts.push(part(buildBox({ size: [postW, postW, d - postW * 2] }).geometry, { position: [w / 2 - postW / 2, y, 0], name: 'rail', material: 'steel-dark' }));
    }
    if (p.sidePanels !== false) {
      for (const sx of [-1, 1]) {
        parts.push(part(buildBox({ size: [1.4, h - postW * 2, d - postW * 2] }).geometry, {
          position: [sx * (w / 2 - postW / 2), h / 2, 0], name: 'side-panel', material: { preset: 'steel-dark', texture: 'vents' }
        }));
      }
    }
    return compound(parts);
  }

  function recipeServerBlade(g) {
    const p = g.params || {};
    const w = p.width || 440, h = p.height || 44, d = p.depth || 680;
    const parts = [];
    parts.push(part(buildChamferBox({ size: [w, h, d], radius: 1.6 }).geometry, { name: 'chassis', material: 'aluminum' }));
    parts.push(part(buildChamferBox({ size: [w * 0.995, h * 0.86, 6], radius: 1.2 }).geometry, {
      position: [0, 0, d / 2 + 3], name: 'bezel', material: { preset: 'steel-dark', texture: 'vents' }
    }));
    // drive bays
    for (const sx of [-1, 1]) {
      parts.push(part(buildChamferBox({ size: [w * 0.3, h * 0.6, 14], radius: 1 }).geometry, {
        position: [sx * w * 0.28, -h * 0.02, d / 2 + 12], name: 'drive-bay', material: 'steel-dark'
      }));
      parts.push(part(buildBox({ size: [w * 0.22, 2.2, 1] }).geometry, {
        position: [sx * w * 0.28, -h * 0.02, d / 2 + 19.5], name: 'bay-latch', material: 'plastic-gray'
      }));
    }
    // handles
    for (const sx of [-1, 1]) {
      parts.push(part(buildBox({ size: [10, h * 0.5, 16] }).geometry, {
        position: [sx * (w / 2 + 4), 0, d / 2 - 6], name: 'handle', material: 'plastic-black'
      }));
    }
    // status LEDs
    for (let i = 0; i < 4; i++) {
      parts.push(part(buildBox({ size: [3, 2.2, 1.2] }).geometry, {
        position: [w * 0.32 + i * 5, h * 0.22, d / 2 + 19.4], name: 'led', material: i === 3 ? 'emissive-amber' : 'emissive-cyan'
      }));
    }
    return compound(parts);
  }

  function recipeConnectorPort(g) {
    const p = g.params || {};
    const w = p.width || 16, h = p.height || 8, d = p.depth != null ? p.depth : 12;
    const pins = p.pins != null ? p.pins : 8;
    const parts = [];
    parts.push(part(buildBox({ size: [w, h, d] }).geometry, { name: 'shell', material: 'steel-dark' }));
    parts.push(part(buildBox({ size: [w * 0.78, h * 0.55, d * 0.5] }).geometry, {
      position: [0, -h * 0.08, d * 0.28], name: 'cavity', material: 'plastic-black'
    }));
    for (let i = 0; i < pins; i++) {
      const x = -w * 0.32 + (i / Math.max(1, pins - 1)) * w * 0.64;
      parts.push(part(buildBox({ size: [0.7, 0.7, d * 0.42] }).geometry, {
        position: [x, -h * 0.08, d * 0.3], name: 'pin', material: 'gold'
      }));
    }
    return compound(parts);
  }

  function recipePortRow(g) {
    const p = g.params || {};
    const count = p.count || 3, spacing = p.spacing || 22;
    const parts = [];
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * spacing;
      const port = recipeConnectorPort({ params: Object.assign({}, p, { count: undefined }) });
      for (const sub of port.parts) {
        parts.push(part(sub.geometry, {
          position: [x + sub.position[0], sub.position[1], sub.position[2]],
          rotation: sub.rotation, material: sub.material, name: sub.name
        }));
      }
    }
    return compound(parts);
  }

  function recipeDimm(g) {
    const p = g.params || {};
    const len = p.length || 133, h = p.height || 30, t = p.thickness != null ? p.thickness : 4;
    const chips = p.chips != null ? p.chips : 8;
    const parts = [];
    parts.push(part(buildRoundedBox({ size: [len, t, h], radius: 0.8 }).geometry, { name: 'pcb', material: 'pcb-green' }));
    for (let i = 0; i < chips; i++) {
      const x = -len * 0.38 + (i / Math.max(1, chips - 1)) * len * 0.76;
      parts.push(part(buildChamferBox({ size: [len / chips * 0.72, 1.3, h * 0.52], radius: 0.3 }).geometry, {
        position: [x, t / 2 + 0.65, 0], name: 'memory-chip', material: 'silicon'
      }));
    }
    for (let i = 0; i < 28; i++) {
      const x = -len * 0.42 + (i / 27) * len * 0.84;
      parts.push(part(buildBox({ size: [len / 27 * 0.55, 0.5, 3.4] }).geometry, {
        position: [x, -t / 2 - 0.25, -h * 0.36], name: 'gold-finger', material: 'gold'
      }));
    }
    return compound(parts);
  }

  function recipeCapacitor(g) {
    const p = g.params || {};
    const r = p.radius || 4, h = p.height || 10;
    return compound([
      part(buildCylinder({ radius: r, height: h, segments: 18 }).geometry, { name: 'can', material: p.material || 'plastic-gray' }),
      part(buildCylinder({ radius: r * 0.92, height: 0.6, segments: 18 }).geometry, { position: [0, h / 2 + 0.3, 0], name: 'top', material: 'aluminum' }),
      part(buildBox({ size: [r * 1.2, 0.25, 0.5] }).geometry, { position: [0, h / 2 + 0.65, 0], name: 'vent' }),
      part(buildBox({ size: [0.5, 0.25, r * 1.2] }).geometry, { position: [0, h / 2 + 0.65, 0], name: 'vent' })
    ]);
  }

  function recipeScrew(g) {
    const p = g.params || {};
    const r = p.radius || 2.4, len = p.length || 8;
    const headR = p.headR || r * 1.9, headH = p.headH || 1.8;
    return compound([
      part(buildCylinder({ radius: headR, height: headH, segments: 18 }).geometry, { position: [0, len / 2 + headH / 2, 0], name: 'head', material: p.material || 'steel-dark' }),
      part(buildCylinder({ radius: r, height: len, segments: 12 }).geometry, { position: [0, 0, 0], name: 'shaft', material: p.material || 'steel-dark' })
    ]);
  }

  function recipeBolt(g) {
    const p = g.params || {};
    const r = p.radius || 3, len = p.length || 12;
    const headR = p.headR || r * 1.8, headH = p.headH || 2.6;
    return compound([
      part(buildCylinder({ radius: headR, radiusBottom: headR, height: headH, segments: 6 }).geometry, { position: [0, len / 2 + headH / 2, 0], name: 'hex-head', material: p.material || 'brushed-steel' }),
      part(buildCylinder({ radius: r, height: len, segments: 14 }).geometry, { name: 'shaft', material: p.material || 'brushed-steel' }),
      part(buildCylinder({ radius: r * 1.12, height: 0.8, segments: 14 }).geometry, { position: [0, len / 2 - 0.4, 0], name: 'washer', material: p.material || 'brushed-steel' })
    ]);
  }

  function recipeFlange(g) {
    const p = g.params || {};
    const R = p.radius || 22, t = p.thickness != null ? p.thickness : 4;
    const bolts = p.bolts != null ? p.bolts : 6, bc = p.boltCircle || R * 0.72;
    const neckR = p.neckR || R * 0.5, neckH = p.neckH != null ? p.neckH : 8;
    const parts = [
      part(buildCylinder({ radius: R, height: t, segments: 32 }).geometry, { name: 'flange-disc', material: 'brushed-steel' }),
      part(buildCylinder({ radius: neckR, height: neckH, segments: 24 }).geometry, { position: [0, t / 2 + neckH / 2, 0], name: 'neck' })
    ];
    for (let i = 0; i < bolts; i++) {
      const a = (i / bolts) * Math.PI * 2;
      parts.push(part(buildCylinder({ radius: 1.4, height: t + 1.2, segments: 10 }).geometry, {
        position: [Math.cos(a) * bc, 0, Math.sin(a) * bc], name: 'bolt', material: 'steel-dark'
      }));
    }
    return compound(parts);
  }

  function recipePipe(g) {
    const p = g.params || {};
    const r = p.radius || 10, len = p.length || 60;
    const parts = [
      part(buildCylinder({ radius: r, height: len, segments: 26 }).geometry, { name: 'pipe' })
    ];
    if (p.flanges !== false) {
      for (const s of [-1, 1]) {
        parts.push(part(buildCylinder({ radius: r * 1.45, height: 3, segments: 26 }).geometry, {
          position: [0, s * (len / 2 - 1.5), 0], name: 'flange', material: 'brushed-steel'
        }));
      }
    }
    return compound(parts);
  }

  function recipePipeElbow(g) {
    const p = g.params || {};
    const R = p.radius || 20, tr = p.tubeR || 6;
    const angle = (p.angle || 90) * Math.PI / 180;
    return compound([
      part(buildTorus({ radius: R, tube: tr, arc: angle * 180 / Math.PI, segments: 28 }).geometry, { name: 'elbow' })
    ]);
  }

  function recipeGauge(g) {
    const p = g.params || {};
    const r = p.radius || 12, d = p.depth != null ? p.depth : 7;
    return compound([
      part(buildCylinder({ radius: r, height: d, segments: 28 }).geometry, { name: 'body', material: 'brushed-steel' }),
      part(buildCylinder({ radius: r * 0.88, height: 0.8, segments: 28 }).geometry, { position: [0, d / 2 + 0.4, 0], name: 'dial', material: 'plastic-white' }),
      part(buildBox({ size: [r * 0.1, 0.35, r * 0.62] }).geometry, { position: [0, d / 2 + 0.95, r * 0.2], rotation: [0, 0.7, 0], name: 'needle', material: 'emissive-amber' }),
      part(buildCylinder({ radius: r * 0.92, height: 1.2, segments: 28 }).geometry, { position: [0, d / 2 + 1.2, 0], name: 'glass', material: 'glass' }),
      part(buildCylinder({ radius: r * 0.22, height: 4, segments: 12 }).geometry, { position: [0, -d / 2 - 2, 0], name: 'stem', material: 'brass' })
    ]);
  }

  function recipeMotor(g) {
    const p = g.params || {};
    const r = p.radius || 26, len = p.length || 70;
    const fins = p.fins != null ? p.fins : 9;
    const shaftR = p.shaftR || 6, shaftL = p.shaftL || 18;
    // Axis convention: cylinder axis = local +Y. Shaft extends +Y, fan cowl -Y.
    const parts = [];
    parts.push(part(buildCylinder({ radius: r, height: len, segments: 30 }).geometry, { name: 'body', material: 'aluminum' }));
    for (let i = 0; i < fins; i++) {
      const y = -len * 0.38 + (i / Math.max(1, fins - 1)) * len * 0.76;
      parts.push(part(buildCylinder({ radius: r + 2.6, height: 1.4, segments: 30 }).geometry, {
        position: [0, y, 0], name: 'cooling-fin', material: 'aluminum'
      }));
    }
    parts.push(part(buildCylinder({ radius: r * 0.98, height: 9, segments: 28 }).geometry, {
      position: [0, -len / 2 - 4.5, 0], name: 'fan-cowl', material: { preset: 'steel-dark', texture: 'vents' }
    }));
    parts.push(part(buildCylinder({ radius: shaftR, height: shaftL, segments: 18 }).geometry, {
      position: [0, len / 2 + shaftL / 2, 0], name: 'shaft', material: 'chrome'
    }));
    parts.push(part(buildBox({ size: [shaftR * 0.5, shaftL * 0.6, 1.2] }).geometry, {
      position: [0, len / 2 + shaftL / 2, shaftR - 0.4], name: 'key', material: 'chrome'
    }));
    parts.push(part(buildChamferBox({ size: [18, 12, 16], radius: 1.2 }).geometry, {
      position: [0, r + 4, -len * 0.1], name: 'terminal-box', material: 'plastic-gray'
    }));
    parts.push(part(buildCylinder({ radius: 2.6, height: 5, segments: 12 }).geometry, {
      position: [0, r + 4, -len * 0.1 + 10], rotation: [Math.PI / 2, 0, 0], name: 'cable-gland', material: 'brass'
    }));
    if (p.feet !== false) {
      for (const s of [-1, 1]) {
        parts.push(part(buildBox({ size: [12, 8, 22] }).geometry, {
          position: [s * (r * 0.72), -r - 2, 0], name: 'foot', material: 'steel-dark'
        }));
      }
    }
    return compound(parts);
  }

  function recipeImpeller(g) {
    const p = g.params || {};
    const R = p.radius || 22, hubR = p.hubR || 7;
    const blades = p.blades != null ? p.blades : 6;
    const h = p.height || 12;
    const parts = [
      part(buildCylinder({ radius: hubR, height: h, segments: 22 }).geometry, { name: 'hub', material: 'copper' }),
      part(buildCylinder({ radius: hubR * 0.55, height: h + 3, segments: 16 }).geometry, { name: 'shaft-boss', material: 'chrome' })
    ];
    for (let i = 0; i < blades; i++) {
      const ang = (i / blades) * Math.PI * 2;
      const shape = new THREE.Shape();
      const r0 = hubR * 0.9, r1 = R * 0.94;
      shape.moveTo(r0, -h * 0.42);
      for (let s = 0; s <= 6; s++) {
        const t = s / 6, r = r0 + (r1 - r0) * t;
        const a = 0.85 * t * t;
        shape.lineTo(Math.cos(a) * r, Math.sin(a) * r - h * 0.42 + h * 0.84 * t * 0.2);
      }
      for (let s = 6; s >= 0; s--) {
        const t = s / 6, r = r0 + (r1 - r0) * t;
        const a = 0.85 * t * t + 0.34;
        shape.lineTo(Math.cos(a) * r, Math.sin(a) * r - h * 0.42);
      }
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: h * 0.84, bevelEnabled: false, curveSegments: 6 });
      geo.rotateX(-Math.PI / 2);
      parts.push(part(geo, { rotation: [0, ang, 0], name: 'blade', material: 'copper' }));
    }
    if (p.shroud !== false) {
      parts.push(part(new THREE.TorusGeometry(R * 0.92, 1.3, 8, 30), {
        rotation: [Math.PI / 2, 0, 0], name: 'shroud-ring', material: 'copper'
      }));
    }
    return compound(parts);
  }

  function recipePumpHousing(g) {
    // Casing only. Exploded-view parts (cover, gasket, bolts, flanges, gauge)
    // belong to the scene so they can move independently — see assembly-rules.md.
    const p = g.params || {};
    const R = p.radius || 30, W = p.width || 36;
    const inletR = p.inletR || 12, outletR = p.outletR || 9;
    const parts = [];
    // main casing along local Z (rotated internally)
    parts.push(part(buildCylinder({ radius: R, height: W, segments: 36 }).geometry, {
      rotation: [Math.PI / 2, 0, 0], name: 'casing', material: 'aluminum'
    }));
    // volute bulge
    parts.push(part(buildCylinder({ radius: R * 1.12, height: W * 0.55, segments: 36 }).geometry, {
      rotation: [Math.PI / 2, 0, 0], position: [R * 0.22, R * 0.18, 0], name: 'volute', material: 'aluminum'
    }));
    // inlet neck along +Z
    parts.push(part(buildCylinder({ radius: inletR, height: 26, segments: 26 }).geometry, {
      rotation: [Math.PI / 2, 0, 0], position: [0, 0, W / 2 + 13], name: 'inlet'
    }));
    // outlet neck along +Y
    parts.push(part(buildCylinder({ radius: outletR, height: 22, segments: 24 }).geometry, {
      position: [R * 0.42, R * 0.95, 0], name: 'outlet'
    }));
    return compound(parts);
  }

  function recipeVaporChamber(g) {
    const p = g.params || {};
    const w = p.width || 100, d = p.depth || 80, h = p.height || 3.2;
    return compound([
      part(buildChamferBox({ size: [w, h, d], radius: 0.9 }).geometry, { name: 'chamber', material: 'copper' }),
      part(buildChamferBox({ size: [w * 0.6, h * 0.5, d * 0.6], radius: 0.6 }).geometry, { position: [0, h * 0.72, 0], name: 'wick-boss', material: 'copper' })
    ]);
  }

  function recipeThermalPad(g) {
    const p = g.params || {};
    const w = p.width || 90, d = p.depth || 80, h = p.height || 1.2;
    return compound([
      part(buildBox({ size: [w, h, d] }).geometry, {
        name: 'thermal-pad',
        material: p.material || { preset: 'ghost', color: '#5fd8c8', opacity: 0.55, emissive: '#1a6b60', emissiveIntensity: 0.3 }
      })
    ]);
  }

  function recipeHandle(g) {
    const p = g.params || {};
    const w = p.width || 24, h = p.height || 10, d = p.depth || 8, r = p.radius || 2.2;
    return compound([
      part(buildCylinder({ radius: r, height: w, segments: 14 }).geometry, {
        rotation: [0, 0, Math.PI / 2], position: [0, h / 2, d / 2], name: 'grip', material: 'plastic-black'
      }),
      part(buildCylinder({ radius: r, height: h, segments: 14 }).geometry, { position: [-w / 2, 0, d / 2 - h / 2 + h / 2], name: 'post', material: 'plastic-black' }),
      part(buildCylinder({ radius: r, height: h, segments: 14 }).geometry, { position: [w / 2, 0, d / 2], name: 'post', material: 'plastic-black' })
    ]);
  }

  function recipeLedRow(g) {
    const p = g.params || {};
    const count = p.count || 4, spacing = p.spacing || 4.5, size = p.size || 1.8;
    const parts = [];
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * spacing;
      parts.push(part(buildBox({ size: [size, size, size * 0.7] }).geometry, {
        position: [x, 0, 0], name: 'led', material: i % 2 === 0 ? (p.material || 'emissive-cyan') : 'emissive-amber'
      }));
    }
    return compound(parts);
  }

  function recipeInductor(g) {
    const p = g.params || {};
    const w = p.width || 10, d = p.depth || 10, h = p.height || 6;
    return compound([
      part(buildChamferBox({ size: [w, h, d], radius: 0.8 }).geometry, { name: 'core', material: 'plastic-black' }),
      part(buildChamferBox({ size: [w * 0.7, 1, d * 0.7], radius: 0.4 }).geometry, { position: [0, h / 2 + 0.5, 0], name: 'cap', material: 'steel-dark' })
    ]);
  }

  function recipeBadge(g) {
    const p = g.params || {};
    const w = p.width || 26, d = p.depth || 10, h = p.height || 0.8;
    return compound([
      part(buildRoundedBox({ size: [w, h, d], radius: 0.5 }).geometry, { name: 'plate', material: p.material || 'emissive-cyan' })
    ]);
  }

  function recipeBracket(g) {
    const p = g.params || {};
    const w = p.width || 120, h = p.height || 110, t = p.thickness || 2.2;
    return compound([
      part(buildBox({ size: [t, h, 22] }).geometry, { position: [-w / 2 + t / 2, 0, 0], name: 'flange-y', material: 'steel-dark' }),
      part(buildBox({ size: [w, h, t] }).geometry, { position: [0, 0, -11 + t / 2], name: 'plate', material: 'steel-dark' }),
      part(buildBox({ size: [w * 0.28, h * 0.22, t * 2.2] }).geometry, { position: [w * 0.18, -h * 0.22, -11 + t], name: 'slot-frame', material: 'steel-dark' }),
      part(buildBox({ size: [w * 0.2, h * 0.14, t * 3] }).geometry, { position: [w * 0.18, -h * 0.22, -11 + t * 1.2], name: 'slot', material: 'plastic-black' })
    ]);
  }

  function recipeGpuCard(g) {
    const p = g.params || {};
    const len = p.length || 260, d = p.depth || 110, t = p.thickness || 2;
    const parts = [];
    parts.push(part(buildRoundedBox({ size: [len, t, d], radius: 0.9 }).geometry, { name: 'pcb', material: 'pcb-green' }));
    parts.push(part(buildChamferBox({ size: [58, 2, 58], radius: 0.5 }).geometry, { position: [-len * 0.08, t / 2 + 1, 0], name: 'gpu-package', material: 'silicon' }));
    for (let i = 0; i < 6; i++) {
      parts.push(part(buildChamferBox({ size: [14, 1.8, 12], radius: 0.4 }).geometry, {
        position: [-len * 0.08 + (i % 3 - 1) * 20, t / 2 + 1.2, (i < 3 ? -1 : 1) * 24], name: 'hbm', material: 'silicon'
      }));
    }
    for (let i = 0; i < 24; i++) {
      const x = -len * 0.4 + (i / 23) * len * 0.28;
      parts.push(part(buildBox({ size: [len / 23 * 0.5, 0.5, 4] }).geometry, {
        position: [x, -t / 2 - 0.25, d * 0.36], name: 'pcie-finger', material: 'gold'
      }));
    }
    return compound(parts);
  }

  function recipeSsd(g) {
    const p = g.params || {};
    const len = p.length || 100, w = p.width || 70, h = p.height || 7;
    return compound([
      part(buildChamferBox({ size: [len, h, w], radius: 0.8 }).geometry, { name: 'case', material: 'aluminum' }),
      part(buildBox({ size: [len * 0.6, 0.4, w * 0.5] }).geometry, { position: [0, h / 2 + 0.2, 0], name: 'label', material: 'plastic-white' }),
      part(buildBox({ size: [len * 0.16, h * 0.5, w * 0.42] }).geometry, { position: [-len * 0.46, 0, 0], name: 'connector', material: 'gold' })
    ]);
  }

  function recipeDuct(g) {
    const p = g.params || {};
    const w = p.width || 60, h = p.height || 50, d = p.depth || 70, wall = p.wall || 2;
    return compound([
      part(buildBox({ size: [w, wall, d] }).geometry, { position: [0, -h / 2, 0], name: 'wall', material: 'aluminum' }),
      part(buildBox({ size: [w, wall, d] }).geometry, { position: [0, h / 2, 0], name: 'wall', material: 'aluminum' }),
      part(buildBox({ size: [wall, h, d] }).geometry, { position: [-w / 2, 0, 0], name: 'wall', material: 'aluminum' }),
      part(buildBox({ size: [wall, h, d] }).geometry, { position: [w / 2, 0, 0], name: 'wall', material: 'aluminum' }),
      part(buildBox({ size: [w + 8, wall * 1.6, 4] }).geometry, { position: [0, -h / 2, d / 2], name: 'flange', material: 'brushed-steel' }),
      part(buildBox({ size: [w + 8, wall * 1.6, 4] }).geometry, { position: [0, h / 2, d / 2], name: 'flange', material: 'brushed-steel' })
    ]);
  }

  function recipeBatteryCell(g) {
    const p = g.params || {};
    const r = p.radius || 9, h = p.height || 65;
    return compound([
      part(buildCylinder({ radius: r, height: h, segments: 24 }).geometry, { name: 'can', material: 'titanium' }),
      part(buildCylinder({ radius: r * 0.42, height: 2.4, segments: 16 }).geometry, { position: [0, h / 2 + 1.2, 0], name: 'positive', material: 'chrome' }),
      part(buildCylinder({ radius: r * 1.01, height: 1.6, segments: 24 }).geometry, { position: [0, -h / 2 + 0.8, 0], name: 'rim', material: 'chrome' })
    ]);
  }

  function recipeGeneric(g) {
    const p = g.params || {};
    const s = p.size || [20, 20, 20];
    return compound([
      part(buildChamferBox({ size: s, radius: Math.min(s[0], s[1], s[2]) * 0.06 }).geometry, { name: 'generic' })
    ]);
  }

  const RECIPES = {
    'board': recipeBoard,
    'chip-package': recipeChipPackage,
    'finned-heatsink': recipeFinnedHeatsink,
    'fan': recipeFan,
    'rack': recipeRack,
    'server-blade': recipeServerBlade,
    'connector-port': recipeConnectorPort,
    'port-row': recipePortRow,
    'dimm': recipeDimm,
    'capacitor': recipeCapacitor,
    'screw': recipeScrew,
    'bolt': recipeBolt,
    'flange': recipeFlange,
    'pipe': recipePipe,
    'pipe-elbow': recipePipeElbow,
    'gauge': recipeGauge,
    'motor': recipeMotor,
    'impeller': recipeImpeller,
    'pump-housing': recipePumpHousing,
    'vapor-chamber': recipeVaporChamber,
    'thermal-pad': recipeThermalPad,
    'handle': recipeHandle,
    'led-row': recipeLedRow,
    'inductor': recipeInductor,
    'badge': recipeBadge,
    'bracket': recipeBracket,
    'gpu-card': recipeGpuCard,
    'ssd': recipeSsd,
    'duct': recipeDuct,
    'battery-cell': recipeBatteryCell,
    'generic-recipe': recipeGeneric
  };
  Object.assign(RECIPES, createVehicleRecipes(THREE, {part, compound, single, buildBox, buildChamferBox, buildRoundedBox, buildCylinder, buildSphere, buildTorus, buildTube, buildExtrude, buildLoft, revolveProfile, cylinderBetween, mergeGeometries, roundedRectShape}));

  function buildGeometry(def) {
    const g = def || { kind: 'box' };
    const kind = g.kind || 'box';
    if (RECIPES[kind]) return RECIPES[kind](g);
    switch (kind) {
      case 'box': return buildBox(g);
      case 'chamferBox': return buildChamferBox(g);
      case 'roundedBox': return buildRoundedBox(g);
      case 'cylinder': return buildCylinder(g);
      case 'cone': return buildCone(g);
      case 'sphere': return buildSphere(g);
      case 'torus': return buildTorus(g);
      case 'plane': return buildPlane(g);
      case 'extrude': return buildExtrude(g);
      case 'lathe': return buildLathe(g);
      case 'tube': return buildTube(g);
      case 'loft': return buildLoft(g);
      case 'compound': return buildCompound(g);
      case 'import': throw new Error('External mesh import is not supported.');
      default: throw new Error('Unknown geometry kind: ' + kind);
    }
  }

  function buildCompound(g) {
    const out = [];
    for (const p of g.parts || []) {
      const built = buildGeometry(p.geometry);
      const items = built.kind === 'single' ? [part(built.geometry)] : built.parts;
      const tf = p.transform || {};
      const outer = new THREE.Matrix4().compose(
        new THREE.Vector3().fromArray(tf.position || [0,0,0]),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...(tf.rotation || [0,0,0]).map(n => n*Math.PI/180), 'XYZ')),
        new THREE.Vector3().fromArray(tf.scale || [1,1,1])
      );
      for (const sub of items) {
        const inner = new THREE.Matrix4().compose(
          new THREE.Vector3().fromArray(sub.position || [0,0,0]),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(...(sub.rotation || [0,0,0]), 'XYZ')),
          new THREE.Vector3().fromArray(sub.scale || [1,1,1])
        );
        const matrix=outer.clone().multiply(inner);
        sub.geometry.applyMatrix4(matrix);
        if(matrix.determinant()<0) {
          const index=sub.geometry.index ? Array.from(sub.geometry.index.array) : Array.from({length:sub.geometry.attributes.position.count},(_,i)=>i);
          for(let i=0;i<index.length;i+=3) [index[i+1],index[i+2]]=[index[i+2],index[i+1]];
          sub.geometry.setIndex(index);
        }
        out.push(part(sub.geometry, {material:p.material || sub.material, name:p.name || sub.name}));
      }
    }
    return compound(out);
  }

  const auditBoundsCache = new Map();
  function partBounds(def) {
    const key = JSON.stringify(def);
    if (auditBoundsCache.has(key)) return auditBoundsCache.get(key);
    const built = buildGeometry(def);
    const parts = built.kind === 'single' ? [part(built.geometry)] : built.parts;
    const boxes = parts.flatMap(p => {
      const matrix = new THREE.Matrix4().compose(new THREE.Vector3().fromArray(p.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.rotation)), new THREE.Vector3().fromArray(p.scale));
      const v = new THREE.Vector3(), vertices = p.geometry.getAttribute('position');
      const groups = p.geometry.userData?.auditGroups?.length ? p.geometry.userData.auditGroups : [[[0, vertices.count]]];
      const out = groups.map(group => {
        const b = new THREE.Box3().makeEmpty();
        for (const [start, end] of group) for (let i = start; i < Math.min(end, vertices.count); i++) b.expandByPoint(v.fromBufferAttribute(vertices, i).applyMatrix4(matrix));
        return b;
      }).filter(b => !b.isEmpty()).map(b => ({min: b.min.toArray(), max: b.max.toArray()}));
      p.geometry.dispose();
      return out;
    });
    auditBoundsCache.set(key,boxes);
    return boxes;
  }

  return { buildGeometry, partBounds, RECIPES, clearBoundsCache: () => auditBoundsCache.clear() };
}
