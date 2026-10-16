// geometry.js — geometry builders: Level-1 primitives and Level-2 parametric recipes.
// Every builder returns {kind:'compound', parts:[...]} or {kind:'single', geometry}.
// Parts: { geometry, position, rotation, scale, material, name }.

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
    return single(new THREE.LatheGeometry(pts, g.segments || 28));
  }

  function buildTube(g) {
    const path = new THREE.CatmullRomCurve3((g.path || [[0, 0, 0], [0, 10, 0]]).map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    return single(new THREE.TubeGeometry(path, g.segments || 32, g.radius != null ? g.radius : 1, 10, false));
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
    const boxes = parts.map(p => {
      const matrix = new THREE.Matrix4().compose(new THREE.Vector3().fromArray(p.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.rotation)), new THREE.Vector3().fromArray(p.scale));
      const b = new THREE.Box3().makeEmpty(), v = new THREE.Vector3();
      const vertices = p.geometry.getAttribute('position');
      for (let i=0; i<vertices.count; i++) b.expandByPoint(v.fromBufferAttribute(vertices,i).applyMatrix4(matrix));
      p.geometry.dispose();
      return {min:b.min.toArray(),max:b.max.toArray()};
    });
    auditBoundsCache.set(key,boxes);
    return boxes;
  }

  return { buildGeometry, partBounds, RECIPES, clearBoundsCache: () => auditBoundsCache.clear() };
}
