// interactions.js — orbit rig, selection, inspection modes, and behavior state machines.

export function createInteractionSystem(THREE) {

  // ------------------------------------------------------------ orbit rig
  function createOrbitRig(camera, dom, opts) {
    const o = Object.assign({
      target: new THREE.Vector3(),
      distance: 200,
      azimuth: 45 * Math.PI / 180,
      elevation: 28 * Math.PI / 180,
      minElevation: -89 * Math.PI / 180,
      maxElevation: 89 * Math.PI / 180,
      minDistance: 5,
      maxDistance: 4000,
      damping: 0.12,
      rotateSpeed: 1,
      zoomSpeed: 1,
      panSpeed: 1
    }, opts || {});

    const state = {
      target: o.target.clone(),
      azimuth: o.azimuth, elevation: o.elevation, distance: o.distance,
      targetAzimuth: o.azimuth, targetElevation: o.elevation, targetDistance: o.distance,
      targetCenter: o.target.clone(),
      autoRotate: 0
    };

    let enabled = o.enabled !== false, rotationEnabled=true;
    const pointers = new Map();
    let mode = 'none'; // none | rotate | pan | pinch
    let last = { x: 0, y: 0 };
    let pinchStart = 0;

    function apply() {
      state.azimuth += (state.targetAzimuth - state.azimuth) * o.damping * 1.6;
      state.elevation += (state.targetElevation - state.elevation) * o.damping * 1.6;
      state.distance += (state.targetDistance - state.distance) * o.damping * 1.6;
      state.targetCenter && state.target.lerp(state.targetCenter, o.damping * 1.6);
      const el = state.elevation, az = state.azimuth, d = state.distance;
      camera.position.set(
        state.target.x + d * Math.cos(el) * Math.sin(az),
        state.target.y + d * Math.sin(el),
        state.target.z + d * Math.cos(el) * Math.cos(az)
      );
      camera.lookAt(state.target);
      if (state.autoRotate) state.targetAzimuth += state.autoRotate;
    }

    function onDown(e) {
      if (!enabled) return;
      if (dom.setPointerCapture && e.isTrusted) dom.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button });
      if (pointers.size === 1) {
        mode = (!rotationEnabled || e.button === 2 || e.shiftKey) ? 'pan' : 'rotate';
        last = { x: e.clientX, y: e.clientY };
      } else if (pointers.size === 2) {
        mode = 'pinch';
        const pts = [...pointers.values()];
        pinchStart = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      }
    }
    function onMove(e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button });
      if (mode === 'rotate' && pointers.size === 1) {
        const dx = e.clientX - last.x, dy = e.clientY - last.y;
        state.targetAzimuth -= dx * 0.0062 * o.rotateSpeed;
        state.targetElevation = clamp(state.targetElevation + dy * 0.0062 * o.rotateSpeed, o.minElevation, o.maxElevation);
        last = { x: e.clientX, y: e.clientY };
      } else if (mode === 'pan' && pointers.size === 1) {
        const dx = e.clientX - last.x, dy = e.clientY - last.y;
        panBy(dx, dy);
        last = { x: e.clientX, y: e.clientY };
      } else if (mode === 'pinch' && pointers.size === 2) {
        const pts = [...pointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (pinchStart > 0 && dist > 0) zoomBy(pinchStart / dist);
        pinchStart = dist;
      }
    }
    function onUp(e) {
      pointers.delete(e.pointerId);
      if (pointers.size === 0) mode = 'none';
      else if (pointers.size === 1) { mode = rotationEnabled ? 'rotate' : 'pan'; const p = [...pointers.values()][0]; last = { x: p.x, y: p.y }; }
    }
    function onWheel(e) {
      if (!enabled) return;
      e.preventDefault();
      const factor = Math.exp(e.deltaY * 0.0011 * o.zoomSpeed);
      zoomBy(factor);
    }
    function zoomBy(factor) {
      if(camera.isOrthographicCamera) {
        camera.zoom=clamp(camera.zoom/factor,.002,2000);camera.updateProjectionMatrix();
      } else state.targetDistance=clamp(state.targetDistance*factor,o.minDistance,o.maxDistance);
    }
    function panBy(dx, dy) {
      const h = camera.isOrthographicCamera ? (camera.top-camera.bottom)/camera.zoom/Math.max(1,dom.clientHeight)*o.panSpeed : state.distance * 0.0016 * o.panSpeed;
      if(camera.isOrthographicCamera) {
        const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1);
        state.targetCenter.addScaledVector(right,-dx*h).addScaledVector(up,dy*h);return;
      }
      const fwd = new THREE.Vector3().subVectors(state.target, camera.position); fwd.y = 0; fwd.normalize();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
      state.targetCenter = state.targetCenter || state.target.clone();
      state.targetCenter.addScaledVector(right, -dx * h);
      state.targetCenter.y += dy * h;
    }

    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerup', onUp);
    dom.addEventListener('pointercancel', onUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    const onContext=e=>e.preventDefault();
    dom.addEventListener('contextmenu',onContext);

    return {
      update: apply,
      setEnabled(value) {enabled = !!value;pointers.clear();mode='none';},
      setCamera(value) {camera=value;},
      setRotationEnabled(value) {rotationEnabled=!!value;},
      state,
      setPose({ target, azimuth, elevation, distance }, immediate) {
        if (target) state.targetCenter = new THREE.Vector3().fromArray(target);
        if (azimuth != null) state.targetAzimuth = azimuth * Math.PI / 180;
        if (elevation != null) state.targetElevation = clamp(elevation * Math.PI / 180, o.minElevation, o.maxElevation);
        if (distance != null) state.targetDistance = clamp(distance, o.minDistance, o.maxDistance);
        if (immediate) {
          if (target) state.target.copy(state.targetCenter);
          if (azimuth != null) state.azimuth = state.targetAzimuth;
          if (elevation != null) state.elevation = state.targetElevation;
          if (distance != null) state.distance = state.targetDistance;
        }
      },
      frame(box, padding) {
        const center = box.getCenter(new THREE.Vector3());
        const radius = box.getSize(new THREE.Vector3()).length() / 2 || 50;
        const fov = (camera.fov || 38) * Math.PI / 180;
        const dist = radius / Math.tan(fov / 2) * (padding || 1.28);
        this.setPose({ target: center.toArray(), distance: dist });
        if(camera.isOrthographicCamera) {camera.zoom=(camera.top-camera.bottom)/(radius*2*(padding || 1.2));camera.updateProjectionMatrix();}
      },
      dispose() {
        dom.removeEventListener('pointerdown', onDown);
        dom.removeEventListener('pointermove', onMove);
        dom.removeEventListener('pointerup', onUp);
        dom.removeEventListener('pointercancel', onUp);
        dom.removeEventListener('wheel', onWheel);
        dom.removeEventListener('contextmenu',onContext);
      }
    };
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ------------------------------------------------------------ selection
  function createPicker(scene, camera, dom) {
    const raycaster = new THREE.Raycaster();
    const occlusionRay = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let downPos = null;

    function pickAt(clientX, clientY) {
      const rect = dom.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.near = 0;raycaster.far = Infinity;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      for (const hit of hits) {
        if (!isPickable(hit.object,hit.point)) continue;
        let obj = hit.object;
        while (obj) {
          if (obj.userData && obj.userData.componentId) {
            return { componentId: obj.userData.componentId, point: hit.point.clone(), object: obj };
          }
          obj = obj.parent;
        }
      }
      return null;
    }

    // Returns the first hit that is NOT on `ignoreComponentId` and not a
    // connector/flow element — so thin cables don't false-occlude labels and an
    // anchor sitting inside its own component does not count as self-occlusion.
    function isPickable(object, point) {
      let node = object;
      while (node) {
        if (!node.visible || node.userData?.spec?.selectable === false) return false;
        node = node.parent;
      }
      const material = object.material;
      if (material?.opacity < .01) return false;
      if (material?.clippingPlanes?.some(plane => plane.distanceToPoint(point) < 0)) return false;
      return true;
    }

    function occludedProbe(origin, dir, far, ignoreComponentId) {
      occlusionRay.set(origin,dir);occlusionRay.near = 0;occlusionRay.far = far;
      const hits = occlusionRay.intersectObjects(scene.children,true);
      for (const hit of hits) {
        const cid = hit.object.userData?.componentId;
        if (!cid || cid === ignoreComponentId || !isPickable(hit.object,hit.point) || hit.object.material?.opacity < .5) continue;
        return hit;
      }
      return null;
    }

    return { pickAt, occludedProbe, raycaster };
  }

  // ------------------------------------------------------------ mode state machine
  function createModeController(hierarchy, materialsApi) {
    const state = {
      explode: 0, explodeTarget: 0,
      xray: false, section: false, isolate: false, ghost: false, flow: true,
      selected: null, hovered: null,
      sectionAxis: 'y', sectionPosition: 0
    };
    const baseMaterials = new Map(); // mesh -> material snapshot
    const flowDots = [];
    let flowGroup = null;
    let activeClipPlane = null;
    const connectorRecords = [];

    function snapshot(mesh) {
      if (!baseMaterials.has(mesh)) baseMaterials.set(mesh, mesh.material);
    }

    function forEachMesh(fn) {
      for (const node of hierarchy.componentNodes.values()) {
        node.traverse((obj) => { if (obj.isMesh) fn(obj, node); });
      }
    }

    function applyAppearance() {
      forEachMesh((mesh, node) => {
        snapshot(mesh);
        const base = baseMaterials.get(mesh);
        const compId = node.userData.componentId;
        const compSpec = hierarchy.componentData.get(compId)?.spec;
        const isSelected = state.selected === compId;
        const isHovered = state.hovered === compId;
        let mat = base;

        if (state.isolate && state.selected && compId !== state.selected) {
          mat = ghostVersion(base, 0.06);
        } else if (state.ghost && state.selected && compId !== state.selected) {
          mat = ghostVersion(base, 0.22);
        } else if (state.xray) {
          const role = compSpec && compSpec.xray ? compSpec.xray : defaultXrayRole(compSpec);
          if (role === 'outer') mat = ghostVersion(base, 0.14);
          else if (isSelected) mat = highlightVersion(base);
          else mat = base;
        } else if (isSelected) {
          mat = highlightVersion(base);
        } else if (isHovered) {
          mat = hoverVersion(base);
        }
        if (mat !== mesh.material) mesh.material = mat;
        mesh.material.depthWrite = mesh.material.opacity >= 0.99;
        const planes = state.section && activeClipPlane ? [activeClipPlane] : null;
        if (mesh.material.clippingPlanes?.[0] !== planes?.[0]) mesh.material.needsUpdate = true;
        mesh.material.clippingPlanes = planes;
        mesh.material.clipShadows = !!planes;
      });
    }

    function defaultXrayRole(spec) {
      if (!spec || !spec.geometry) return 'inner';
      const kind = spec.geometry.kind;
      const enclosureKinds = ['pump-housing', 'rack', 'server-blade', 'duct', 'fan'];
      if (enclosureKinds.includes(kind)) return 'outer';
      if (kind === 'box' || kind === 'chamferBox' || kind === 'roundedBox') {
        const s = spec.geometry.size || [0, 0, 0];
        return (s[0] > 60 && s[1] > 20 && s[2] > 60) ? 'outer' : 'inner';
      }
      return 'inner';
    }

    const ghostCache = new Map();
    function ghostVersion(base, opacity) {
      const key = base.uuid + ':' + opacity;
      if (ghostCache.has(key)) return ghostCache.get(key);
      const m = base.clone();
      m.transparent = true;
      m.opacity = opacity;
      m.emissive && m.emissive.setHex(0x0a1424);
      m.depthWrite = false;
      ghostCache.set(key, m);
      return m;
    }
    function highlightVersion(base) {
      const key = base.uuid + ':sel';
      if (ghostCache.has(key)) return ghostCache.get(key);
      const m = base.clone();
      if (m.emissive) { m.emissive.setHex(0xff9a3c); m.emissiveIntensity = 0.55; }
      ghostCache.set(key, m);
      return m;
    }
    function hoverVersion(base) {
      const key = base.uuid + ':hov';
      if (ghostCache.has(key)) return ghostCache.get(key);
      const m = base.clone();
      if (m.emissive) { m.emissive.setHex(0x2a4a72); m.emissiveIntensity = 0.4; }
      ghostCache.set(key, m);
      return m;
    }

    // Connector curves are refreshed only when their resolved world-space points change.
    function clearConnectors() {
      if (flowGroup) {
        const geometries = new Set(), mats = new Set();
        flowGroup.traverse(o => {if(o.isMesh) {geometries.add(o.geometry);mats.add(o.material);}});
        geometries.forEach(g => g.dispose());mats.forEach(m => m.dispose());
        flowGroup.removeFromParent();flowGroup = null;
      }
      connectorRecords.length = 0;flowDots.length = 0;
    }

    function connectorPoints(con, resolveEndpoint) {
      const from = resolveEndpoint(con.from), to = resolveEndpoint(con.to);
      if (!from || !to) return null;
      const via = con.geometry?.via || [];
      if (via.length) return [from,...via.map(p => new THREE.Vector3().fromArray(p)),to];
      const middle = from.clone().add(to).multiplyScalar(.5);
      middle.y -= con.geometry?.sag || 0;
      return [from,middle,to];
    }

    function buildFlowDots(connectors, resolveEndpoint, materialFor) {
      clearConnectors();
      if (!connectors.length) return null;
      flowGroup = new THREE.Group();flowGroup.name = 'sd-connectors';
      for (const con of connectors) {
        const points = connectorPoints(con,resolveEndpoint);
        if (!points) continue;
        const curve = new THREE.CatmullRomCurve3(points);
        const radius = con.geometry?.radius || 1.2, kind = con.geometry?.kind || 'cable';
        const material = materialFor ? materialFor(con) : new THREE.MeshStandardMaterial({color:0x3ce0ff});
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve,kind === 'line' ? 40 : 56,radius,10,false),material);
        tube.castShadow = true;tube.userData.connectorId = con.id;tube.userData.curve = curve;
        flowGroup.add(tube);
        const record = {con,points,curve,radius,kind,tube,resolveEndpoint,dots:[]};
        if (kind === 'arrow') {
          record.arrow = new THREE.Mesh(new THREE.ConeGeometry(radius*2.6,radius*6,12),material);
          flowGroup.add(record.arrow);
        }
        if (con.flow?.enabled) {
          const dotMaterial = new THREE.MeshBasicMaterial({color:new THREE.Color(con.flow.color || '#3ce0ff')});
          for (let i=0;i<5;i++) {
            const dot = new THREE.Mesh(new THREE.SphereGeometry(radius*1.9,10,8),dotMaterial);
            dot.userData.curve = curve;dot.userData.t = i/5;
            dot.userData.speed = (con.flow.speed || 1)*.14*(con.flow.direction === 'to-from' ? -1 : 1);
            dot.position.copy(curve.getPointAt(dot.userData.t));
            flowGroup.add(dot);flowDots.push(dot);record.dots.push(dot);
          }
        }
        connectorRecords.push(record);
        updateArrow(record);
      }
      return flowGroup;
    }

    function updateArrow(record) {
      if (!record.arrow) return;
      record.arrow.position.copy(record.curve.getPointAt(1));
      record.arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),record.curve.getTangentAt(1).normalize());
    }

    function updateConnectors() {
      for (const record of connectorRecords) {
        const points = connectorPoints(record.con,record.resolveEndpoint);
        record.tube.visible = !!points;
        if (!points) {if(record.arrow) record.arrow.visible=false;record.dots.forEach(d=>d.visible=false);continue;}
        if (record.arrow) record.arrow.visible=true;
        if (points.length === record.points.length && points.every((p,i)=>p.distanceToSquared(record.points[i])<1e-12)) continue;
        record.points = points;record.curve = new THREE.CatmullRomCurve3(points);
        record.tube.geometry.dispose();
        record.tube.geometry = new THREE.TubeGeometry(record.curve,record.kind === 'line' ? 40 : 56,record.radius,10,false);
        record.tube.userData.curve=record.curve;
        for(const dot of record.dots) dot.userData.curve=record.curve;
        updateArrow(record);
      }
    }

    function updateFlow(dt) {
      updateConnectors();
      for (const dot of flowDots) {
        dot.visible=state.flow;
        if (state.flow) dot.userData.t=(dot.userData.t+dot.userData.speed*dt+1)%1;
        dot.position.copy(dot.userData.curve.getPointAt(dot.userData.t));
      }
    }

    function updateSection(clipPlane) {activeClipPlane=clipPlane;applyAppearance();}
    function dispose() {
      clearConnectors();
      for(const [mesh,base] of baseMaterials) mesh.material=base;
      ghostCache.forEach(material=>material.dispose());ghostCache.clear();
      baseMaterials.clear();
    }

    return { state, applyAppearance, buildFlowDots, updateFlow, updateSection, updateConnectors, forEachMesh, ghostCache, dispose };
  }

  return { createOrbitRig, createPicker, createModeController, clamp };
}
