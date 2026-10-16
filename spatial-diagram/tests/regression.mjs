import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../kit/vendor/three.min.js';
import {SCENE_SCHEMA} from '../kit/engine/schema-data.js';
import {aabbOverlapVolume,auditScene,validateSceneSpec,rotatePoint,geometryAABB,normalizeSpec} from '../kit/engine/spec-math.js';
import {createGeometrySystem} from '../kit/engine/geometry.js';
import {createAssemblySystem} from '../kit/engine/assembly.js';

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
  for(const mode of ['webgl','blueprint']) {
    spec.scene.renderMode=mode;spec.scene.style='studio-light';
    assert.equal(errors(spec).length,0);assert.equal(normalizeSpec(spec).scene.style,'studio-light');
  }
  spec.scene.renderMode='wire';assert.ok(errors(spec).length);
});
