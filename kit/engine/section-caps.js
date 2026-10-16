// section-caps.js — cross-section loops where a clipping plane cuts mesh triangles.
// Shared by the WebGL renderer (hatched cap meshes) and the vector renderers
// (hatched SVG cap polygons). Loops are world-space; open chains are dropped,
// so non-manifold recipe surfaces simply get no cap rather than a wrong one.

export function createSectionCapSystem(THREE) {
  const capMaterials = new Map();
  let hatchTexture = null;

  // Returns [[Vector3,...], ...] closed loops for one mesh against one plane.
  function loopsForMesh(mesh, plane) {
    const geometry = mesh.geometry, positions = geometry?.getAttribute('position');
    if (!positions) return [];
    mesh.updateWorldMatrix(true, false);
    const index = geometry.index, count = index ? index.count : positions.count;
    const world = new Array(positions.count);
    const vertex = i => world[i] || (world[i] = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld));
    const quantum = Math.max(1e-4, 1e-6 * (geometry.boundingSphere?.radius || (geometry.computeBoundingSphere(), geometry.boundingSphere.radius) || 1));
    const key = p => `${Math.round(p.x / quantum)},${Math.round(p.y / quantum)},${Math.round(p.z / quantum)}`;
    const points = new Map(), adjacency = new Map();
    const link = (a, b) => {
      const ka = key(a), kb = key(b);
      if (ka === kb) return;
      if (!points.has(ka)) points.set(ka, a);
      if (!points.has(kb)) points.set(kb, b);
      if (!adjacency.has(ka)) adjacency.set(ka, new Set());
      if (!adjacency.has(kb)) adjacency.set(kb, new Set());
      adjacency.get(ka).add(kb);adjacency.get(kb).add(ka);
    };
    for (let i = 0; i + 2 < count; i += 3) {
      const ids = [0, 1, 2].map(j => index ? index.getX(i + j) : i + j);
      const v = ids.map(vertex), d = v.map(p => plane.distanceToPoint(p));
      const crossings = [];
      for (let j = 0; j < 3; j++) {
        const a = j, b = (j + 1) % 3;
        if ((d[a] > 0 && d[b] < 0) || (d[a] < 0 && d[b] > 0)) crossings.push(v[a].clone().lerp(v[b], d[a] / (d[a] - d[b])));
        else if (d[a] === 0) crossings.push(v[a].clone());
      }
      const unique = [];
      for (const p of crossings) if (!unique.some(q => q.distanceToSquared(p) < quantum * quantum)) unique.push(p);
      if (unique.length === 2) link(unique[0], unique[1]);
    }
    const loops = [], used = new Set();
    for (const start of adjacency.keys()) {
      if (used.has(start)) continue;
      const loop = [start];used.add(start);
      let previous = null, current = start, closed = false;
      for (let guard = 0; guard < adjacency.size + 2; guard++) {
        const next = [...adjacency.get(current)].find(k => k !== previous && (!used.has(k) || (k === start && loop.length > 2)));
        if (!next) break;
        if (next === start) {closed = true;break;}
        loop.push(next);used.add(next);previous = current;current = next;
      }
      if (closed && loop.length >= 3) loops.push(loop.map(k => points.get(k)));
    }
    return loops;
  }

  // Loops grouped by component id for every clipped, visible, opaque mesh.
  function sectionLoops(root, plane) {
    const byComponent = new Map();
    root.updateWorldMatrix(true, true);
    root.traverse(mesh => {
      if (!mesh.isMesh || !visibleChain(mesh)) return;
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (!material || material.opacity < .5) return;
      let owner = mesh;
      while (owner && !owner.userData.componentId) owner = owner.parent;
      if (!owner) return;
      const loops = loopsForMesh(mesh, plane);
      if (!loops.length) return;
      const id = owner.userData.componentId;
      if (!byComponent.has(id)) byComponent.set(id, {id, loops: [], color: material.color?.getHexString?.() || '888888'});
      byComponent.get(id).loops.push(...loops);
    });
    return [...byComponent.values()];
  }

  function visibleChain(node) {for (let p = node; p; p = p.parent) if (!p.visible) return false;return true;}

  // 2D frame on the plane: u, v orthonormal, origin = plane point.
  function planeFrame(plane) {
    const n = plane.normal.clone().normalize();
    const helper = Math.abs(n.y) < .9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(helper, n).normalize(), v = new THREE.Vector3().crossVectors(n, u).normalize();
    const origin = n.clone().multiplyScalar(-plane.constant);
    return {n, u, v, origin, to2D: p => {const d = p.clone().sub(origin);return new THREE.Vector2(d.dot(u), d.dot(v));}};
  }

  // Outer loops get holes by even-odd nesting depth.
  function shapesFromLoops(loops, frame) {
    const flat = loops.map(loop => loop.map(frame.to2D)).filter(loop => Math.abs(THREE.ShapeUtils.area(loop)) > 1e-8);
    const depth = flat.map((loop, i) => flat.reduce((sum, other, j) => sum + (i !== j && pointInPolygon(loop[0], other) ? 1 : 0), 0));
    const shapes = [];
    flat.forEach((loop, i) => {
      if (depth[i] % 2) return;
      const outer = THREE.ShapeUtils.isClockWise(loop) ? loop.slice().reverse() : loop;
      const shape = new THREE.Shape(outer);
      flat.forEach((hole, j) => {
        if (depth[j] === depth[i] + 1 && pointInPolygon(hole[0], loop)) shape.holes.push(new THREE.Path(THREE.ShapeUtils.isClockWise(hole) ? hole : hole.slice().reverse()));
      });
      shapes.push(shape);
    });
    return shapes;
  }

  function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }

  function hatch() {
    if (hatchTexture) return hatchTexture;
    const canvas = document.createElement('canvas');canvas.width = canvas.height = 64;
    const g = canvas.getContext('2d');
    g.fillStyle = '#ffffff';g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#3a3f46';g.lineWidth = 5;
    for (let x = -64; x <= 128; x += 16) {g.beginPath();g.moveTo(x, 64);g.lineTo(x + 64, 0);g.stroke();}
    hatchTexture = new THREE.CanvasTexture(canvas);
    hatchTexture.wrapS = hatchTexture.wrapT = THREE.RepeatWrapping;
    hatchTexture.encoding = THREE.sRGBEncoding;
    return hatchTexture;
  }

  function capMaterial(color) {
    if (capMaterials.has(color)) return capMaterials.get(color);
    const material = new THREE.MeshBasicMaterial({color: new THREE.Color('#' + color).lerp(new THREE.Color('#ffffff'), .35), map: hatch(), side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, toneMapped: false});
    capMaterials.set(color, material);return material;
  }

  // Builds a group of hatched cap meshes in world space; caller disposes.
  function buildCapGroup(root, plane, hatchScale = 6) {
    const group = new THREE.Group();group.name = 'sd-section-caps';
    const frame = planeFrame(plane), basis = new THREE.Matrix4().makeBasis(frame.u, frame.v, frame.n).setPosition(frame.origin);
    for (const section of sectionLoops(root, plane)) {
      const shapes = shapesFromLoops(section.loops, frame);
      if (!shapes.length) continue;
      const geometry = new THREE.ShapeGeometry(shapes);
      const uv = geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / hatchScale, uv.getY(i) / hatchScale);
      const mesh = new THREE.Mesh(geometry, capMaterial(section.color));
      mesh.applyMatrix4(basis);mesh.userData.capFor = section.id;mesh.renderOrder = 2;
      group.add(mesh);
    }
    return group;
  }

  function disposeCapGroup(group) {
    if (!group) return;
    group.traverse(o => o.geometry?.dispose());
    group.removeFromParent();
  }

  function dispose() {
    capMaterials.forEach(m => m.dispose());capMaterials.clear();
    hatchTexture?.dispose();hatchTexture = null;
  }

  return {loopsForMesh, sectionLoops, buildCapGroup, disposeCapGroup, planeFrame, dispose};
}
