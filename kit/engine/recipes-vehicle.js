// recipes-vehicle.js — Level-2 recipes for vehicles and motorsport hardware.
// Same contract as geometry.js recipes: centred unless noted, axis conventions
// documented per recipe, parts with material null take the component material.
// Registered into RECIPES by geometry.js (createGeometrySystem).

export function createVehicleRecipes(THREE, kit) {
  const {part, compound, buildChamferBox, buildRoundedBox, buildCylinder, buildSphere, buildTube, revolveProfile, cylinderBetween} = kit;
  const num = (value, fallback) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
  const count = (value, fallback, min = 1) => Math.max(min, Math.round(num(value, fallback)));
  const rotY = (geo, angle) => geo.applyMatrix4(new THREE.Matrix4().makeRotationY(angle));
  const rotX = (geo, angle) => geo.applyMatrix4(new THREE.Matrix4().makeRotationX(angle));
  const rotZ = (geo, angle) => geo.applyMatrix4(new THREE.Matrix4().makeRotationZ(angle));
  const at = (geo, x, y, z) => {geo.translate(x, y, z);return geo;};
  const ledWhite = {preset: 'plastic-white', emissive: '#f4f8ff', emissiveIntensity: 1.1};
  // Rounded polyline: Catmull-Rom through points pulled back from each corner.
  const fillet = (points, radius) => {
    if (points.length < 3) return points;
    const out = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
      const p = new THREE.Vector3(...points[i]), a = new THREE.Vector3(...points[i - 1]), c = new THREE.Vector3(...points[i + 1]);
      const da = a.clone().sub(p), dc = c.clone().sub(p), r = Math.min(radius, da.length() * .45, dc.length() * .45);
      out.push(p.clone().addScaledVector(da.normalize(), r).toArray(), p.clone().addScaledVector(dc.normalize(), r).toArray());
    }
    out.push(points[points.length - 1]);
    return out;
  };
  const tube = (points, radius, opts = {}) => {
    const path = fillet(points, opts.fillet ?? radius * 3);
    let length = 0;for (let i = 1; i < path.length; i++) length += Math.hypot(...path[i].map((v, k) => v - path[i - 1][k]));
    return part(buildTube({path, radius, segments: opts.segments || Math.max(6, Math.min(48, Math.round(length / (radius * 3.5))))}).geometry, opts);
  };

  // wheel — axis +Y, outer face toward +Y. Tyre, rim barrel, spokes, hub, centre-lock nut.
  function recipeWheel(g) {
    const p = g.params || {};
    const R = num(p.radius, 345), W = num(p.width, 275), hw = W / 2, Rr = num(p.rimRadius, R * .735), h = R - Rr;
    const spokes = count(p.spokes, 10, 3), rh = Rr * .26;
    const parts = [part(revolveProfile([
      [Rr + 1, -hw * .84], [Rr + h * .10, -hw * .98], [Rr + h * .55, -hw], [R - h * .12, -hw * .97], [R - h * .02, -hw * .86], [R, -hw * .70],
      [R, hw * .70], [R - h * .02, hw * .86], [R - h * .12, hw * .97], [Rr + h * .55, hw], [Rr + h * .10, hw * .98], [Rr + 1, hw * .84]], 64, {smooth: true}), {name: 'tyre', material: p.tireMaterial || 'rubber'})];
    parts.push(part(revolveProfile([[Rr - 10, -hw * .82], [Rr, -hw * .82], [Rr, hw * .80], [Rr + 14, hw * .80], [Rr + 14, hw * .92], [Rr - 10, hw * .92]], 64), {name: 'rim-barrel', material: p.rimMaterial || null}));
    const outerY = hw * .70, dish = 9 * Math.PI / 180, twin = p.twin !== false;
    for (let i = 0; i < spokes; i++) {
      for (const offset of twin ? [-.055, .055] : [0]) {
        const a = (i / spokes) * Math.PI * 2 + offset, inner = rh * .9, outer = Rr - 8, length = outer - inner, mid = (inner + outer) / 2;
        const geo = new THREE.BoxGeometry(length, Math.max(8, W * .06), twin ? Math.max(10, Rr * .055) : Math.max(14, Rr * .09));
        rotZ(geo, -dish);rotY(geo, -a);at(geo, mid * Math.cos(a), outerY - length * Math.sin(dish) * .1, mid * Math.sin(a));
        parts.push(part(geo, {name: 'spoke', material: p.rimMaterial || null}));
      }
    }
    parts.push(part(buildCylinder({radius: rh, height: W * .30, segments: 28}).geometry, {position: [0, hw * .52, 0], name: 'hub', material: p.rimMaterial || null}));
    if (p.centerLock !== false) parts.push(part(buildCylinder({radius: rh * .55, height: W * .16, segments: 12}).geometry, {position: [0, hw * .52 + W * .23, 0], name: 'centre-lock-nut', material: p.nutMaterial || 'chrome'}));
    return compound(parts);
  }

  // brake-assembly — axis +Y. Ventilated-look disc, bell, cross-drilling, monoblock caliper.
  // caliperAngle (deg, local XZ from +X toward +Z) places the caliper around the disc.
  function recipeBrakeAssembly(g) {
    const p = g.params || {};
    const R = num(p.radius, 200), t = num(p.thickness, 34), hatR = num(p.hatRadius, R * .55), hatH = num(p.hatHeight, 44);
    const parts = [
      part(revolveProfile([[hatR * .98, -t / 2], [R, -t / 2], [R, t / 2], [hatR * .98, t / 2]], 64), {name: 'disc', material: p.discMaterial || null}),
      part(revolveProfile([[hatR * .98, t / 2 - 2], [hatR, t / 2], [hatR * .94, t / 2 + hatH], [R * .18, t / 2 + hatH], [R * .18, t / 2 + hatH - 8], [hatR * .86, t / 2 + hatH - 8], [hatR * .9, t / 2 - 2]], 48), {name: 'bell', material: p.bellMaterial || 'aluminum'})
    ];
    const holes = count(p.holes, 24, 0);
    for (let i = 0; i < holes; i++) {
      const a = (i / Math.max(1, holes)) * Math.PI * 2, r = hatR + (R - hatR) * (i % 2 ? .66 : .38);
      parts.push(part(buildCylinder({radius: R * .022, height: t + 1, segments: 8}).geometry, {position: [r * Math.cos(a), 0, r * Math.sin(a)], name: 'drilling', material: 'plastic-black'}));
    }
    if (p.caliper !== false) {
      const a = num(p.caliperAngle, 120) * Math.PI / 180, rc = R * .86, turn = Math.PI / 2 - a;
      const caliper = (size, radial, y, name, material) => {
        const geo = buildChamferBox({size, radius: Math.min(...size) * .18}).geometry;
        rotY(at(geo, 0, y, radial), turn);
        parts.push(part(at(geo, rc * Math.cos(a), 0, rc * Math.sin(a)), {name, material}));
      };
      const material = p.caliperMaterial || {preset: 'plastic-white', color: '#f2b705', metalness: .25, roughness: .42};
      caliper([R * .62, t * 2.5, R * .30], 0, 0, 'caliper-body', material);
      caliper([R * .48, t * .9, R * .38], R * .04, t * 1.05, 'caliper-bridge', material);
      for (const s of [-1, 1]) {
        const geo = buildCylinder({radius: R * .06, height: 6, segments: 12}).geometry;
        rotY(at(geo, s * R * .16, t * 1.55, 0), turn);
        parts.push(part(at(geo, rc * Math.cos(a), 0, rc * Math.sin(a)), {name: 'piston-cap', material: 'aluminum'}));
      }
    }
    return compound(parts);
  }

  // coilover — axis +Y, bottom eye at -length/2. Spring takes the component material.
  function recipeCoilover(g) {
    const p = g.params || {};
    const L = num(p.length, 380), Rs = num(p.radius, 52), coils = count(p.coils, 7, 2), wire = num(p.wire, 7), Rd = num(p.damperRadius, 22);
    const y0 = -L / 2, y1 = L / 2, perch = y0 + L * .30, cap = y1 - L * .07;
    const parts = [
      part(buildCylinder({radius: Rd, height: L * .52, segments: 22}).geometry, {position: [0, y0 + L * .32, 0], name: 'damper-body', material: 'steel-dark'}),
      part(buildCylinder({radius: Rd * .36, height: L * .40, segments: 14}).geometry, {position: [0, y0 + L * .78, 0], name: 'shaft', material: 'chrome'}),
      part(cylinderBetween([-Rd * .7, y0 + Rd * .7, 0], [Rd * .7, y0 + Rd * .7, 0], Rd * .9, 16), {name: 'eye', material: 'steel-dark'}),
      part(buildCylinder({radius: Rs * 1.18, height: 8, segments: 28}).geometry, {position: [0, perch, 0], name: 'perch', material: 'aluminum'}),
      part(buildCylinder({radius: Rs * 1.22, height: 10, segments: 28}).geometry, {position: [0, cap, 0], name: 'top-mount', material: 'aluminum'}),
      part(buildCylinder({radius: Rs * .9, height: 8, segments: 24}).geometry, {position: [0, y1 - 6, 0], name: 'top-plate', material: 'steel-dark'}),
      part(buildCylinder({radius: 10, height: 14, segments: 12}).geometry, {position: [0, y1 + 4, 0], name: 'adjuster', material: 'aluminum'})
    ];
    const ys = perch + 4 + wire, ye = cap - 5 - wire, points = [];
    for (let i = 0; i <= coils * 20; i++) {
      const t = i / (coils * 20), a = t * coils * Math.PI * 2;
      points.push(new THREE.Vector3(Rs * Math.cos(a), ys + (ye - ys) * t, Rs * Math.sin(a)));
    }
    parts.push(part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), coils * 28, wire / 2 * 1.6, 8, false), {name: 'spring', material: p.springMaterial || null}));
    return compound(parts);
  }

  // control-arm — lies in XZ; inner pivots at x = 0 (z = ±depth/2), ball joint at +x (span).
  // shape 'link' gives a single straight link with bushings at both ends.
  function recipeControlArm(g) {
    const p = g.params || {};
    const S = num(p.span, 420), Dz = num(p.depth, 260), r = num(p.radius, 13);
    const bushing = (x, z) => {const geo = buildCylinder({radius: r * 1.9, height: r * 3.4, segments: 16}).geometry;rotX(geo, Math.PI / 2);return part(at(geo, x, 0, z), {name: 'bushing', material: p.bushingMaterial || 'rubber'});};
    if (p.shape === 'link') return compound([part(cylinderBetween([0, 0, 0], [S, 0, 0], r, 12), {name: 'link'}), bushing(0, 0), bushing(S, 0)]);
    return compound([
      part(cylinderBetween([0, 0, -Dz / 2], [S * .97, 0, 0], r, 12), {name: 'arm'}),
      part(cylinderBetween([0, 0, Dz / 2], [S * .97, 0, 0], r, 12), {name: 'arm'}),
      part(buildChamferBox({size: [S * .2, r * 1.5, Dz * .2], radius: r * .3}).geometry, {position: [S * .8, 0, 0], name: 'gusset'}),
      part(buildSphere({radius: r * 1.7, segments: 16}).geometry, {position: [S, 0, 0], name: 'ball-joint', material: 'chrome'}),
      bushing(0, -Dz / 2), bushing(0, Dz / 2)
    ]);
  }

  // steering-rack — along X. Housing, bellows, tie rods, pinion tower.
  function recipeSteeringRack(g) {
    const p = g.params || {};
    const L = num(p.length, 700), r = num(p.radius, 26), half = L * .31;
    const parts = [part(cylinderBetween([-half, 0, 0], [half, 0, 0], r, 20), {name: 'housing'})];
    for (const s of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const geo = new THREE.TorusGeometry(r * .82, r * .26, 8, 20);rotY(geo, Math.PI / 2);
        parts.push(part(at(geo, s * (half + r * .25 + i * r * .42), 0, 0), {name: 'bellows', material: 'rubber'}));
      }
      parts.push(part(cylinderBetween([s * half, 0, 0], [s * L * .5, 0, 0], r * .26, 10), {name: 'tie-rod', material: 'chrome'}));
      parts.push(part(buildSphere({radius: r * .55, segments: 12}).geometry, {position: [s * L * .5, 0, 0], name: 'tie-rod-end', material: 'steel-dark'}));
      parts.push(part(buildChamferBox({size: [r * 1.6, r * .9, r * 2.6], radius: 2}).geometry, {position: [s * half * .62, -r * 1.05, 0], name: 'mount', material: 'steel-dark'}));
    }
    parts.push(part(cylinderBetween([-L * .18, 0, 0], [-L * .18, r * 3.2, r * 1.6], r * .72, 14), {name: 'pinion-tower'}));
    return compound(parts);
  }

  // bucket-seat — faces +Z, origin at the base centre. Shell takes the component material.
  function recipeBucketSeat(g) {
    const p = g.params || {};
    const W = num(p.width, 520), H = num(p.height, 980), D = num(p.depth, 560), pad = p.padMaterial || 'plastic-black', tilt = -14 * Math.PI / 180;
    const back = (size, local, extraY = 0) => {
      const geo = buildRoundedBox({size, radius: Math.min(...size) * .28}).geometry;
      at(geo, local[0], local[1], local[2]);rotX(geo, tilt);if (extraY) rotY(geo, extraY);
      return at(geo, 0, H * .53, -D * .38);
    };
    const parts = [
      part(back([W, H * .86, 46], [0, 0, -24]), {name: 'shell-back'}),
      part(buildRoundedBox({size: [W * .96, H * .17, D * .92], radius: 30}).geometry, {position: [0, H * .085, 0], name: 'shell-base'}),
      part(buildRoundedBox({size: [W * .62, H * .07, D * .74], radius: 22}).geometry, {position: [0, H * .2, D * .04], name: 'cushion', material: pad}),
      part(back([W * .6, H * .62, 40], [0, -H * .02, 20]), {name: 'back-pad', material: pad})
    ];
    for (const s of [-1, 1]) {
      const geo = buildRoundedBox({size: [W * .17, H * .6, 120], radius: 36}).geometry;
      at(geo, s * W * .38, 0, 32);rotY(geo, -s * .2);rotX(geo, tilt);at(geo, 0, H * .53, -D * .38);
      parts.push(part(geo, {name: 'back-bolster', material: pad}));
      parts.push(part(buildRoundedBox({size: [W * .17, H * .12, D * .72], radius: 30}).geometry, {position: [s * W * .39, H * .22, D * .04], name: 'cushion-bolster', material: pad}));
      parts.push(part(back([W * .08, H * .07, 10], [s * W * .12, H * .33, 44]), {name: 'harness-slot', material: 'steel-dark'}));
    }
    if (p.accentMaterial) for (const s of [-1, 1]) parts.push(part(back([10, H * .5, 12], [s * W * .3, 0, 44]), {name: 'accent', material: p.accentMaterial}));
    return compound(parts);
  }

  // steering-wheel — rim in XZ, facing +Y; 12 o'clock toward +Z. Paddles behind the hub.
  function recipeSteeringWheel(g) {
    const p = g.params || {};
    const R = num(p.radius, 170), t = num(p.grip, 15);
    const rim = new THREE.TorusGeometry(R, t, 12, 48);rotX(rim, Math.PI / 2);
    const parts = [part(rim, {name: 'rim'}),
      part(buildCylinder({radius: R * .3, height: t * 2.6, segments: 28}).geometry, {position: [0, -t * .4, 0], name: 'hub', material: 'steel-dark'}),
      part(buildCylinder({radius: R * .12, height: R * .9, segments: 16}).geometry, {position: [0, -R * .55, 0], name: 'column', material: 'steel-dark'})];
    for (const a of [0, Math.PI, Math.PI * 1.5]) {
      const geo = new THREE.BoxGeometry(R * .72, t * .9, t * 2.2);rotY(geo, -a);
      parts.push(part(at(geo, R * .62 * Math.cos(a), -t * .2, R * .62 * Math.sin(a)), {name: 'spoke', material: 'steel-dark'}));
    }
    parts.push(part(buildChamferBox({size: [t * .9, t * 2.15, t * 2.15], radius: 2}).geometry, {position: [0, 0, R], name: 'centre-marker', material: p.markerMaterial || {preset: 'plastic-white', color: '#d6001c'}}));
    for (const s of [-1, 1]) parts.push(part(buildChamferBox({size: [R * .32, 6, R * .5], radius: 2}).geometry, {position: [s * R * .42, -t * 2.2, R * .05], name: 'paddle', material: 'aluminum'}));
    return compound(parts);
  }

  // roll-cage — origin at floor centre, front +Z. Main hoop, A-pillar/roof bars, stays, diagonals, door bars.
  // topRatio narrows the roof-level tubes (fits a tapering greenhouse) while door bars stay at full width.
  function recipeRollCage(g) {
    const p = g.params || {};
    const W = num(p.width, 1240), H = num(p.height, 1060), L = num(p.length, 1500), r = num(p.radius, 20), hx = W / 2, tx = hx * num(p.topRatio, .82);
    const zm = -L * .32, zf = L * .62, zr = L * .12, zs = zm - L * .48, opts = {name: 'tube'};
    const parts = [
      tube([[-hx, 0, zm], [-hx, H * .5, zm], [-tx * 1.06, H * .95, zm], [-tx, H, zm], [tx, H, zm], [tx * 1.06, H * .95, zm], [hx, H * .5, zm], [hx, 0, zm]], r, opts),
      tube([[-tx * 1.02, H * .96, zr], [tx * 1.02, H * .96, zr]], r, opts),
      tube([[-hx * .96, H * .08, zm], [tx * 1.02, H * .97, zm]], r, opts),
      tube([[-hx * .98, H * .5, zm], [hx * .98, H * .5, zm]], r * .85, opts),
      tube([[-hx * .70, H * .45, zs], [hx * .70, H * .45, zs]], r * .85, opts)
    ];
    for (const s of [-1, 1]) {
      parts.push(tube([[s * hx * .98, 0, zf], [s * hx * .95, H * .45, zf * .78], [s * tx * 1.02, H * .96, zr], [s * tx, H, zm]], r, opts));
      parts.push(tube([[s * tx, H, zm], [s * hx * .70, H * .45, zs]], r, opts));
      if (p.doorBars !== false) {
        parts.push(tube([[s * hx, H * .12, zf * .92], [s * hx, H * .42, zm]], r * .85, opts));
        parts.push(tube([[s * hx, H * .40, zf * .85], [s * hx, H * .14, zm]], r * .85, opts));
      }
      for (const z of [zm, zf]) parts.push(part(buildChamferBox({size: [r * 5, 6, r * 5], radius: 1}).geometry, {position: [s * hx * (z === zf ? .98 : 1), 3, z], name: 'foot-plate', material: 'steel-dark'}));
    }
    return compound(parts);
  }

  // airfoil-wing — span along X, chord along Z (leading edge +Z), up +Y. Inverted (downforce) camber.
  // angle tilts the trailing edge up; elements 2 adds a slotted flap; endplates close the tips.
  function airfoilGeometry(chord, thickness, camber, span) {
    const shape = new THREE.Shape(), n = 26, pp = .4;
    const yt = x => 5 * thickness * (.2969 * Math.sqrt(x) - .1260 * x - .3516 * x * x + .2843 * x ** 3 - .1036 * x ** 4);
    const yc = x => x < pp ? camber / (pp * pp) * (2 * pp * x - x * x) : camber / ((1 - pp) ** 2) * ((1 - 2 * pp) + 2 * pp * x - x * x);
    const pts = [];
    for (let i = 0; i <= n; i++) {const x = (1 - Math.cos(Math.PI * i / n)) / 2;pts.push([x * chord, -(yc(x) + yt(x)) * chord]);}
    for (let i = n - 1; i > 0; i--) {const x = (1 - Math.cos(Math.PI * i / n)) / 2;pts.push([x * chord, -(yc(x) - yt(x)) * chord]);}
    pts.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y));shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {depth: span, bevelEnabled: false, curveSegments: 4});
    geo.translate(-chord / 2, 0, -span / 2);rotY(geo, Math.PI / 2);
    return geo;
  }
  function recipeAirfoilWing(g) {
    const p = g.params || {};
    const S = num(p.span, 1700), c = num(p.chord, 320), th = num(p.thickness, .12), angle = num(p.angle, 6) * Math.PI / 180;
    const main = airfoilGeometry(c, th, num(p.camber, .05), S);rotX(main, angle);
    const parts = [part(main, {name: 'main-plane'})];
    if (count(p.elements, 2, 1) > 1) {
      const c2 = c * .42, flap = airfoilGeometry(c2, th * .85, .06, S * .985);rotX(flap, angle + 22 * Math.PI / 180);
      parts.push(part(at(flap, 0, c * .1, -c / 2 - c2 * .22), {name: 'flap'}));
    }
    if (p.endplates !== false) {
      const endH = num(p.endplateHeight, c * .85);
      for (const s of [-1, 1]) parts.push(part(buildRoundedBox({size: [10, endH, c * 1.5], radius: 4}).geometry, {position: [s * (S / 2 + 5), endH * .08, -c * .2], name: 'endplate'}));
    }
    if (p.mounts !== false) for (const s of [-1, 1]) parts.push(part(buildChamferBox({size: [36, 26, c * .36], radius: 4}).geometry, {position: [s * S * .17, th * c * .55 + 10, c * .05], name: 'mount-pad', material: 'aluminum'}));
    return compound(parts);
  }

  // flat-engine — horizontally opposed; crank along Z, flywheel flange at +Z, accessory drive at -Z.
  function recipeFlatEngine(g) {
    const p = g.params || {};
    const n = count(p.cylinders, 6, 2), per = Math.ceil(n / 2), L = num(p.length, 600), W = num(p.width, 820), H = num(p.height, 500);
    const cover = p.coverMaterial || 'steel-dark', pitch = L / per;
    const parts = [
      part(buildChamferBox({size: [W * .34, H * .56, L], radius: 14}).geometry, {position: [0, -H * .04, 0], name: 'crankcase'}),
      part(buildChamferBox({size: [W * .30, H * .16, L * .82], radius: 10}).geometry, {position: [0, -H * .40, 0], name: 'sump'}),
      part(cylinderBetween([0, -H * .04, L / 2], [0, -H * .04, L / 2 + 36], H * .40, 36), {name: 'flywheel-flange'}),
      part(cylinderBetween([0, 0, -L / 2], [0, 0, -L / 2 - 28], H * .16, 28), {name: 'pulley', material: 'aluminum'}),
      part(cylinderBetween([W * .12, H * .28, -L / 2], [W * .12, H * .28, -L / 2 - 24], H * .09, 20), {name: 'idler', material: 'aluminum'}),
      part(cylinderBetween([-W * .12, H * .30, -L / 2 + 10], [-W * .12, H * .30, -L / 2 - 60], H * .11, 20), {name: 'alternator', material: 'aluminum'}),
      part(cylinderBetween([W * .08, -H * .30, -L * .30], [W * .08, -H * .30 - 70, -L * .30 - 30], 34, 16), {name: 'oil-filter', material: 'plastic-black'})
    ];
    for (const s of [-1, 1]) {
      for (let i = 0; i < per; i++) {
        const z = -L / 2 + pitch * (i + .5);
        parts.push(part(cylinderBetween([s * W * .17, 0, z], [s * W * .33, 0, z], pitch * .40, 20), {name: 'barrel'}));
        parts.push(tube([[s * W * .40, H * .22, z], [s * W * .36, H * .42, z], [s * W * .18, H * .52, z]], pitch * .13, {name: 'intake-runner', material: 'aluminum', fillet: 40}));
        parts.push(tube([[s * W * .40, -H * .22, z], [s * W * .36, -H * .42, z], [s * W * .12, -H * .50, z + pitch * .2]], pitch * .11, {name: 'header', material: p.headerMaterial || 'titanium', fillet: 40}));
        parts.push(part(buildChamferBox({size: [W * .05, H * .06, pitch * .32], radius: 3}).geometry, {position: [s * W * .48, H * .27, z], name: 'coil', material: 'plastic-black'}));
      }
      parts.push(part(buildChamferBox({size: [W * .12, H * .50, L * .96], radius: 10}).geometry, {position: [s * W * .39, H * .02, 0], name: 'head'}));
      parts.push(part(buildRoundedBox({size: [W * .07, H * .40, L * .92], radius: 14}).geometry, {position: [s * W * .48, H * .04, 0], name: 'cam-cover', material: cover}));
      parts.push(part(buildChamferBox({size: [W * .07, H * .08, L * .12], radius: 3}).geometry, {position: [s * W * .18, H * .25, -L * .42], name: 'mount', material: 'rubber'}));
    }
    return compound(parts);
  }

  // intake-plenum — length along Z, sits on its base (y = 0 up). Throttle bodies at +Z, runner stubs below.
  function recipeIntakePlenum(g) {
    const p = g.params || {};
    const L = num(p.length, 520), W = num(p.width, 320), H = num(p.height, 150), runners = count(p.runners, 6, 2), per = Math.ceil(runners / 2);
    const parts = [part(buildRoundedBox({size: [W, H, L], radius: Math.min(W, H) * .3}).geometry, {position: [0, H * .5, 0], name: 'plenum'})];
    for (const s of [-1, 1]) {
      parts.push(part(cylinderBetween([s * W * .22, H * .45, L / 2], [s * W * .22, H * .45, L / 2 + L * .18], H * .26, 24), {name: 'throttle-body', material: 'aluminum'}));
      for (let i = 0; i < per; i++) {
        const z = -L / 2 + L * (i + .5) / per;
        parts.push(part(cylinderBetween([s * W * .36, H * .1, z], [s * W * .36, -H * .5, z], H * .14, 14), {name: 'runner-stub', material: 'aluminum'}));
      }
    }
    for (let i = -1; i <= 1; i++) parts.push(part(buildChamferBox({size: [W * .7, 8, 18], radius: 2}).geometry, {position: [0, H + 4, i * L * .28], name: 'rib'}));
    return compound(parts);
  }

  // transaxle — along Z, bell housing at -Z (mates an engine ahead or behind), differential across X.
  function recipeTransaxle(g) {
    const p = g.params || {};
    const L = num(p.length, 560), W = num(p.width, 400), H = num(p.height, 330), diffZ = -L * .2;
    const parts = [
      part(cylinderBetween([0, 0, -L / 2], [0, 0, -L / 2 + L * .22], H * .50, 36, H * .40), {name: 'bell-housing'}),
      part(cylinderBetween([-W * .36, -H * .08, diffZ], [W * .36, -H * .08, diffZ], H * .30, 28), {name: 'differential'}),
      part(buildChamferBox({size: [W * .50, H * .72, L * .60], radius: 16}).geometry, {position: [0, -H * .02, L * .16], name: 'gearcase'}),
      part(buildChamferBox({size: [W * .18, H * .16, L * .2], radius: 6}).geometry, {position: [W * .15, H * .40, L * .25], name: 'shift-actuator', material: 'aluminum'}),
      part(buildChamferBox({size: [W * .3, H * .08, L * .25], radius: 4}).geometry, {position: [-W * .18, H * .36, L * .05], name: 'oil-cooler', material: {preset: 'aluminum', texture: 'vents'}})
    ];
    for (let i = 0; i < 3; i++) parts.push(part(buildChamferBox({size: [W * .52, 10, 14], radius: 2}).geometry, {position: [0, H * .34, L * (.0 + i * .14)], name: 'rib'}));
    for (const s of [-1, 1]) parts.push(part(cylinderBetween([s * W * .36, -H * .08, diffZ], [s * W * .46, -H * .08, diffZ], H * .15, 18), {name: 'output-flange', material: 'steel-dark'}));
    return compound(parts);
  }

  // radiator — core in XY facing +Z; side tanks, frame, fittings.
  function recipeRadiator(g) {
    const p = g.params || {};
    const w = num(p.width, 620), h = num(p.height, 420), d = num(p.depth, 46);
    const parts = [part(buildChamferBox({size: [w, h, d], radius: 2}).geometry, {name: 'core', material: p.coreMaterial || {preset: 'aluminum', texture: 'vents'}})];
    for (const y of [-1, 1]) parts.push(part(buildChamferBox({size: [w, 10, d * 1.1], radius: 2}).geometry, {position: [0, y * (h / 2 + 5), 0], name: 'frame', material: 'steel-dark'}));
    if (p.tanks !== false) for (const s of [-1, 1]) {
      parts.push(part(buildChamferBox({size: [44, h * 1.04, d * 1.25], radius: 6}).geometry, {position: [s * (w / 2 + 22), 0, 0], name: 'tank', material: 'plastic-black'}));
      parts.push(part(cylinderBetween([s * (w / 2 + 40), s * h * .32, 0], [s * (w / 2 + 80), s * h * .32, 0], d * .3, 14), {name: 'fitting', material: 'aluminum'}));
    }
    return compound(parts);
  }

  // headlamp — lens faces +Y. Housing cup, body-colour bezel (component material), LED modules, DRL ring.
  function recipeHeadlamp(g) {
    const p = g.params || {};
    const R = num(p.radius, 100), D = num(p.depth, 90), modules = count(p.modules, 4, 0), led = p.ledMaterial || ledWhite;
    const bezel = new THREE.TorusGeometry(R * .98, R * .05, 8, 48);rotX(bezel, Math.PI / 2);
    const drl = new THREE.TorusGeometry(R * .80, R * .022, 6, 48);rotX(drl, Math.PI / 2);
    const parts = [
      part(revolveProfile([[R * .72, -D], [R, -D * .40], [R, 0], [R * .90, 0], [R * .90, -D * .36], [R * .62, -D * .92]], 48), {name: 'housing', material: p.housingMaterial || 'plastic-black'}),
      part(bezel, {name: 'bezel'}),
      part(buildCylinder({radius: R * .88, height: 4, segments: 40}).geometry, {position: [0, -D * .36, 0], name: 'reflector', material: 'chrome'}),
      part(buildCylinder({radius: R * .22, height: D * .4, segments: 24}).geometry, {position: [0, -D * .2, 0], name: 'projector', material: 'chrome'}),
      part(at(drl, 0, -D * .28, 0), {name: 'drl-ring', material: led}),
      part(buildCylinder({radius: R * .93, height: 6, segments: 40}).geometry, {position: [0, -3, 0], name: 'lens', material: 'glass'})
    ];
    for (let k = 0; k < modules; k++) {
      const a = Math.PI / 4 + k * Math.PI * 2 / modules, geo = buildChamferBox({size: [R * .30, R * .06, R * .12], radius: 1}).geometry;
      rotY(geo, Math.PI / 2 - a);
      parts.push(part(at(geo, R * .48 * Math.cos(a), -D * .30, R * .48 * Math.sin(a)), {name: 'led-module', material: led}));
    }
    return compound(parts);
  }

  // exhaust — transverse silencer along X; tips exit toward +Y; inlet pipes run toward -Y.
  function recipeExhaust(g) {
    const p = g.params || {};
    const S = num(p.span, 860), Rm = num(p.mufflerRadius, 105), L = num(p.length, 380), tips = count(p.tips, 2, 1), Rt = num(p.tipRadius, 52), Lt = num(p.tipLength, 150);
    const tip = p.tipMaterial || 'titanium';
    const parts = [part(buildRoundedBox({size: [S, Rm * 1.2, Rm * 1.5], radius: Rm * .45}).geometry, {name: 'silencer'})];
    for (let k = 0; k < tips; k++) {
      const x = (k - (tips - 1) / 2) * Rt * 2.5;
      parts.push(part(cylinderBetween([x, Rm * .5, 0], [x, Rm * .5 + Lt, 0], Rt, 28), {name: 'tip', material: tip}));
      parts.push(part(cylinderBetween([x, Rm * .5 + Lt - 4, 0], [x, Rm * .5 + Lt + 1, 0], Rt * .78, 28), {name: 'tip-bore', material: 'plastic-black'}));
    }
    for (const s of [-1, 1]) parts.push(tube([[s * S * .45, -Rm * .4, 0], [s * S * .42, -L * .5, -Rm * .6], [s * S * .40, -L, -Rm * 1.4]], Rm * .28, {name: 'inlet', fillet: 60}));
    return compound(parts);
  }

  return {
    'wheel': recipeWheel,
    'brake-assembly': recipeBrakeAssembly,
    'coilover': recipeCoilover,
    'control-arm': recipeControlArm,
    'steering-rack': recipeSteeringRack,
    'bucket-seat': recipeBucketSeat,
    'steering-wheel': recipeSteeringWheel,
    'roll-cage': recipeRollCage,
    'airfoil-wing': recipeAirfoilWing,
    'flat-engine': recipeFlatEngine,
    'intake-plenum': recipeIntakePlenum,
    'transaxle': recipeTransaxle,
    'radiator': recipeRadiator,
    'headlamp': recipeHeadlamp,
    'exhaust': recipeExhaust
  };
}
