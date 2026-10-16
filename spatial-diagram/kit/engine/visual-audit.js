// visual-audit.js — rendered-view audits the CLI cannot see: framing, labels over
// geometry, clipped/overflowing labels, crossing leaders, unlabeled emissive
// fragments and stranded parts. Returns machine-readable issues for the agent loop.

export function createVisualAuditSystem(THREE) {

  function screenRectOf(object, camera, width, height) {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return null;
    const rect = {minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity};
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const p = new THREE.Vector3(x, y, z).project(camera);
      const sx = (p.x * .5 + .5) * width, sy = (-p.y * .5 + .5) * height;
      rect.minX = Math.min(rect.minX, sx);rect.maxX = Math.max(rect.maxX, sx);rect.minY = Math.min(rect.minY, sy);rect.maxY = Math.max(rect.maxY, sy);
    }
    return {x: rect.minX, y: rect.minY, w: rect.maxX - rect.minX, h: rect.maxY - rect.minY, cx: (rect.minX + rect.maxX) / 2, cy: (rect.minY + rect.maxY) / 2};
  }

  // ctx: {hierarchy, camera, width, height, items, pickAt(x,y)->id|null, spec, layoutIssues, explode, renderMode, collapsed, annotatedComponents:Set}
  function run(ctx) {
    const issues = [], {camera, width, height} = ctx;
    const add = (level, code, message, context) => issues.push({level, code, message, ...(context ? {context} : {})});
    const rects = new Map();
    for (const [id, node] of ctx.hierarchy.componentNodes) {
      if (!visibleChain(node)) continue;
      const rect = screenRectOf(node, camera, width, height);
      if (rect && Number.isFinite(rect.w)) rects.set(id, rect);
    }
    let subject = null;
    for (const rect of rects.values()) subject = subject ? union(subject, rect) : {...rect};
    const metrics = {explode: ctx.explode, renderMode: ctx.renderMode, viewport: [width, height]};
    if (subject) {
      const fill = Math.max(subject.w / width, subject.h / height);
      metrics.subjectRect = [round(subject.x), round(subject.y), round(subject.w), round(subject.h)];
      metrics.frameFill = round(fill);
      if (fill < .5) add('warning', 'frame:underfilled', `Subject spans ${Math.round(fill * 100)}% of the frame (aim for 60–75%).`, {fill: round(fill)});
      if (subject.x < -4 || subject.y < -4 || subject.x + subject.w > width + 4 || subject.y + subject.h > height + 4) add('warning', 'frame:clipped', 'Part of the subject falls outside the frame.', {rect: metrics.subjectRect});
    }

    // Labels sitting on top of geometry (sampled pick test inside each label box).
    for (const item of ctx.items) {
      const box = item.layoutBox;
      if (!box || item.g.style.display === 'none' || item.g.style.visibility === 'hidden' || item.style === 'dimension') continue;
      let hits = 0, samples = 0;
      if (item.spec.leader === false) continue;
      for (const fx of [.15, .5, .85]) for (const fy of [.25, .75]) {
        samples++;
        const id = ctx.pickAt(box.x + box.w * fx, box.y + box.h * fy);
        if (id) hits++;
      }
      if (hits / samples >= .5) add('warning', 'label:over-geometry', `Label "${item.spec.id}" covers the subject (${Math.round(hits / samples * 100)}% of samples).`, {annotation: item.spec.id});
      if (box.x < 0 || box.y < 0 || box.x + box.w > width || box.y + box.h > height) add('warning', 'label:offscreen', `Label "${item.spec.id}" is clipped by the frame.`, {annotation: item.spec.id});
    }
    for (const issue of ctx.layoutIssues || []) issues.push(issue);

    // Small emissive parts with no label anywhere in their parent chain read as glitches.
    for (const [id, data] of ctx.hierarchy.componentData) {
      const rect = rects.get(id);
      if (!rect) continue;
      let emissive = false;
      ctx.hierarchy.componentNodes.get(id).traverse(o => {
        const m = o.isMesh && (Array.isArray(o.material) ? o.material[0] : o.material);
        if (m?.emissive && m.emissiveIntensity > .3 && m.emissive.getHex() !== 0 && m.opacity > .5) emissive = true;
      });
      if (!emissive) continue;
      const area = rect.w * rect.h / (width * height);
      let labeled = false;
      for (let cursor = id, guard = 0; cursor && guard < 20; guard++) {if (ctx.annotatedComponents.has(cursor)) {labeled = true;break;}cursor = ctx.hierarchy.componentData.get(cursor)?.parent;}
      if (!labeled && area < .004) add('warning', 'part:unlabeled-emissive', `Small emissive part "${id}" has no label and reads as a stray fragment.`, {component: id});
    }

    // Stranded parts: far from every other part's screen footprint.
    if (rects.size > 3 && subject) {
      const centers = [...rects.entries()];
      const diag = Math.hypot(width, height);
      for (const [id, rect] of centers) {
        let nearest = Infinity;
        for (const [other, b] of centers) if (other !== id) nearest = Math.min(nearest, rectGap(rect, b));
        if (nearest > diag * .12) add('warning', 'part:stranded', `Part "${id}" sits ${Math.round(nearest)}px from every other part; its explode path may be unreadable.`, {component: id, gap: Math.round(nearest)});
      }
    }
    if (ctx.collapsed) add('info', 'label:collapsed', `${ctx.collapsed} internal label(s) collapsed into the summary chip at this explode amount.`);
    return {metrics, issues};
  }

  function rectGap(a, b) {
    const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
    const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
    return Math.hypot(dx, dy);
  }
  function union(a, b) {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    return {x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y};
  }
  function visibleChain(node) {for (let p = node; p; p = p.parent) if (!p.visible) return false;return true;}
  function round(value) {return Math.round(value * 1000) / 1000;}

  return {run, screenRectOf};
}
