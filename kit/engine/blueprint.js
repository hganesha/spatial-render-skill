// True vector drawings from the SAME transformed meshes as WebGL.
// Two themes share one pipeline: `blueprint` (isometric drawing sheet) and
// `illustration` (publication line art: white paper, weighted ink lines).
// Painter-sorted front faces hide rear edges. This is an illustration renderer,
// not a CAD B-rep/boolean hidden-line solver (intersecting faces can be ambiguous).
let blueprintInstance=0;

export const VECTOR_THEMES={
  blueprint:{paper:'#0b2947',grid:true,gridMinor:'#224764',gridMajor:'#315e7b',border:'#719bb4',
    fills:{top:'#163d5c',side:'#10314e',front:'#0d2c48'},edge:'#b5d6e7',silhouette:'#d3ebf6',edgeW:.85,silW:1.3,
    hidden:'#7fa6bd',select:'#65e7ff',hover:'#b0f2ff',selectFill:null,connector:'#70d7f2',pulse:'#d6f7ff',
    text:'#b9d9e9',headingText:'#d5eaf5',font:'monospace',hatch:'#8ebdd6',hatchBg:'#0f3657',triad:'#97c9e3',
    detailBg:'#0b2947',footer:true,triadDefault:true},
  illustration:{paper:'#ffffff',grid:false,border:null,
    fills:{top:'#ffffff',side:'#eef1f4',front:'#dfe4ea'},edge:'#3b4148',silhouette:'#0f1216',edgeW:.55,silW:1.45,
    hidden:'#8a929c',select:'#D55E00',hover:'#E69F00',selectFill:'#fbe3d2',connector:'#0072B2',pulse:'#0072B2',
    text:'#1d232b',headingText:'#1d232b',font:"Helvetica,Arial,'Inter',sans-serif",hatch:'#30353b',hatchBg:'#ffffff',triad:'#55606c',
    detailBg:'#ffffff',footer:true,triadDefault:false}
};

export function vectorTheme(spec,mode) {
  const base=VECTOR_THEMES[mode] || VECTOR_THEMES.blueprint,drawing=spec.scene.drawing || {};
  const theme={...base,fills:{...base.fills},mode};
  if(mode==='illustration') {
    const options=spec.scene.illustration || {};
    if(options.paper) {theme.paper=options.paper;theme.detailBg=options.paper;theme.hatchBg=options.paper;}
    if(options.ink) {theme.edge=options.ink;theme.silhouette=options.ink;theme.text=options.ink;theme.headingText=options.ink;theme.hatch=options.ink;}
    if(options.spotColor) theme.select=options.spotColor;
    if(options.shading==='none') theme.fills={top:theme.paper,side:theme.paper,front:theme.paper};
    else if(options.shading==='flat') theme.fills={top:'#f4f6f8',side:'#f4f6f8',front:'#f4f6f8'};
  }
  const weight=drawing.lineWeight || 1;theme.edgeW*=weight;theme.silW*=weight;
  theme.hiddenLines=!!drawing.hiddenLines;theme.sectionCaps=drawing.sectionCaps!==false;
  theme.triad=drawing.triad ?? theme.triadDefault;theme.footer=drawing.footer ?? theme.footer;
  return theme;
}

export function createBlueprintSystem(THREE,container,capSystem) {
  const ns='http://www.w3.org/2000/svg',uid=`sd-bp-${++blueprintInstance}`;
  const svg=document.createElementNS(ns,'svg');
  svg.setAttribute('class','sd-blueprint-drawing');svg.setAttribute('role','img');
  svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;display:none;';
  container.appendChild(svg);
  const topologyCache=new WeakMap();let signature='',sheetSize='',width=0,height=0,panelCount=0;
  let screenLayers=null;
  const n=value=>Number(value.toFixed(2));
  function el(tag,attrs={},text) {
    const node=document.createElementNS(ns,tag);
    for(const [key,value] of Object.entries(attrs)) if(value!==undefined && value!==null) node.setAttribute(key,String(value));
    if(text!==undefined) node.textContent=text;
    return node;
  }

  // Populates `target` with paper, grid, frame, layers and sheet notes.
  function sheet(target,w,h,spec,theme,id,opts={}) {
    target.replaceChildren();
    target.setAttribute('xmlns',ns);target.setAttribute('viewBox',`0 0 ${w} ${h}`);
    target.setAttribute('width',w);target.setAttribute('height',h);
    const kind=theme.mode==='illustration'?'technical illustration':'isometric blueprint';
    target.setAttribute('aria-label',`${spec.scene.title || spec.scene.id} — ${kind}`);
    target.appendChild(el('title',{},`${spec.scene.title || spec.scene.id} — ${kind}`));
    target.appendChild(el('desc',{},`Orthographic ${theme.mode==='illustration'?'':'isometric '}illustration, ${spec.scene.fidelity} fidelity. Drawing not to scale. Geometry, outlines, connectors and labels are vectors.`));
    const defs=el('defs');
    if(theme.grid) {
      const grid=el('pattern',{id:id+'-grid',width:24,height:24,patternUnits:'userSpaceOnUse'});
      grid.appendChild(el('path',{d:'M24 0H0V24',fill:'none',stroke:theme.gridMinor,'stroke-width':.45}));defs.appendChild(grid);
      const major=el('pattern',{id:id+'-major',width:120,height:120,patternUnits:'userSpaceOnUse'});
      major.appendChild(el('rect',{width:120,height:120,fill:`url(#${id}-grid)`}));
      major.appendChild(el('path',{d:'M120 0H0V120',fill:'none',stroke:theme.gridMajor,'stroke-width':.65}));defs.appendChild(major);
    }
    const hatch=el('pattern',{id:id+'-hatch',width:6,height:6,patternUnits:'userSpaceOnUse',patternTransform:'rotate(45)'});
    hatch.appendChild(el('rect',{width:6,height:6,fill:theme.hatchBg}));
    hatch.appendChild(el('line',{x1:0,y1:0,x2:0,y2:6,stroke:theme.hatch,'stroke-width':1.1}));defs.appendChild(hatch);
    const inset=opts.margin ?? (theme.border?18:0),bottom=opts.reserveBottom || 0;
    const clip=el('clipPath',{id:id+'-clip'});clip.appendChild(el('rect',{x:inset,y:inset,width:Math.max(1,w-inset*2),height:Math.max(1,h-inset*2-bottom)}));defs.appendChild(clip);
    target.appendChild(defs);
    target.appendChild(el('rect',{'class':'sd-paper',width:w,height:h,fill:theme.paper}));
    if(theme.grid) target.appendChild(el('rect',{width:w,height:h,fill:`url(#${id}-major)`}));
    if(theme.border) target.appendChild(el('rect',{x:inset,y:inset,width:Math.max(1,w-inset*2),height:Math.max(1,h-inset*2-bottom),fill:'none',stroke:theme.border,'stroke-width':.8}));
    const layers={
      geometry:el('g',{'class':'sd-blueprint-geometry','clip-path':`url(#${id}-clip)`,'stroke-linejoin':'round','stroke-linecap':'round'}),
      hidden:el('g',{'class':'sd-vector-hidden','clip-path':`url(#${id}-clip)`,fill:'none'}),
      connectors:el('g',{'class':'sd-blueprint-connectors','clip-path':`url(#${id}-clip)`}),
      details:el('g',{'class':'sd-vector-details'}),
      hatchId:id+'-hatch',id
    };
    target.appendChild(layers.geometry);target.appendChild(layers.hidden);target.appendChild(layers.connectors);target.appendChild(layers.details);
    const frame=el('g',{'class':'sd-blueprint-sheet',fill:theme.text,'font-family':theme.font,'font-size':9,'letter-spacing':theme.mode==='illustration'?.4:1});
    if(theme.footer && opts.footer!==false) {
      const projection=theme.mode==='illustration'?'ORTHOGRAPHIC':'ISOMETRIC 30° / 30°';
      frame.appendChild(el('text',{x:inset+12,y:h-inset-11-bottom},`${projection}  ·  ${spec.scene.units}  ·  NOT TO SCALE`));
      if(w>750) frame.appendChild(el('text',{x:w-inset-12,y:h-inset-11-bottom,'text-anchor':'end'},`${spec.scene.id.toUpperCase()}  /  ${spec.scene.fidelity.toUpperCase()}`));
    }
    layers.triad=el('g',{'class':'sd-vector-triad'});frame.appendChild(layers.triad);
    if(theme.triad && opts.triad!==false && opts.camera) layers.triad.replaceChildren(triad(opts.camera,w,theme,inset));
    layers.inset=inset;
    target.appendChild(frame);
    return layers;
  }

  // Orientation triad projected through the drawing camera.
  function triad(camera,w,theme,inset) {
    const group=el('g',{transform:`translate(${w-inset-52} ${inset+88})`,stroke:theme.triad,'stroke-width':1.1});
    const q=camera.quaternion.clone().invert();
    for(const [label,axis] of [['X',[1,0,0]],['Y',[0,1,0]],['Z',[0,0,1]]]) {
      const v=new THREE.Vector3(...axis).applyQuaternion(q),x=n(v.x*30),y=n(-v.y*30);
      group.appendChild(el('path',{d:`M0 0L${x} ${y}`,fill:'none'}));
      group.appendChild(el('text',{x:n(v.x*38)-3,y:n(-v.y*38)+3,stroke:'none'},label));
    }
    return group;
  }

  // Weld BufferGeometry's seam-split vertices so tessellation is not mistaken
  // for physical edges. The cache is weak: component replacement frees it.
  function topology(geometry) {
    if(topologyCache.has(geometry)) return topologyCache.get(geometry);
    const positions=geometry.getAttribute('position'),index=geometry.index,vertices=[],remap=[],weld=new Map(),faces=[],edges=new Map();
    if(!positions)return {vertices,faces,edges};
    for(let i=0;i<positions.count;i++) {
      const v=new THREE.Vector3().fromBufferAttribute(positions,i),key=v.toArray().map(x=>Math.round(x*1e5)).join(',');
      if(!weld.has(key)){weld.set(key,vertices.length);vertices.push(v);}remap[i]=weld.get(key);
    }
    const count=index?index.count:positions.count;
    for(let i=0;i+2<count;i+=3) {
      const ids=[0,1,2].map(j=>remap[index?index.getX(i+j):i+j]);
      const normal=new THREE.Vector3().subVectors(vertices[ids[1]],vertices[ids[0]]).cross(new THREE.Vector3().subVectors(vertices[ids[2]],vertices[ids[0]]));
      if(normal.lengthSq()<1e-15)continue;normal.normalize();
      const face={ids,normal,edges:[]},faceIndex=faces.length;faces.push(face);
      for(let j=0;j<3;j++) {
        const a=ids[j],b=ids[(j+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(':');
        if(!edges.has(key))edges.set(key,{a,b,faces:[]});
        const edge=edges.get(key);edge.faces.push(faceIndex);face.edges.push(edge);
      }
    }
    for(const edge of edges.values())edge.feature=edge.faces.length!==2 || faces[edge.faces[0]].normal.dot(faces[edge.faces[1]].normal)<Math.cos(25*Math.PI/180);
    const result={vertices,faces,edges};topologyCache.set(geometry,result);return result;
  }
  function visible(node) {for(let p=node;p;p=p.parent)if(!p.visible)return false;return true;}
  function materialOf(mesh) {return Array.isArray(mesh.material)?mesh.material[0]:mesh.material;}
  function componentIdOf(mesh) {let parent=mesh;while(parent&&!parent.userData.componentId)parent=parent.parent;return parent?.userData.componentId || '';}
  function clipPolygon(points,planes) {
    for(const plane of planes) {
      const clipped=[];
      for(let i=0;i<points.length;i++) {
        const a=points[i],b=points[(i+1)%points.length],da=plane.distanceToPoint(a),db=plane.distanceToPoint(b);
        if(da>=0)clipped.push(a);
        if((da>=0)!==(db>=0))clipped.push(a.clone().lerp(b,da/(da-db)));
      }
      points=clipped;if(!points.length)break;
    }
    return points;
  }
  function clipEdge(a,b,planes) {
    a=a.clone();b=b.clone();
    for(const plane of planes) {
      const da=plane.distanceToPoint(a),db=plane.distanceToPoint(b);
      if(da<0&&db<0)return null;
      if(da<0)a.lerp(b,da/(da-db));else if(db<0)b.lerp(a,db/(db-da));
    }
    return [a,b];
  }
  function project(point,camera) {const p=point.clone().project(camera);return [n((p.x*.5+.5)*width),n((-.5*p.y+.5)*height),p.z];}
  function line(points,camera,closed=false) {return points.map((v,i)=>{const p=project(v,camera);return `${i?'L':'M'}${p[0]} ${p[1]}`;}).join('')+(closed?'Z':'');}
  function inHighlight(state,id) {return state.highlight && state.highlight.size>0 && state.highlight.has(id);}

  function collectMeshes(hierarchy) {
    hierarchy.root.updateWorldMatrix(true,true);
    const meshes=[];hierarchy.root.traverse(node=>{if(node.isMesh && visible(node))meshes.push(node);});
    return meshes;
  }

  function drawGeometry(layers,meshes,camera,state,theme) {
    const triangles=[],forward=camera.getWorldDirection(new THREE.Vector3()),hidden=[];
    let sectionPlane=null;
    for(const mesh of meshes) {
      const material=materialOf(mesh);if(!material || material.opacity<.01)continue;
      const model=topology(mesh.geometry),world=model.vertices.map(v=>v.clone().applyMatrix4(mesh.matrixWorld));
      const normalMatrix=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
      const normals=model.faces.map(f=>f.normal.clone().applyMatrix3(normalMatrix).normalize());
      const fronts=normals.map(normal=>normal.dot(forward)<-1e-8);
      const planes=material.clippingPlanes || [];
      if(planes.length && !sectionPlane) sectionPlane=planes[0];
      const id=componentIdOf(mesh),selected=state.selected===id || inHighlight(state,id),hovered=state.hovered===id;
      const stroke=selected?theme.select:hovered?theme.hover:theme.edge,silStroke=selected?theme.select:hovered?theme.hover:theme.silhouette;
      if(theme.hiddenLines && material.opacity>=.5) {
        const segments=[];
        for(const edge of model.edges.values()) {
          const silhouette=edge.faces.length===1 || edge.faces.some(j=>fronts[j])!==edge.faces.every(j=>fronts[j]);
          if(!edge.feature && !silhouette) continue;
          const pair=clipEdge(world[edge.a],world[edge.b],planes);if(pair)segments.push(line(pair,camera));
        }
        if(segments.length) hidden.push({id,d:segments.join(''),opacity:material.opacity});
      }
      for(let i=0;i<model.faces.length;i++) {
        const face=model.faces[i];if(!fronts[i])continue;
        const points=clipPolygon(face.ids.map(index=>world[index]),planes);if(points.length<3)continue;
        const normal=normals[i];
        let fill=normal.y>.55?theme.fills.top:Math.abs(normal.x)>.55?theme.fills.side:theme.fills.front;
        if(selected && theme.selectFill) fill=theme.selectFill;
        const creases=[],silhouettes=[];
        for(const edge of face.edges) {
          const silhouette=edge.faces.length===1 || edge.faces.some(j=>!fronts[j]);
          if(!edge.feature && !silhouette) continue;
          const pair=clipEdge(world[edge.a],world[edge.b],planes);if(!pair) continue;
          (silhouette?silhouettes:creases).push(line(pair,camera));
        }
        // The newly cut rim is an honest clipping boundary (capped below when enabled).
        for(let j=0;j<points.length;j++)if(planes.some(p=>Math.abs(p.distanceToPoint(points[j]))<1e-6 && Math.abs(p.distanceToPoint(points[(j+1)%points.length]))<1e-6))silhouettes.push(line([points[j],points[(j+1)%points.length]],camera));
        triangles.push({id,depth:points.reduce((sum,v)=>sum+v.clone().project(camera).z,0)/points.length,
          face:line(points,camera,true),creases:creases.join(''),silhouettes:silhouettes.join(''),fill,opacity:material.opacity,
          stroke,silStroke,weight:selected?theme.edgeW*1.5:theme.edgeW,silWeight:selected?theme.silW*1.25:theme.silW});
      }
    }
    if(sectionPlane && theme.sectionCaps && capSystem) {
      for(const section of capSystem.sectionLoops({traverse:fn=>meshes.forEach(fn),updateWorldMatrix(){}},sectionPlane)) {
        const opacity=meshes.find(mesh=>componentIdOf(mesh)===section.id && materialOf(mesh)?.clippingPlanes?.length);
        const projected=section.loops.map(loop=>loop.map(p=>project(p,camera)));
        const depth=projected.flat().reduce((sum,p)=>sum+p[2],0)/Math.max(1,projected.flat().length);
        const d=projected.map(loop=>loop.map((p,i)=>`${i?'L':'M'}${p[0]} ${p[1]}`).join('')+'Z').join('');
        const selected=state.selected===section.id || inHighlight(state,section.id);
        triangles.push({id:section.id,cap:true,depth:depth-1e-6,face:d,creases:'',silhouettes:d,fill:`url(#${layers.hatchId})`,
          opacity:materialOf(opacity)?.opacity ?? 1,stroke:theme.edge,silStroke:selected?theme.select:theme.silhouette,weight:theme.edgeW,silWeight:theme.silW});
      }
    }
    triangles.sort((a,b)=>b.depth-a.depth);
    const fragment=document.createDocumentFragment();
    // Merge consecutive triangles from the same component and face orientation.
    // Stroke only physical feature edges/silhouettes; never the triangle mesh.
    let batch=null;
    function flush() {
      if(!batch)return;
      const group=el('g',{'data-component-id':batch.id,opacity:n(batch.opacity)});
      group.appendChild(el('path',{'class':batch.cap?'sd-blueprint-face sd-vector-cap':'sd-blueprint-face',d:batch.face,fill:batch.fill,stroke:batch.cap?'none':batch.fill,'stroke-width':.35,'fill-rule':'evenodd'}));
      if(batch.creases)group.appendChild(el('path',{'class':'sd-blueprint-edge',d:batch.creases,fill:'none',stroke:batch.stroke,'stroke-width':n(batch.weight)}));
      if(batch.silhouettes)group.appendChild(el('path',{'class':'sd-blueprint-edge sd-blueprint-silhouette',d:batch.silhouettes,fill:'none',stroke:batch.silStroke,'stroke-width':n(batch.silWeight)}));
      fragment.appendChild(group);
    }
    for(const triangle of triangles) {
      if(batch && !batch.cap && !triangle.cap && ['id','fill','opacity','stroke','weight','silStroke','silWeight'].every(key=>batch[key]===triangle[key])) {batch.face+=triangle.face;batch.creases+=triangle.creases;batch.silhouettes+=triangle.silhouettes;}
      else {flush();batch={...triangle};}
    }
    flush();layers.geometry.replaceChildren(fragment);
    const hiddenFragment=document.createDocumentFragment();
    for(const item of hidden) hiddenFragment.appendChild(el('path',{'data-component-id':item.id,d:item.d,stroke:theme.hidden,'stroke-width':n(theme.edgeW*.7),'stroke-dasharray':'3 2.2',opacity:n(item.opacity)}));
    layers.hidden.replaceChildren(hiddenFragment);
    return triangles.length;
  }

  function drawConnectors(layer,scene,camera,spec,theme) {
    const fragment=document.createDocumentFragment(),group=scene.getObjectByName('sd-connectors');
    if(group?.visible)for(const object of group.children) {
      if(!object.visible)continue;
      const material=materialOf(object),planes=material?.clippingPlanes || [];
      if(object.userData.connectorId && object.userData.curve) {
        const points=object.userData.curve.getPoints(48),segments=[];
        for(let i=1;i<points.length;i++){const pair=clipEdge(points[i-1],points[i],planes);if(pair)segments.push(line(pair,camera));}
        fragment.appendChild(el('path',{'data-connector-id':object.userData.connectorId,d:segments.join(''),fill:'none',stroke:theme.connector,'stroke-width':n(1.4*(spec.scene.drawing?.lineWeight || 1))}));
        const definition=spec.connectors.find(c=>c.id===object.userData.connectorId),end=object.userData.curve.getPoint(1);
        if(definition?.geometry?.kind==='arrow' && !planes.some(p=>p.distanceToPoint(end)<0)) {
          const tip=project(end,camera),previous=project(object.userData.curve.getPoint(.97),camera),dx=tip[0]-previous[0],dy=tip[1]-previous[1],length=Math.hypot(dx,dy);
          if(length>1e-5) {
            const ux=dx/length,uy=dy/length;
            const points=[[tip[0],tip[1]],[tip[0]-ux*10-uy*4,tip[1]-uy*10+ux*4],[tip[0]-ux*10+uy*4,tip[1]-uy*10-ux*4]];
            fragment.appendChild(el('polygon',{'class':'sd-blueprint-arrow','data-connector-id':object.userData.connectorId,points:points.map(p=>p.map(n).join(',')).join(' '),fill:theme.connector}));
          }
        }
      } else if(object.userData.t!==undefined) {
        if(planes.some(p=>p.distanceToPoint(object.position)<0))continue;
        const point=project(object.position,camera);fragment.appendChild(el('circle',{'class':'sd-blueprint-pulse',cx:point[0],cy:point[1],r:2.1,fill:theme.pulse}));
      }
    }
    layer.replaceChildren(fragment);
  }

  // Detail insets: [{rect:{x,y,w,h}, camera}] drawn as clipped vector sub-drawings.
  function drawDetails(layers,meshes,details,state,theme) {
    const fragment=document.createDocumentFragment();
    const saved=[width,height];
    for(const [i,detail] of details.entries()) {
      const {x,y,w,h}=detail.rect,clipId=`${layers.id}-detail-${i}`;
      const clip=el('clipPath',{id:clipId});clip.appendChild(el('rect',{x:0,y:0,width:w,height:h,rx:theme.mode==='illustration'?0:4}));
      const group=el('g',{'class':'sd-vector-detail',transform:`translate(${n(x)} ${n(y)})`,'data-detail-id':detail.id});
      group.appendChild(clip);
      group.appendChild(el('rect',{width:w,height:h,fill:theme.detailBg}));
      width=w;height=h;
      const sub={geometry:el('g',{'clip-path':`url(#${clipId})`,'stroke-linejoin':'round','stroke-linecap':'round'}),hidden:el('g',{'clip-path':`url(#${clipId})`,fill:'none'}),hatchId:layers.hatchId,id:clipId};
      drawGeometry(sub,meshes,detail.camera,state,{...theme,edgeW:theme.edgeW*1.15,silW:theme.silW*1.15});
      group.appendChild(sub.geometry);group.appendChild(sub.hidden);
      width=saved[0];height=saved[1];
      fragment.appendChild(group);
    }
    layers.details.replaceChildren(fragment);
  }

  // On-screen drawing. opts: {theme, reserveBottom, details}
  function update(hierarchy,scene,camera,spec,state,opts={}) {
    const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;
    const theme=opts.theme || vectorTheme(spec,'blueprint');
    const size=JSON.stringify([w,h,spec.scene.id,spec.scene.title,spec.scene.units,spec.scene.fidelity,theme,opts.reserveBottom || 0]);
    camera.updateMatrixWorld();
    if(size!==sheetSize) {width=w;height=h;screenLayers=sheet(svg,w,h,spec,theme,uid,{reserveBottom:opts.reserveBottom,camera});sheetSize=size;signature='';}
    width=w;height=h;
    if(theme.triad) screenLayers.triad.replaceChildren(triad(camera,w,theme,screenLayers.inset));
    const meshes=collectMeshes(hierarchy);
    const stamp=JSON.stringify([camera.matrixWorld.elements,camera.projectionMatrix.elements,state.selected,state.hovered,[...(state.highlight || [])],(opts.details || []).map(d=>[d.rect,d.camera.matrixWorld.elements,d.camera.projectionMatrix.elements]),meshes.map(mesh=>{
      const mat=materialOf(mesh);return [mesh.uuid,mesh.geometry.uuid,mesh.matrixWorld.elements,mat?.opacity,mat?.clippingPlanes?.map(p=>[...p.normal.toArray(),p.constant])];
    })]);
    if(stamp!==signature){
      svg.dataset.faceCount=String(drawGeometry(screenLayers,meshes,camera,state,theme));
      drawDetails(screenLayers,meshes,opts.details || [],state,theme);
      signature=stamp;
    }
    drawConnectors(screenLayers.connectors,scene,camera,spec,theme);
    svg.dataset.projection='orthographic';svg.dataset.theme=theme.mode;
    const spherical=new THREE.Spherical().setFromVector3(camera.getWorldDirection(new THREE.Vector3()).negate());
    svg.dataset.azimuth=String(theme.mode==='blueprint'?45:n(spherical.theta*180/Math.PI));
    svg.dataset.elevation=String(theme.mode==='blueprint'?35.264389682754654:n(90-spherical.phi*180/Math.PI));
  }

  // Off-screen drawing at explicit dimensions; returns a detached <svg>.
  // opts: {hierarchy, scene, camera, spec, state, width, height, theme, annotations, heading, details, footer}
  function renderDrawing(opts) {
    const saved=[width,height],target=el('svg'),id=`${uid}-p${++panelCount}`,theme=opts.theme;
    width=opts.width;height=opts.height;opts.camera.updateMatrixWorld();
    const layers=sheet(target,width,height,opts.spec,theme,id,{camera:opts.camera,footer:opts.footer,triad:opts.triad});
    const meshes=collectMeshes(opts.hierarchy);
    target.dataset.faceCount=String(drawGeometry(layers,meshes,opts.camera,opts.state,theme));
    drawDetails(layers,meshes,opts.details || [],opts.state,theme);
    drawConnectors(layers.connectors,opts.scene,opts.camera,opts.spec,theme);
    if(opts.annotations) {
      const labels=opts.annotations.cloneNode(true);labels.removeAttribute('style');
      labels.setAttribute('width',width);labels.setAttribute('height',height);labels.setAttribute('viewBox',`0 0 ${width} ${height}`);target.appendChild(labels);
    }
    if(opts.heading) target.appendChild(heading(opts.spec,theme,width));
    width=saved[0];height=saved[1];
    return target;
  }

  function heading(spec,theme,w) {
    const group=el('g',{'class':'sd-vector-heading',fill:theme.headingText,'font-family':theme.font});
    const inset=theme.border?26:12;
    group.appendChild(el('rect',{x:inset,y:inset,width:Math.max(1,w-inset*2),height:54,fill:theme.paper}));
    group.appendChild(el('text',{x:inset+6,y:inset+20,'font-size':15,'font-weight':theme.mode==='illustration'?600:400},spec.scene.title || spec.scene.id));
    group.appendChild(el('text',{x:inset+6,y:inset+39,'font-size':10,'letter-spacing':1},`${spec.scene.type.toUpperCase()}  /  ${spec.scene.fidelity.toUpperCase()} FIDELITY`));
    return group;
  }

  function serializeElement(element) {
    const copy=element.cloneNode(true);copy.removeAttribute('style');copy.removeAttribute('class');copy.removeAttribute('role');
    return '<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(copy);
  }

  return {svg,update,renderDrawing,serializeElement,el,dispose(){svg.remove();}};
}
