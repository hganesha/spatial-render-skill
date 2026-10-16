// annotations.js — SVG annotation overlay projected from 3D anchors.
// The SVG layer shares the camera's coordinate system: each 3D anchor is
// projected to screen space and a matching label/leader/dimension is placed.
// The same overlay also draws explode trace lines, measurements, detail-view
// frames, the hidden-label summary chip and the parts list, so every export
// that composites the overlay carries them too.

export const ANNOTATION_PALETTES = {
  default: ['#3ce0ff', '#ffb35c', '#8ef0c8', '#d8a8ff', '#ff8e7a', '#9fc2ff'],
  'okabe-ito': ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#D55E00', '#56B4E9', '#F0E442'],
  mono: ['#1d232b', '#4a525c', '#7a828c', '#1d232b', '#4a525c', '#7a828c']
};

const ANNOTATION_THEME_CSS = `
.sd-annotations .sd-annotation[data-linked="true"] rect.sd-card{stroke:#ffb35c;stroke-width:1.6}
.sd-annotations .sd-annotation[data-linked="true"] circle.sd-balloon{stroke:#ffb35c;stroke-width:2}
.sd-annotations .sd-hit{cursor:pointer}
.sd-annotations-blueprint .sd-annotation text{font-family:monospace;fill:#e0f4ff}
.sd-annotations-blueprint .sd-annotation rect.sd-card{fill:#0b2947;stroke:#8ebdd6;rx:0}
.sd-annotations-blueprint .sd-annotation line{stroke:#a6d2e7}
.sd-annotations-blueprint .sd-annotation circle.sd-dot{fill:#c6e9f9}
.sd-annotations-blueprint circle.sd-balloon{fill:#0b2947;stroke:#c6e9f9}
.sd-annotations-blueprint .sd-annotation[data-linked="true"] rect.sd-card{stroke:#65e7ff}
.sd-annotations-illustration .sd-annotation text{font-family:Helvetica,Arial,'Inter',sans-serif;fill:#1d232b;paint-order:stroke;stroke:#ffffff;stroke-width:3px;stroke-linejoin:round}
.sd-annotations-illustration .sd-annotation--dimension text{fill:#1d232b}
.sd-annotations-illustration .sd-annotation rect.sd-card{fill:none;stroke:none}
.sd-annotations-illustration .sd-annotation rect.sd-dim-bg{fill:#ffffff}
.sd-annotations-illustration .sd-annotation line{stroke:#30363d}
.sd-annotations-illustration .sd-annotation circle.sd-dot{fill:#1d232b}
.sd-annotations-illustration circle.sd-balloon{fill:#ffffff;stroke:#1d232b;stroke-width:1.1}
.sd-annotations-illustration .sd-annotation text.sd-balloon-text{stroke:none;font-weight:600}
.sd-annotations-illustration .sd-annotation[data-linked="true"] text{fill:#D55E00}
.sd-annotations-illustration .sd-annotation[data-linked="true"] circle.sd-balloon{stroke:#D55E00}
.sd-annotations-illustration .sd-parts-list rect.sd-pl-bg{fill:#ffffff;stroke:#1d232b}
.sd-annotations-illustration .sd-parts-list text{fill:#1d232b;font-family:Helvetica,Arial,sans-serif}
.sd-annotations-illustration .sd-parts-list line{stroke:#1d232b}
.sd-annotations-blueprint .sd-parts-list rect.sd-pl-bg{fill:#0b2947;stroke:#8ebdd6}
.sd-annotations-blueprint .sd-parts-list text{fill:#d5eaf5;font-family:monospace}
.sd-annotations-blueprint .sd-parts-list line{stroke:#5f8ca8}
.sd-annotations-illustration .sd-parts-list text.sd-badge-text{fill:#ffffff}
.sd-annotations-blueprint .sd-parts-list text.sd-badge-text{fill:#0b2947}
.sd-annotations-illustration .sd-summary rect{fill:#ffffff;stroke:#1d232b}
.sd-annotations-illustration .sd-summary text{fill:#1d232b}
.sd-annotations-blueprint .sd-summary rect{fill:#0b2947;stroke:#8ebdd6;rx:0}
.sd-annotations-illustration .sd-detail-frame{stroke:#1d232b}
.sd-annotations-illustration .sd-detail-text{fill:#1d232b}
.sd-annotations-blueprint .sd-detail-frame{stroke:#a6d2e7}
.sd-annotations-blueprint .sd-detail-text{fill:#d5eaf5;font-family:monospace}
`;

export function createAnnotationSystem(THREE) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const make = (tag, attrs = {}, text) => {
    const node = document.createElementNS(svgNS, tag);
    for (const [key, value] of Object.entries(attrs)) if (value !== undefined && value !== null) node.setAttribute(key, String(value));
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function createOverlay(container) {
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'sd-annotations');
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none;overflow:hidden;';
    container.appendChild(svg);
    return svg;
  }

  // env: {renderMode, hooks:{hover(id), click(id), expand()}, componentOf(target), componentInfo(id)}
  function buildAnnotations(svg, spec, env = {}) {
    const items = [];
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const mode = env.renderMode || spec.scene.renderMode;
    svg.classList.toggle('sd-annotations-blueprint', mode === 'blueprint');
    // Paper theme: illustration, or the light WebGL stage (studio-light).
    svg.classList.toggle('sd-annotations-illustration', mode === 'illustration' || (mode === 'webgl' && spec.scene.style === 'studio-light'));
    svg.appendChild(make('style', {}, ANNOTATION_THEME_CSS));
    const defs = make('defs');
    const arrowColor = svg.classList.contains('sd-annotations-illustration') ? '#30363d' : 'rgba(230,238,248,0.9)';
    defs.innerHTML = `
      <marker id="sd-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0,0 L8,4 L0,8 z" fill="${arrowColor}"/>
      </marker>`;
    svg.appendChild(defs);
    const layers = {traces: make('g', {'class': 'sd-traces'}), measure: make('g', {'class': 'sd-measurements'}), details: make('g', {'class': 'sd-detail-frames'}), labels: make('g', {'class': 'sd-labels'}), extras: make('g', {'class': 'sd-overlay-extras'})};
    for (const layer of Object.values(layers)) svg.appendChild(layer);

    const defaultStyle = spec.scene.annotationStyle || 'card';
    const numbers = new Map();let nextNumber = 1;
    // One balloon size per scene, so equal slots can swap when untangling leaders.
    const balloonSpecs = (spec.annotations || []).filter(a => a.type !== 'dimension' && (a.style || defaultStyle) === 'balloon');
    const wideBalloons = balloonSpecs.length >= 10 || balloonSpecs.some(a => a.item >= 10);
    for (const ann of spec.annotations || []) {
      const style = ann.type === 'dimension' ? 'dimension' : (ann.style || defaultStyle);
      const component = env.componentOf ? env.componentOf(ann.target) : null;
      let number = null;
      if (style === 'balloon') {
        const key = component || ann.id;
        if (ann.item != null) {number = ann.item;numbers.set(key, number);nextNumber = Math.max(nextNumber, number + 1);}
        else if (numbers.has(key)) number = numbers.get(key);
        else {number = nextNumber++;numbers.set(key, number);}
      }
      const g = make('g', {'class': `sd-annotation sd-annotation--${ann.type || 'label'} sd-annotation-style--${style} sd-emph--${ann.emphasis || 'normal'}`});
      g.dataset.id = ann.id;
      g.dataset.group = ann.group || '';
      if (component) g.dataset.componentId = component;

      const leader = make('line', {stroke: 'rgba(210,224,240,0.55)', 'stroke-width': '1'});
      if (ann.leader !== false) g.appendChild(leader);
      const anchorDot = make('circle', {'class': 'sd-dot', r: '2.4', fill: 'rgba(230,238,248,0.9)'});
      g.appendChild(anchorDot);

      const body = style === 'dimension' ? buildDimensionBody(ann) : style === 'balloon' ? buildBalloonBody(ann, number, wideBalloons) : buildLabelBody(ann);
      for (const el of body.nodes) g.appendChild(el);
      if (component && style !== 'dimension') {
        const hit = body.nodes[0];
        hit.classList.add('sd-hit');hit.style.pointerEvents = 'all';
        hit.addEventListener('pointerenter', () => env.hooks?.hover?.(component));
        hit.addEventListener('pointerleave', () => env.hooks?.hover?.(null));
        hit.addEventListener('click', event => {event.stopPropagation();env.hooks?.click?.(component);});
      }
      layers.labels.appendChild(g);
      items.push({spec: ann, g, leader, anchorDot, body, style, number, component, occluded: false, measured: style !== 'card'});
    }
    const summary = buildSummary(env);
    layers.extras.appendChild(summary.g);
    const partsList = make('g', {'class': 'sd-parts-list'});
    layers.extras.appendChild(partsList);
    return Object.assign(items, {svg, layers, summary, partsList, spec, env, mode, paper: svg.classList.contains('sd-annotations-illustration')});
  }

  function buildLabelBody(ann) {
    const g = make('g', {'class': 'sd-label-body'});
    const isCallout = ann.type === 'callout';
    const text = make('text', {'font-size': isCallout ? '11.5' : '11', 'font-family': "'Inter','SF Pro Text',system-ui,sans-serif", fill: '#e8eef6', x: '10', y: '15'}, ann.text || '');
    const w = estimateWidth(ann.text || '', isCallout ? 11.5 : 11) + 20, h = 24;
    const rect = make('rect', {'class': 'sd-card', width: w, height: h, rx: '6', fill: 'rgba(12,18,28,0.82)',
      stroke: ann.emphasis === 'primary' ? 'rgba(255,170,80,0.85)' : ann.emphasis === 'warning' ? 'rgba(255,110,90,0.85)' : ann.emphasis === 'secondary' ? 'rgba(130,170,220,0.55)' : 'rgba(150,180,215,0.5)'});
    g.appendChild(rect);g.appendChild(text);
    return {nodes: [g], rect, text, width: w, height: h};
  }

  function buildBalloonBody(ann, number, wide) {
    const g = make('g', {'class': 'sd-label-body'});
    const r = wide || String(number).length > 1 ? 11.5 : 10.5;
    const circle = make('circle', {'class': 'sd-balloon', r, fill: 'rgba(12,18,28,0.88)', stroke: ann.emphasis === 'primary' ? 'rgba(255,170,80,0.9)' : 'rgba(170,200,230,0.8)', 'stroke-width': '1.2'});
    const text = make('text', {'class': 'sd-balloon-text', 'font-size': '11', 'font-weight': '650', 'font-family': "'Inter','SF Pro Text',system-ui,sans-serif", fill: '#e8eef6', 'text-anchor': 'middle'}, String(number));
    const title = make('title', {}, ann.text || '');
    g.appendChild(circle);g.appendChild(text);g.appendChild(title);
    return {nodes: [g], circle, text, width: r * 2, height: r * 2, radius: r};
  }

  function buildDimensionBody(ann) {
    const g = make('g');
    const extensionA = make('line', {stroke: 'rgba(230,238,248,0.45)'}), extensionB = make('line', {stroke: 'rgba(230,238,248,0.45)'});
    g.appendChild(extensionA);g.appendChild(extensionB);
    const line = make('line', {stroke: 'rgba(230,238,248,0.8)', 'stroke-width': '1', 'stroke-dasharray': '4 3', 'marker-start': 'url(#sd-arrow)', 'marker-end': 'url(#sd-arrow)'});
    const text = make('text', {'font-size': '10.5', 'font-family': "'Inter',ui-monospace,monospace", fill: '#ffe6c8', 'text-anchor': 'middle'}, ann.value || ann.text || '');
    const w = Math.max(24, estimateWidth(text.textContent, 10.5) + 12);
    const bg = make('rect', {'class': 'sd-dim-bg', width: w, height: '18', rx: '4', fill: 'rgba(12,18,28,0.85)'});
    g.appendChild(line);g.appendChild(bg);g.appendChild(text);
    return {nodes: [g], line, extensionA, extensionB, text, bg, width: w, height: 18};
  }

  function buildSummary(env) {
    const g = make('g', {'class': 'sd-summary', display: 'none'});
    g.style.pointerEvents = 'all';g.style.cursor = 'pointer';
    const rect = make('rect', {height: 24, rx: 12, fill: 'rgba(12,18,28,0.88)', stroke: 'rgba(60,224,255,0.55)'});
    const text = make('text', {'font-size': '11', 'font-family': "'Inter','SF Pro Text',system-ui,sans-serif", fill: '#b8f1ff', x: 12, y: 16});
    g.appendChild(rect);g.appendChild(text);
    g.addEventListener('click', event => {event.stopPropagation();env.hooks?.expand?.();});
    return {g, rect, text};
  }

  function estimateWidth(text, size) {return Math.max(8, text.length * size * 0.58);}

  function measure(item) {
    if (item.measured || item.style !== 'card') return;
    let length = 0;
    try {length = item.body.text.getComputedTextLength();} catch {length = 0;}
    if (!(length > 0)) return;
    item.body.width = Math.ceil(length + 20);item.body.rect.setAttribute('width', String(item.body.width));item.measured = true;
  }

  function project(world, camera, width, height, v) {
    v.copy(world).project(camera);
    return {x: (v.x * 0.5 + 0.5) * width, y: (-v.y * 0.5 + 0.5) * height, z: v.z};
  }

  // Per-frame update. ctx: {resolveTarget, occlusionFor(world,target,camera), explodeOf(componentId),
  //   collapse:{enabled,threshold}, layout:'free'|'margins', subjectRect(camera,w,h)}
  // view (per call): {camera, width, height, occupied, forceOcclusion, traces, measurements, details, partsList}
  function updateAnnotations(items, ctx) {
    const v = new THREE.Vector3();
    let roundRobin = 0;
    return function update(view = {}) {
      const host = items.svg?.parentElement;
      const camera = view.camera || ctx.camera();
      const width = view.width || host?.clientWidth || 1, height = view.height || host?.clientHeight || 1;
      const occupied = (view.occupied || []).slice();
      const vectorMode = items.mode === 'blueprint' || items.mode === 'illustration';
      for (const detail of view.details || []) occupied.push({...detail.rect, h: detail.rect.h + 18});
      for (const box of drawPartsList(items, view, width, height)) occupied.push(box);
      drawTraces(items, view.traces || [], camera, width, height, v);
      drawMeasurements(items, view.measurements || [], camera, width, height, v);
      drawDetailFrames(items, view.details || [], camera, width, height, v);

      const ordered = [...items].sort((a, b) => rank(b) - rank(a));
      const collapse = ctx.collapse || {};
      let collapsedCount = 0;
      const placements = [];
      for (const [index, item] of ordered.entries()) {
        item.layoutBox = null;
        if (item.g.style.visibility === 'hidden') continue;
        const spec = item.spec;
        const worldPos = ctx.resolveTarget(spec.target);
        if (!worldPos || !visibleByCondition(spec, item, ctx, items.mode) || (ctx.isVisible && !ctx.isVisible(item.component)) || (item.style !== 'dimension' && ctx.isClipped?.(worldPos))) {item.g.style.display = 'none';continue;}
        item.g.style.display = '';
        measure(item);

        if (item.style === 'dimension') {
          const worldB = spec.targetB ? ctx.resolveTarget(spec.targetB) : null;
          if (!worldB) {item.g.style.display = 'none';continue;}
          const a = project(worldPos, camera, width, height, v), b = project(worldB, camera, width, height, v);
          const offset = spec.offset || [0, 0];
          const dx = offset[0] || 0, dy = offset[1] || 0;
          const mx = (a.x + b.x) / 2 + dx, my = (a.y + b.y) / 2 + dy;
          if (!Number.isFinite(mx) || !Number.isFinite(my)) {item.g.style.display = 'none';continue;}
          for (const [extension, x, y] of [[item.body.extensionA, a.x, a.y], [item.body.extensionB, b.x, b.y]]) {
            extension.setAttribute('x1', String(x));extension.setAttribute('y1', String(y));
            extension.setAttribute('x2', String(x + dx));extension.setAttribute('y2', String(y + dy));
          }
          item.body.line.setAttribute('x1', String(a.x + dx));item.body.line.setAttribute('y1', String(a.y + dy));
          item.body.line.setAttribute('x2', String(b.x + dx));item.body.line.setAttribute('y2', String(b.y + dy));
          item.body.bg.setAttribute('x', String(mx - item.body.width / 2));item.body.bg.setAttribute('y', String(my - 9));
          item.body.text.setAttribute('x', String(mx));item.body.text.setAttribute('y', String(my + 4));
          item.anchorDot.setAttribute('cx', String(a.x));item.anchorDot.setAttribute('cy', String(a.y));
          item.leader.style.display = 'none';
          item.layoutBox = {x: mx - item.body.width / 2, y: my - 9, w: item.body.width, h: 18};
          occupied.push(item.layoutBox);
          continue;
        }

        const p = project(worldPos, camera, width, height, v);
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {item.g.style.display = 'none';continue;}
        const collapsing = collapse.enabled && ctx.explodeOf(item.component) < collapse.threshold;
        if (ctx.occlusionFor && (view.forceOcclusion || collapsing || ((index + roundRobin) % 3 === 0))) item.occluded = ctx.occlusionFor(worldPos, spec.target, camera);
        if (collapsing && item.occluded) {item.g.style.display = 'none';collapsedCount++;continue;}
        placements.push({item, sx: p.x, sy: p.y, behind: p.z > 1});
      }

      const layout = view.layout || ctx.layout || 'free';
      if (layout === 'margins') placeInMargins(placements, occupied, width, height, ctx.subjectRect?.(camera, width, height), view.limits || {});
      else {
        const obstacles = ctx.partRects?.(camera, width, height) || [];
        for (const placement of placements) placeFree(placement, occupied, width, height, obstacles);
      }

      for (const {item, sx, sy, behind, box} of placements) {
        item.layoutBox = box;
        const w = item.body.width, h = item.body.height, side = box.side;
        item.anchorDot.setAttribute('cx', String(sx));item.anchorDot.setAttribute('cy', String(sy));
        let edgeX = side === 1 ? box.x : box.x + w, edgeY = box.y + h / 2;
        if (item.style === 'balloon') {
          const cx = box.x + w / 2, cy = box.y + h / 2, angle = Math.atan2(sy - cy, sx - cx);
          edgeX = cx + Math.cos(angle) * item.body.radius;edgeY = cy + Math.sin(angle) * item.body.radius;
          item.body.circle.setAttribute('cx', String(cx));item.body.circle.setAttribute('cy', String(cy));
          item.body.text.setAttribute('x', String(cx));item.body.text.setAttribute('y', String(cy + 4));
        } else {
          item.body.rect.setAttribute('x', String(box.x));item.body.rect.setAttribute('y', String(box.y));
          const textX = items.paper && side === -1 ? box.x + w - 10 : box.x + 10;
          item.body.text.setAttribute('text-anchor', items.paper && side === -1 ? 'end' : 'start');
          item.body.text.setAttribute('x', String(textX));item.body.text.setAttribute('y', String(box.y + 16));
        }
        if (item.spec.leader !== false) {
          item.leader.setAttribute('x1', String(sx));item.leader.setAttribute('y1', String(sy));
          item.leader.setAttribute('x2', String(edgeX));item.leader.setAttribute('y2', String(edgeY));
          item.leaderSegment = [sx, sy, edgeX, edgeY];
        } else item.leaderSegment = null;
        const dimmed = (!vectorMode && item.occluded) || behind || sx < -80 || sx > width + 80 || sy < -40 || sy > height + 40;
        item.g.setAttribute('opacity', dimmed ? '0.22' : '1');
        item.g.dataset.anchorOccluded = String(item.occluded);
        item.leader.setAttribute('stroke-dasharray', vectorMode && item.occluded ? '3 3' : 'none');
        item.anchorDot.setAttribute('opacity', vectorMode && item.occluded ? '.45' : '1');
      }
      drawSummary(items, ctx.summary === false ? 0 : collapsedCount, occupied, width, height, ctx.subjectRect?.(camera, width, height));
      items.collapsedCount = collapsedCount;
      roundRobin = (roundRobin + 1) % 3;
    };
  }

  function rank(item) {return (item.spec.type === 'dimension' ? 2 : 0) + (item.spec.emphasis === 'primary' ? 1 : 0);}

  function visibleByCondition(spec, item, ctx, mode) {
    const when = spec.visibleWhen;
    if (!when) return true;
    const amount = ctx.explodeOf(item.component);
    if (when.explodeMin != null && amount < when.explodeMin) return false;
    if (when.explodeMax != null && amount > when.explodeMax) return false;
    if (when.renderModes && !when.renderModes.includes(mode)) return false;
    return true;
  }

  function overlapArea(x, y, w, h, boxes) {
    return boxes.reduce((sum, b) => sum + Math.max(0, Math.min(x + w + 4, b.x + b.w) - Math.max(x - 4, b.x)) * Math.max(0, Math.min(y + h + 4, b.y + b.h) - Math.max(y - 4, b.y)), 0);
  }

  // Labels avoid other labels/UI hard, and the parts' screen footprints softly:
  // candidates step vertically and outward from the authored offset.
  function placeFree(placement, occupied, width, height, obstacles = []) {
    const {item, sx, sy} = placement, spec = item.spec;
    const offset = spec.offset || [24, -14, 0];
    const requestedSide = spec.side || 'auto';
    const side = requestedSide === 'auto' ? (sx >= width / 2 ? 1 : -1) : (requestedSide === 'right' ? 1 : -1);
    const w = item.body.width, h = item.body.height;
    const desiredX = sx + side * Math.abs(offset[0]) - (side === 1 ? 0 : w);
    const desiredY = sy + offset[1] - h / 2;
    const nearby = obstacles.filter(b => b.x < desiredX + w + 240 && b.x + b.w > desiredX - 240);
    let best = null, bestScore = Infinity;
    const steps = Math.ceil(height / (h + 5)) + 1;
    for (const shift of spec.leader === false ? [0] : [0, 40, 80, 130, 190]) {
      for (let step = 0; step < steps; step++) for (const sign of step === 0 ? [1] : [-1, 1]) {
        const x = Math.max(5, Math.min(width - w - 5, desiredX + side * shift));
        const y = Math.max(5, Math.min(height - h - 5, desiredY + sign * step * (h + 5)));
        const hard = overlapArea(x, y, w, h, occupied);
        if (hard && bestScore < 1000) continue;
        const soft = nearby.length ? overlapArea(x, y, w, h, nearby) / (w * h) : 0;
        const score = hard * 1000 + soft * 140 + Math.abs(y - desiredY) * .5 + shift * .45;
        if (score < bestScore) {bestScore = score;best = {x, y, w, h};}
        if (!hard && !soft && step === 0) break;
      }
      if (bestScore < 1) break;
    }
    placement.box = {...(best || {x: desiredX, y: desiredY, w, h}), side, desiredX, desiredY};
    occupied.push(placement.box);
  }

  // Publication layout: labels stack in left/right columns beside the subject, inside
  // limits {left, right, top, bottom} (the parts list and toolbar keep their strips).
  // Columns compress to fit, then 2-opt swaps remove crossing leaders.
  function placeInMargins(placements, occupied, width, height, subject, limits = {}) {
    const minX = (limits.left || 0) + 8, maxX = width - (limits.right || 0) - 8;
    const topY = Math.max(8, limits.top || 8), bottomY = Math.min(height - 8, limits.bottom || height - 8);
    const rect = subject || {x: width * .3, y: height * .2, w: width * .4, h: height * .6};
    const centerX = rect.x + rect.w / 2, gap = 34;
    const columns = {'-1': [], '1': []};
    for (const placement of placements) {
      const requested = placement.item.spec.side;
      const side = requested === 'left' ? -1 : requested === 'right' ? 1 : placement.sx < centerX ? -1 : 1;
      columns[side].push(placement);
    }
    for (const side of [-1, 1]) {
      const column = columns[side].sort((a, b) => a.sy - b.sy);
      if (!column.length) continue;
      const maxW = Math.max(...column.map(p => p.item.body.width));
      const edge = side === -1 ? Math.max(minX + maxW, Math.min(rect.x - gap, maxX - maxW)) : Math.min(maxX - maxW, Math.max(rect.x + rect.w + gap, minX));
      const heights = column.map(p => p.item.body.height), total = heights.reduce((a, b) => a + b, 0);
      const colX0 = side === -1 ? edge - maxW : edge, colX1 = colX0 + maxW;
      const blocked = occupied.filter(b => b.x < colX1 + 4 && b.x + b.w > colX0 - 4).map(b => [b.y - 3, b.y + b.h + 3]).sort((a, b) => a[0] - b[0]);
      const free = bottomY - topY - blocked.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, bottomY) - Math.max(a, topY)), 0);
      const spacing = column.length > 1 ? Math.max(1, Math.min(6, (free - total) / (column.length - 1))) : 0;
      const skip = (y, h) => {for (const [a, b] of blocked) if (y < b && y + h > a) y = b;return y;};
      // Sweep down from each label's wish (skipping blocked bands), then pull up on overflow.
      let cursor = topY - spacing;
      const ys = column.map((p, i) => {const y = skip(Math.max(p.sy - heights[i] / 2, cursor + spacing), heights[i]);cursor = y + heights[i];return y;});
      const overflow = cursor - bottomY;
      if (overflow > 0) {
        let limit = bottomY;
        for (let i = column.length - 1; i >= 0; i--) {ys[i] = Math.min(ys[i], limit - heights[i]);limit = ys[i] - spacing;}
        for (let i = 0; i < column.length; i++) ys[i] = Math.max(ys[i], i ? ys[i - 1] + heights[i - 1] + spacing : topY);
      }
      column.forEach((p, i) => {
        const w = p.item.body.width, x = side === -1 ? edge - w : edge;
        p.box = {x, y: ys[i], w, h: heights[i], side: side === -1 ? -1 : 1};
      });
      // 2-opt: swap slots of equal-height labels whose leaders cross.
      const leader = p => [p.sx, p.sy, side === -1 ? p.box.x + p.box.w : p.box.x, p.box.y + p.box.h / 2];
      for (let pass = 0; pass < column.length * column.length; pass++) {
        let swapped = false;
        for (let i = 0; i < column.length; i++) for (let j = i + 1; j < column.length; j++) {
          const a = column[i], b = column[j];
          if (Math.abs(a.box.h - b.box.h) > .5 || !segmentsCross(leader(a), leader(b))) continue;
          [a.box.y, b.box.y] = [b.box.y, a.box.y];swapped = true;
        }
        if (!swapped) break;
      }
      for (const placement of column) occupied.push(placement.box);
    }
  }

  function drawSummary(items, count, occupied, width, height, subject) {
    const {g, rect, text} = items.summary;
    if (!count) {g.setAttribute('display', 'none');items.summaryBox = null;return;}
    g.removeAttribute('display');
    text.textContent = `+${count} internal part${count === 1 ? '' : 's'} · explode to reveal`;
    let length = 0;try {length = text.getComputedTextLength();} catch {length = 0;}
    const w = Math.ceil((length > 0 ? length : estimateWidth(text.textContent, 11)) + 24), h = 24;
    const anchor = subject || {x: width / 2, y: height / 2, w: 0, h: 0};
    let x = Math.max(8, Math.min(width - w - 8, anchor.x + anchor.w / 2 - w / 2)), y = Math.max(8, anchor.y - h - 14);
    for (let guard = 0; guard < 30 && overlapArea(x, y, w, h, occupied) > 0; guard++) y += h / 2;
    rect.setAttribute('x', x);rect.setAttribute('y', y);rect.setAttribute('width', w);
    text.setAttribute('x', x + 12);text.setAttribute('y', y + 16);
    items.summaryBox = {x, y, w, h};occupied.push(items.summaryBox);
  }

  function drawTraces(items, traces, camera, width, height, v) {
    const layer = items.layers.traces, color = items.paper ? '#6b7480' : items.mode === 'blueprint' ? '#8ebdd6' : 'rgba(170,200,235,0.55)';
    const nodes = [];
    for (const trace of traces) {
      const a = project(trace.from, camera, width, height, v), b = project(trace.to, camera, width, height, v);
      if (![a.x, a.y, b.x, b.y].every(Number.isFinite) || Math.hypot(a.x - b.x, a.y - b.y) < 6) continue;
      nodes.push(make('line', {'data-component-id': trace.id, x1: a.x.toFixed(1), y1: a.y.toFixed(1), x2: b.x.toFixed(1), y2: b.y.toFixed(1),
        stroke: trace.color || color, 'stroke-width': trace.width || .9, 'stroke-dasharray': trace.dash || '7 3 1.5 3', 'stroke-linecap': 'round'}));
    }
    layer.replaceChildren(...nodes);
  }

  function drawMeasurements(items, measurements, camera, width, height, v) {
    const layer = items.layers.measure, ink = items.paper ? '#D55E00' : '#ffd166', nodes = [];
    for (const m of measurements) {
      const a = project(m.a, camera, width, height, v);
      nodes.push(make('circle', {cx: a.x.toFixed(1), cy: a.y.toFixed(1), r: 3.2, fill: ink}));
      if (!m.b) continue;
      const b = project(m.b, camera, width, height, v), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      nodes.push(make('circle', {cx: b.x.toFixed(1), cy: b.y.toFixed(1), r: 3.2, fill: ink}));
      nodes.push(make('line', {x1: a.x.toFixed(1), y1: a.y.toFixed(1), x2: b.x.toFixed(1), y2: b.y.toFixed(1), stroke: ink, 'stroke-width': 1.4, 'marker-start': 'url(#sd-arrow)', 'marker-end': 'url(#sd-arrow)'}));
      const w = estimateWidth(m.text, 11) + 14;
      nodes.push(make('rect', {x: (mx - w / 2).toFixed(1), y: (my - 10).toFixed(1), width: w, height: 20, rx: 4, fill: items.paper ? '#ffffff' : 'rgba(12,18,28,0.9)', stroke: ink}));
      nodes.push(make('text', {x: mx.toFixed(1), y: (my + 4).toFixed(1), 'text-anchor': 'middle', 'font-size': 11, 'font-family': "ui-monospace,monospace", fill: items.paper ? '#1d232b' : '#fff1cc'}, m.text));
    }
    layer.replaceChildren(...nodes);
  }

  function drawDetailFrames(items, details, camera, width, height, v) {
    const layer = items.layers.details, nodes = [];
    const ink = items.paper ? '#1d232b' : items.mode === 'blueprint' ? '#a6d2e7' : 'rgba(255,190,110,0.9)';
    for (const detail of details) {
      const c = project(detail.center, camera, width, height, v);
      if (Number.isFinite(c.x) && Number.isFinite(c.y)) {
        nodes.push(make('circle', {'class': 'sd-detail-frame', cx: c.x.toFixed(1), cy: c.y.toFixed(1), r: detail.radiusPx.toFixed(1), fill: 'none', stroke: ink, 'stroke-width': 1.2, 'stroke-dasharray': '5 3'}));
        const lx = c.x + detail.radiusPx * .72 + 4, ly = c.y - detail.radiusPx * .72 - 4;
        nodes.push(make('text', {'class': 'sd-detail-text', x: lx.toFixed(1), y: ly.toFixed(1), 'font-size': 12, 'font-weight': 700, 'font-family': "'Inter',system-ui,sans-serif", fill: ink}, detail.label));
      }
      const r = detail.rect;
      nodes.push(make('rect', {'class': 'sd-detail-frame', x: r.x, y: r.y, width: r.w, height: r.h, rx: items.mode === 'webgl' ? 8 : 0, fill: 'none', stroke: ink, 'stroke-width': 1.3}));
      nodes.push(make('text', {'class': 'sd-detail-text', x: r.x + 2, y: r.y + r.h + 14, 'font-size': 10.5, 'font-family': "'Inter',system-ui,sans-serif", fill: items.mode === 'webgl' ? '#d6e4f2' : ink},
        `DETAIL ${detail.label} · ${detail.scaleText}${detail.caption ? ' · ' + detail.caption : ''}`));
    }
    layer.replaceChildren(...nodes);
  }

  function partsListMetrics(config) {
    const font = 10.5, padX = 8, rowH = 18;
    const widths = config.columns.map(column => Math.max(estimateWidth(column.title, 9.5), ...config.rows.map(row => estimateWidth(String(row[column.key] ?? ''), font))) + padX * 2);
    return {widths, w: widths.reduce((a, b) => a + b, 0), h: rowH * (config.rows.length + 1) + 22, font, padX, rowH};
  }
  // Poster legend: numbered badge, name, material subtitle; optional material key below.
  const LEGEND_ROW = 32, KEY_ROW = 16;
  function legendMetrics(rows, config) {
    const w = Math.max(150, ...rows.map(r => Math.max(estimateWidth(String(r.description).toUpperCase(), 10.2) * 1.06, estimateWidth(String(r.material || ''), 9.2)) + 40)) + 8;
    return {w: Math.min(300, w), h: rows.length * LEGEND_ROW + (config.title ? 22 : 4)};
  }
  function keyMetrics(config) {
    if (!config.materialKey?.length) return {w: 0, h: 0};
    return {w: Math.max(...config.materialKey.map(k => estimateWidth(k.name, 9.4))) + 34, h: config.materialKey.length * KEY_ROW + 22};
  }
  function legendColumns(config) {
    const rows = config.rows;
    if (config.position !== 'split') return [{side: config.position === 'left' ? -1 : 1, rows}];
    const half = Math.ceil(rows.length / 2);
    return [{side: -1, rows: rows.slice(0, half)}, {side: 1, rows: rows.slice(half)}];
  }
  // Width each side of the frame must keep clear for the parts list (0 when none).
  function measurePartsList(config) {
    if (config.style !== 'legend') {const m = partsListMetrics(config);return {w: m.w, h: m.h, left: config.position === 'left' ? m.w : 0, right: config.position === 'right' ? m.w : 0};}
    const cols = legendColumns(config).map(c => ({...c, ...legendMetrics(c.rows, config)})), key = keyMetrics(config);
    const left = Math.max(0, ...cols.filter(c => c.side < 0).map(c => c.w)), right = Math.max(0, ...cols.filter(c => c.side > 0).map(c => Math.max(c.w, key.w)));
    return {w: Math.max(left, right), h: Math.max(...cols.map(c => c.h)) + key.h, left, right};
  }
  function inkFor(items) {
    const paper = items.svg?.classList.contains('sd-annotations-illustration');
    if (items.mode === 'blueprint') return {bg: '#0b2947', stroke: '#8ebdd6', ink: '#d5eaf5', muted: '#9cc3d8', badge: '#d5eaf5', badgeText: '#0b2947', font: 'monospace'};
    if (paper) return {bg: '#ffffff', stroke: 'rgba(29,35,43,.28)', ink: '#1d232b', muted: '#5b6470', badge: '#1d232b', badgeText: '#ffffff', font: "Helvetica,Arial,'Inter',sans-serif"};
    return {bg: 'rgba(10,16,26,0.86)', stroke: 'rgba(130,170,220,0.4)', ink: '#e0eaf5', muted: '#8fa8c0', badge: '#e8eef6', badgeText: '#0c1220', font: "'Inter',system-ui,sans-serif"};
  }

  function drawLegend(items, view, width, height) {
    const config = view.partsList, palette = inkFor(items), nodes = [], boxes = [];
    const key = keyMetrics(config);
    for (const column of legendColumns(config)) {
      const m = legendMetrics(column.rows, config), x = column.side < 0 ? 16 : width - m.w - 16;
      const y = column.side < 0 ? (view.leftTopInset || view.topInset || 16) : (view.topInset || 16);
      // Rows shrink (and drop the material line) when the frame is short; the key yields first.
      const room = height - y - 30 - (config.title ? 18 : 2) - (column.side > 0 && key.h ? key.h + 14 : 0);
      const rowH = Math.max(14, Math.min(LEGEND_ROW, room / Math.max(1, column.rows.length))), compact = rowH < 26;
      let cy = y + (config.title ? 18 : 2);
      if (config.title && (column.side > 0 || config.position !== 'split')) nodes.push(make('text', {x, y: y + 10, 'font-size': 9.5, 'font-weight': 700, 'letter-spacing': 1, fill: palette.muted, 'font-family': palette.font}, config.title.toUpperCase()));
      for (const row of column.rows) {
        const g = make('g', {'class': 'sd-legend-row'});
        if (row.componentId) g.dataset.componentId = row.componentId;
        const r = compact ? Math.min(10.5, rowH * .42) : 10.5, mid = compact ? cy + rowH / 2 : cy + 11;
        g.appendChild(make('circle', {cx: x + 11, cy: mid, r, fill: palette.badge}));
        g.appendChild(make('text', {'class': 'sd-badge-text', x: x + 11, y: mid + r * .38, 'text-anchor': 'middle', 'font-size': Math.min(9.5, r * .95), 'font-weight': 700, fill: palette.badgeText, 'font-family': palette.font}, String(row.item).padStart(2, '0')));
        g.appendChild(make('text', {x: x + 28, y: compact ? mid + 3.5 : cy + 10, 'font-size': compact ? Math.min(10.2, rowH * .62) : 10.2, 'font-weight': 650, 'letter-spacing': .3, fill: palette.ink, 'font-family': palette.font}, String(row.description).toUpperCase()));
        if (row.material && !compact) g.appendChild(make('text', {x: x + 28, y: cy + 23, 'font-size': 9.2, fill: palette.muted, 'font-family': palette.font}, row.material + (row.qty > 1 ? `  ·  ×${row.qty}` : '')));
        nodes.push(g);cy += rowH;
      }
      boxes.push({x: x - 4, y: y - 4, w: m.w + 8, h: cy - y + 4});
      if (key.h && column.side > 0 && !compact) {
        let ky = cy + 14;
        const kx = width - Math.max(m.w, key.w) - 16;
        nodes.push(make('text', {x: kx, y: ky, 'font-size': 9.5, 'font-weight': 700, 'letter-spacing': 1, fill: palette.muted, 'font-family': palette.font}, 'MATERIALS'));
        ky += 8;
        for (const entry of config.materialKey) {
          nodes.push(make('rect', {x: kx, y: ky, width: 18, height: 10, fill: entry.color, stroke: palette.stroke}));
          nodes.push(make('text', {x: kx + 26, y: ky + 9, 'font-size': 9.4, fill: palette.ink, 'font-family': palette.font}, entry.name));
          ky += KEY_ROW;
        }
        boxes.push({x: kx - 4, y: cy, w: key.w + 8, h: ky - cy});
      }
    }
    items.partsList.replaceChildren(...nodes);
    return boxes;
  }

  // Parts list (BOM) from balloon items: item · description · qty · material · part no.
  function drawPartsList(items, view, width, height) {
    const group = items.partsList, config = view.partsList;
    if (!config || !config.rows.length) {group.replaceChildren();return [];}
    if (config.style === 'legend') return drawLegend(items, view, width, height);
    const columns = config.columns, {widths, w: tableW, h: tableH, font, padX, rowH} = partsListMetrics(config);
    const position = config.position || 'right';
    const x = position === 'left' ? 16 : width - tableW - 16;
    const y = position === 'bottom' ? height - tableH - (view.bottomInset || 16) : (view.topInset || 16);
    const nodes = [make('rect', {'class': 'sd-pl-bg', x, y, width: tableW, height: tableH, fill: 'rgba(10,16,26,0.86)', stroke: 'rgba(130,170,220,0.4)', rx: items.mode === 'webgl' ? 8 : 0})];
    nodes.push(make('text', {x: x + padX, y: y + 15, 'font-size': 10, 'font-weight': 700, 'letter-spacing': .8, fill: '#9fc4e6', 'font-family': "'Inter',system-ui,sans-serif"}, (config.title || 'Parts list').toUpperCase()));
    let cx = x;
    columns.forEach((column, i) => {
      nodes.push(make('text', {x: cx + padX, y: y + 22 + 13, 'font-size': 9.5, 'font-weight': 600, fill: '#8fa8c0', 'font-family': "'Inter',system-ui,sans-serif"}, column.title));
      cx += widths[i];
    });
    nodes.push(make('line', {x1: x, x2: x + tableW, y1: y + 22 + rowH, y2: y + 22 + rowH, stroke: 'rgba(130,170,220,0.4)'}));
    config.rows.forEach((row, r) => {
      let colX = x;const rowY = y + 22 + rowH * (r + 1) + 13;
      columns.forEach((column, i) => {
        const node = make('text', {x: colX + padX, y: rowY, 'font-size': font, fill: '#e0eaf5', 'font-family': column.key === 'partNumber' ? 'ui-monospace,monospace' : "'Inter',system-ui,sans-serif"}, String(row[column.key] ?? ''));
        if (row.componentId) node.dataset.componentId = row.componentId;
        nodes.push(node);colX += widths[i];
      });
    });
    group.replaceChildren(...nodes);
    return [{x, y, w: tableW, h: tableH}];
  }

  function setGroupVisibility(items, group, visible) {
    for (const item of items) {
      if (group && item.spec.group !== group) continue;
      item.g.style.visibility = visible ? 'visible' : 'hidden';
    }
  }

  function setLinked(items, ids) {
    for (const item of items) item.g.dataset.linked = String(!!item.component && ids.has(item.component));
  }

  function shown(item) {return item.layoutBox && item.g.style.visibility !== 'hidden' && item.g.style.display !== 'none';}

  function auditLayout(items, width, height) {
    const issues = [];
    const visible = items.filter(shown);
    for (let i = 0; i < visible.length; i++) for (let j = i + 1; j < visible.length; j++) {
      const a = visible[i].layoutBox, b = visible[j].layoutBox;
      if (Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y)) issues.push({level: 'warning', code: 'annotation:overlap', message: `Annotations "${visible[i].spec.id}" and "${visible[j].spec.id}" overlap.`});
    }
    for (const item of visible) {
      if (item.style === 'card') {
        let length = 0;try {length = item.body.text.getComputedTextLength();} catch {length = 0;}
        if (length > item.body.width - 12) issues.push({level: 'warning', code: 'annotation:overflow', message: `Annotation "${item.spec.id}" text overflows its card.`});
      }
      const box = item.layoutBox;
      if (width && height && box.desiredX !== undefined && (Math.abs(box.desiredX - box.x) > 220 || Math.abs(box.desiredY - box.y) > 160)) issues.push({level: 'warning', code: 'annotation:displaced', message: `Annotation "${item.spec.id}" was pushed far from its authored offset.`});
    }
    const leaders = visible.filter(item => item.leaderSegment);
    for (let i = 0; i < leaders.length; i++) for (let j = i + 1; j < leaders.length; j++) {
      if (segmentsCross(leaders[i].leaderSegment, leaders[j].leaderSegment)) issues.push({level: 'warning', code: 'annotation:leader-cross', message: `Leaders of "${leaders[i].spec.id}" and "${leaders[j].spec.id}" cross.`});
    }
    return issues;
  }

  function segmentsCross([ax, ay, bx, by], [cx, cy, dx, dy]) {
    const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
    if (Math.abs(d) < 1e-9) return false;
    const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d, u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
    return t > .02 && t < .98 && u > .02 && u < .98;
  }

  return {auditLayout, createOverlay, buildAnnotations, updateAnnotations, setGroupVisibility, setLinked, estimateWidth, measurePartsList};
}
