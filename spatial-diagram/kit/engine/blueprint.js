// True vector axonometric drawing from the SAME transformed meshes as WebGL.
// Painter-sorted front faces hide rear edges. This is an illustration renderer,
// not a CAD B-rep/boolean hidden-line solver (intersecting faces can be ambiguous).
let blueprintInstance=0;
export function createBlueprintSystem(THREE,container) {
  const ns='http://www.w3.org/2000/svg',uid=`sd-bp-${++blueprintInstance}`;
  const svg=document.createElementNS(ns,'svg');
  svg.setAttribute('class','sd-blueprint-drawing');svg.setAttribute('role','img');
  svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;display:none;';
  container.appendChild(svg);
  const topologyCache=new WeakMap();let signature='',sheetSize='',width=0,height=0;
  let geometryLayer,connectorLayer;
  const n=value=>Number(value.toFixed(2));
  function el(tag,attrs={},text) {
    const node=document.createElementNS(ns,tag);
    for(const [key,value] of Object.entries(attrs)) node.setAttribute(key,String(value));
    if(text!==undefined) node.textContent=text;
    return node;
  }
  function sheet(w,h,spec) {
    width=w;height=h;svg.replaceChildren();
    svg.setAttribute('xmlns',ns);svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
    svg.setAttribute('width',w);svg.setAttribute('height',h);
    svg.setAttribute('aria-label',`${spec.scene.title || spec.scene.id} — isometric blueprint`);
    svg.appendChild(el('title',{},`${spec.scene.title || spec.scene.id} — architectural blueprint`));
    svg.appendChild(el('desc',{},`Orthographic isometric illustration, ${spec.scene.fidelity} fidelity. Drawing not to scale. Geometry, outlines, connectors and labels are vectors.`));
    const defs=el('defs');
    const grid=el('pattern',{id:uid+'-grid',width:24,height:24,patternUnits:'userSpaceOnUse'});
    grid.appendChild(el('path',{d:'M24 0H0V24',fill:'none',stroke:'#224764','stroke-width':.45}));defs.appendChild(grid);
    const major=el('pattern',{id:uid+'-major',width:120,height:120,patternUnits:'userSpaceOnUse'});
    major.appendChild(el('rect',{width:120,height:120,fill:`url(#${uid}-grid)`}));
    major.appendChild(el('path',{d:'M120 0H0V120',fill:'none',stroke:'#315e7b','stroke-width':.65}));defs.appendChild(major);
    const clip=el('clipPath',{id:uid+'-clip'});clip.appendChild(el('rect',{x:18,y:18,width:Math.max(1,w-36),height:Math.max(1,h-36)}));defs.appendChild(clip);svg.appendChild(defs);
    svg.appendChild(el('rect',{width:w,height:h,fill:'#0b2947'}));
    svg.appendChild(el('rect',{width:w,height:h,fill:`url(#${uid}-major)`}));
    svg.appendChild(el('rect',{x:18,y:18,width:Math.max(1,w-36),height:Math.max(1,h-36),fill:'none',stroke:'#719bb4','stroke-width':.8}));
    geometryLayer=el('g',{'class':'sd-blueprint-geometry','clip-path':`url(#${uid}-clip)`,'stroke-linejoin':'round','stroke-linecap':'round'});svg.appendChild(geometryLayer);
    connectorLayer=el('g',{'class':'sd-blueprint-connectors','clip-path':`url(#${uid}-clip)`});svg.appendChild(connectorLayer);
    const frame=el('g',{'class':'sd-blueprint-sheet',fill:'#b9d9e9','font-family':'monospace','font-size':9,'letter-spacing':1});
    frame.appendChild(el('text',{x:30,y:h-29},`ISOMETRIC 30° / 30°  ·  ${spec.scene.units}  ·  NOT TO SCALE`));
    if(w>750) frame.appendChild(el('text',{x:w-30,y:h-29,'text-anchor':'end'},`${spec.scene.id.toUpperCase()}  /  ${spec.scene.fidelity.toUpperCase()}`));
    // Equal-length world axes: x and z sit at 30°, vertical y completes the triad.
    const triad=el('g',{transform:`translate(${w-70} 106)`,stroke:'#97c9e3','stroke-width':1.1});
    triad.appendChild(el('path',{d:'M0 0L26 15M0 0L-26 15M0 0V-30',fill:'none'}));
    for(const [text,x,y] of [['X',30,21],['Z',-37,21],['Y',-3,-37]])triad.appendChild(el('text',{x,y,stroke:'none'},text));
    frame.appendChild(triad);svg.appendChild(frame);
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

  function drawGeometry(meshes,camera,state) {
    const triangles=[],forward=camera.getWorldDirection(new THREE.Vector3());
    for(const mesh of meshes) {
      const material=materialOf(mesh);if(!material || material.opacity<.01)continue;
      const model=topology(mesh.geometry),world=model.vertices.map(v=>v.clone().applyMatrix4(mesh.matrixWorld));
      const normalMatrix=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
      const fronts=model.faces.map(f=>f.normal.clone().applyMatrix3(normalMatrix).normalize().dot(forward)<-1e-8);
      const planes=material.clippingPlanes || [];
      let parent=mesh;while(parent&&!parent.userData.componentId)parent=parent.parent;
      const id=parent?.userData.componentId || '',selected=state.selected===id,hovered=state.hovered===id;
      for(let i=0;i<model.faces.length;i++) {
        const face=model.faces[i];if(!fronts[i])continue;
        const points=clipPolygon(face.ids.map(index=>world[index]),planes);if(points.length<3)continue;
        const normal=face.normal.clone().applyMatrix3(normalMatrix).normalize();
        const fill=normal.y>.55?'#163d5c':Math.abs(normal.x)>.55?'#10314e':'#0d2c48';
        const edges=[];
        for(const edge of face.edges)if(edge.feature || edge.faces.some(j=>!fronts[j])) {
          const pair=clipEdge(world[edge.a],world[edge.b],planes);if(pair)edges.push(line(pair,camera));
        }
        // The newly cut rim is an honest, uncapped clipping boundary.
        for(let j=0;j<points.length;j++)if(planes.some(p=>Math.abs(p.distanceToPoint(points[j]))<1e-6 && Math.abs(p.distanceToPoint(points[(j+1)%points.length]))<1e-6))edges.push(line([points[j],points[(j+1)%points.length]],camera));
        triangles.push({id,depth:points.reduce((sum,v)=>sum+v.clone().project(camera).z,0)/points.length,
          face:line(points,camera,true),edges:edges.join(''),fill,opacity:material.opacity,stroke:selected?'#65e7ff':hovered?'#b0f2ff':'#b5d6e7',weight:selected?1.45:.85});
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
      group.appendChild(el('path',{'class':'sd-blueprint-face',d:batch.face,fill:batch.fill,stroke:batch.fill,'stroke-width':.35}));
      if(batch.edges)group.appendChild(el('path',{'class':'sd-blueprint-edge',d:batch.edges,fill:'none',stroke:batch.stroke,'stroke-width':batch.weight}));
      fragment.appendChild(group);
    }
    for(const triangle of triangles) {
      if(batch && ['id','fill','opacity','stroke','weight'].every(key=>batch[key]===triangle[key])) {batch.face+=triangle.face;batch.edges+=triangle.edges;}
      else {flush();batch={...triangle};}
    }
    flush();geometryLayer.replaceChildren(fragment);
    svg.dataset.faceCount=String(triangles.length);
  }

  function drawConnectors(scene,camera,spec) {
    const fragment=document.createDocumentFragment(),group=scene.getObjectByName('sd-connectors');
    if(group?.visible)for(const object of group.children) {
      if(!object.visible)continue;
      const material=materialOf(object),planes=material?.clippingPlanes || [];
      if(object.userData.connectorId && object.userData.curve) {
        const points=object.userData.curve.getPoints(48),segments=[];
        for(let i=1;i<points.length;i++){const pair=clipEdge(points[i-1],points[i],planes);if(pair)segments.push(line(pair,camera));}
        fragment.appendChild(el('path',{'data-connector-id':object.userData.connectorId,d:segments.join(''),fill:'none',stroke:'#70d7f2','stroke-width':1.4}));
        const definition=spec.connectors.find(c=>c.id===object.userData.connectorId),end=object.userData.curve.getPoint(1);
        if(definition?.geometry?.kind==='arrow' && !planes.some(p=>p.distanceToPoint(end)<0)) {
          const tip=project(end,camera),previous=project(object.userData.curve.getPoint(.97),camera),dx=tip[0]-previous[0],dy=tip[1]-previous[1],length=Math.hypot(dx,dy);
          if(length>1e-5) {
            const ux=dx/length,uy=dy/length;
            const points=[[tip[0],tip[1]],[tip[0]-ux*10-uy*4,tip[1]-uy*10+ux*4],[tip[0]-ux*10+uy*4,tip[1]-uy*10-ux*4]];
            fragment.appendChild(el('polygon',{'class':'sd-blueprint-arrow','data-connector-id':object.userData.connectorId,points:points.map(p=>p.map(n).join(',')).join(' '),fill:'#70d7f2'}));
          }
        }
      } else if(object.userData.t!==undefined) {
        if(planes.some(p=>p.distanceToPoint(object.position)<0))continue;
        const point=project(object.position,camera);fragment.appendChild(el('circle',{'class':'sd-blueprint-pulse',cx:point[0],cy:point[1],r:2.1,fill:'#d6f7ff'}));
      }
    }
    connectorLayer.replaceChildren(fragment);
  }
  function update(hierarchy,scene,camera,spec,state) {
    const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;
    const size=JSON.stringify([w,h,spec.scene.id,spec.scene.title,spec.scene.units,spec.scene.fidelity]);
    if(size!==sheetSize) {sheet(w,h,spec);sheetSize=size;signature='';}
    hierarchy.root.updateWorldMatrix(true,true);camera.updateMatrixWorld();
    const meshes=[];hierarchy.root.traverse(node=>{if(node.isMesh && visible(node))meshes.push(node);});
    const stamp=JSON.stringify([camera.matrixWorld.elements,camera.projectionMatrix.elements,state.selected,state.hovered,meshes.map(mesh=>{
      const mat=materialOf(mesh);return [mesh.uuid,mesh.geometry.uuid,mesh.matrixWorld.elements,mat?.opacity,mat?.clippingPlanes?.map(p=>[...p.normal.toArray(),p.constant])];
    })]);
    if(stamp!==signature){drawGeometry(meshes,camera,state);signature=stamp;}
    drawConnectors(scene,camera,spec);
    svg.dataset.projection='orthographic';svg.dataset.azimuth='45';svg.dataset.elevation='35.264389682754654';
  }
  function serialize(spec,annotations) {
    const copy=svg.cloneNode(true);copy.removeAttribute('style');copy.removeAttribute('class');copy.removeAttribute('role');
    if(annotations) {
      const labels=annotations.cloneNode(true);labels.removeAttribute('style');
      labels.setAttribute('width',width);labels.setAttribute('height',height);labels.setAttribute('viewBox',`0 0 ${width} ${height}`);copy.appendChild(labels);
    }
    const heading=el('g',{fill:'#d5eaf5','font-family':'monospace'});
    heading.appendChild(el('rect',{x:26,y:26,width:Math.max(1,width-52),height:54,fill:'#0b2947'}));
    heading.appendChild(el('text',{x:32,y:46,'font-size':15},spec.scene.title || spec.scene.id));
    heading.appendChild(el('text',{x:32,y:65,'font-size':10,'letter-spacing':1},`${spec.scene.type.toUpperCase()}  /  ${spec.scene.fidelity.toUpperCase()} FIDELITY`));copy.appendChild(heading);
    return '<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(copy);
  }
  return {svg,update,serialize,dispose(){svg.remove();}};
}
