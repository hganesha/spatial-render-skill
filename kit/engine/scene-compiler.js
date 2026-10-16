// scene-compiler.js — turns a normalized Scene Spec into renderable parts.
// Bridges the declarative spec and the geometry/material systems.

import { normalizeSpec } from './spec-math.js';
import { createMaterialSystem, resolveMaterialDef } from './materials.js';
import { createGeometrySystem } from './geometry.js';

export function createSceneCompiler(THREE) {
  const materials = createMaterialSystem(THREE);
  const geometry = createGeometrySystem(THREE);

  // Build [{geometry, position, rotation, scale, material, name}] for one component spec.
  function buildGeometryParts(geomDef, compSpec, library) {
    const built = geometry.buildGeometry(geomDef);
    const out = [];
    if (built.kind === 'single') {
      out.push({
        geometry: built.geometry,
        position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
        material: pickMaterial(library, compSpec && compSpec.material, geomDef),
        name: null
      });
      return out;
    }
    for (const p of built.parts) {
      const def = p.material ? resolveMaterialDef(library, p.material) : pickMaterialDef(library, compSpec && compSpec.material, geomDef);
      out.push({
        geometry: p.geometry,
        position: p.position || [0, 0, 0],
        rotation: p.rotation || [0, 0, 0],
        scale: p.scale || [1, 1, 1],
        material: materials.buildMaterial(library, def),
        name: p.name
      });
    }
    return out;
  }

  function pickMaterialDef(library, nameOrDef, geomDef) {
    if (nameOrDef) return resolveMaterialDef(library, nameOrDef);
    // sensible default by geometry kind
    const kind = geomDef && geomDef.kind;
    if (kind === 'board') return { preset: 'pcb-green' };
    return { preset: 'aluminum' };
  }

  function pickMaterial(library, nameOrDef, geomDef) {
    return materials.buildMaterial(library, pickMaterialDef(library, nameOrDef, geomDef));
  }

  function compile(specIn) {
    const spec = normalizeSpec(specIn);
    const library = spec.materials || {};
    return { spec, materials, geometry, buildParts: (geomDef, compSpec) => buildGeometryParts(geomDef, compSpec, library), library };
  }

  return { compile, materials, geometry, buildGeometryParts };
}

export { normalizeSpec };
