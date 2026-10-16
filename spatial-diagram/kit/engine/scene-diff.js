// scene-diff.js — pure revision diff between two Scene Specs, keyed by stable ids.
// Used by the runtime diff overlay (engine.compare) and scripts/scene-diff.mjs.

export function diffScenes(before, after) {
  const a = before || {}, b = after || {};
  const flat = spec => {
    const out = new Map();
    for (const assembly of spec.assemblies || []) for (const component of assembly.components || []) out.set(component.id, {component, assembly: assembly.id});
    return out;
  };
  const ca = flat(a), cb = flat(b);
  const components = {added: [], removed: [], moved: [], changed: []};
  for (const [id, entry] of cb) if (!ca.has(id)) components.added.push({id, label: entry.component.label || id, assembly: entry.assembly});
  for (const [id, entry] of ca) if (!cb.has(id)) components.removed.push({id, label: entry.component.label || id, assembly: entry.assembly, component: entry.component});
  for (const [id, next] of cb) {
    const previous = ca.get(id);
    if (!previous) continue;
    const from = previous.component.transform?.position || [0, 0, 0], to = next.component.transform?.position || [0, 0, 0];
    const delta = to.map((value, i) => value - (from[i] || 0)), distance = Math.hypot(...delta);
    if (distance > 1e-6 || previous.assembly !== next.assembly) components.moved.push({id, label: next.component.label || id, from, to, delta, distance: round(distance)});
    const fields = changedFields(previous.component, next.component, ['id', 'transform']);
    const rot = JSON.stringify(previous.component.transform?.rotation || [0, 0, 0]) !== JSON.stringify(next.component.transform?.rotation || [0, 0, 0]);
    const scale = JSON.stringify(previous.component.transform?.scale || [1, 1, 1]) !== JSON.stringify(next.component.transform?.scale || [1, 1, 1]);
    if (rot) fields.push('transform.rotation');
    if (scale) fields.push('transform.scale');
    if (fields.length) components.changed.push({id, label: next.component.label || id, fields});
  }
  const byId = list => new Map((list || []).map(item => [item.id, item]));
  const collection = (x, y) => {
    const mx = byId(x), my = byId(y), out = {added: [], removed: [], changed: []};
    for (const id of my.keys()) if (!mx.has(id)) out.added.push(id);
    for (const id of mx.keys()) if (!my.has(id)) out.removed.push(id);
    for (const [id, item] of my) if (mx.has(id)) {const fields = changedFields(mx.get(id), item, ['id']);if (fields.length) out.changed.push({id, fields});}
    return out;
  };
  const materials = {added: [], removed: [], changed: []};
  const ma = a.materials || {}, mb = b.materials || {};
  for (const name of Object.keys(mb)) if (!(name in ma)) materials.added.push(name);
  else if (JSON.stringify(ma[name]) !== JSON.stringify(mb[name])) materials.changed.push(name);
  for (const name of Object.keys(ma)) if (!(name in mb)) materials.removed.push(name);
  const scene = changedFields(a.scene || {}, b.scene || {}, []);
  const result = {
    from: a.scene?.id, to: b.scene?.id, components, annotations: collection(a.annotations, b.annotations), connectors: collection(a.connectors, b.connectors), materials, scene,
    summary: {added: components.added.length, removed: components.removed.length, moved: components.moved.length, changed: components.changed.length}
  };
  result.summary.total = Object.values(result.summary).reduce((x, y) => x + y, 0) + result.annotations.added.length + result.annotations.removed.length + result.annotations.changed.length + result.connectors.added.length + result.connectors.removed.length + result.connectors.changed.length + materials.added.length + materials.removed.length + materials.changed.length + scene.length;
  return result;
}

function changedFields(x, y, ignore) {
  const keys = new Set([...Object.keys(x || {}), ...Object.keys(y || {})]);
  return [...keys].filter(key => !ignore.includes(key) && JSON.stringify(x?.[key]) !== JSON.stringify(y?.[key])).sort();
}

function round(value) {return Math.round(value * 1000) / 1000;}

export function formatDiff(diff) {
  const lines = [`Scene diff ${diff.from || '?'} → ${diff.to || '?'}: ${diff.summary.added} added, ${diff.summary.removed} removed, ${diff.summary.moved} moved, ${diff.summary.changed} changed`];
  for (const c of diff.components.added) lines.push(`  + ${c.id}  (${c.label})`);
  for (const c of diff.components.removed) lines.push(`  - ${c.id}  (${c.label})`);
  for (const c of diff.components.moved) lines.push(`  ~ ${c.id} moved ${c.distance} [${c.delta.map(round).join(', ')}]`);
  for (const c of diff.components.changed) lines.push(`  * ${c.id} changed: ${c.fields.join(', ')}`);
  for (const kind of ['annotations', 'connectors']) {
    const d = diff[kind];
    if (d.added.length || d.removed.length || d.changed.length) lines.push(`  ${kind}: +${d.added.join(', +') || '0'}  -${d.removed.join(', -') || '0'}  *${d.changed.map(c => c.id).join(', *') || '0'}`);
  }
  if (diff.materials.added.length + diff.materials.removed.length + diff.materials.changed.length) lines.push(`  materials: +[${diff.materials.added}] -[${diff.materials.removed}] *[${diff.materials.changed}]`);
  if (diff.scene.length) lines.push(`  scene fields changed: ${diff.scene.join(', ')}`);
  return lines.join('\n');
}
