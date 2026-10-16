// annotations.js — SVG annotation overlay projected from 3D anchors.
// The SVG layer shares the camera's coordinate system: each 3D anchor is
// projected to screen space and a matching label/leader/dimension is placed.

export function createAnnotationSystem(THREE) {

  function createOverlay(container) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'sd-annotations');
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none;overflow:hidden;';
    container.appendChild(svg);
    return svg;
  }

  function buildAnnotations(svg, spec) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const items = [];
    // clear
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    svg.classList.toggle('sd-annotations-blueprint',spec.scene.renderMode==='blueprint');
    if(spec.scene.renderMode==='blueprint') {
      const theme=document.createElementNS(svgNS,'style');
      theme.textContent='.sd-annotations-blueprint .sd-annotation text{font-family:monospace;fill:#e0f4ff}.sd-annotations-blueprint .sd-annotation rect{fill:#0b2947;stroke:#8ebdd6;rx:0}.sd-annotations-blueprint .sd-annotation line{stroke:#a6d2e7}.sd-annotations-blueprint .sd-annotation circle{fill:#c6e9f9}';
      svg.appendChild(theme);
    }
    const defs = document.createElementNS(svgNS, 'defs');
    defs.innerHTML = `
      <marker id="sd-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M0,0 L8,4 L0,8 z" fill="rgba(230,238,248,0.9)"/>
      </marker>`;
    svg.appendChild(defs);

    for (const ann of spec.annotations || []) {
      const g = document.createElementNS(svgNS, 'g');
      g.setAttribute('class', `sd-annotation sd-annotation--${ann.type || 'label'} sd-emph--${ann.emphasis || 'normal'}`);
      g.dataset.id = ann.id;
      g.dataset.group = ann.group || '';

      const leader = document.createElementNS(svgNS, 'line');
      leader.setAttribute('stroke', 'rgba(210,224,240,0.55)');
      leader.setAttribute('stroke-width', '1');
      if (ann.leader !== false) g.appendChild(leader);

      const anchorDot = document.createElementNS(svgNS, 'circle');
      anchorDot.setAttribute('r', '2.4');
      anchorDot.setAttribute('fill', 'rgba(230,238,248,0.9)');
      g.appendChild(anchorDot);

      let body;
      if ((ann.type || 'label') === 'dimension') {
        body = buildDimensionBody(svgNS, ann);
      } else {
        body = buildLabelBody(svgNS, ann);
      }
      for (const el of body.nodes) g.appendChild(el);

      svg.appendChild(g);
      items.push({ spec: ann, g, leader, anchorDot, body, occluded: false });
    }
    return items;
  }

  function buildLabelBody(svgNS, ann) {
    const g = document.createElementNS(svgNS, 'g');
    const rect = document.createElementNS(svgNS, 'rect');
    const text = document.createElementNS(svgNS, 'text');
    const isCallout = ann.type === 'callout';
    text.textContent = ann.text || '';
    text.setAttribute('font-size', isCallout ? '11.5' : '11');
    text.setAttribute('font-family', "'Inter','SF Pro Text',system-ui,sans-serif");
    text.setAttribute('fill', '#e8eef6');
    text.setAttribute('x', '10');
    text.setAttribute('y', '15');
    const w = Math.max(28, (ann.text || '').length * 6.4 + 20);
    const h = 24;
    rect.setAttribute('width', String(w));
    rect.setAttribute('height', String(h));
    rect.setAttribute('rx', '6');
    rect.setAttribute('fill', 'rgba(12,18,28,0.82)');
    rect.setAttribute('stroke', ann.emphasis === 'primary' ? 'rgba(255,170,80,0.85)'
      : ann.emphasis === 'warning' ? 'rgba(255,110,90,0.85)'
        : ann.emphasis === 'secondary' ? 'rgba(130,170,220,0.55)'
          : 'rgba(150,180,215,0.5)');
    g.appendChild(rect);
    g.appendChild(text);
    return { nodes: [g], rect, text, width: w, height: h };
  }

  function buildDimensionBody(svgNS, ann) {
    const g = document.createElementNS(svgNS, 'g');
    const extensionA = document.createElementNS(svgNS, 'line');
    const extensionB = document.createElementNS(svgNS, 'line');
    for (const extension of [extensionA,extensionB]) {extension.setAttribute('stroke','rgba(230,238,248,0.45)');g.appendChild(extension);}
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('stroke', 'rgba(230,238,248,0.8)');
    line.setAttribute('stroke-width', '1');
    line.setAttribute('stroke-dasharray', '4 3');
    line.setAttribute('marker-start', 'url(#sd-arrow)');
    line.setAttribute('marker-end', 'url(#sd-arrow)');
    const text = document.createElementNS(svgNS, 'text');
    text.textContent = ann.value || ann.text || '';
    text.setAttribute('font-size', '10.5');
    text.setAttribute('font-family', "'Inter',ui-monospace,monospace");
    text.setAttribute('fill', '#ffe6c8');
    text.setAttribute('text-anchor', 'middle');
    const bg = document.createElementNS(svgNS, 'rect');
    const w = Math.max(24, (text.textContent.length * 6.1 + 12));
    bg.setAttribute('width', String(w));
    bg.setAttribute('height', '18');
    bg.setAttribute('rx', '4');
    bg.setAttribute('fill', 'rgba(12,18,28,0.85)');
    g.appendChild(line);
    g.appendChild(bg);
    g.appendChild(text);
    return { nodes: [g], line, extensionA, extensionB, text, bg, width: w, height: 18 };
  }

  // Per-frame update. resolveTarget(spec) -> THREE.Vector3 | null (world)
  function updateAnnotations(items, camera, width, height, resolveTarget, occlusionFor) {
    const v = new THREE.Vector3();
    let roundRobin = 0;
    return function update() {
      const host=items[0]?.g.ownerSVGElement?.parentElement;
      if(host) {width=host.clientWidth;height=host.clientHeight;}
      const hostRect=host?.getBoundingClientRect();
      const occupied=[];
      if(hostRect) for(const element of host.querySelectorAll('.sd-title,.sd-toolbar,.sd-legend,.sd-inspect')) {
        if(getComputedStyle(element).display==='none') continue;
        const b=element.getBoundingClientRect();
        occupied.push({x:b.x-hostRect.x,y:b.y-hostRect.y,w:b.width,h:b.height});
      }
      const ordered=[...items].sort((a,b)=>((b.spec.type==='dimension'?2:0)+(b.spec.emphasis==='primary'?1:0))-((a.spec.type==='dimension'?2:0)+(a.spec.emphasis==='primary'?1:0)));
      for (const [index,item] of ordered.entries()) {
        if (item.g.style.visibility==='hidden') continue;
        const spec = item.spec;
        const worldPos = resolveTarget(spec.target);
        const visibleOk = !!worldPos;
        if (!visibleOk) { item.g.style.display = 'none'; continue; }
        item.g.style.display = '';

        if ((spec.type || 'label') === 'dimension') {
          const worldB = spec.targetB ? resolveTarget(spec.targetB) : null;
          if (!worldB) { item.g.style.display = 'none'; continue; }
          v.copy(worldPos).project(camera);
          const x1 = (v.x * 0.5 + 0.5) * width, y1 = (-v.y * 0.5 + 0.5) * height;
          v.copy(worldB).project(camera);
          const x2 = (v.x * 0.5 + 0.5) * width, y2 = (-v.y * 0.5 + 0.5) * height;
          const offset=spec.offset || [0,0];
          const dx=offset[0] || 0,dy=offset[1] || 0;
          const mx=(x1+x2)/2+dx,my=(y1+y2)/2+dy;
          for (const [extension,x,y] of [[item.body.extensionA,x1,y1],[item.body.extensionB,x2,y2]]) {
            extension.setAttribute('x1',String(x));extension.setAttribute('y1',String(y));
            extension.setAttribute('x2',String(x+dx));extension.setAttribute('y2',String(y+dy));
          }
          if (!Number.isFinite(mx) || !Number.isFinite(my)) { item.g.style.display = 'none'; continue; }
          item.body.line.setAttribute('x1', String(x1+dx));
          item.body.line.setAttribute('y1', String(y1+dy));
          item.body.line.setAttribute('x2', String(x2+dx));
          item.body.line.setAttribute('y2', String(y2+dy));
          item.body.bg.setAttribute('x', String(mx - item.body.width / 2));
          item.body.bg.setAttribute('y', String(my - 9));
          item.body.text.setAttribute('x', String(mx));
          item.body.text.setAttribute('y', String(my + 4));
          item.anchorDot.setAttribute('cx', String(x1));
          item.anchorDot.setAttribute('cy', String(y1));
          item.leader.style.display = 'none';
          item.layoutBox={x:mx-item.body.width/2,y:my-9,w:item.body.width,h:18};
          occupied.push(item.layoutBox);
          continue;
        }

        v.copy(worldPos).project(camera);
        const behind = v.z > 1;
        const sx = (v.x * 0.5 + 0.5) * width, sy = (-v.y * 0.5 + 0.5) * height;
        if (!Number.isFinite(sx) || !Number.isFinite(sy)) { item.g.style.display = 'none'; continue; }
        const offset = spec.offset || [24, -14, 0];
        const requestedSide=spec.side || 'auto';
        const side=requestedSide==='auto' ? (sx>=width/2 ? 1 : -1) : (requestedSide==='right' ? 1 : -1);
        const desiredX=sx+side*Math.abs(offset[0])-(side===1 ? 0 : item.body.width);
        const desiredY=sy+offset[1]-item.body.height/2;
        const w=item.body.width,h=item.body.height;
        let best=null,bestScore=Infinity;
        for(let step=0;step<Math.ceil(height/(h+5))+1;step++) for(const sign of step===0 ? [1] : [-1,1]) {
          const x=Math.max(5,Math.min(width-w-5,desiredX));
          const y=Math.max(5,Math.min(height-h-5,desiredY+sign*step*(h+5)));
          const overlap=occupied.reduce((sum,b)=>sum+Math.max(0,Math.min(x+w+4,b.x+b.w)-Math.max(x-4,b.x))*Math.max(0,Math.min(y+h+4,b.y+b.h)-Math.max(y-4,b.y)),0);
          const score=overlap*1000+Math.abs(y-desiredY);
          if(score<bestScore){bestScore=score;best={x,y,w,h};}
          if(overlap===0) break;
        }
        const box=best || {x:desiredX,y:desiredY,w,h};
        item.layoutBox=box;occupied.push(box);
        const edgeX=side===1 ? box.x : box.x+w,centerY=box.y+h/2;
        item.anchorDot.setAttribute('cx',String(sx));item.anchorDot.setAttribute('cy',String(sy));
        item.body.rect.setAttribute('x',String(box.x));item.body.rect.setAttribute('y',String(box.y));
        item.body.text.setAttribute('x',String(box.x+10));item.body.text.setAttribute('y',String(box.y+17));
        if(spec.leader!==false) {
          item.leader.setAttribute('x1',String(sx));item.leader.setAttribute('y1',String(sy));
          item.leader.setAttribute('x2',String(edgeX));item.leader.setAttribute('y2',String(centerY));
        }

        // Round-robin occlusion dimming (budgeted raycasts)
        if (occlusionFor && ((index+roundRobin) % 3 === 0)) {
          item.occluded = occlusionFor(worldPos, item.spec.target);
        }
        const blueprint=!!item.g.ownerSVGElement?.classList.contains('sd-annotations-blueprint');
        const dimmed = (!blueprint && item.occluded) || behind || sx < -80 || sx > width + 80 || sy < -40 || sy > height + 40;
        item.g.setAttribute('opacity', dimmed ? '0.22' : '1');
        item.g.dataset.anchorOccluded=String(item.occluded);
        item.leader.setAttribute('stroke-dasharray',blueprint && item.occluded?'3 3':'none');
        item.anchorDot.setAttribute('opacity',blueprint && item.occluded?'.45':'1');
      }
      roundRobin=(roundRobin+1)%3;
    };
  }

  function setGroupVisibility(items, group, visible) {
    for (const item of items) {
      if (group && item.spec.group !== group) continue;
      item.g.style.visibility = visible ? 'visible' : 'hidden';
    }
  }

  function auditLayout(items) {
    const issues=[];
    const visible=items.filter(i=>i.layoutBox && i.g.style.visibility!=='hidden' && i.g.style.display!=='none');
    for(let i=0;i<visible.length;i++) for(let j=i+1;j<visible.length;j++) {
      const a=visible[i].layoutBox,b=visible[j].layoutBox;
      if(Math.min(a.x+a.w,b.x+b.w)>Math.max(a.x,b.x) && Math.min(a.y+a.h,b.y+b.h)>Math.max(a.y,b.y)) issues.push({level:'warning',code:'annotation:overlap',message:`Annotations "${visible[i].spec.id}" and "${visible[j].spec.id}" overlap.`});
    }
    return issues;
  }

  return { auditLayout, createOverlay, buildAnnotations, updateAnnotations, setGroupVisibility };
}
