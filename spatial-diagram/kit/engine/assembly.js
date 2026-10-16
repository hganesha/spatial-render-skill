// assembly.js — object hierarchy, explode transforms, bounds utilities.
//
// Spec semantics (see references/assembly-rules.md):
//   * component.transform is authored in ASSEMBLY space (flat, predictable).
//   * component.parent is SEMANTIC: explode direction derivation, inspect tree,
//     detach audits. It does not rescale or re-orient the child's transform.
//   * Object graph: root -> assembly groups -> component groups -> part meshes.

import { resolveExplodeVector, explodeOrderOf, staggeredAmount, applyEasing, clamp01 } from './spec-math.js';

export function createAssemblySystem(THREE) {

  // Build the object hierarchy for a normalized spec.
  // buildGeometryParts(geometryDef, compSpec) -> [{geometry, position, rotation, scale, material, name}]
  function buildHierarchy(spec, buildGeometryParts, previous) {
    const root = previous ? previous.root : new THREE.Group();
    root.name = spec.scene.id || 'scene';
    const assemblyNodes = new Map(), componentNodes = new Map(), componentData = new Map();
    function signatureOf(comp, node) {
      const names=new Set();
      const add=ref=>{if(typeof ref==='string') names.add(ref);else if(ref?.preset) names.add(ref.preset);};
      add(comp.material);
      node?.traverse(o=>{if(o.isMesh) add(o.material.userData.spatialSource);});
      return JSON.stringify([comp.geometry,comp.material,comp.opacity,[...names].sort().map(name=>[name,spec.materials?.[name]])]);
    }
    for (const asmSpec of spec.assemblies || []) {
      const asmGroup = previous?.assemblyNodes.get(asmSpec.id) || new THREE.Group();
      asmGroup.name = asmSpec.id;
      applyTransform(asmGroup, asmSpec.transform);
      asmGroup.userData.assemblyId = asmSpec.id;
      root.add(asmGroup);
      assemblyNodes.set(asmSpec.id,asmGroup);
      for (const compSpec of asmSpec.components || []) {
        const oldData = previous?.componentData.get(compSpec.id);
        let compGroup = previous?.componentNodes.get(compSpec.id);
        const signature = signatureOf(compSpec,compGroup);
        if (!compGroup) compGroup = buildComponentGroup(compSpec,buildGeometryParts);
        else {
          if (oldData.signature !== signature) {
            disposeComponent(compGroup);
            const replacement = buildComponentGroup(compSpec,buildGeometryParts);
            while (replacement.children.length) compGroup.add(replacement.children[0]);
          }
          applyTransform(compGroup,compSpec.transform);
          compGroup.userData.spec = compSpec;
          compGroup.visible = compSpec.visible !== false;
        }
        compGroup.userData.componentId = compSpec.id;
        asmGroup.add(compGroup);
        componentNodes.set(compSpec.id,compGroup);
        componentData.set(compSpec.id,{spec:compSpec,assemblySpec:asmSpec,basePosition:compGroup.position.clone(),parent:compSpec.parent || null,signature:signatureOf(compSpec,compGroup)});
      }
    }
    if (previous) {
      for (const [id,node] of previous.componentNodes) if (!componentNodes.has(id)) {disposeComponent(node);node.removeFromParent();}
      for (const [id,node] of previous.assemblyNodes) if (!assemblyNodes.has(id)) node.removeFromParent();
    }
    root.updateWorldMatrix(true,true);
    let sceneBounds = null;
    for (const node of componentNodes.values()) {
      if (!node.visible) continue;
      const box = new THREE.Box3().setFromObject(node);
      if (!box.isEmpty()) sceneBounds = sceneBounds ? sceneBounds.union(box) : box;
    }
    const sceneB = sceneBounds ? {min:sceneBounds.min.toArray(),max:sceneBounds.max.toArray()} : {min:[-50,-50,-50],max:[50,50,50]};
    const orders = new Map();
    for (const data of componentData.values()) {
      const parentData = componentData.get(data.parent);
      data.order = explodeOrderOf(data.spec,data.assemblySpec,hierarchyDepth(data.spec,componentData));
      orders.set(data.assemblySpec.id,Math.max(orders.get(data.assemblySpec.id) || 0,data.order));
      data.explodeVector = resolveExplodeVector(data.spec,data.assemblySpec,parentData?.spec,sceneB);
    }
    for (const data of componentData.values()) data.maxOrder = orders.get(data.assemblySpec.id);
    return {root,assemblyNodes,componentNodes,componentData,bounds:sceneBounds,sceneBounds:sceneB};
  }

  function disposeComponent(node) {
    const geometries = new Set(), materials = new Set();
    node.traverse(object => {if (object.isMesh) {geometries.add(object.geometry);for (const m of [].concat(object.material)) materials.add(m);}});
    geometries.forEach(g => g.dispose());materials.forEach(m => m.dispose());
    node.clear();
  }

  function disposeHierarchy(hierarchy) {
    if (!hierarchy) return;
    for (const node of hierarchy.componentNodes.values()) disposeComponent(node);
    hierarchy.root.removeFromParent();
  }

  function hierarchyDepth(spec, componentData) {
    let depth = 0, cur = spec;
    const seen = new Set();
    while (cur && cur.parent && componentData.has(cur.parent) && !seen.has(cur.parent)) {
      seen.add(cur.parent);
      cur = componentData.get(cur.parent).spec;
      depth++;
    }
    return depth;
  }

  function buildComponentGroup(compSpec, buildGeometryParts) {
    const group = new THREE.Group();
    group.name = compSpec.id;
    applyTransform(group, compSpec.transform);

    const built = buildGeometryParts(compSpec.geometry, compSpec);
    for (const p of built) {
      const mesh = new THREE.Mesh(p.geometry, p.material);
      mesh.position.fromArray(p.position || [0, 0, 0]);
      mesh.rotation.set(
        (p.rotation && p.rotation[0]) || 0,
        (p.rotation && p.rotation[1]) || 0,
        (p.rotation && p.rotation[2]) || 0
      );
      if (p.scale && (p.scale[0] !== 1 || p.scale[1] !== 1 || p.scale[2] !== 1)) mesh.scale.fromArray(p.scale);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = compSpec.id + (p.name ? ':' + p.name : '');
      mesh.userData.componentId = compSpec.id;
      mesh.userData.partName = p.name;
      group.add(mesh);
    }
    group.userData.spec = compSpec;
    if (compSpec.visible === false) group.visible = false;
    return group;
  }

  function applyTransform(obj, tf) {
    obj.position.set(0,0,0);obj.rotation.set(0,0,0);obj.scale.set(1,1,1);
    if (!tf) return;
    if (tf.position) obj.position.fromArray(tf.position);
    if (tf.rotation) obj.rotation.set(deg(tf.rotation[0]), deg(tf.rotation[1]), deg(tf.rotation[2]));
    if (tf.scale) obj.scale.fromArray(tf.scale);
  }

  function deg(d) { return (d || 0) * Math.PI / 180; }

  // Apply explode amount to hierarchy. amount in [0,1].
  // options: { easing, assemblyId, stagger }
  function applyExplode(hierarchy, amount, options) {
    const opts = options || {};
    const easing = opts.easing || 'ease-in-out';
    for (const [id, data] of hierarchy.componentData) {
      if (opts.assemblyId && data.assemblySpec.id !== opts.assemblyId) continue;
      const node = hierarchy.componentNodes.get(id);
      if (!node) continue;
      const stagger = opts.stagger === false ? clamp01(amount) : staggeredAmount(amount, data.order, data.maxOrder);
      const t = applyEasing(stagger, easing);
      const v = data.explodeVector;
      node.position.set(
        data.basePosition.x + v[0] * t,
        data.basePosition.y + v[1] * t,
        data.basePosition.z + v[2] * t
      );
    }
  }

  function computeBounds(hierarchy, includeInvisible) {
    let box = null;
    hierarchy.root.updateWorldMatrix(true, true);
    for (const node of hierarchy.componentNodes.values()) {
      if (!includeInvisible && !node.visible) continue;
      const b = new THREE.Box3().setFromObject(node);
      box = box ? box.union(b) : b;
    }
    return box;
  }

  function componentWorldCenter(hierarchy, id) {
    const node = hierarchy.componentNodes.get(id);
    if (!node) return null;
    node.updateWorldMatrix(true, true);
    return new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
  }

  function componentAnchorWorld(hierarchy, id, anchorName) {
    const data = hierarchy.componentData.get(id);
    const node = hierarchy.componentNodes.get(id);
    if (!data || !node) return null;
    node.updateWorldMatrix(true, true);
    if (anchorName && data.spec.anchors && data.spec.anchors[anchorName]) {
      const local = new THREE.Vector3().fromArray(data.spec.anchors[anchorName]);
      return node.localToWorld(local);
    }
    return anchorName ? null : componentWorldCenter(hierarchy,id);
  }

  return { buildHierarchy, applyExplode, computeBounds, componentWorldCenter, componentAnchorWorld, applyTransform, disposeHierarchy };
}
