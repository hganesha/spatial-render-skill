import '../kit/vendor/three.min.js';
import { createGeometrySystem } from '../kit/engine/geometry.js';
import { validateSceneSpec, auditScene } from '../kit/engine/spec-math.js';
const auditGeometry = createGeometrySystem(globalThis.THREE);
export function checkScene(spec) {
  const structural = validateSceneSpec(spec);
  return {structural, audits:structural.some(issue => issue.level === 'error') ? [] : auditScene(spec,{partBounds:auditGeometry.partBounds})};
}
