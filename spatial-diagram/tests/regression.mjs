import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../kit/vendor/three.min.js';
import {SCENE_SCHEMA} from '../kit/engine/schema-data.js';
import {aabbOverlapVolume,auditScene,validateSceneSpec,rotatePoint,geometryAABB,normalizeSpec} from '../kit/engine/spec-math.js';
import {createGeometrySystem} from '../kit/engine/geometry.js';
import {createAssemblySystem} from '../kit/engine/assembly.js';
import {diffScenes,formatDiff} from '../kit/engine/scene-diff.js';
import {deriveInstructionSteps,normalizeTourSteps,lerpAngle} from '../kit/engine/tour.js';
import {validateSchema} from '../kit/engine/schema-validation.js';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const geometry=createGeometrySystem(THREE);
const box={min:[-5,-5,-5],max:[5,5,5]};
const component=(id,extra={})=>({id,label:id,geometry:{kind:'box',size:[10,10,10]},...extra});
const scene=components=>({scene:{id:'fixture',fidelity:'representative'},assemblies:[{id:'assembly',components}]});
const errors=spec=>validateSceneSpec(spec).filter(i=>i.level==='error');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-4,`${a} != ${b}`);

test('coincident, partial, touching and disjoint overlaps are symmetric',()=>{
  assert.equal(aabbOverlapVolume(box,box),1000);
  for(const [shift,expected] of [[3,700],[10,0],[11,0]]) {
    const other={min:[-5,-5,-5+shift],max:[5,5,5+shift]};
    assert.equal(aabbOverlapVolume(box,other),expected);assert.equal(aabbOverlapVolume(other,box),expected);
  }
});
test('audit catches intersecting siblings and accepts documented contact',()=>{
  const spec=scene([component('a'),component('b')]);
  assert.ok(auditScene(spec).some(i=>i.code==='audit:intersecting'));
  spec.assemblies[0].components[1].transform={position:[0,10,0]};
  assert.equal(auditScene(spec).filter(i=>i.level==='warning').length,0);
});
test('schema embedded in the runtime exactly matches source',()=>{
  assert.deepEqual(SCENE_SCHEMA,JSON.parse(readFileSync(new URL('../schemas/scene.schema.json',import.meta.url))));
});
test('malformed input returns validation errors without crashing',()=>{
  for(const value of [null,[],{assemblies:'invalid'},scene([null]),scene([component('a',{transform:{position:[1,2]}})])]) assert.ok(errors(value).length);
});
test('unknown fields, kinds, unsupported imports and behaviors are rejected',()=>{
  assert.ok(errors({...scene([component('a')]),typo:true}).length);
  for(const kind of ['typo','import']) assert.ok(errors(scene([component('a',{geometry:{kind,url:'a.glb'}})])).length);
  assert.ok(errors({...scene([component('a')]),behaviors:[{type:'rotate',component:'a'}]}).length);
  assert.throws(()=>geometry.buildGeometry({kind:'import',url:'a.glb'}),/not supported/);
});
test('named-anchor typos do not silently become centroids',()=>{
  const spec=scene([component('a')]);spec.annotations=[{id:'label',type:'label',text:'A',target:{anchor:'a.missing'}}];
  assert.ok(errors(spec).some(i=>i.code==='annotation:anchor'));
  spec.annotations[0].target.anchor='a';assert.equal(errors(spec).length,0);
});
test('dimensions and nested geometry parameters are validated',()=>{
  for(const def of [{kind:'chamferBox',size:[-1,2,3]},{kind:'fan',params:{size:-1}},{kind:'board',params:{width:'wide'}},{kind:'sphere',radius:0},{kind:'fan',params:{blades:2.5}},{kind:'fan',params:{size:[60,60,60]}},{kind:'fan',params:{hubRatio:'invalid'}},{kind:'fan',params:{frameT:50}}]) assert.ok(errors(scene([component('a',{geometry:def})])).length);
  assert.ok(errors(scene([component('a',{geometry:{kind:'compound',parts:[{geometry:{kind:'box',size:[0,2,3]}}]}})])).length);
});
test('2D annotation offsets are valid alongside legacy 3D offsets',()=>{
  for(const offset of [[20,-10],[20,-10,0]]) assert.equal(errors({...scene([component('a')]),annotations:[{id:'a-label',type:'label',text:'A',target:{anchor:'a'},offset}]}).length,0);
});
test('pure Euler math agrees with Three for simultaneous XYZ rotations',()=>{
  const input=[3,5,7],rotation=[31,53,-28];const expected=new THREE.Vector3(...input).applyEuler(new THREE.Euler(...rotation.map(n=>n*Math.PI/180)));
  rotatePoint(input,rotation).forEach((v,i)=>near(v,expected.getComponent(i)));
});
test('compound transform position, degrees and scale reach the rendered vertices',()=>{
  const def={kind:'compound',parts:[{geometry:{kind:'box',size:[2,4,6]},transform:{position:[20,30,40],rotation:[0,90,0],scale:[2,2,2]}}]};
  const built=geometry.buildGeometry(def);built.parts[0].geometry.computeBoundingBox();
  const bounds=built.parts[0].geometry.boundingBox;[14,26,38].forEach((v,i)=>near(v,bounds.min.getComponent(i)));[26,34,42].forEach((v,i)=>near(v,bounds.max.getComponent(i)));
});
test('nested compound preserves nonuniform scale and matrix multiplication',()=>{
  const outer={position:[12,8,-4],rotation:[23,41,18],scale:[2,1,3]},inner={position:[4,-2,3],rotation:[11,52,-8],scale:[1,2,1]};
  const def={kind:'compound',parts:[{transform:outer,geometry:{kind:'compound',parts:[{transform:inner,geometry:{kind:'box',size:[2,4,6]}}]}}]};
  const built=geometry.buildGeometry(def),actual=built.parts[0].geometry.attributes.position;
  const matrix=tf=>new THREE.Matrix4().compose(new THREE.Vector3(...tf.position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...tf.rotation.map(n=>n*Math.PI/180))),new THREE.Vector3(...tf.scale));
  const expectedGeometry=new THREE.BoxGeometry(2,4,6).applyMatrix4(matrix(outer).multiply(matrix(inner)));
  for(let i=0;i<actual.count;i++) for(let j=0;j<3;j++) near(actual.array[i*3+j],expectedGeometry.attributes.position.array[i*3+j]);
});
test('thin rounded/chamfered plates preserve nominal dimensions and centers',()=>{
  for(const kind of ['chamferBox','roundedBox']) {
    const g=geometry.buildGeometry({kind,size:[20,.5,12],radius:3}).geometry;g.computeBoundingBox();
    const size=g.boundingBox.getSize(new THREE.Vector3()),center=g.boundingBox.getCenter(new THREE.Vector3());
    [20,.5,12].forEach((v,i)=>near(size.getComponent(i),v));center.toArray().forEach(v=>near(v,0));
  }
});
test('mirrored compound surfaces preserve outward front-face winding',()=>{
  const g=geometry.buildGeometry({kind:'compound',parts:[{geometry:{kind:'box',size:[2,4,6]},transform:{scale:[-1,1,1]}}]}).parts[0].geometry;
  const [a,b,c]=[0,1,2].map(i=>new THREE.Vector3().fromBufferAttribute(g.attributes.position,g.index.getX(i)));
  const normal=new THREE.Vector3().fromBufferAttribute(g.attributes.normal,g.index.getX(0));
  assert.ok(b.sub(a).cross(c.sub(a)).normalize().dot(normal)>.99);
});
test('recipe bounds use rendered thickness, offsets and internal parts',()=>{
  const board=geometry.partBounds({kind:'board',params:{width:120,depth:95,thickness:2}})[0];near(board.min[1],-1);near(board.max[1],1);
  const pure=geometryAABB({kind:'board',params:{width:120,depth:95,thickness:2}});assert.equal(pure.max[1],1);
  const parts=geometry.partBounds({kind:'chip-package',params:{width:40,depth:40,substrateH:1.4,dieH:1.2,lidH:1.6}});
  near(Math.min(...parts.map(p=>p.min[1])),-.7);assert.ok(Math.max(...parts.map(p=>p.max[1]))<5);
  for(const kind of Object.keys(geometry.RECIPES)) assert.ok(geometry.partBounds({kind}).every(b=>b.min.concat(b.max).every(Number.isFinite)),kind);
});
test('rendered-part audits avoid treating open rack interiors as solid boxes',()=>{
  const spec=scene([component('rack',{geometry:{kind:'rack',params:{width:100,depth:100,height:100,postW:4,sidePanels:false}}}),component('inside',{geometry:{kind:'box',size:[10,10,10]},transform:{position:[0,50,0]}})]);
  assert.equal(auditScene(spec,{partBounds:geometry.partBounds}).filter(i=>i.code==='audit:intersecting').length,0);
});
test('component reconciliation preserves unchanged groups and geometry',()=>{
  const assemblies=createAssemblySystem(THREE),spec=scene([component('a'),component('b')]);
  const build=def=>[{geometry:geometry.buildGeometry(def).geometry,material:new THREE.MeshStandardMaterial()}];
  const original=assemblies.buildHierarchy(spec,build),node=original.componentNodes.get('a'),mesh=node.children[0];
  const next=structuredClone(spec);next.assemblies[0].components[0].transform={position:[10,20,30]};
  const revised=assemblies.buildHierarchy(next,build,original);
  assert.equal(revised.componentNodes.get('a'),node);assert.equal(node.children[0],mesh);assert.deepEqual(node.position.toArray(),[10,20,30]);
  assert.equal(assemblies.componentAnchorWorld(revised,'a','missing'),null);
});
test('GPU package layers remain ordered throughout the authored stagger',()=>{
  const spec=JSON.parse(readFileSync(new URL('../examples/gpu-exploded/scene.json',import.meta.url)));
  const assemblies=createAssemblySystem(THREE);
  const build=(def)=>{const built=geometry.buildGeometry(def);return (built.kind==='single'?[{geometry:built.geometry}]:built.parts).map(p=>({...p,material:new THREE.MeshStandardMaterial()}));};
  const h=assemblies.buildHierarchy(spec,build);
  for(let step=0;step<=100;step++) {
    assemblies.applyExplode(h,step/100,{stagger:true});
    const bounds=id=>new THREE.Box3().setFromObject(h.componentNodes.get(id));
    for(const [below,above] of [['substrate','interposer'],['interposer','gpu'],['gpu','thermal-pad'],['thermal-pad','vapor-chamber']]) assert.ok(bounds(below).max.y<=bounds(above).min.y+1e-4,`${below} crossed ${above} at ${step}%`);
  }
});
test('unexplained collisions stay warnings; exceptions require exact IDs and reasons',()=>{
  const spec=scene([component('a'),component('b')]);
  spec.metadata={auditExceptions:[{code:'audit:intersecting',components:['a','b'],reason:'Intentional fixture overlap'}]};
  assert.ok(auditScene(spec).some(i=>i.code==='audit:acknowledged'));
  spec.metadata.auditExceptions[0].reason='';assert.ok(errors(spec).some(i=>i.code==='audit:exception'));
  spec.metadata.auditExceptions='invalid';assert.ok(errors(spec).some(i=>i.code==='audit:exception'));
});


test('render modes validate and default without conflating the WebGL palette',()=>{
  const spec=scene([component('part')]);
  assert.equal(normalizeSpec(spec).scene.renderMode,'webgl');
  for(const mode of ['webgl','blueprint','illustration']) {
    spec.scene.renderMode=mode;spec.scene.style='studio-light';
    assert.equal(errors(spec).length,0);assert.equal(normalizeSpec(spec).scene.style,'studio-light');
  }
  spec.scene.renderMode='wire';assert.ok(errors(spec).length);
});

const example=name=>JSON.parse(readFileSync(new URL(`../examples/${name}/scene.json`,import.meta.url)));
test('publication, explode and annotation options validate; typos are rejected',()=>{
  const spec=scene([component('a',{anchors:{top:[0,5,0]}})]);
  spec.scene={...spec.scene,renderMode:'illustration',annotationStyle:'balloon',labelLayout:'margins',drawing:{hiddenLines:true,lineWeight:1.4,sectionCaps:true,triad:false},illustration:{spotColor:'#D55E00',shading:'flat',palette:'mono'},camera:{followExplode:false}};
  spec.interactions={explode:{stops:[0,.5,1],traces:false,peek:true,collapseHidden:true,local:true},measure:true,tree:false};
  spec.annotations=[{id:'l',type:'label',text:'A',target:{anchor:'a.top'},style:'balloon',item:3,visibleWhen:{explodeMin:.2,renderModes:['illustration']}}];
  spec.partsList={position:'bottom',columns:['item','description','partNumber']};
  spec.detailViews=[{id:'d',label:'A',target:{anchor:'a.top'},magnification:4,placement:'right'}];
  assert.deepEqual(errors(spec),[]);
  for(const bad of [s=>s.scene.labelLayout='grid',s=>s.scene.drawing.lineWeight=0,s=>s.scene.illustration.shading='gouraud',s=>s.interactions.explode.stops=[1.5],
    s=>s.annotations[0].style='bubble',s=>s.annotations[0].item=0,s=>s.partsList.columns=['price'],s=>s.detailViews[0].magnification=1,s=>s.detailViews[0].typo=true]) {
    const copy=JSON.parse(JSON.stringify(spec));bad(copy);assert.ok(errors(copy).length,JSON.stringify(copy).slice(0,80));
  }
});
test('detail views and tour steps must reference real anchors and components',()=>{
  const spec=scene([component('a'),component('b')]);
  spec.detailViews=[{id:'d',target:{anchor:'a.missing'}}];
  assert.ok(errors(spec).some(i=>i.code==='detail:anchor'));
  spec.detailViews=[{id:'d',target:{anchor:'a'}}];
  spec.tour={steps:[{id:'one',highlight:['a','ghost'],camera:{focus:'b'},select:null,explode:{assembly:.5}},{id:'two',camera:'auto',section:{axis:'x',position:.3},modes:{section:true}}]};
  assert.deepEqual(errors(spec).map(i=>i.code),['tour:component']);
  spec.tour.steps[0].highlight=['a'];assert.equal(errors(spec).length,0);
  spec.tour.steps[0].explode={nope:1};assert.ok(errors(spec).some(i=>i.code==='tour:assembly'));
  spec.tour.steps[0].explode=.5;spec.tour.steps[0].camera={focus:'zzz'};assert.ok(errors(spec).some(i=>i.code==='tour:component'));
});
test('schema evaluator accepts union types including null',()=>{
  assert.deepEqual(validateSchema({type:['string','null']},null),[]);
  assert.deepEqual(validateSchema({type:['string','null']},'x'),[]);
  assert.equal(validateSchema({type:['string','null']},3).length,1);
});
test('scene diff reports added, removed, moved and changed parts by id',()=>{
  const before=scene([component('a'),component('b',{transform:{position:[0,10,0]}}),component('c')]);
  const after=scene([component('a',{material:'copper'}),component('b',{transform:{position:[3,14,0]}}),component('d')]);
  after.annotations=[{id:'n',type:'note',text:'new',target:{anchor:'a'}}];
  const diff=diffScenes(before,after);
  assert.deepEqual(diff.components.added.map(c=>c.id),['d']);
  assert.deepEqual(diff.components.removed.map(c=>c.id),['c']);
  assert.deepEqual(diff.components.moved.map(c=>[c.id,c.distance]),[['b',5]]);
  assert.deepEqual(diff.components.changed,[{id:'a',label:'a',fields:['material']}]);
  assert.deepEqual(diff.annotations.added,['n']);
  assert.equal(diffScenes(before,before).summary.total,0);
  assert.match(formatDiff(diff),/1 added, 1 removed, 1 moved, 1 changed/);
});
test('assembly instructions start from the base and install outer parts last',()=>{
  const spec=example('gpu-exploded'),assemblies=createAssemblySystem(THREE);
  const build=def=>{const built=geometry.buildGeometry(def);return (built.kind==='single'?[{geometry:built.geometry}]:built.parts).map(p=>({...p,material:new THREE.MeshStandardMaterial()}));};
  const h=assemblies.buildHierarchy(normalizeSpec(spec),build),steps=deriveInstructionSteps(h.componentData);
  const index=id=>steps.findIndex(step=>step.adds.includes(id));
  assert.deepEqual(steps[0].adds,['pcb']);
  assert.ok(index('substrate')<index('gpu') && index('gpu')<index('vapor-chamber') && index('vapor-chamber')<index('fan-left') && index('fan-left')<index('screw-1'));
  assert.equal(new Set(steps.flatMap(s=>s.adds)).size,h.componentData.size);
  for(const step of steps) assert.ok(step.placed.every(id=>steps.slice(0,step.index).some(s=>s.adds.includes(id))));
});
test('local explode moves a semantic subtree and leaves the rest assembled',()=>{
  const spec=normalizeSpec(example('gpu-exploded')),assemblies=createAssemblySystem(THREE);
  const build=def=>{const built=geometry.buildGeometry(def);return (built.kind==='single'?[{geometry:built.geometry}]:built.parts).map(p=>({...p,material:new THREE.MeshStandardMaterial()}));};
  const h=assemblies.buildHierarchy(spec,build),members=assemblies.descendantsOf(h,'vapor-chamber');
  assert.ok(members.has('fin-stack-left') && members.has('fan-right') && !members.has('vapor-chamber') && !members.has('pcb'));
  assemblies.applyExplode(h,1,{stagger:false,componentIds:members});
  assert.equal(h.componentNodes.get('pcb').position.y,0);near(h.componentNodes.get('gpu').position.y,4);
  assert.ok(h.componentNodes.get('fan-left').position.y>150);
  assemblies.setPeekOffsets(h,new Map([['pcb',[0,5,0]]]));near(h.componentNodes.get('pcb').position.y,5);
  assemblies.setPeekOffsets(h,new Map());near(h.componentNodes.get('pcb').position.y,0);
});
test('tour steps normalize with defaults and angles take the short way round',()=>{
  const steps=normalizeTourSteps({steps:[{title:'A'},{id:'b',camera:{azimuth:10},explode:.5,section:{axis:'x'}}]});
  assert.deepEqual(steps.map(s=>[s.id,s.camera,s.duration]),[['step-1','auto',1100],['b',{azimuth:10},1100]]);
  assert.deepEqual(steps[1].section,{axis:'x'});
  near(lerpAngle(350,10,.5),360);near(lerpAngle(10,350,.5),0);
});
test('shipped examples, tours and scaffolds validate strictly',()=>{
  for(const name of ['gpu-exploded','mechanical-pump','data-center-rack','recipe-gallery','track-car-exploded']) {
    const spec=example(name);assert.deepEqual(errors(spec),[],name);
    assert.equal(auditScene(spec,{partBounds:geometry.partBounds}).filter(i=>i.level==='warning').length,0,name);
  }
  const dir=mkdtempSync(join(tmpdir(),'scaffold-'));
  for(const type of ['exploded-view','technical-assembly','systems-topology','cutaway']) {
    const file=join(dir,type,'scene.json');
    execFileSync(process.execPath,[fileURLToPathSafe('../scripts/new-scene.mjs'),'demo-'+type.replace(/[^a-z]/g,''),'--type',type,'-o',file]);
    const spec=JSON.parse(readFileSync(file));assert.deepEqual(errors(spec),[],type);
    assert.equal(auditScene(spec,{partBounds:geometry.partBounds}).filter(i=>i.level==='warning').length,0,type);
  }
});
test('scene-diff CLI exit codes: 0 identical, 1 different, 2 invalid',()=>{
  const dir=mkdtempSync(join(tmpdir(),'diff-')),a=join(dir,'a.json'),b=join(dir,'b.json'),bad=join(dir,'bad.json');
  const spec=scene([component('a')]);writeFileSync(a,JSON.stringify(spec));
  spec.assemblies[0].components.push(component('b',{transform:{position:[0,20,0]}}));writeFileSync(b,JSON.stringify(spec));writeFileSync(bad,'{"scene":{}}');
  const run=(...args)=>spawnSync(process.execPath,[fileURLToPathSafe('../scripts/scene-diff.mjs'),...args],{encoding:'utf8'});
  assert.equal(run(a,a).status,0);
  const changed=run(a,b,'--json');assert.equal(changed.status,1);assert.deepEqual(JSON.parse(changed.stdout).components.added.map(c=>c.id),['b']);
  assert.equal(run(a,bad).status,2);
});
function fileURLToPathSafe(relative) {return new URL(relative,import.meta.url).pathname;}

function openEdges(geo) {
  const pos=geo.getAttribute('position'),idx=geo.index,key=i=>[pos.getX(i),pos.getY(i),pos.getZ(i)].map(v=>Math.round(v*1e3)).join(',');
  const edges=new Map(),n=idx?idx.count:pos.count;
  for(let i=0;i+2<n;i+=3) {
    const ids=[0,1,2].map(j=>key(idx?idx.getX(i+j):i+j));
    if(new Set(ids).size<3) continue;
    for(let j=0;j<3;j++) {const a=ids[j],b=ids[(j+1)%3],k=a<b?a+'|'+b:b+'|'+a;edges.set(k,(edges.get(k)||0)+1);}
  }
  return [...edges.values()].filter(c=>c===1).length;
}
const sections=[{z:0,width:400,top:300,bottom:0},{z:500,width:600,top:400,bottom:0},{z:900,width:300,top:250,bottom:50}];
test('lofts build closed solids and closed shell panels with patch bounds',()=>{
  for(const def of [{kind:'loft',sections},{kind:'loft',sections,thickness:10},{kind:'loft',sections,arc:[30,150],thickness:6},{kind:'loft',sections,arc:[121,419],thickness:20}]) {
    const built=geometry.buildGeometry(def);
    assert.equal(openEdges(built.geometry),0,JSON.stringify(def.arc || def.thickness || 'solid'));
    assert.ok(geometry.partBounds(def).length>1,'patch bounds');
  }
  const solid=geometry.partBounds({kind:'loft',sections});
  const all=solid.reduce((b,p)=>({min:b.min.map((v,i)=>Math.min(v,p.min[i])),max:b.max.map((v,i)=>Math.max(v,p.max[i]))}));
  near(all.min[2],0);near(all.max[2],900);near(all.max[1],400);near(all.max[0],300);
});
test('panels sliced from one loft share their seam and patches exclude the hollow interior',()=>{
  const outer=(arc)=>{const g=geometry.buildGeometry({kind:'loft',sections,arc,thickness:5,segments:12,subdivisions:1}).geometry,pos=g.getAttribute('position');return new Set(Array.from({length:pos.count},(_,i)=>[pos.getX(i),pos.getY(i),pos.getZ(i)].map(v=>v.toFixed(3)).join(',')));};
  const a=outer([0,90]),b=outer([90,180]);
  assert.ok([...a].filter(p=>b.has(p)).length>=sections.length*2,'seam vertices coincide');
  // A box inside a hollow shell overlaps no shell patch heavily.
  const shell=geometry.partBounds({kind:'loft',sections,arc:[0,360],thickness:8});
  const inner={min:[-60,120,300],max:[60,220,600]};
  assert.ok(shell.every(box=>aabbOverlapVolume(box,inner)/((120*100*300))<.05));
});
test('vehicle recipes build finite closed parts with documented axes',()=>{
  const kinds=['wheel','brake-assembly','coilover','control-arm','steering-rack','bucket-seat','steering-wheel','roll-cage','airfoil-wing','flat-engine','intake-plenum','transaxle','radiator','headlamp','exhaust'];
  for(const kind of kinds) {
    assert.ok(geometry.RECIPES[kind],kind);
    const boxes=geometry.partBounds({kind});
    assert.ok(boxes.length && boxes.every(b=>b.min.concat(b.max).every(Number.isFinite)),kind);
    const built=geometry.buildGeometry({kind});
    const closedPart=built.parts.some(p=>openEdges(p.geometry)===0);
    assert.ok(closedPart,kind);
  }
  const wheel=geometry.partBounds({kind:'wheel',params:{radius:300,width:200}}),top=Math.max(...wheel.map(b=>b.max[1]));
  assert.ok(top>100 && top<130,'wheel outer face toward +Y with a proud centre-lock nut');
  const wing=geometry.partBounds({kind:'airfoil-wing',params:{span:1000,chord:200,endplates:false,mounts:false}});
  near(Math.max(...wing.map(b=>b.max[0])),500);
});
test('loft and vehicle parameters are validated',()=>{
  const bad=[{kind:'loft',sections:[{z:0,width:10,top:5,bottom:0}]},{kind:'loft',sections:[{z:0,width:10,top:0,bottom:5},{z:10,width:10,top:5,bottom:0}]},
    {kind:'loft',sections,arc:[120,30]},{kind:'loft',sections,thickness:-1},{kind:'control-arm',params:{shape:'triangle'}},{kind:'wheel',params:{spokes:0}},{kind:'brake-assembly',params:{holes:-2}}];
  for(const def of bad) assert.ok(errors(scene([component('a',{geometry:def})])).length,JSON.stringify(def).slice(0,60));
  assert.deepEqual(errors(scene([component('a',{geometry:{kind:'loft',sections,arc:[0,90],thickness:4}})])),[]);
});
