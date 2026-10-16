// spec-math.js — pure-JS scene spec math, validation, and geometry audits.
// No THREE dependency: usable from Node scripts, agent tooling, and the engine.

import { SCENE_SCHEMA } from './schema-data.js';
import { validateSchema } from './schema-validation.js';

export function vec3(x, y, z) { return [x, y, z]; }

export function vAdd(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
export function vSub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
export function vScale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
export function vLen(a) { return Math.hypot(a[0], a[1], a[2]); }
export function vNorm(a) { const l = vLen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
export function vLerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

export function degToRad(d) { return d * Math.PI / 180; }

// ---------------------------------------------------------------- transforms
// Euler XYZ in degrees, matching THREE.Euler(..., "XYZ").
export function rotatePoint(p, rotDeg) {
  if (!rotDeg) return p.slice();
  let [x, y, z] = p;
  const rx = degToRad(rotDeg[0] || 0), ry = degToRad(rotDeg[1] || 0), rz = degToRad(rotDeg[2] || 0);
  if (rz) { const c = Math.cos(rz), s = Math.sin(rz); const x2 = x * c - y * s; y = x * s + y * c; x = x2; }
  if (ry) { const c = Math.cos(ry), s = Math.sin(ry); const x2 = x * c + z * s; z = -x * s + z * c; x = x2; }
  if (rx) { const c = Math.cos(rx), s = Math.sin(rx); const y2 = y * c - z * s; z = y * s + z * c; y = y2; }
  return [x, y, z];
}

export function composeTransform(tf) {
  const pos = (tf && tf.position) || [0, 0, 0];
  const rot = (tf && tf.rotation) || [0, 0, 0];
  const scl = (tf && tf.scale) || [1, 1, 1];
  return (p) => {
    const q = rotatePoint([p[0] * scl[0], p[1] * scl[1], p[2] * scl[2]], rot);
    return [q[0] + pos[0], q[1] + pos[1], q[2] + pos[2]];
  };
}

// ---------------------------------------------------------------- AABB math
export function makeAABB(min, max) { return { min: min.slice(), max: max.slice() }; }
export function aabbFromPoints(points) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of points) for (let i = 0; i < 3; i++) {
    if (p[i] < min[i]) min[i] = p[i];
    if (p[i] > max[i]) max[i] = p[i];
  }
  return { min, max };
}
export function aabbCenter(b) {
  return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
}
export function aabbSize(b) { return vSub(b.max, b.min); }
export function aabbRadius(b) { return vLen(aabbSize(b)) / 2; }
export function aabbUnion(a, b) {
  if (!a) return b ? { min: b.min.slice(), max: b.max.slice() } : null;
  if (!b) return a;
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
    max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])]
  };
}
export function aabbTransform(b, tf) {
  const xf = composeTransform(tf);
  const pts = [];
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) pts.push(xf([x, y, z]));
  return aabbFromPoints(pts);
}
export function aabbOverlapVolume(a, b) {
  const ox = Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]);
  const oy = Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]);
  const oz = Math.min(a.max[2], b.max[2]) - Math.max(a.min[2], b.min[2]);
  if (ox <= 0 || oy <= 0 || oz <= 0) return 0;
  return ox * oy * oz;
}
export function aabbVolume(b) {
  const s = aabbSize(b);
  return Math.max(0, s[0]) * Math.max(0, s[1]) * Math.max(0, s[2]);
}
export function aabbGap(a, b) {
  const dx = Math.max(a.min[0] - b.max[0], b.min[0] - a.max[0], 0);
  const dy = Math.max(a.min[1] - b.max[1], b.min[1] - a.max[1], 0);
  const dz = Math.max(a.min[2] - b.max[2], b.min[2] - a.max[2], 0);
  return Math.hypot(dx, dy, dz);
}

// ---------------------------------------------------------------- geometry AABBs (approximate, spec-level)
export function geometryAABB(def) {
  const g = def || {};
  const kind = g.kind || 'box';
  switch (kind) {
    case 'box': case 'chamferBox': case 'roundedBox': {
      const s = g.size || [10, 10, 10];
      return makeAABB([-s[0] / 2, -s[1] / 2, -s[2] / 2], [s[0] / 2, s[1] / 2, s[2] / 2]);
    }
    case 'cylinder': {
      const r = g.radius != null ? g.radius : Math.max(g.radiusTop || 0, g.radiusBottom || 0);
      const h = (g.height != null ? g.height : 10) / 2;
      return makeAABB([-r, -h, -r], [r, h, r]);
    }
    case 'cone': {
      const r = g.radius != null ? g.radius : g.radiusBottom || 5;
      const h = (g.height != null ? g.height : 10) / 2;
      return makeAABB([-r, -h, -r], [r, h, r]);
    }
    case 'sphere': {
      const r = g.radius != null ? g.radius : 5;
      return makeAABB([-r, -r, -r], [r, r, r]);
    }
    case 'torus': {
      const R = g.radius != null ? g.radius : 10;
      const t = g.tube != null ? g.tube : 2;
      return makeAABB([-R - t, -R - t, -t], [R + t, R + t, t]);
    }
    case 'plane': {
      const w = (g.width != null ? g.width : 10) / 2, d = (g.depth != null ? g.depth : 10) / 2;
      return makeAABB([-w, 0, -d], [w, 0, d]);
    }
    case 'extrude': {
      const pts = g.profile || [[-5, -5, 0], [5, -5, 0], [5, 5, 0], [-5, 5, 0]];
      const depth = g.depth != null ? g.depth : 5;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of pts) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
      return makeAABB([minX, minY, 0], [maxX, maxY, depth]);
    }
    case 'lathe': {
      const pts = g.profile || [[2, 0, 0], [5, 0, 0], [5, 10, 0], [2, 10, 0]];
      let maxR = 0, minY = Infinity, maxY = -Infinity;
      for (const p of pts) { maxR = Math.max(maxR, Math.abs(p[0])); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
      return makeAABB([-maxR, minY, -maxR], [maxR, maxY, maxR]);
    }
    case 'tube': {
      const pts = g.path || [[0, 0, 0], [0, 10, 0]];
      const r = g.radius != null ? g.radius : 1;
      const b = aabbFromPoints(pts);
      return makeAABB(b.min.map(v => v-r), b.max.map(v => v+r));
    }
    case 'compound': {
      let b = null;
      for (const part of g.parts || []) {
        const pb = aabbTransform(geometryAABB(part.geometry), part.transform);
        b = aabbUnion(b, pb);
      }
      return b || makeAABB([-5, -5, -5], [5, 5, 5]);
    }
    case 'loft': {
      const sections = g.sections || [];
      if (!sections.length) return makeAABB([-5, -5, -5], [5, 5, 5]);
      return makeAABB([Math.min(...sections.map(s => (s.x || 0) - s.width / 2)), Math.min(...sections.map(s => s.bottom)), Math.min(...sections.map(s => s.z))],
        [Math.max(...sections.map(s => (s.x || 0) + s.width / 2)), Math.max(...sections.map(s => s.top)), Math.max(...sections.map(s => s.z))]);
    }
    case 'import':
      throw new Error('External mesh import is not supported.');
    case 'board': {
      const p = g.params || {}, w = p.width || 100, d = p.depth || 80, h = p.thickness ?? 1.8;
      return makeAABB([-w/2,-h/2,-d/2], [w/2,h/2,d/2]);
    }
    case 'fan': {
      const p = g.params || {}, w = p.size || 60, h = p.depth ?? 15;
      return makeAABB([-w/2,-h*.51,-w/2], [w/2,h*.51,w/2]);
    }
    case 'chip-package': {
      const p = g.params || {}, w = p.width || 22, d = p.depth || 22, sub = p.substrateH ?? 1.4;
      const top = sub/2 + (p.dieH ?? 1.2) + (p.lidH ?? 1.6) + .8;
      return makeAABB([-w/2,-sub/2,-d/2], [w/2,top,d/2]);
    }
    default: {
      // Level-2 recipe: approximate from params (audit-grade, not exact).
      const p = g.params || {};
      const sizeNum = typeof p.size === 'number' ? p.size : null;
      const sizeArr = Array.isArray(p.size) ? p.size : null;
      const w = p.width || (sizeArr && sizeArr[0]) || sizeNum || (p.radius ? p.radius * 2 : 0) || 40;
      const h = p.height || (sizeArr && sizeArr[1]) || ((p.baseH || 0) + (p.finH || 0)) || sizeNum || (p.radius ? p.radius * 2 : 0) || 20;
      const d = p.depth || (sizeArr && sizeArr[2]) || sizeNum || (p.radius ? p.radius * 2 : 0) || 30;
      // Origin convention: recipes like finned-heatsink and rack are authored
      // with origin at the base; most others are center-origin.
      const baseOriginKinds = ['finned-heatsink', 'rack'];
      const yMin = baseOriginKinds.includes(g.kind) ? 0 : -h / 2;
      return makeAABB([-w / 2, yMin, -d / 2], [w / 2, yMin + h, d / 2]);
    }
  }
}

// ---------------------------------------------------------------- camera math (pure)
export function cameraPosition(target, distance, azimuthDeg, elevationDeg) {
  const az = degToRad(azimuthDeg), el = degToRad(elevationDeg);
  return [
    target[0] + distance * Math.cos(el) * Math.sin(az),
    target[1] + distance * Math.sin(el),
    target[2] + distance * Math.cos(el) * Math.cos(az)
  ];
}

export function projectPoint(p, cam) {
  // cam: {position, target, fov, aspect, near, far, projection}
  // Returns {x, y, depth} in NDC-ish units: x,y in [-1,1] when on screen; depth>1 means behind.
  const eye = cam.position, tgt = cam.target;
  const f = vNorm(vSub(tgt, eye));               // forward
  const up = [0, 1, 0];
  const r = vNorm(cross(f, up));
  const u = cross(r, f);
  const rel = vSub(p, eye);
  const z = rel[0] * f[0] + rel[1] * f[1] + rel[2] * f[2]; // view depth
  const x = rel[0] * r[0] + rel[1] * r[1] + rel[2] * r[2];
  const y = rel[0] * u[0] + rel[1] * u[1] + rel[2] * u[2];
  if (cam.projection === 'orthographic') {
    const h = cam.orthoHeight || 100;
    return { x: x / (h * (cam.aspect || 1.6)), y: y / h, depth: z };
  }
  const fovY = degToRad(cam.fov || 38);
  const hh = Math.tan(fovY / 2) * Math.max(z, 1e-6);
  const hw = hh * (cam.aspect || 1.6);
  return { x: x / hw, y: y / hh, depth: z };
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function boundsInFrame(bounds, cam, margin = 0.12) {
  // Check all 8 corners project inside NDC with margin.
  const pts = [];
  for (const x of [bounds.min[0], bounds.max[0]])
    for (const y of [bounds.min[1], bounds.max[1]])
      for (const z of [bounds.min[2], bounds.max[2]]) pts.push([x, y, z]);
  let ok = true, behind = false, maxAbs = 0;
  for (const p of pts) {
    const pr = projectPoint(p, cam);
    if (pr.depth <= 0.01) { behind = true; continue; }
    const m = Math.max(Math.abs(pr.x), Math.abs(pr.y));
    maxAbs = Math.max(maxAbs, m);
    if (m > 1 + margin) ok = false;
  }
  return { inFrame: ok && !behind, behind, maxExtent: maxAbs };
}

// ---------------------------------------------------------------- spec normalization
export function normalizeSpec(spec) {
  const s = JSON.parse(JSON.stringify(spec || {}));
  s.scene = s.scene || {};
  s.scene.id = s.scene.id || 'scene';
  s.scene.type = s.scene.type || 'technical-assembly';
  s.scene.style = s.scene.style || 'precision-editorial';
  s.scene.renderMode = s.scene.renderMode || 'webgl';
  s.scene.units = s.scene.units || 'mm';
  s.scene.fidelity = s.scene.fidelity || 'representative';
  s.scene.lighting = s.scene.lighting || 'studio';
  s.scene.camera = s.scene.camera || {};
  s.scene.camera.mode = s.scene.camera.mode || 'isometric';
  s.scene.camera.projection = s.scene.camera.projection || 'perspective';
  s.scene.camera.target = s.scene.camera.target || [0, 0, 0];
  s.scene.camera.fov = s.scene.camera.fov || 38;
  s.scene.camera.framing = s.scene.camera.framing || 'fit-padded';
  if (s.scene.camera.azimuth == null) s.scene.camera.azimuth = s.scene.camera.mode === 'front' ? 0 : s.scene.camera.mode === 'side' ? 90 : 45;
  if (s.scene.camera.elevation == null) s.scene.camera.elevation = s.scene.camera.mode === 'top' ? 89 : 28;
  s.materials = s.materials || {};
  s.assemblies = s.assemblies || [];
  s.connectors = s.connectors || [];
  s.annotations = s.annotations || [];
  s.interactions = Object.assign({
    orbit: true, select: true, inspect: true, explode: true,
    xray: true, section: true, isolate: true, ghost: true, flow: true, measure: true, tree: true
  }, s.interactions || {});
  s.behaviors = s.behaviors || [];
  for (const a of s.assemblies) {
    a.components = a.components || [];
    for (const c of a.components) {
      c.transform = c.transform || {};
      c.transform.position = c.transform.position || [0, 0, 0];
      c.transform.rotation = c.transform.rotation || [0, 0, 0];
      c.transform.scale = c.transform.scale || [1, 1, 1];
      c.anchors = c.anchors || {};
    }
  }
  return s;
}

export function flattenComponents(spec) {
  const out = [];
  for (const asm of spec.assemblies || []) {
    for (const c of asm.components || []) out.push({ component: c, assembly: asm });
  }
  return out;
}

// Explode vector for one component (assembled-space displacement at amount=1).
export function resolveExplodeVector(component, assembly, parentComponent, sceneBounds) {
  const ex = component.explode;
  if (Array.isArray(ex)) return ex.slice();
  if (ex && typeof ex === 'object' && ex.direction) {
    const d = vNorm(ex.direction);
    const dist = ex.distance != null ? ex.distance : defaultExplodeDistance(assembly, sceneBounds);
    return vScale(d, dist);
  }
  // Derived: away from parent (or assembly default direction).
  const fallbackDist = (ex && ex.distance != null) ? ex.distance : defaultExplodeDistance(assembly, sceneBounds);
  const aDir = assembly && assembly.explode && assembly.explode.direction ? assembly.explode.direction : null;
  const own = component.transform && component.transform.position ? component.transform.position : [0, 0, 0];
  if (parentComponent) {
    const pp = parentComponent.transform && parentComponent.transform.position ? parentComponent.transform.position : [0, 0, 0];
    let dir = vSub(own, pp);
    if (vLen(dir) < 1e-6) dir = aDir ? vNorm(aDir) : [0, 1, 0];
    else dir = vNorm(dir);
    return vScale(dir, fallbackDist);
  }
  if (aDir) return vScale(vNorm(aDir), fallbackDist);
  const dir = vLen(own) > 1e-6 ? vNorm(own) : [0, 1, 0];
  return vScale(dir, fallbackDist);
}

function defaultExplodeDistance(assembly, sceneBounds) {
  if (assembly && assembly.explode && assembly.explode.distance != null) return assembly.explode.distance;
  const r = sceneBounds ? aabbRadius(sceneBounds) : 100;
  return Math.max(20, r * 0.28);
}

export function explodeOrderOf(component, assembly, depth) {
  if (component.explode && !Array.isArray(component.explode) && component.explode && component.explode.order != null) return component.explode.order;
  return depth || 0;
}

// Staggered amount for one component: amount in [0,1] global, order n of maxOrder.
export function staggeredAmount(amount, order, maxOrder, window = 0.55) {
  if (maxOrder <= 0) return clamp01(amount);
  const start = (order / (maxOrder + 1)) * (1 - window);
  return clamp01((amount - start) / window);
}

export function clamp01(x) { return Math.max(0, Math.min(1, x)); }

export function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
export function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
export function backOut(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
export function applyEasing(t, name) {
  switch (name) {
    case 'linear': return t;
    case 'ease-out': return easeOut(t);
    case 'back-out': return backOut(t);
    case 'ease-in-out': default: return easeInOut(t);
  }
}

// ---------------------------------------------------------------- validation + audits
export function validateSceneSpec(spec) {
  const issues = [];
  const err = (code, msg, ctx) => issues.push({ level: 'error', code, message: msg, context: ctx });
  const warn = (code, msg, ctx) => issues.push({ level: 'warning', code, message: msg, context: ctx });
  const info = (code, msg, ctx) => issues.push({ level: 'info', code, message: msg, context: ctx });

  const schemaIssues = validateSchema(SCENE_SCHEMA, spec);
  if (schemaIssues.length) return schemaIssues;

  if (!spec || typeof spec !== 'object') { err('spec:invalid', 'Scene spec must be an object.'); return issues; }
  if (!spec.scene) err('scene:missing', 'Missing top-level "scene" block.');
  if (!Array.isArray(spec.assemblies) || spec.assemblies.length === 0) err('assemblies:missing', 'Scene must contain at least one assembly with components.');

  const ids = new Set();
  const materialNames = new Set(Object.keys(spec.materials || {}));
  const anchorRefs = new Set();
  const componentIds = new Set();
  const assemblyIds = new Set();
  const flat = [];

  for (const asm of spec.assemblies || []) {
    if (!asm.id) err('assembly:id', 'Assembly missing id.');
    else if (assemblyIds.has(asm.id)) err('assembly:dup', `Duplicate assembly id "${asm.id}".`, asm.id);
    else assemblyIds.add(asm.id);
    for (const c of asm.components || []) {
      flat.push({ component: c, assembly: asm });
      if (!c.id) err('component:id', `Component in assembly "${asm.id}" missing id.`);
      else if (ids.has(c.id)) err('component:dup', `Duplicate component id "${c.id}".`, c.id);
      else { ids.add(c.id); componentIds.add(c.id); }
      if (!c.geometry || !c.geometry.kind) err('component:geometry', `Component "${c.id}" missing geometry.kind.`, c.id);
      for (const [name, pt] of Object.entries(c.anchors || {})) {
        anchorRefs.add(`${c.id}.${name}`);
        if (!Array.isArray(pt) || pt.length !== 3 || pt.some((n) => typeof n !== 'number' || Number.isNaN(n))) {
          err('anchor:invalid', `Anchor "${c.id}.${name}" must be a numeric vec3.`, c.id);
        }
      }
      anchorRefs.add(c.id); // bare component ref = centroid
      const tf = c.transform || {};
      for (const key of ['position', 'rotation', 'scale']) {
        const v = tf[key];
        if (v && (!Array.isArray(v) || v.length !== 3 || v.some((n) => typeof n !== 'number' || Number.isNaN(n)))) {
          err('transform:invalid', `Component "${c.id}" has invalid ${key} (needs vec3 of numbers).`, c.id);
        }
      }
      if (c.material && typeof c.material === 'string' && !materialNames.has(c.material) && !isBuiltinPreset(c.material)) {
        warn('material:unknown', `Component "${c.id}" references unknown material "${c.material}".`, c.id);
      }
      // geometry sanity
      const g = c.geometry || {};
      validateGeometryNumbers(g, c.id, err);
      if (tf.scale && tf.scale.some(n => n === 0)) err('transform:scale', 'Scale cannot contain zero.', c.id);
      const nums = collectNumbers(g);
      for (const n of nums) if (!Number.isFinite(n)) err('geometry:nan', `Component "${c.id}" geometry contains NaN.`, c.id);
      if (g.kind === 'box' && g.size && g.size.some((n) => n <= 0)) err('geometry:size', `Component "${c.id}" box size must be positive.`, c.id);
      if ((g.kind === 'cylinder' || g.kind === 'sphere') && g.radius != null && g.radius <= 0) err('geometry:radius', `Component "${c.id}" radius must be positive.`, c.id);
    }
    // parent refs
    for (const c of asm.components || []) {
      if (c.parent && !componentIds.has(c.parent) && c.parent !== asm.id && !assemblyIds.has(c.parent)) {
        // parents may appear later in the same pass — do a second pass below
      }
    }
  }

  // second pass parent refs
  for (const { component: c, assembly: asm } of flat) {
    if (c.parent && !componentIds.has(c.parent) && !assemblyIds.has(c.parent)) {
      err('parent:missing', `Component "${c.id}" has unknown parent "${c.parent}".`, c.id);
    }
    if (c.parent === c.id) err('parent:self', `Component "${c.id}" cannot parent itself.`, c.id);
  }

  // cycle check
  const parentOf = new Map(flat.map(({ component: c, assembly: asm }) => [c.id, c.parent || asm.id]));
  for (const { component: c } of flat) {
    const seen = new Set([c.id]);
    let p = parentOf.get(c.id);
    while (p) {
      if (seen.has(p)) { err('parent:cycle', `Parent cycle detected at "${c.id}".`, c.id); break; }
      seen.add(p);
      p = parentOf.get(p);
    }
  }

  const connectorIds=new Set(),annotationIds=new Set();
  // connectors
  for (const con of spec.connectors || []) {
    if (!con.id) err('connector:id', 'Connector missing id.');
    if(connectorIds.has(con.id)) err('connector:dup','Duplicate connector id.',con.id);
    connectorIds.add(con.id);
    for (const endName of ['from', 'to']) {
      const end = con[endName];
      if (!end) { err('connector:endpoint', `Connector "${con.id}" missing ${endName}.`, con.id); continue; }
      if (end.anchor && !anchorRefs.has(end.anchor)) {
        err('connector:anchor', `Connector "${con.id}" ${endName} references unknown anchor "${end.anchor}".`, con.id);
      }
      if (end.position && (!Array.isArray(end.position) || end.position.length !== 3)) {
        err('connector:position', `Connector "${con.id}" ${endName} position must be vec3.`, con.id);
      }
    }
    if (con.geometry && con.geometry.radius != null && con.geometry.radius <= 0) err('connector:radius', `Connector "${con.id}" radius must be positive.`, con.id);
  }

  // annotations
  for (const ann of spec.annotations || []) {
    if (!ann.id) err('annotation:id', 'Annotation missing id.');
    if(annotationIds.has(ann.id)) err('annotation:dup','Duplicate annotation id.',ann.id);
    annotationIds.add(ann.id);
    if (ann.type === 'dimension' && !ann.targetB) err('annotation:dimension', `Dimension "${ann.id}" needs targetB.`, ann.id);
    for (const key of ['target', 'targetB']) {
      const t = ann[key];
      if (!t) continue;
      if (t.anchor && !anchorRefs.has(t.anchor)) {
        err('annotation:anchor', `Annotation "${ann.id}" ${key} references unknown anchor "${t.anchor}".`, ann.id);
      }
    }
    if ((ann.type === 'label' || ann.type === 'callout') && !ann.text) warn('annotation:text', `Annotation "${ann.id}" has no text.`, ann.id);
  }

  // behaviors
  for (const b of spec.behaviors || []) {
    if (b.assembly && !assemblyIds.has(b.assembly)) err('behavior:assembly', `Behavior references unknown assembly "${b.assembly}".`, b.type);
    if (b.component && !componentIds.has(b.component)) err('behavior:component', `Behavior references unknown component "${b.component}".`, b.type);
    if (b.amount != null && (b.amount < 0 || b.amount > 1)) warn('behavior:amount', `Behavior amount ${b.amount} outside [0,1].`, b.type);
  }

  // detail views and tour steps reference components/anchors by id
  const detailIds=new Set();
  for (const detail of spec.detailViews || []) {
    if (detailIds.has(detail.id)) err('detail:dup', `Duplicate detail view id "${detail.id}".`, detail.id);
    detailIds.add(detail.id);
    if (detail.target?.anchor && !anchorRefs.has(detail.target.anchor)) err('detail:anchor', `Detail view "${detail.id}" references unknown anchor "${detail.target.anchor}".`, detail.id);
  }
  for (const [index, step] of (spec.tour?.steps || []).entries()) {
    const label = step.id || `step ${index + 1}`;
    for (const id of step.highlight || []) if (!componentIds.has(id)) err('tour:component', `Tour step "${label}" highlights unknown component "${id}".`, label);
    if (step.select && !componentIds.has(step.select)) err('tour:component', `Tour step "${label}" selects unknown component "${step.select}".`, label);
    if (step.camera?.focus && !componentIds.has(step.camera.focus)) err('tour:component', `Tour step "${label}" focuses unknown component "${step.camera.focus}".`, label);
    if (step.explode && typeof step.explode === 'object') for (const id of Object.keys(step.explode)) if (!assemblyIds.has(id)) err('tour:assembly', `Tour step "${label}" explodes unknown assembly "${id}".`, label);
    const groups = new Set((spec.annotations || []).map(a => a.group).filter(Boolean));
    for (const group of Object.keys(step.annotationGroups || {})) if (!groups.has(group)) warn('tour:group', `Tour step "${label}" toggles unknown annotation group "${group}".`, label);
  }
  for (const ann of spec.annotations || []) {
    const when = ann.visibleWhen;
    if (when && when.explodeMin != null && when.explodeMax != null && when.explodeMin > when.explodeMax) err('annotation:visibleWhen', `Annotation "${ann.id}" has explodeMin > explodeMax.`, ann.id);
  }

  if(spec.metadata?.auditExceptions && !Array.isArray(spec.metadata.auditExceptions)) {err('audit:exception','auditExceptions must be an array.');return issues;}
  for(const exception of spec.metadata?.auditExceptions || []) {
    if(exception?.code!=='audit:intersecting' || !Array.isArray(exception.components) || exception.components.length!==2 || !exception.components.every(id=>componentIds.has(id)) || typeof exception.reason!=='string' || !exception.reason.trim()) err('audit:exception','Audit exceptions need two component IDs, audit:intersecting, and a reason.');
  }
  if (spec.scene && !spec.scene.fidelity) info('fidelity:undeclared', 'Scene has no fidelity declaration; defaulting to "representative".');
  return issues;
}

function isBuiltinPreset(name) {
  return [
    'aluminum', 'brushed-steel', 'steel-dark', 'copper', 'brass', 'gold', 'chrome',
    'pcb-green', 'pcb-blue', 'solder-mask', 'silicon', 'ceramic', 'plastic-black',
    'plastic-white', 'plastic-gray', 'rubber', 'glass', 'acrylic', 'emissive-amber',
    'emissive-cyan', 'ghost', 'wood', 'titanium'
  ].includes(name);
}

function collectNumbers(obj, out = []) {
  if (typeof obj === 'number') out.push(obj);
  else if (Array.isArray(obj)) for (const v of obj) collectNumbers(v, out);
  else if (obj && typeof obj === 'object') for (const v of Object.values(obj)) collectNumbers(v, out);
  return out;
}

// Geometry audits: spatial plausibility computed from spec-level AABBs.
export function auditScene(spec, options = {}) {
  const issues = [];
  const warn = (code, msg, ctx) => issues.push({ level: 'warning', code, message: msg, context: ctx });
  const info = (code, msg, ctx) => issues.push({ level: 'info', code, message: msg, context: ctx });

  if (validateSceneSpec(spec).some(i => i.level === 'error')) return [];
  const s = normalizeSpec(spec);
  const flat = flattenComponents(s);
  const boundsById = new Map();
  let sceneBounds = null;

  // assembled-space AABB per component. Spec semantics: component.transform is
  // authored in ASSEMBLY space (flat); `parent` is semantic only (explode
  // direction, inspect tree). So world transform = assembly transform + own.
  const partBounds = options.partBounds || (def => [geometryAABB(def)]);
  for (const { component: c, assembly } of flat) {
    if (c.visible === false) continue;
    const parts = partBounds(c.geometry).map(local => transformAuditBox(local, [c.transform, assembly.transform]));
    const world = parts.reduce((box, partBox) => aabbUnion(box, partBox), null);
    if (!world) continue;
    boundsById.set(c.id, { world, parts, component: c });
    sceneBounds = aabbUnion(sceneBounds, world);
  }

  // sibling overlap + detach checks
  const comps = [...boundsById.entries()];
  for (let i = 0; i < comps.length; i++) {
    for (let j = i + 1; j < comps.length; j++) {
      const [ida, a] = comps[i], [idb, b] = comps[j];
      if (a.component.parent === idb || b.component.parent === ida) continue;
      let fraction = 0;
      for (const ba of a.parts) for (const bb of b.parts) {
        const smaller = Math.min(aabbVolume(ba), aabbVolume(bb));
        if (smaller > 1e-9) fraction = Math.max(fraction, aabbOverlapVolume(ba, bb) / smaller);
      }
      if (fraction > 0.35) {
        const exception = (s.metadata?.auditExceptions || []).find(e => e.code === 'audit:intersecting' &&
          e.components?.length === 2 && e.components.includes(ida) && e.components.includes(idb) && e.reason?.trim());
        if (exception) info('audit:acknowledged', `Intentional overlap of "${ida}" and "${idb}": ${exception.reason}`, [ida, idb]);
        else warn('audit:intersecting', `Components "${ida}" and "${idb}" overlap heavily (~${Math.round(fraction * 100)}% of a smaller part).`, [ida, idb]);
      }
    }
  }

  // detached children: gap from child AABB to parent AABB
  for (const { component: c, assembly: asm } of flat) {
    const pid = c.parent;
    if (!pid || !boundsById.has(pid)) continue;
    if (!boundsById.has(c.id)) continue;
    const a = boundsById.get(c.id), b = boundsById.get(pid);
    const gap = aabbGap(a.world, b.world);
    const scale = aabbRadius(sceneBounds) || 100;
    if (gap > scale * 0.12) {
      warn('audit:detached', `Component "${c.id}" is detached from parent "${pid}" (gap ${gap.toFixed(1)} units).`, c.id);
    }
  }

  // top-level components that float with no parent (soft check)
  for (const { component: c, assembly: asm } of flat) {
    if (c.parent) continue;
    const entry = boundsById.get(c.id);
    if (!entry) continue;
    let nearest = Infinity, nearestId = null;
    for (const [oid, o] of boundsById) {
      if (oid === c.id) continue;
      const d = aabbGap(entry.world, o.world);
      if (d < nearest) { nearest = d; nearestId = oid; }
    }
    const scale = aabbRadius(sceneBounds) || 100;
    if (nearest > scale * 0.2 && flat.length > 1) {
      info('audit:isolated-component', `Component "${c.id}" floats ${nearest.toFixed(1)} units from nearest component "${nearestId}". Verify intent.`, c.id);
    }
  }

  // explode coverage
  for (const asm of s.assemblies) {
    const wantsExplode = asm.explode || (s.interactions && s.interactions.explode);
    if (!wantsExplode) continue;
    const missing = asm.components.filter((c) => !c.explode).map((c) => c.id);
    if (missing.length && missing.length === asm.components.length) {
      info('audit:explode-derived', `Assembly "${asm.id}" has no explicit explode vectors; engine will derive them from hierarchy.`, asm.id);
    }
  }

  // camera framing — only meaningful when the author pinned the camera.
  // With framing "fit"/"fit-padded" and no explicit distance, the engine frames automatically.
  const cam = s.scene.camera;
  if (sceneBounds && cam) {
    const manual = cam.framing === 'manual' || cam.distance != null;
    if (manual) {
      const center = aabbCenter(sceneBounds);
      const radius = aabbRadius(sceneBounds);
      const distance = cam.distance != null ? cam.distance : radius * 2.6;
      const camPos = cameraPosition(cam.target || center, distance, cam.azimuth, cam.elevation);
      const camDef = {
        position: camPos,
        target: cam.target || center,
        fov: cam.fov, aspect: 16 / 9,
        projection: cam.projection, orthoHeight: radius * 1.6
      };
      const fit = boundsInFrame(sceneBounds, camDef, 0.18);
      if (!fit.inFrame) {
        warn('audit:out-of-frame', `Scene bounds may be out of frame at the declared camera (max projected extent ${fit.maxExtent.toFixed(2)}). Use camera.framing "fit-padded" or adjust distance/target.`, { maxExtent: fit.maxExtent });
      }
    } else {
      info('audit:camera-auto', 'Camera framing is automatic (fit-padded); engine will frame computed bounds.');
    }
  }

  // summary
  const totalParts = flat.reduce((n, { component: c }) => n + (c.geometry && c.geometry.kind === 'compound' ? c.geometry.parts.length : 1), 0);
  info('audit:summary', `Components: ${flat.length}; primitive parts (with compounds): ${totalParts}; connectors: ${(s.connectors || []).length}; annotations: ${(s.annotations || []).length}; bounds radius: ${sceneBounds ? aabbRadius(sceneBounds).toFixed(1) : 'n/a'}.`);

  return issues;
}

function transformAuditBox(box, transforms) {
  const points = [];
  for (const x of [box.min[0], box.max[0]]) for (const y of [box.min[1], box.max[1]]) for (const z of [box.min[2], box.max[2]]) {
    let point = [x,y,z];
    for (const tf of transforms) point = composeTransform(tf)(point);
    points.push(point);
  }
  return aabbFromPoints(points);
}

function validateGeometryNumbers(g, id, err) {
  const positive = new Set(['width','height','depth','length','thickness','radius','tube','tubeR','baseH','finH','finT','postW','wall','shaftR','shaftL','headR','headH','hubR','spacing','inletR','outletR','boltCircle','neckR','frameT','hubRatio',
    'span','chord','rimRadius','damperRadius','wire','grip','mufflerRadius','tipRadius','tipLength','endplateHeight','hatRadius','hatHeight']);
  const counts = new Set(['fins','blades','count','chips','bolts','segments','spokes','coils','cylinders','elements','modules','tips','runners','subdivisions']);
  if (g.kind === 'loft' && g.thickness !== undefined && !(g.thickness > 0)) err('geometry:parameter', `Component "${id}" loft thickness must be positive.`, id);
  for (const obj of [g, g.params || {}]) for (const [key,value] of Object.entries(obj)) {
    if ((positive.has(key) && !(key==='radius' && ['box','chamferBox','roundedBox'].includes(g.kind)) && typeof value === 'number' && value <= 0) ||
        (counts.has(key) && (!Number.isInteger(value) || value < 1)) ||
        (['pins','heatPipes','substrateH','dieH','lidH','bevel','neckH'].includes(key) && (typeof value !== 'number' || value < 0))) {
      err('geometry:parameter', `Component "${id}" has invalid ${key}.`, id);
    }
    if(key==='size' && typeof value!=='number' && !Array.isArray(value)) err('geometry:size', `Component size must be numeric or a vec3.`, id);
    if (key === 'size' && ((Array.isArray(value) && (value.length !== 3 || value.some(n => !Number.isFinite(n) || n <= 0))) || (typeof value === 'number' && value <= 0))) err('geometry:size', `Component "${id}" size must be positive.`, id);
    if (positive.has(key) && typeof value !== 'number') err('geometry:parameter', `Component "${id}" ${key} must be numeric.`, id);
  }
  if(g.kind==='tube' && (g.path?.length || 0)<2) err('geometry:path','Tube needs at least two path points.',id);
  if(g.kind==='extrude' && (g.profile?.length || 0)<3) err('geometry:profile','Extrusion needs at least three profile points.',id);
  if(g.kind==='lathe' && (g.profile?.length || 0)<2) err('geometry:profile','Lathe needs at least two profile points.',id);
  if(g.kind==='loft') {
    const sections=Array.isArray(g.sections)?g.sections:[];
    if(new Set(sections.map(s=>s?.z)).size<2) err('geometry:sections',`Component "${id}" loft needs at least two sections at different z.`,id);
    for(const s of sections) if(s && Number.isFinite(s.top) && Number.isFinite(s.bottom) && s.top<s.bottom) err('geometry:sections',`Component "${id}" loft section at z=${s.z} has top below bottom.`,id);
    if(Array.isArray(g.arc) && g.arc.length===2 && !(g.arc[1]>g.arc[0] && g.arc[1]-g.arc[0]<=360)) err('geometry:arc',`Component "${id}" loft arc must increase and span at most 360°.`,id);
  }
  if(g.params?.holes!==undefined && !(Number.isInteger(g.params.holes) && g.params.holes>=0)) err('geometry:parameter',`Component "${id}" has invalid holes.`,id);
  if(g.params?.shape!==undefined && g.kind==='control-arm' && !['a-arm','link'].includes(g.params.shape)) err('geometry:parameter','Control-arm shape must be "a-arm" or "link".',id);
  if(g.params?.size!==undefined && g.kind==='fan' && typeof g.params.size!=='number') err('geometry:parameter','Fan size must be a number.',id);
  if(g.params?.size!==undefined && g.kind==='generic-recipe' && !Array.isArray(g.params.size)) err('geometry:parameter','Generic-recipe size must be a vec3.',id);
  for(const key of ['feet','flanges','shroud','sidePanels']) if(g.params?.[key]!==undefined && typeof g.params[key]!=='boolean') err('geometry:parameter',`${key} must be boolean.`,id);
  if(g.params?.hubRatio!==undefined && g.params.hubRatio>=.5) err('geometry:parameter','Fan hubRatio must be less than 0.5.',id);
  if(g.kind==='fan' && g.params?.frameT!==undefined && g.params.frameT>=(g.params.size || 60)/2) err('geometry:parameter','Fan frameT must leave an open interior.',id);
  for (const child of g.parts || []) {
    if(child.transform?.scale?.some(n=>n===0)) err('transform:scale','Compound part scale cannot contain zero.',id);
    validateGeometryNumbers(child.geometry,id,err);
  }
}
