// tour.js — guided tour steps and assembly-instruction sequences.
// Pure data helpers; the engine applies the resulting steps to the live stage.

// Instruction sequence from explode semantics. Components that never move are
// the base; the rest are installed in reverse explode order (the parts that
// leave last during disassembly are installed first).
export function deriveInstructionSteps(componentData, options = {}) {
  const moving = [], base = [];
  for (const [id, data] of componentData) {
    if (data.spec.visible === false) continue;
    const v = data.explodeVector || [0, 0, 0];
    (Math.hypot(v[0], v[1], v[2]) < 1e-6 ? base : moving).push({id, data});
  }
  const groups = new Map();
  for (const entry of moving) {
    const order = entry.data.order || 0;
    if (!groups.has(order)) groups.set(order, []);
    groups.get(order).push(entry);
  }
  const orders = [...groups.keys()].sort((a, b) => b - a);
  const steps = [];
  const label = entry => entry.data.spec.label || entry.id;
  const placed = base.map(entry => entry.id);
  if (base.length) steps.push({index: 0, title: 'Start with ' + listText(base.map(label)), adds: base.map(e => e.id), placed: [], order: null});
  const maxPerStep = options.maxPerStep || 6;
  for (const order of orders) {
    const entries = groups.get(order);
    for (let i = 0; i < entries.length; i += maxPerStep) {
      const chunk = entries.slice(i, i + maxPerStep);
      steps.push({index: steps.length, title: 'Install ' + listText(chunk.map(label)), adds: chunk.map(e => e.id), placed: placed.slice(), order});
      placed.push(...chunk.map(e => e.id));
    }
  }
  return steps;
}

function listText(labels) {
  if (labels.length <= 2) return labels.join(' and ');
  if (labels.length <= 3) return labels.slice(0, -1).join(', ') + ' and ' + labels[labels.length - 1];
  return labels.slice(0, 2).join(', ') + ` and ${labels.length - 2} more`;
}

// Normalized tour steps with defaults; camera may be 'auto' or a pose/focus object.
export function normalizeTourSteps(tour) {
  return (tour?.steps || []).map((step, index) => ({
    id: step.id || `step-${index + 1}`,
    title: step.title || `Step ${index + 1}`,
    caption: step.caption || '',
    camera: step.camera ?? 'auto',
    explode: step.explode,
    renderMode: step.renderMode,
    modes: step.modes || {},
    section: step.section || null,
    highlight: step.highlight || [],
    select: step.select ?? null,
    annotationGroups: step.annotationGroups || null,
    duration: step.duration || 1100
  }));
}

export function lerpNumber(a, b, t) {return a + (b - a) * t;}

// Shortest-path angle interpolation in degrees.
export function lerpAngle(a, b, t) {
  let delta = ((b - a) % 360 + 540) % 360 - 180;
  return a + delta * t;
}
