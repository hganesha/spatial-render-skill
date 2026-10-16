// Public runtime. Scene edits reconcile semantic components without replacing the WebGL stage.
import { normalizeSpec, validateSceneSpec, auditScene } from './spec-math.js';
import { createMaterialSystem, MATERIAL_PRESETS, resolveMaterialDef } from './materials.js';
import { createGeometrySystem } from './geometry.js';
import { createAssemblySystem } from './assembly.js';
import { createAnnotationSystem } from './annotations.js';
import { createInteractionSystem } from './interactions.js';
import { createRendererSystem } from './renderer.js';
import { createBlueprintSystem, vectorTheme } from './blueprint.js';
import { createSectionCapSystem } from './section-caps.js';
import { createVisualAuditSystem } from './visual-audit.js';
import { diffScenes } from './scene-diff.js';
import { deriveInstructionSteps, normalizeTourSteps, lerpNumber, lerpAngle } from './tour.js';
import { createUISystem } from './ui.js';

export const ENGINE_VERSION = '1.3.0';
export const RENDER_MODES = ['webgl','blueprint','illustration'];
const ISO_ELEVATION=35.264389682754654;
export const VIEW_PRESETS={front:{azimuth:0,elevation:0},back:{azimuth:180,elevation:0},right:{azimuth:90,elevation:0},left:{azimuth:-90,elevation:0},top:{azimuth:0,elevation:89.9},bottom:{azimuth:0,elevation:-89.9},iso:{azimuth:45,elevation:ISO_ELEVATION}};
export const FIGURE_PRESETS={'single-column':89,'one-and-half-column':120,'double-column':183,'full-page':247};
const PEEK_FRACTION=.18,COLLAPSE_THRESHOLD=.12;

export function createEngine(options) {
  const THREE=options.THREE || globalThis.THREE, container=options.container;
  if(!THREE || !container) throw new Error('SpatialDiagram requires THREE and a container.');
  const onEvent=options.onEvent || (()=>{});
  const materials=createMaterialSystem(THREE), geometrySys=createGeometrySystem(THREE);
  const assemblySys=createAssemblySystem(THREE), annotationSys=createAnnotationSystem(THREE);
  const ix=createInteractionSystem(THREE), rend=createRendererSystem(THREE), ui=createUISystem();
  const caps=createSectionCapSystem(THREE), visualAudit=createVisualAuditSystem(THREE);
  let stage=null,hierarchy=null,compiledSpec=null,rig=null,picker=null,modes=null,chrome=null;
  let overlaySvg=null,annotationItems=[],updateAnnotations=null,clipPlane=null,unbindPointer=null;
  const blueprint=createBlueprintSystem(THREE,container,caps);
  const views={webgl:null,blueprint:null,illustration:null};
  let raf=0,lastT=0,disposed=false,poseVersion=0,frameBoxes=null,capGroup=null,capStamp='';
  const animations=new Map(),explodeStates=new Map(),annotationVisibility=new Map(),hidden=new Set(),peeks=new Map();
  let peekTarget=null,subtree=null,measurements=[],pendingMeasure=null,diffState=null,diffGroup=null;
  let traceCache={version:-1,traces:[]},subjectCache={key:'',rect:null},lastShare='',shareTick=0;
  const tourState={steps:[],index:-1,active:false,kind:'tour',saved:null};
  const reduceMotion=typeof matchMedia==='function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(getComputedStyle(container).position==='static') container.style.position='relative';
  container.style.overflow='hidden';
  if(!container.hasAttribute('tabindex')) container.tabIndex=0;
  container.style.outline='none';
  const enabled=value=>!!value && (typeof value!=='object' || value.enabled!==false);
  const isVector=mode=>mode==='blueprint' || mode==='illustration';
  const explodeConfig=()=>typeof compiledSpec.interactions.explode==='object' ? compiledSpec.interactions.explode : {};

  function buildParts(def,comp) {
    const built=geometrySys.buildGeometry(def);
    const parts=built.kind==='single' ? [{geometry:built.geometry,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}] : built.parts;
    return parts.map(part=>{
      const material=materials.buildMaterial(compiledSpec.materials,part.material || comp.material);
      if(comp.opacity!==undefined) {material.opacity*=comp.opacity;material.transparent=material.opacity<1;}
      return {...part,material};
    });
  }

  function pose() {
    if(!rig) return null;
    return {target:rig.state.targetCenter.toArray(),azimuth:rig.state.targetAzimuth*180/Math.PI,
      elevation:rig.state.targetElevation*180/Math.PI,distance:rig.state.targetDistance};
  }

  function stageKey(spec) {
    const s=spec.scene;
    return JSON.stringify([s.style,s.background,s.lighting,s.environment,s.ground,s.camera.projection]);
  }

  function loadSpec(input,opts={}) {
    if(disposed) throw new Error('This engine has been disposed.');
    const structural=validateSceneSpec(input),errors=structural.filter(i=>i.level==='error');
    if(errors.length) throw new Error('Invalid Scene Spec:\n'+errors.map(i=>i.message).join('\n'));
    const next=normalizeSpec(input),previous=compiledSpec,preserve=!!opts.preserveState;
    const savedState=preserve && modes ? {...modes.state,highlight:new Set(modes.state.highlight),diff:new Map(modes.state.diff)} : null;
    const savedPose=preserve ? pose() : null;
    const savedZoom=stage?.camera.zoom,savedFramed=!!rig?.state.userFramed;
    const modeChanged=!!previous && previous.scene.renderMode!==next.scene.renderMode;
    if(modeChanged && preserve) views[previous.scene.renderMode]={pose:savedPose,zoom:savedZoom,userFramed:savedFramed};
    if(!preserve) {views.webgl=null;views.blueprint=null;views.illustration=null;}
    const replaceStage=!stage || stageKey(previous)!==stageKey(next);
    const cameraChanged=!!previous && JSON.stringify(previous.scene.camera)!==JSON.stringify(next.scene.camera);
    if(cameraChanged) {views.webgl=null;views.blueprint=null;views.illustration=null;}
    animations.clear();peeks.clear();peekTarget=null;subtree=null;
    modes?.dispose();
    if(replaceStage) {
      unbindPointer?.();rig?.dispose();disposeCaps();assemblySys.disposeHierarchy(hierarchy);stage?.dispose();
      hierarchy=null;stage=rend.createStage(container,next);
    }
    compiledSpec=next;
    hierarchy=assemblySys.buildHierarchy(next,buildParts,hierarchy);
    if(!hierarchy.root.parent) stage.scene.add(hierarchy.root);
    if(!preserve) {explodeStates.clear();annotationVisibility.clear();hidden.clear();measurements=[];pendingMeasure=null;}
    for(const id of [...hidden]) if(!hierarchy.componentNodes.has(id)) hidden.delete(id);
    for(const id of hidden) hierarchy.componentNodes.get(id).visible=false;
    for(const id of [...explodeStates.keys()]) if(!hierarchy.assemblyNodes.has(id)) explodeStates.delete(id);
    modes=ix.createModeController(hierarchy,materials);
    if(savedState) Object.assign(modes.state,savedState);
    if(!hierarchy.componentData.has(modes.state.selected)) {
      modes.state.selected=null;modes.state.isolate=false;modes.state.ghost=false;
    }
    if(!hierarchy.componentData.has(modes.state.hovered)) modes.state.hovered=null;
    for(const id of [...modes.state.highlight]) if(!hierarchy.componentData.has(id)) modes.state.highlight.delete(id);
    if(!savedState) modes.state.traces=explodeConfig().traces!==false;
    for(const [id,state] of explodeStates) assemblySys.applyExplode(hierarchy,state.amount,{...state,assemblyId:id});
    const mode=next.scene.renderMode;
    stage.setProjection(isVector(mode)?'orthographic':next.scene.camera.projection);
    if(replaceStage) {
      const radius=hierarchy.bounds?.getSize(new THREE.Vector3()).length()/2 || 100;
      rig=ix.createOrbitRig(stage.camera,stage.renderer.domElement,{minDistance:radius*.08,maxDistance:radius*24,enabled:next.interactions.orbit});
      bindPointer();
    }
    rig.setCamera(stage.camera);rig.setRotationEnabled(mode!=='blueprint');
    rig.setEnabled(next.interactions.orbit);
    stage.renderer.domElement.style.opacity=isVector(mode)?'0':'1';
    blueprint.svg.style.display=isVector(mode)?'block':'none';
    container.classList.toggle('sd-blueprint',mode==='blueprint');
    container.classList.toggle('sd-illustration',mode==='illustration');
    container.classList.toggle('sd-light',mode==='illustration' || (mode==='webgl' && next.scene.style==='studio-light'));
    if(stage.camera.isPerspectiveCamera) {stage.camera.fov=next.scene.camera.fov;stage.camera.updateProjectionMatrix();}
    stage.resize(container.clientWidth,container.clientHeight);
    computeFrameBoxes();
    const bounds=displayBounds();
    if(bounds) {stage.fitShadowCamera(bounds);stage.setGroundY(bounds.min.y);}
    const restoredView=modeChanged && !cameraChanged ? views[mode] : null;
    if(restoredView) {rig.setPose(restoredView.pose,true);stage.camera.zoom=restoredView.zoom;stage.camera.updateProjectionMatrix();rig.state.userFramed=restoredView.userFramed;}
    else if(modeChanged && mode==='illustration' && savedPose) frameDefault(true,{azimuth:savedPose.azimuth,elevation:savedPose.elevation});
    else if(!preserve || cameraChanged || modeChanged) frameDefault(true);
    else if(replaceStage && savedPose) {rig.setPose(savedPose,true);stage.camera.zoom=savedZoom;stage.camera.updateProjectionMatrix();rig.state.userFramed=savedFramed;}
    rig.update();ensureClipRange();
    picker=ix.createPicker(stage.scene,stage.camera,stage.renderer.domElement);
    clipPlane=new THREE.Plane();
    const sectionConfig=next.interactions.section;
    const sectionChanged=previous && JSON.stringify(previous.interactions.section)!==JSON.stringify(sectionConfig);
    configureSection(!sectionChanged && savedState ? savedState.sectionAxis : sectionConfig?.axis || 'y', !sectionChanged && savedState ? savedState.sectionPosition : .5);
    if(!enabled(sectionConfig)) modes.state.section=false;
    for(const m of ['xray','isolate','ghost']) if(!next.interactions[m]) modes.state[m]=false;
    if(!next.interactions.measure) modes.state.measure=false;
    modes.state.flow=preserve && previous?.interactions.flow===next.interactions.flow ? savedState.flow : !!next.interactions.flow;
    const connectors=modes.buildFlowDots(next.connectors,resolveTarget,con=>materials.buildMaterial(next.materials,con.material || {preset:'emissive-cyan'}));
    if(connectors) stage.scene.add(connectors);
    if(diffState) applyDiff(diffState.base,false);
    modes.applyAppearance();
    if(!overlaySvg) overlaySvg=annotationSys.createOverlay(container);
    narrow=container.clientWidth<600;
    annotationItems=annotationSys.buildAnnotations(overlaySvg,screenSpec(next),annotationEnv(mode));
    for(const [group,visible] of annotationVisibility) annotationSys.setGroupVisibility(annotationItems,group,visible);
    updateAnnotations=annotationSys.updateAnnotations(annotationItems,annotationContext());
    chrome?.dispose();chrome=ui.buildChrome(container,engineApi);
    tourState.steps=normalizeTourSteps(next.tour);
    if(modes.state.selected && next.interactions.inspect) engineApi._showInspect(engineApi.inspect(modes.state.selected));
    poseVersion++;refreshLinks();syncChrome();updateOverlay();renderFrame();
    if(!preserve) {
      for(const behavior of next.behaviors) if(behavior.autoPlay!==false) {
        engineApi.explode(behavior.amount ?? 1,{assemblyId:behavior.assembly,duration:behavior.duration || 1200,easing:behavior.easing,stagger:behavior.stagger});
      }
      if(options.urlState) applyShareFromLocation();
      if(next.tour?.autoStart && tourState.steps.length && !tourState.active) engineApi.tour.start();
    }
    startLoop();
    onEvent({type:preserve?'scene:updated':'scene:loaded',sceneId:next.scene.id,components:hierarchy.componentData.size});
    return engineApi;
  }

  // ------------------------------------------------------------ bounds and framing
  function boundsAtExplode(amount) {
    const saved=[...hierarchy.componentData].map(([id,data])=>[id,data.explodeAmount,data.explodeStagger,data.explodeEasing,data.peekOffset]);
    for(const data of hierarchy.componentData.values()) data.peekOffset=null;
    assemblySys.applyExplode(hierarchy,amount,{stagger:false});
    const box=assemblySys.computeBounds(hierarchy,false);
    for(const [id,amountWas,stagger,easing,peek] of saved) {
      const data=hierarchy.componentData.get(id);data.explodeAmount=amountWas;data.explodeStagger=stagger;data.explodeEasing=easing;data.peekOffset=peek;
      assemblySys.placeComponent(hierarchy,id,data);
    }
    hierarchy.root.updateWorldMatrix(true,true);
    return box && !box.isEmpty() ? box : null;
  }

  function computeFrameBoxes() {
    const assembled=boundsAtExplode(0);
    const exploded=enabled(compiledSpec.interactions.explode) ? boundsAtExplode(1) : assembled;
    frameBoxes={assembled:assembled || new THREE.Box3(new THREE.Vector3(-50,-50,-50),new THREE.Vector3(50,50,50)),exploded:exploded || assembled};
  }

  function displayBounds() {
    let bounds=assemblySys.computeBounds(hierarchy,false);
    for(const box of [frameBoxes.assembled,frameBoxes.exploded]) if(box) bounds=bounds ? bounds.union(box.clone()) : box.clone();
    return bounds;
  }

  function paddingFor(camera) {
    const framing=compiledSpec.scene.camera.framing;
    return camera.isOrthographicCamera ? (framing==='fit'?1.06:1.2) : (framing==='fit'?1.06:1.22);
  }

  // Tight fit for a camera at the given orientation. `boxes` is one Box3 or a list
  // (per-part boxes fit long diagonal subjects much tighter than their union).
  // The target is centred on the projected extents, not the box centre.
  // widthFraction < 1 fits a narrower central strip (the rest is reserved for the parts list).
  function fitCamera(camera,boxes,padding,azimuth,elevation,widthFraction=1) {
    const list=(Array.isArray(boxes)?boxes:[boxes]).filter(b=>b && !b.isEmpty());
    const union=list.reduce((acc,b)=>acc.union(b),new THREE.Box3());
    const az=azimuth*Math.PI/180,el=elevation*Math.PI/180;
    const back=new THREE.Vector3(Math.cos(el)*Math.sin(az),Math.sin(el),Math.cos(el)*Math.cos(az));
    const forward=back.clone().negate();
    let right=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0));
    if(right.lengthSq()<1e-10) right.set(1,0,0);right.normalize();
    const up=new THREE.Vector3().crossVectors(right,forward).normalize();
    const corners=[];
    for(const b of list) for(const x of [b.min.x,b.max.x]) for(const y of [b.min.y,b.max.y]) for(const z of [b.min.z,b.max.z]) corners.push(new THREE.Vector3(x,y,z));
    const center=union.getCenter(new THREE.Vector3());
    let rMin=Infinity,rMax=-Infinity,uMin=Infinity,uMax=-Infinity;
    for(const c of corners) {const d=c.clone().sub(center),r=d.dot(right),u=d.dot(up);rMin=Math.min(rMin,r);rMax=Math.max(rMax,r);uMin=Math.min(uMin,u);uMax=Math.max(uMax,u);}
    if(Number.isFinite(rMin)) center.addScaledVector(right,(rMin+rMax)/2).addScaledVector(up,(uMin+uMax)/2);
    let maxR=0,maxU=0,distance=0;
    const aspect=(camera.isPerspectiveCamera ? camera.aspect : (camera.right-camera.left)/Math.max(1e-6,camera.top-camera.bottom))*widthFraction;
    const tanV=Math.tan((camera.fov || 38)*Math.PI/360),tanH=tanV*aspect;
    for(const c of corners) {
      const d=c.clone().sub(center),r=Math.abs(d.dot(right)),u=Math.abs(d.dot(up)),f=d.dot(back);
      maxR=Math.max(maxR,r);maxU=Math.max(maxU,u);
      distance=Math.max(distance,f+padding*r/tanH,f+padding*u/tanV);
    }
    const radius=union.getSize(new THREE.Vector3()).length()/2 || 50;
    if(camera.isOrthographicCamera) {
      const zoom=Math.min((camera.top-camera.bottom)/2/Math.max(1e-6,padding*maxU),(camera.right-camera.left)*widthFraction/2/Math.max(1e-6,padding*maxR));
      return {target:center.toArray(),distance:radius*3,zoom};
    }
    return {target:center.toArray(),distance:Math.max(distance,radius*.2)};
  }

  // Fit the pose actually on screen (staggered explode, subtree explode, hidden parts).
  let liveBoxCache={version:-1,boxes:null};
  function partBoxes() {
    hierarchy.root.updateWorldMatrix(true,true);
    const boxes=[];
    for(const node of hierarchy.componentNodes.values()) if(node.visible) {const b=new THREE.Box3().setFromObject(node);if(!b.isEmpty()) boxes.push(b);}
    return boxes;
  }
  function liveBounds() {
    if(liveBoxCache.version!==poseVersion) liveBoxCache={version:poseVersion,boxes:partBoxes()};
    return liveBoxCache.boxes.length ? liveBoxCache.boxes : frameBoxes.assembled;
  }

  function framingAt(orientation) {
    const camera=stage.camera,o=orientation || currentOrientation();
    return fitCamera(camera,liveBounds(),paddingFor(camera),o.azimuth,o.elevation,screenReserve?.fraction || 1);
  }

  // Clip planes follow scene size and camera distance (a fixed far plane clips large exploded scenes).
  function ensureClipRange() {
    const camera=stage.camera,radius=(frameBoxes.exploded || frameBoxes.assembled).getSize(new THREE.Vector3()).length()/2 || 100;
    const far=Math.max(rig.state.distance,rig.state.targetDistance)+radius*4;
    if(camera.isPerspectiveCamera) {
      if(camera.far<far || camera.far>far*4) {camera.far=far*1.5;camera.near=Math.max(.05,Math.min(1,camera.far/4e5));camera.updateProjectionMatrix();}
    } else if(camera.far<far || camera.near>-radius*4) {camera.near=-far*1.5;camera.far=far*1.5;camera.updateProjectionMatrix();}
  }

  // The on-screen parts list keeps its strip of the frame: the projection is offset
  // so the subject centres in the remaining space (picking and labels follow).
  let screenReserve=null;
  function applyScreenReserve() {
    const width=container.clientWidth,height=container.clientHeight;
    const next=narrow ? null : reserveFor(partsListConfig(annotationItems),width);
    const camera=stage.camera,offset=next?.offset || 0;
    if(offset) {
      const view=camera.view;
      if(!view || !view.enabled || view.offsetX!==offset || view.fullWidth!==width || view.fullHeight!==height) camera.setViewOffset(width,height,offset,0,width,height);
    } else if(camera.view?.enabled) camera.clearViewOffset();
    screenReserve=next;
  }

  function followEnabled() {
    const camera=compiledSpec.scene.camera;
    return camera.followExplode!==false && camera.framing!=='manual' && !rig.state.userFramed;
  }

  function frameDefault(immediate=false,orientation=null) {
    const mode=compiledSpec.scene.renderMode,camera=compiledSpec.scene.camera;
    const o=mode==='blueprint' ? VIEW_PRESETS.iso : orientation || {azimuth:camera.azimuth,elevation:camera.elevation};
    rig.setPose(o,true);rig.update();
    if(camera.framing==='manual' && mode!=='blueprint') rig.setPose({...camera,distance:camera.distance || 300},immediate);
    else {
      const framed=framingAt(o);
      rig.setPose({...o,target:framed.target,distance:mode==='blueprint' || mode==='illustration' ? framed.distance : camera.distance || framed.distance},immediate);
      if(framed.zoom) {stage.camera.zoom=framed.zoom;stage.camera.updateProjectionMatrix();}
    }
    rig.state.userFramed=false;
  }

  function applyFollow(immediate=false) {
    if(!followEnabled() || (!immediate && peeks.size)) return;
    const framed=framingAt();
    rig.setPose({target:framed.target,distance:framed.distance},immediate);
    if(framed.zoom && stage.camera.isOrthographicCamera) {
      const zoom=immediate ? framed.zoom : stage.camera.zoom+(framed.zoom-stage.camera.zoom)*.18;
      if(Math.abs(zoom-stage.camera.zoom)>1e-6) {stage.camera.zoom=zoom;stage.camera.updateProjectionMatrix();}
    }
  }

  // ------------------------------------------------------------ targets, occlusion, pointer
  function resolveTarget(target) {
    if(target?.position) return new THREE.Vector3().fromArray(target.position);
    if(!target?.anchor) return null;
    const ref=target.anchor;
    if(hierarchy.componentData.has(ref)) return assemblySys.componentAnchorWorld(hierarchy,ref);
    const id=componentOfRef(ref);
    return id ? assemblySys.componentAnchorWorld(hierarchy,id,ref.slice(id.length+1)) : null;
  }

  function componentOfRef(ref) {
    if(!ref) return null;
    if(hierarchy.componentData.has(ref)) return ref;
    return [...hierarchy.componentData.keys()].filter(id=>ref.startsWith(id+'.')).sort((a,b)=>b.length-a.length)[0] || null;
  }

  function occlusionProbe(world,target,camera=stage.camera) {
    const direction=camera.isOrthographicCamera ? camera.getWorldDirection(new THREE.Vector3()) : world.clone().sub(camera.position).normalize();
    const distance=world.distanceTo(camera.position),origin=camera.isOrthographicCamera ? world.clone().addScaledVector(direction,-distance) : camera.position.clone();
    if(distance<1e-3) return false;
    const ownId=componentOfRef(target?.anchor);
    return !!picker.occludedProbe(origin,direction,camera.isOrthographicCamera?distance-1e-3:distance*.9,ownId);
  }

  function bindPointer() {
    const element=stage.renderer.domElement;let down=null,lastClick=0;
    const onDown=e=>{down={x:e.clientX,y:e.clientY};container.focus({preventScroll:true});};
    const onUp=e=>{
      const start=down;down=null;
      if(!start || Math.hypot(e.clientX-start.x,e.clientY-start.y)>6) return;
      const hit=picker.pickAt(e.clientX,e.clientY);
      if(modes.state.measure) {measureClick(hit,e);return;}
      if(!compiledSpec.interactions.select) return;
      const now=performance.now(),id=hit?.componentId || null;
      if(now-lastClick<320 && id && explodeConfig().local!==false && enabled(compiledSpec.interactions.explode)) {lastClick=0;engineApi.explodeSubtree(id);return;}
      lastClick=now;engineApi.select(id);
    };
    const onMove=e=>{
      if(down || !compiledSpec.interactions.select) return;
      const id=picker.pickAt(e.clientX,e.clientY)?.componentId || null;
      if(id!==modes.state.hovered) {
        modes.state.hovered=id;modes.applyAppearance();refreshLinks();element.style.cursor=id || modes.state.measure?'pointer':'default';
        if(explodeConfig().peek!==false && !modes.state.measure) peekTarget=id && (hierarchy.componentData.get(id)?.explodeAmount || 0)<.05 ? id : null;
      }
      engineApi._tooltip?.(id && id!==modes.state.selected ? engineApi.inspect(id) : null,e.clientX,e.clientY);
    };
    const onLeave=()=>{engineApi._tooltip?.(null);if(modes.state.hovered){modes.state.hovered=null;peekTarget=null;modes.applyAppearance();refreshLinks();}};
    const onCancel=()=>{down=null;};
    element.addEventListener('pointerdown',onDown);element.addEventListener('pointerup',onUp);
    element.addEventListener('pointermove',onMove);element.addEventListener('pointercancel',onCancel);element.addEventListener('pointerleave',onLeave);
    container.addEventListener('keydown',onKey);
    unbindPointer=()=>{element.removeEventListener('pointerdown',onDown);element.removeEventListener('pointerup',onUp);element.removeEventListener('pointermove',onMove);element.removeEventListener('pointercancel',onCancel);element.removeEventListener('pointerleave',onLeave);container.removeEventListener('keydown',onKey);};
  }

  function setHover(id) {
    if(id && !hierarchy.componentData.has(id)) id=null;
    if(modes.state.hovered===id) return;
    modes.state.hovered=id;modes.applyAppearance();refreshLinks();
  }

  function refreshLinks() {
    const ids=new Set([modes.state.hovered,modes.state.selected,...modes.state.highlight].filter(Boolean));
    annotationSys.setLinked(annotationItems,ids);
    engineApi._syncTree?.();
  }

  // ------------------------------------------------------------ section
  function configureSection(axis,position) {
    modes.state.sectionAxis=axis;modes.state.sectionPosition=Math.max(0,Math.min(1,position));
    const bounds=assemblySys.computeBounds(hierarchy,false) || hierarchy.bounds;
    const index=axis==='x'?0:axis==='z'?2:1;
    clipPlane.normal.set(0,0,0).setComponent(index,-1);
    clipPlane.constant=bounds.min.getComponent(index)+(bounds.max.getComponent(index)-bounds.min.getComponent(index))*modes.state.sectionPosition;
    modes.updateSection(clipPlane);
    capStamp='';
  }

  function disposeCaps() {caps.disposeCapGroup(capGroup);capGroup=null;capStamp='';}

  function updateCaps(force=false) {
    const want=modes.state.section && compiledSpec.scene.drawing?.sectionCaps!==false && compiledSpec.scene.renderMode==='webgl';
    if(!want) {if(capGroup) disposeCaps();return;}
    const stamp=JSON.stringify([poseVersion,clipPlane.normal.toArray(),clipPlane.constant,modes.state.xray,modes.state.isolate,modes.state.ghost,modes.state.selected]);
    if(!force && stamp===capStamp) return;
    caps.disposeCapGroup(capGroup);
    capGroup=caps.buildCapGroup(hierarchy.root,clipPlane,Math.max(2,(frameBoxes.assembled.getSize(new THREE.Vector3()).length() || 100)/90));
    stage.scene.add(capGroup);capStamp=stamp;
  }

  // ------------------------------------------------------------ explode
  function applyExplode(amount,opts={}) {
    const config=compiledSpec.interactions.explode;
    const stagger=opts.stagger ?? (typeof config==='object' ? config.autoStagger!==false : true);
    const easing=opts.easing || config?.easing || 'ease-in-out';
    modes.state.explode=amount;
    if(!opts.assemblyId) subtree=null;
    for(const id of hierarchy.assemblyNodes.keys()) if(!opts.assemblyId || id===opts.assemblyId) {
      explodeStates.set(id,{amount,stagger,easing});
      assemblySys.applyExplode(hierarchy,amount,{stagger,easing,assemblyId:id});
    }
    poseVersion++;syncChrome();
  }

  function snapStop(amount) {
    const stops=explodeConfig().stops;
    if(!Array.isArray(stops)) return amount;
    for(const stop of stops) if(Math.abs(stop-amount)<.035) return stop;
    return amount;
  }

  function updatePeeks() {
    if(!peekTarget && !peeks.size) return;
    if(peekTarget && !peeks.has(peekTarget)) peeks.set(peekTarget,0);
    const offsets=new Map();let active=false;
    for(const [id,value] of peeks) {
      const target=id===peekTarget ? 1 : 0,next=value+(target-value)*(reduceMotion?1:.22);
      if(target===0 && next<.004) {peeks.delete(id);continue;}
      peeks.set(id,next);active=true;
      const data=hierarchy.componentData.get(id);if(!data) continue;
      const members=assemblySys.descendantsOf(hierarchy,id);members.add(id);
      if(members.size>hierarchy.componentData.size*.6) {peeks.delete(id);continue;}
      const v=data.explodeVector.map(x=>x*PEEK_FRACTION*next);
      for(const member of members) {const prev=offsets.get(member) || [0,0,0];offsets.set(member,prev.map((x,i)=>x+v[i]));}
    }
    assemblySys.setPeekOffsets(hierarchy,offsets);
    if(active || offsets.size===0) poseVersion++;
  }

  // ------------------------------------------------------------ overlay
  function annotationEnv(mode) {
    return {renderMode:mode,componentOf:target=>componentOfRef(target?.anchor),hooks:{
      hover:id=>setHover(id),
      click:id=>engineApi.select(id),
      expand:()=>engineApi.explode(1,{duration:1100})
    }};
  }

  function annotationContext() {
    return {camera:()=>stage.camera,resolveTarget,occlusionFor:occlusionProbe,
      isClipped:world=>!!modes.state.section && clipPlane.distanceToPoint(world)<-1e-6,
      isVisible:id=>{if(!id) return true;for(let node=hierarchy.componentNodes.get(id);node;node=node.parent) if(!node.visible) return false;return true;},
      explodeOf:id=>(id && hierarchy.componentData.get(id)?.explodeAmount) ?? modes.state.explode,
      collapse:{enabled:explodeConfig().collapseHidden!==false && enabled(compiledSpec.interactions.explode),threshold:COLLAPSE_THRESHOLD},
      layout:compiledSpec.scene.labelLayout || 'free',subjectRect,partRects};
  }

  function subjectRect(camera,width,height) {
    const rects=partRects(camera,width,height);
    if(!rects.length) return null;
    const x=Math.min(...rects.map(r=>r.x)),y=Math.min(...rects.map(r=>r.y));
    return {x,y,w:Math.max(...rects.map(r=>r.x+r.w))-x,h:Math.max(...rects.map(r=>r.y+r.h))-y};
  }

  // Screen footprints of visible parts (soft obstacles for label placement).
  let partRectCache={key:'',rects:[]};
  function partRects(camera,width,height) {
    const key=[poseVersion,camera.uuid,...camera.matrixWorld.elements.map(v=>v.toFixed(2)),camera.zoom,width,height].join(',');
    if(partRectCache.key===key) return partRectCache.rects;
    const rects=[],v=new THREE.Vector3();
    for(const node of hierarchy.componentNodes.values()) {
      let shown=true;for(let p=node;p;p=p.parent) if(!p.visible) shown=false;
      if(!shown) continue;
      const box=new THREE.Box3().setFromObject(node);if(box.isEmpty()) continue;
      let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      for(const x of [box.min.x,box.max.x]) for(const y of [box.min.y,box.max.y]) for(const z of [box.min.z,box.max.z]) {
        v.set(x,y,z).project(camera);const sx=(v.x*.5+.5)*width,sy=(-v.y*.5+.5)*height;
        minX=Math.min(minX,sx);maxX=Math.max(maxX,sx);minY=Math.min(minY,sy);maxY=Math.max(maxY,sy);
      }
      // Shrink: AABB footprints overstate thin diagonal parts.
      const w=maxX-minX,h=maxY-minY;
      if(w>0 && h>0) rects.push({x:minX+w*.12,y:minY+h*.12,w:w*.76,h:h*.76});
    }
    partRectCache={key,rects};return rects;
  }

  function chromeRects() {
    const hostRect=container.getBoundingClientRect(),out=[];
    for(const element of container.querySelectorAll('.sd-title,.sd-toolbar,.sd-legend,.sd-inspect,.sd-tree,.sd-tour,.sd-diff-legend')) {
      if(getComputedStyle(element).display==='none') continue;
      const b=element.getBoundingClientRect();
      if(b.width && b.height) out.push({x:b.x-hostRect.x,y:b.y-hostRect.y,w:b.width,h:b.height});
    }
    return out;
  }

  function topInset() {
    const title=container.querySelector('.sd-title');
    if(!title) return 16;
    const hostRect=container.getBoundingClientRect(),b=title.getBoundingClientRect();
    return Math.round(b.bottom-hostRect.top+16);
  }

  function traceSegments() {
    if(!modes.state.traces) return [];
    if(traceCache.version===poseVersion) return traceCache.traces;
    const radius=frameBoxes.exploded.getSize(new THREE.Vector3()).length()/2 || 100,threshold=radius*.05,traces=[];
    const displacement=new Map();
    for(const id of hierarchy.componentData.keys()) displacement.set(id,assemblySys.componentDisplacementWorld(hierarchy,id));
    for(const [id,data] of hierarchy.componentData) {
      const node=hierarchy.componentNodes.get(id),disp=displacement.get(id);
      if(!node.visible || !disp || disp.length()<threshold) continue;
      const parentDisp=data.parent && displacement.get(data.parent);
      if(parentDisp && parentDisp.distanceTo(disp)<disp.length()*.04) continue;
      const box=new THREE.Box3().setFromObject(node),center=box.getCenter(new THREE.Vector3());
      if(modes.state.section && clipPlane.distanceToPoint(center)<0) continue;
      // Trim the segment so it runs between the part's two silhouettes, not across them.
      const half=box.getSize(new THREE.Vector3()).multiplyScalar(.5),dir=disp.clone().normalize();
      const reach=Math.abs(dir.x)*half.x+Math.abs(dir.y)*half.y+Math.abs(dir.z)*half.z;
      if(disp.length()<=reach*2.05) continue;
      traces.push({id,from:center.clone().sub(disp).addScaledVector(dir,reach),to:center.clone().addScaledVector(dir,-reach)});
    }
    traceCache={version:poseVersion,traces};return traces;
  }

  function measurementSegments() {
    const out=[];
    const world=point=>point.id ? hierarchy.componentNodes.get(point.id)?.localToWorld(point.local.clone()) : point.world.clone();
    for(const m of measurements) {const a=world(m.a),b=world(m.b);if(a&&b) out.push({a,b,text:m.text});}
    if(pendingMeasure) {const a=world(pendingMeasure);if(a) out.push({a});}
    return out;
  }

  function materialColor(ref) {
    const def=resolveMaterialDef(compiledSpec.materials,ref);
    return def.color || MATERIAL_PRESETS[def.preset]?.color || '#9aa3ad';
  }

  function partsListConfig(items) {
    const config=compiledSpec.partsList || {};
    if(config.enabled===false) return null;
    const rows=new Map(),key=new Map();
    for(const item of items) {
      if(item.style!=='balloon' || item.g.style.visibility==='hidden' || rows.has(item.number)) continue;
      const data=item.component && hierarchy.componentData.get(item.component),props=data?.spec.properties || {};
      const material=data ? (typeof data.spec.material==='string' ? data.spec.material : data.spec.material?.preset || '') : '';
      const name=props.materialName || material;
      rows.set(item.number,{item:item.number,description:item.spec.text || data?.spec.label || item.component || '',qty:props.qty ?? props.quantity ?? 1,material:name,partNumber:props.partNumber || '',componentId:item.component});
      if(name && data && !key.has(name)) key.set(name,materialColor(data.spec.material));
    }
    if(!rows.size) return null;
    const titles={item:'#',description:'Description',qty:'Qty',material:'Material',partNumber:'Part no.'};
    const style=config.style || 'table';
    return {rows:[...rows.values()].sort((a,b)=>a.item-b.item),columns:(config.columns || ['item','description','qty','material']).map(key=>({key,title:titles[key] || key})),
      title:config.title ?? 'Parts list',position:config.position || (style==='legend'?'split':'right'),style,
      materialKey:config.materialKey ? [...key].map(([name,color])=>({name,color})) : null};
  }

  // Width the parts list keeps clear at the frame edges (on screen and in figures).
  function reserveFor(config,width) {
    if(!config || config.position==='bottom') return null;
    const size=annotationSys.measurePartsList(config),left=Math.min(width*.3,size.left ? size.left+24 : 0),right=Math.min(width*.3,size.right ? size.right+24 : 0);
    if(!left && !right) return null;
    return {left,right,fraction:Math.max(.4,(width-left-right)/width),offset:(right-left)/2};
  }

  function formatScale(magnification) {
    const rounded=Math.round(magnification);
    return Math.abs(rounded-magnification)<.06 ? `${rounded}:1` : `${magnification.toFixed(1)}:1`;
  }

  // Detail views: on-sheet frames + inset cameras for one main camera/viewport.
  const insetCameras=new Map();
  function detailLayout(camera,width,height,top=16,limits={}) {
    const out=[];let left=top,right=top;
    // Insets sit just inside any strip reserved for the parts list, beyond the margin label column.
    const column=compiledSpec.scene.labelLayout==='margins' && limits.left ? 44 : 0;
    const leftX=(limits.left ? limits.left+8+column : 16),rightEdge=width-(limits.right ? limits.right+8+column : 16);
    camera.updateMatrixWorld();
    for(const [index,detail] of (compiledSpec.detailViews || []).entries()) {
      const center=resolveTarget(detail.target);if(!center) continue;
      const size=Math.round(Math.min(detail.size || 170,Math.min(width,height)*.3));
      const p0=center.clone().project(camera),axis=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0).normalize();
      const p1=center.clone().add(axis).project(camera),scale=Math.hypot((p1.x-p0.x)*width/2,(p1.y-p0.y)*height/2);
      if(!(scale>0) || p0.z>1) continue;
      let magnification=detail.magnification || 3,radius=detail.radius;
      if(radius) magnification=(size/2/radius)/scale;else radius=size/2/(scale*magnification);
      const placement=detail.placement || 'left',x=placement==='right'?rightEdge-size:leftX,y=placement==='right'?right:left;
      if(placement==='right') right+=size+40;else left+=size+40;
      const key=`${camera.uuid}:${detail.id}`;
      const inset=insetCameras.get(key) || new THREE.OrthographicCamera(-1,1,1,-1,-20000,20000);
      insetCameras.set(key,inset);
      inset.left=-radius;inset.right=radius;inset.top=radius;inset.bottom=-radius;
      inset.position.copy(center);inset.quaternion.copy(camera.quaternion);inset.updateMatrixWorld();inset.updateProjectionMatrix();
      out.push({id:detail.id,label:detail.label || String.fromCharCode(65+index),caption:detail.caption || '',rect:{x,y,w:size,h:size},center,radiusPx:radius*scale,scaleText:formatScale(magnification),camera:inset});
    }
    return out;
  }

  function diffTraces() {
    if(!diffState?.diff) return [];
    const out=[];
    for(const moved of diffState.diff.components.moved) {
      const node=hierarchy.componentNodes.get(moved.id);if(!node?.parent) continue;
      const to=new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
      const delta=node.parent.localToWorld(new THREE.Vector3(...moved.to)).sub(node.parent.localToWorld(new THREE.Vector3(...moved.from)));
      out.push({id:moved.id,from:to.clone().sub(delta),to,color:'#f59e0b',width:1.6,dash:'5 3'});
    }
    return out;
  }

  // Phones get numbered balloons (tap to inspect) instead of cards that would cover the subject.
  let screenDetails=[],narrow=false;
  function screenSpec(spec) {return narrow && spec.scene.annotationStyle!=='balloon' ? {...spec,scene:{...spec.scene,annotationStyle:'balloon'},annotations:spec.annotations.map(a=>a.type==='dimension'?a:{...a,style:'balloon'})} : spec;}
  function rebuildOverlay() {
    annotationItems=annotationSys.buildAnnotations(overlaySvg,screenSpec(compiledSpec),annotationEnv(compiledSpec.scene.renderMode));
    for(const [group,visible] of annotationVisibility) annotationSys.setGroupVisibility(annotationItems,group,visible);
    updateAnnotations=annotationSys.updateAnnotations(annotationItems,annotationContext());refreshLinks();
  }
  function updateOverlay() {
    const width=container.clientWidth,height=container.clientHeight;
    if((width<600)!==narrow && width>0) {narrow=width<600;rebuildOverlay();}
    const treeOpen=!!container.querySelector('.sd-tree.sd-open'),occupied=chromeRects();
    const bar=chrome?.bar?.getBoundingClientRect(),host=container.getBoundingClientRect();
    const limits={left:screenReserve?.left || 0,right:screenReserve?.right || 0,top:8,bottom:bar && bar.height ? bar.top-host.top-8 : height-8};
    screenDetails=narrow || treeOpen ? [] : detailLayout(stage.camera,width,height,topInset(),limits);
    updateAnnotations({camera:stage.camera,width,height,occupied,traces:[...traceSegments(),...diffTraces()],measurements:measurementSegments(),details:screenDetails,partsList:narrow?null:partsListConfig(annotationItems),topInset:16,leftTopInset:topInset(),limits});
  }

  function renderFrame() {
    const mode=compiledSpec.scene.renderMode;
    if(isVector(mode)) {
      const bar=chrome?.bar,hostRect=container.getBoundingClientRect(),barRect=bar?.getBoundingClientRect();
      const reserve=barRect && barRect.height ? Math.max(0,Math.round(hostRect.bottom-barRect.top+6)) : 0;
      blueprint.update(hierarchy,stage.scene,stage.camera,compiledSpec,modes.state,{theme:vectorTheme(compiledSpec,mode),reserveBottom:reserve,details:screenDetails});
    } else {
      updateCaps();stage.render();
      stage.renderInsets(screenDetails.map(d=>({rect:d.rect,camera:d.camera})));
    }
  }

  function startLoop() {
    cancelAnimationFrame(raf);lastT=performance.now();
    const tick=time=>{
      if(disposed) return;
      const dt=Math.min(.05,(time-lastT)/1000);lastT=time;
      for(const [key,animation] of animations) {
        const fraction=animation.duration ? Math.min(1,(time-animation.start)/animation.duration) : 1;
        const value=animation.from+(animation.to-animation.from)*fraction;
        if(animation.componentIds) {assemblySys.applyExplode(hierarchy,value,{...animation,componentIds:animation.componentIds});if(subtree && key==='subtree') subtree.amount=value;poseVersion++;}
        else applyExplode(value,animation);
        if(fraction===1) {animations.delete(key);animation.done?.();}
      }
      updatePeeks();applyFollow();
      rig.update();stage.resize(container.clientWidth,container.clientHeight);applyScreenReserve();ensureClipRange();
      modes.updateFlow(dt);updateOverlay();renderFrame();
      if(options.urlState && ++shareTick%20===0) writeShareToLocation();
      raf=requestAnimationFrame(tick);
    };
    raf=requestAnimationFrame(tick);
  }

  // ------------------------------------------------------------ panels (off-screen renders)
  function snapshotScene() {
    return {
      components:[...hierarchy.componentData].map(([id,d])=>[id,d.explodeAmount,d.explodeStagger,d.explodeEasing,d.peekOffset]),
      visible:[...hierarchy.componentNodes].map(([id,n])=>[id,n.visible]),
      state:{...modes.state,highlight:new Set(modes.state.highlight),diff:new Map(modes.state.diff)}
    };
  }
  function restoreScene(snapshot) {
    for(const [id,amount,stagger,easing,peek] of snapshot.components) {
      const data=hierarchy.componentData.get(id);if(!data) continue;
      Object.assign(data,{explodeAmount:amount,explodeStagger:stagger,explodeEasing:easing,peekOffset:peek});
      assemblySys.placeComponent(hierarchy,id,data);
    }
    for(const [id,visible] of snapshot.visible) {const node=hierarchy.componentNodes.get(id);if(node) node.visible=visible;}
    Object.assign(modes.state,snapshot.state);
    hierarchy.root.updateWorldMatrix(true,true);modes.applyAppearance();modes.updateConnectors();
    poseVersion++;traceCache.version=-1;capStamp='';
  }

  function placeCamera(camera,target,orientation,distance) {
    const az=orientation.azimuth*Math.PI/180,el=orientation.elevation*Math.PI/180;
    camera.up.set(0,1,0);
    camera.position.set(target[0]+distance*Math.cos(el)*Math.sin(az),target[1]+distance*Math.sin(el),target[2]+distance*Math.cos(el)*Math.cos(az));
    camera.lookAt(new THREE.Vector3(...target));camera.updateMatrixWorld();
  }

  function currentOrientation() {return {azimuth:rig.state.targetAzimuth*180/Math.PI,elevation:rig.state.targetElevation*180/Math.PI};}

  function panelCamera(mode,width,height,opts) {
    const aspect=width/height;
    const ortho=isVector(mode) || opts.projection==='orthographic' || (mode==='webgl' && !opts.projection && compiledSpec.scene.camera.projection==='orthographic');
    if(opts.camera==='current') {
      const camera=stage.camera.clone();
      if(camera.isPerspectiveCamera) camera.aspect=aspect;
      else {const hh=camera.top-camera.bottom;camera.left=-hh*aspect/2;camera.right=hh*aspect/2;}
      camera.updateProjectionMatrix();camera.updateMatrixWorld();return camera;
    }
    const camera=ortho ? new THREE.OrthographicCamera(-60*aspect,60*aspect,60,-60,-40000,40000) : new THREE.PerspectiveCamera(compiledSpec.scene.camera.fov || 38,aspect,1,60000);
    const orientation=mode==='blueprint' ? VIEW_PRESETS.iso : opts.view ? VIEW_PRESETS[opts.view] : opts.orientation || currentOrientation();
    const parts=opts.bounds ? null : partBoxes(),box=opts.bounds || (parts.length ? parts : frameBoxes.exploded);
    const fraction=opts.reserve?.fraction || 1;
    const fit=fitCamera(camera,box,opts.padding || paddingFor(camera),orientation.azimuth,orientation.elevation,fraction);
    placeCamera(camera,fit.target,orientation,fit.distance);
    if(ortho) camera.zoom=opts.zoom || fit.zoom;
    if(opts.reserve?.offset) camera.setViewOffset(width,height,opts.reserve.offset,0,width,height);
    camera.updateProjectionMatrix();
    return camera;
  }

  function applyPanelState(opts) {
    if(opts.explode!=null) assemblySys.applyExplode(hierarchy,opts.explode,{stagger:opts.stagger ?? explodeConfig().autoStagger!==false,easing:explodeConfig().easing});
    for(const data of hierarchy.componentData.values()) data.peekOffset=null;
    if(opts.componentExplode) for(const [id,amount] of opts.componentExplode) assemblySys.applyExplode(hierarchy,amount,{stagger:false,componentIds:new Set([id])});
    else for(const [id,data] of hierarchy.componentData) assemblySys.placeComponent(hierarchy,id,data);
    if(opts.hidden) for(const id of opts.hidden) {const node=hierarchy.componentNodes.get(id);if(node) node.visible=false;}
    if(opts.highlight) {modes.state.highlight=new Set(opts.highlight);modes.state.highlightGhost=opts.highlightGhost ?? true;}
    if(opts.selected!==undefined) modes.state.selected=opts.selected;
    modes.state.hovered=null;
    if(opts.modes) Object.assign(modes.state,opts.modes);
    hierarchy.root.updateWorldMatrix(true,true);modes.applyAppearance();modes.updateConnectors();
    poseVersion++;traceCache.version=-1;
  }

  // opts: {mode, width, height, explode, componentExplode, hidden, highlight, selected, modes, camera:'current',
  //        view, orientation, bounds, zoom, annotations, traces, details, partsList, heading, layout, pixelRatio}
  function renderPanel(opts) {
    const mode=opts.mode || compiledSpec.scene.renderMode,width=Math.round(opts.width),height=Math.round(opts.height);
    const snapshot=snapshotScene();
    const tempOverlay=annotationSys.createOverlay(container);tempOverlay.style.visibility='hidden';
    try {
      applyPanelState(opts);
      const items=annotationSys.buildAnnotations(tempOverlay,opts.annotations===false?{...compiledSpec,annotations:[]}:compiledSpec,annotationEnv(mode));
      for(const [group,visible] of annotationVisibility) annotationSys.setGroupVisibility(items,group,visible);
      const partsList=opts.partsList===false || opts.annotations===false ? null : partsListConfig(items);
      const reserve=reserveFor(partsList,width);
      const camera=panelCamera(mode,width,height,{...opts,reserve:opts.camera==='current' ? null : reserve});
      const limits={left:reserve?.left || 0,right:reserve?.right || 0,top:8,bottom:height-8};
      const details=opts.details===false ? [] : detailLayout(camera,width,height,opts.heading?96:16,limits);
      let overlay=null;
      if(opts.annotations!==false || opts.traces || details.length || opts.overlay) {
        tempOverlay.setAttribute('width',width);tempOverlay.setAttribute('height',height);tempOverlay.setAttribute('viewBox',`0 0 ${width} ${height}`);
        tempOverlay.style.width=width+'px';tempOverlay.style.height=height+'px';
        const update=annotationSys.updateAnnotations(items,{...annotationContext(),summary:false});
        const traces=opts.traces===true ? traceSegments() : Array.isArray(opts.traces) ? opts.traces : [];
        update({camera,width,height,occupied:[],forceOcclusion:true,traces,measurements:opts.measurements ? measurementSegments() : [],details,partsList,layout:opts.layout,topInset:opts.heading?96:16,limits});
        overlay=tempOverlay;
      }
      if(isVector(mode)) {
        const theme=vectorTheme(compiledSpec,mode);
        if(opts.hiddenLines!==undefined) theme.hiddenLines=!!opts.hiddenLines;
        const svg=blueprint.renderDrawing({hierarchy,scene:stage.scene,camera,spec:compiledSpec,state:modes.state,width,height,theme,annotations:overlay,heading:opts.heading,details,footer:opts.footer,triad:opts.triad});
        return {kind:'svg',svg,width,height,camera};
      }
      const renderer=stage.renderer,ratio=renderer.getPixelRatio(),size=renderer.getSize(new THREE.Vector2());
      renderer.setPixelRatio(opts.pixelRatio || ratio);renderer.setSize(width,height,false);
      updateCaps(true);
      renderer.render(stage.scene,camera);
      stage.renderInsets(details.map(d=>({rect:d.rect,camera:d.camera})));
      const canvas=document.createElement('canvas');canvas.width=renderer.domElement.width;canvas.height=renderer.domElement.height;
      canvas.getContext('2d').drawImage(renderer.domElement,0,0);
      renderer.setPixelRatio(ratio);renderer.setSize(size.x,size.y,false);
      let overlayMarkup=null;
      if(overlay) {const copy=overlay.cloneNode(true);copy.removeAttribute('style');copy.setAttribute('xmlns','http://www.w3.org/2000/svg');overlayMarkup=new XMLSerializer().serializeToString(copy);}
      return {kind:'raster',canvas,overlay:overlayMarkup,width,height,camera};
    } finally {
      tempOverlay.remove();restoreScene(snapshot);
      for(const key of [...insetCameras.keys()]) if(!key.startsWith(stage.camera.uuid+':')) insetCameras.delete(key);
      if(compiledSpec.scene.renderMode==='webgl') {updateCaps(true);stage.render();}
    }
  }

  async function loadImage(src) {const image=new Image();image.src=src;await image.decode();return image;}
  function svgDataUrl(markup) {return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(markup);}

  async function panelToCanvas(panel,scale=1) {
    const canvas=document.createElement('canvas');canvas.width=Math.round(panel.width*scale);canvas.height=Math.round(panel.height*scale);
    const context=canvas.getContext('2d');
    if(panel.kind==='svg') context.drawImage(await loadImage(svgDataUrl(blueprint.serializeElement(panel.svg))),0,0,canvas.width,canvas.height);
    else {
      context.drawImage(panel.canvas,0,0,canvas.width,canvas.height);
      if(panel.overlay) context.drawImage(await loadImage(svgDataUrl(panel.overlay)),0,0,canvas.width,canvas.height);
    }
    return canvas;
  }

  function figurePalette(mode) {
    return mode==='illustration' ? {paper:compiledSpec.scene.illustration?.paper || '#ffffff',ink:'#1d232b',muted:'#5b6470',font:"Helvetica,Arial,sans-serif"}
      : mode==='blueprint' ? {paper:'#0b2947',ink:'#d5eaf5',muted:'#9cc3d8',font:'monospace'}
        : {paper:'#0a0f18',ink:'#e8eef6',muted:'#9db2c8',font:"'Inter',system-ui,sans-serif"};
  }

  // Composite panels into one SVG (vector panels) or PNG (any panels).
  // layout: {cells:[{panel, x, y, caption}], width, height, mode, title, extra(svgRoot,el)}
  async function compose(layout,format,scale=1) {
    const palette=figurePalette(layout.mode);
    if(format==='svg') {
      const el=blueprint.el,root=el('svg',{xmlns:'http://www.w3.org/2000/svg',viewBox:`0 0 ${layout.width} ${layout.height}`,width:layout.widthAttr || layout.width,height:layout.heightAttr || layout.height});
      root.appendChild(el('title',{},layout.title || compiledSpec.scene.title || compiledSpec.scene.id));
      root.appendChild(el('rect',{width:layout.width,height:layout.height,fill:palette.paper}));
      if(layout.title) root.appendChild(el('text',{x:16,y:28,'font-size':16,'font-weight':600,fill:palette.ink,'font-family':palette.font},layout.title));
      for(const cell of layout.cells) {
        if(cell.panel.kind!=='svg') throw new Error('SVG figures need vector panels (blueprint or illustration).');
        const nested=cell.panel.svg.cloneNode(true);
        nested.setAttribute('x',cell.x);nested.setAttribute('y',cell.y);nested.setAttribute('width',cell.panel.width);nested.setAttribute('height',cell.panel.height);
        root.appendChild(nested);
        if(cell.caption) root.appendChild(el('text',{x:cell.x+4,y:cell.y+cell.panel.height+17,'font-size':12,fill:palette.ink,'font-family':palette.font},cell.caption));
      }
      layout.extra?.(root,el,palette);
      return '<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(root);
    }
    const canvas=document.createElement('canvas');canvas.width=Math.round(layout.width*scale);canvas.height=Math.round(layout.height*scale);
    const context=canvas.getContext('2d');context.scale(scale,scale);
    context.fillStyle=palette.paper;context.fillRect(0,0,layout.width,layout.height);
    if(layout.title) {context.fillStyle=palette.ink;context.font=`600 16px ${palette.font}`;context.fillText(layout.title,16,28);}
    for(const cell of layout.cells) {
      context.drawImage(await panelToCanvas(cell.panel,scale),cell.x,cell.y,cell.panel.width,cell.panel.height);
      if(cell.caption) {context.fillStyle=palette.ink;context.font=`12px ${palette.font}`;context.fillText(cell.caption,cell.x+4,cell.y+cell.panel.height+17);}
    }
    if(layout.extra) {
      const el=blueprint.el,root=el('svg',{xmlns:'http://www.w3.org/2000/svg',viewBox:`0 0 ${layout.width} ${layout.height}`,width:layout.width,height:layout.height});
      layout.extra(root,el,palette);
      context.drawImage(await loadImage(svgDataUrl(new XMLSerializer().serializeToString(root))),0,0,layout.width,layout.height);
    }
    return canvas.toDataURL('image/png');
  }

  function gridLayout(panels,captions,columns,gap,top,mode,title) {
    const pw=panels[0].width,ph=panels[0].height,captionH=captions.some(Boolean)?26:0;
    const rows=Math.ceil(panels.length/columns);
    const cells=panels.map((panel,i)=>({panel,x:gap+(i%columns)*(pw+gap),y:top+Math.floor(i/columns)*(ph+captionH+gap),caption:captions[i]}));
    return {cells,width:gap+columns*(pw+gap),height:top+rows*(ph+captionH+gap),mode,title};
  }

  function figureDims(opts) {
    const aspect=opts.aspect || container.clientWidth/Math.max(1,container.clientHeight);
    if(opts.figure || opts.widthMm) {
      const widthMm=opts.widthMm || FIGURE_PRESETS[opts.figure];
      if(!widthMm) throw new Error('Unknown figure preset: '+opts.figure+'. Use '+Object.keys(FIGURE_PRESETS).join(', ')+'.');
      const pxPerMm=11/((opts.fontPt || 7)*.3528),width=Math.round(widthMm*pxPerMm);
      const heightMm=opts.heightMm || widthMm/aspect;
      return {width,height:Math.round(heightMm*pxPerMm),widthMm,heightMm,pxPerMm};
    }
    return {width:opts.width || container.clientWidth,height:opts.height || container.clientHeight};
  }

  function download(content,filename,type,opts) {
    if(opts.download===false) return;
    const url=typeof content==='string' && content.startsWith('data:') ? content : URL.createObjectURL(content instanceof Blob ? content : new Blob([content],{type}));
    downloadUrl(url,filename);
  }

  // ------------------------------------------------------------ measure
  function measureClick(hit,event) {
    if(!hit) {pendingMeasure=null;return;}
    let point={id:hit.componentId,local:hierarchy.componentNodes.get(hit.componentId).worldToLocal(hit.point.clone())};
    // Snap to a nearby authored anchor (within 12px).
    const rect=container.getBoundingClientRect(),cx=event.clientX-rect.left,cy=event.clientY-rect.top;
    let best=12;
    for(const [id,data] of hierarchy.componentData) for(const name of Object.keys(data.spec.anchors || {})) {
      const world=assemblySys.componentAnchorWorld(hierarchy,id,name);if(!world) continue;
      const p=world.clone().project(stage.camera),sx=(p.x*.5+.5)*rect.width,sy=(-p.y*.5+.5)*rect.height,d=Math.hypot(sx-cx,sy-cy);
      if(d<best) {best=d;point={id,local:hierarchy.componentNodes.get(id).worldToLocal(world.clone()),anchor:`${id}.${name}`};}
    }
    if(!pendingMeasure) {pendingMeasure=point;return;}
    const world=p=>hierarchy.componentNodes.get(p.id).localToWorld(p.local.clone());
    const distance=world(pendingMeasure).distanceTo(world(point));
    const units=compiledSpec.scene.units==='unitless'?'':' '+compiledSpec.scene.units;
    const approximate=compiledSpec.scene.fidelity==='actual'?'':'≈ ';
    const text=`${approximate}${distance.toFixed(distance<10?2:distance<100?1:0)}${units}`;
    measurements.push({a:pendingMeasure,b:point,text,distance});pendingMeasure=null;
    onEvent({type:'measure',distance,text});engineApi._toast?.(`Measured ${text}`);
  }

  // ------------------------------------------------------------ diff
  function clearDiffGroup() {
    if(!diffGroup) return;
    diffGroup.traverse(o=>{o.geometry?.dispose();if(o.material) [].concat(o.material).forEach(m=>m.dispose());});
    diffGroup.removeFromParent();diffGroup=null;
  }
  function applyDiff(base,announce=true) {
    const diff=diffScenes(base,compiledSpec);
    diffState={base,diff};
    modes.state.diff=new Map([...diff.components.added.map(c=>[c.id,'added']),...diff.components.changed.map(c=>[c.id,'changed']),...diff.components.moved.map(c=>[c.id,'changed'])]);
    clearDiffGroup();diffGroup=new THREE.Group();diffGroup.name='sd-diff-removed';
    const ghost=new THREE.MeshBasicMaterial({color:0xef4444,transparent:true,opacity:.28,depthWrite:false});
    for(const removed of diff.components.removed) {
      const assembly=(base.assemblies || []).find(a=>a.id===removed.assembly);
      const asmGroup=new THREE.Group();assemblySys.applyTransform(asmGroup,assembly?.transform);
      const group=new THREE.Group();assemblySys.applyTransform(group,removed.component.transform);
      try {
        const built=geometrySys.buildGeometry(removed.component.geometry);
        for(const part of built.kind==='single' ? [{geometry:built.geometry}] : built.parts) {
          const mesh=new THREE.Mesh(part.geometry,ghost.clone());
          if(part.position) mesh.position.fromArray(part.position);
          if(part.rotation) mesh.rotation.set(...part.rotation);
          if(part.scale) mesh.scale.fromArray(part.scale);
          group.add(mesh);
        }
      } catch {continue;}
      asmGroup.add(group);diffGroup.add(asmGroup);
    }
    ghost.dispose();
    stage.scene.add(diffGroup);
    if(announce) {modes.applyAppearance();syncChrome();onEvent({type:'diff',summary:diff.summary});}
    return diff;
  }

  // ------------------------------------------------------------ share links
  function shareState() {
    const p=pose();
    return {v:1,m:compiledSpec.scene.renderMode,c:[p.azimuth,p.elevation,p.distance,...p.target,stage.camera.zoom].map(v=>Math.round(v*100)/100),f:rig.state.userFramed?1:0,
      e:Math.round(modes.state.explode*1000)/1000,s:modes.state.selected,x:['xray','section','isolate','ghost','flow','traces'].filter(m=>modes.state[m]),
      g:[...annotationVisibility].filter(([,v])=>!v).map(([g])=>g),h:[...hidden],t:tourState.active?tourState.index:-1};
  }
  function encodeShare(state) {return btoa(unescape(encodeURIComponent(JSON.stringify(state)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
  function decodeShare(text) {return JSON.parse(decodeURIComponent(escape(atob(text.replace(/-/g,'+').replace(/_/g,'/')))));}
  function applyShareState(state) {
    if(!state || state.v!==1) return false;
    if(RENDER_MODES.includes(state.m) && state.m!==compiledSpec.scene.renderMode) engineApi.setRenderMode(state.m);
    animations.clear();applyExplode(state.e ?? 0,{});
    for(const id of state.h || []) engineApi.setComponentVisible(id,false);
    for(const m of ['xray','section','isolate','ghost','flow','traces']) if(m==='traces' || enabled(compiledSpec.interactions[m])) modes.state[m]=(state.x || []).includes(m);
    for(const group of state.g || []) engineApi.setAnnotationGroup(group,false);
    if(state.s && hierarchy.componentData.has(state.s)) engineApi.select(state.s);
    if(Array.isArray(state.c)) {
      const [azimuth,elevation,distance,x,y,z,zoom]=state.c;
      rig.setPose({azimuth,elevation,distance,target:[x,y,z]},true);
      if(zoom) {stage.camera.zoom=zoom;stage.camera.updateProjectionMatrix();}
      rig.state.userFramed=!!state.f;
    }
    if(state.t>=0 && tourState.steps.length) engineApi.tour.goTo(state.t,{immediate:true});
    modes.applyAppearance();syncChrome();return true;
  }
  function applyShareFromLocation() {
    const match=/[#&]sd=([A-Za-z0-9_-]+)/.exec(location.hash || '');
    if(!match) return;
    try {applyShareState(decodeShare(match[1]));} catch(error) {console.warn('[spatial-diagram] ignoring malformed share link',error);}
  }
  function writeShareToLocation() {
    const encoded=encodeShare(shareState());
    if(encoded===lastShare) return;
    lastShare=encoded;
    try {history.replaceState(null,'',location.pathname+location.search+'#sd='+encoded);} catch {/* sandboxed frames */}
  }

  // ------------------------------------------------------------ keyboard
  function onKey(event) {
    if(event.metaKey || event.ctrlKey || event.altKey || /^(input|textarea|select)$/i.test(event.target?.tagName || '')) return;
    const key=event.key,actions={
      '1':()=>engineApi.setRenderMode('webgl'),'2':()=>engineApi.setRenderMode('blueprint'),'3':()=>engineApi.setRenderMode('illustration'),
      e:()=>engineApi.explode(modes.state.explode>.5?0:1,{duration:1100}),t:()=>engineApi.toggleMode('traces'),
      x:()=>engineApi.toggleMode('xray'),s:()=>engineApi.toggleMode('section'),i:()=>engineApi.toggleMode('isolate'),g:()=>engineApi.toggleMode('ghost'),
      o:()=>engineApi.toggleMode('flow'),m:()=>engineApi.toggleMode('measure'),f:()=>modes.state.selected && engineApi.focus(modes.state.selected),
      r:()=>engineApi.resetView(),p:()=>engineApi._toggleTree?.(),'?':()=>engineApi._toggleHelp?.(),
      '[':()=>cycleSelection(-1),']':()=>cycleSelection(1),
      ArrowRight:()=>tourState.active && engineApi.tour.next(),ArrowLeft:()=>tourState.active && engineApi.tour.prev(),
      Escape:()=>{if(tourState.active) engineApi.tour.stop();else if(modes.state.measure) engineApi.clearMeasurements();else engineApi.select(null);engineApi._closeMenus?.();}
    };
    const action=actions[key] || actions[key.toLowerCase?.()];
    if(!action) return;
    event.preventDefault();
    try {action();} catch(error) {engineApi._toast?.(error.message);}
  }

  function cycleSelection(direction) {
    const ids=[...hierarchy.componentData.keys()].filter(id=>hierarchy.componentNodes.get(id).visible && hierarchy.componentData.get(id).spec.selectable!==false);
    if(!ids.length) return;
    const index=ids.indexOf(modes.state.selected);
    engineApi.select(ids[(index+direction+ids.length)%ids.length]);
  }

  // ------------------------------------------------------------ tour
  function applyTourStep(step,opts={}) {
    const immediate=opts.immediate || reduceMotion;
    if(step.renderMode && step.renderMode!==compiledSpec.scene.renderMode) engineApi.setRenderMode(step.renderMode);
    for(const m of ['xray','section','isolate','ghost','flow','traces']) if(step.modes[m]!==undefined) modes.state[m]=!!step.modes[m] && (m==='traces' || enabled(compiledSpec.interactions[m]));
    if(step.section) configureSection(step.section.axis || modes.state.sectionAxis,step.section.position ?? .5);
    modes.state.highlight=new Set(step.highlight || []);modes.state.highlightGhost=!step._instruction;
    if(step.select!==undefined && step.select!==null) engineApi.select(step.select);
    else if(step.select===null && !opts.keepSelection) engineApi.select(null);
    if(step.annotationGroups) for(const [group,visible] of Object.entries(step.annotationGroups)) engineApi.setAnnotationGroup(group,visible);
    if(typeof step.explode==='number') engineApi.explode(step.explode,{duration:immediate?0:step.duration,immediate});
    else if(step.explode && typeof step.explode==='object') for(const [assemblyId,amount] of Object.entries(step.explode)) engineApi.explode(amount,{assemblyId,duration:immediate?0:step.duration,immediate});
    if(step._instruction) applyInstruction(step._instruction,immediate);
    const camera=step.camera;
    if(camera==='auto' || !camera) {rig.state.userFramed=false;if(compiledSpec.scene.renderMode!=='blueprint' && !opts.keepOrientation) {const o={azimuth:compiledSpec.scene.camera.azimuth,elevation:compiledSpec.scene.camera.elevation};rig.setPose(o,immediate);}}
    else if(camera.focus) engineApi.focus(camera.focus);
    else {
      rig.setPose(compiledSpec.scene.renderMode==='blueprint'?{target:camera.target,distance:camera.distance}:camera,immediate);
      rig.state.userFramed=camera.distance!=null || camera.target!=null;
    }
    if(immediate) {applyFollow(true);rig.update();}
    modes.applyAppearance();modes.updateFlow(0);refreshLinks();syncChrome();
  }

  function applyInstruction(instruction,immediate) {
    for(const [id,node] of hierarchy.componentNodes) node.visible=!hidden.has(id) && instruction.visible.has(id);
    const adds=new Set(instruction.adds);
    assemblySys.applyExplode(hierarchy,0,{stagger:false,componentIds:new Set(instruction.visible)});
    if(adds.size) {
      assemblySys.applyExplode(hierarchy,.6,{stagger:false,componentIds:adds});
      animations.set('instruction',{from:.6,to:0,start:performance.now(),duration:immediate?0:1100,componentIds:adds,stagger:false,easing:'ease-out'});
    }
    poseVersion++;
  }

  function instructionTourSteps() {
    const steps=deriveInstructionSteps(hierarchy.componentData);
    return steps.map((step,index)=>({id:`instruction-${index+1}`,title:`Step ${index+1}`,caption:step.title,camera:'auto',explode:undefined,modes:{traces:false},highlight:step.adds,select:null,annotationGroups:null,duration:1100,
      _instruction:{visible:new Set([...step.placed,...step.adds]),adds:step.adds}}));
  }

  const tour={
    get steps() {return tourState.steps.map(s=>({...s}));},
    get index() {return tourState.index;},
    get active() {return tourState.active;},
    get kind() {return tourState.kind;},
    start(source) {
      const instructions=source==='instructions';
      const steps=Array.isArray(source) ? normalizeTourSteps({steps:source}) : instructions ? instructionTourSteps() : normalizeTourSteps(compiledSpec.tour);
      if(!steps.length) throw new Error(instructions ? 'This scene has no movable parts to sequence.' : 'This scene has no tour steps.');
      if(!tourState.active) tourState.saved={explode:modes.state.explode,state:{...modes.state,highlight:new Set(modes.state.highlight)},visible:[...hierarchy.componentNodes].map(([id,n])=>[id,n.visible])};
      tourState.steps=steps;tourState.kind=instructions?'instructions':'tour';tourState.active=true;tourState.index=-1;
      tour.goTo(0);onEvent({type:'tour:start',kind:tourState.kind,steps:steps.length});return engineApi;
    },
    goTo(index,opts={}) {
      if(!tourState.active) {tourState.steps=normalizeTourSteps(compiledSpec.tour);if(!tourState.steps.length) return engineApi;tourState.active=true;tourState.kind='tour';}
      const clamped=Math.max(0,Math.min(tourState.steps.length-1,index));
      tourState.index=clamped;applyTourStep(tourState.steps[clamped],opts);
      engineApi._showTour?.(tourState);onEvent({type:'tour:step',index:clamped,id:tourState.steps[clamped].id});
      return engineApi;
    },
    next() {if(tourState.index<tourState.steps.length-1) tour.goTo(tourState.index+1);else if(compiledSpec.tour?.loop) tour.goTo(0);return engineApi;},
    prev() {if(tourState.index>0) tour.goTo(tourState.index-1);return engineApi;},
    stop() {
      if(!tourState.active) return engineApi;
      const saved=tourState.saved;tourState.active=false;tourState.index=-1;animations.delete('instruction');
      if(saved) {
        for(const [id,visible] of saved.visible) {const node=hierarchy.componentNodes.get(id);if(node) node.visible=visible;}
        modes.state.highlight=new Set();
        for(const m of ['xray','section','isolate','ghost','flow','traces']) modes.state[m]=saved.state[m];
        applyExplode(modes.state.explode,{});
      }
      tourState.steps=normalizeTourSteps(compiledSpec.tour);tourState.kind='tour';
      modes.applyAppearance();refreshLinks();syncChrome();engineApi._showTour?.(tourState);onEvent({type:'tour:stop'});
      return engineApi;
    },
    // Scroll-driven embeds: fractional step index; camera/explode interpolate between neighbors.
    setProgress(progress) {
      if(!tourState.steps.length) tourState.steps=normalizeTourSteps(compiledSpec.tour);
      const steps=tourState.steps;if(!steps.length) return engineApi;
      const p=Math.max(0,Math.min(steps.length-1,progress)),i=Math.floor(p),f=p-i,a=steps[i],b=steps[Math.min(i+1,steps.length-1)];
      if(!tourState.active || tourState.index!==i) {tourState.active=true;tourState.index=i;applyTourStep({...a,explode:undefined,camera:a.camera},{immediate:true});engineApi._showTour?.(tourState);}
      const ea=typeof a.explode==='number'?a.explode:modes.state.explode,eb=typeof b.explode==='number'?b.explode:ea;
      animations.clear();applyExplode(lerpNumber(ea,eb,f),{});
      const ca=typeof a.camera==='object' && a.camera?.azimuth!=null ? a.camera : null,cb=typeof b.camera==='object' && b.camera?.azimuth!=null ? b.camera : ca;
      if(ca && cb && compiledSpec.scene.renderMode!=='blueprint') rig.setPose({azimuth:lerpAngle(ca.azimuth,cb.azimuth,f),elevation:lerpNumber(ca.elevation ?? 28,cb.elevation ?? 28,f)},true);
      applyFollow(true);rig.update();
      return engineApi;
    }
  };

  // ------------------------------------------------------------ public API
  const engineApi={
    version:ENGINE_VERSION,
    loadSpec,tour,
    getSpec:()=>JSON.parse(JSON.stringify(compiledSpec)),
    getState:()=>({renderMode:compiledSpec.scene.renderMode,camera:{...pose(),zoom:stage.camera.zoom,projection:stage.camera.isOrthographicCamera?'orthographic':'perspective'},modes:{...modes.state,highlight:[...modes.state.highlight],diff:Object.fromEntries(modes.state.diff)},explode:Object.fromEntries(explodeStates),annotationGroups:Object.fromEntries(annotationVisibility),hidden:[...hidden],tour:{active:tourState.active,index:tourState.index,kind:tourState.kind},measurements:measurements.map(m=>({text:m.text,distance:m.distance}))}),
    setRenderMode(mode) {
      if(!RENDER_MODES.includes(mode)) throw new Error('Unknown render mode: '+mode);
      if(compiledSpec.scene.renderMode!==mode) engineApi.updateSpec({scene:{renderMode:mode}});
      onEvent({type:'render:mode',mode});return engineApi;
    },
    setAnnotationStyle(style) {if(!['card','balloon'].includes(style)) throw new Error('Unknown annotation style: '+style);return engineApi.updateSpec({scene:{annotationStyle:style}});},
    setLabelLayout(layout) {if(!['free','margins'].includes(layout)) throw new Error('Unknown label layout: '+layout);return engineApi.updateSpec({scene:{labelLayout:layout}});},
    updateSpec(patch) {return loadSpec(deepMerge(engineApi.getSpec(),patch),{preserveState:true});},
    patchComponents(updates) {
      const next=engineApi.getSpec(),byId=new Map(updates.map(update=>[update.id,update]));
      for(const assembly of next.assemblies) assembly.components=assembly.components.map(component=>{
        if(!byId.has(component.id)) return component;
        const merged=deepMerge(component,byId.get(component.id));byId.delete(component.id);return merged;
      });
      if(byId.size) throw new Error('Unknown component IDs: '+[...byId.keys()].join(', '));
      return loadSpec(next,{preserveState:true});
    },
    explode(amount,opts={}) {
      const target=snapStop(Math.max(0,Math.min(1,amount))),key=opts.assemblyId || '*';
      if(opts.assemblyId && !hierarchy.assemblyNodes.has(opts.assemblyId)) throw new Error('Unknown assembly: '+opts.assemblyId);
      if(key==='*') {animations.delete('*');animations.delete('subtree');for(const k of [...animations.keys()]) if(hierarchy.assemblyNodes.has(k)) animations.delete(k);}
      else animations.delete(key);
      peekTarget=null;
      const from=opts.assemblyId ? explodeStates.get(opts.assemblyId)?.amount || 0 : modes.state.explode;
      if(opts.immediate || reduceMotion) applyExplode(target,opts);
      else animations.set(key,{...opts,from,to:target,start:performance.now(),duration:opts.duration ?? 900});
      onEvent({type:'explode',amount:target});
    },
    // Local explode: separate the semantic children of `id` (or of its parent for a leaf).
    explodeSubtree(id,amount) {
      const data=hierarchy.componentData.get(id);if(!data) throw new Error('Unknown component: '+id);
      let root=id,members=assemblySys.descendantsOf(hierarchy,id);
      if(!members.size && data.parent && hierarchy.componentData.has(data.parent)) {root=data.parent;members=assemblySys.descendantsOf(hierarchy,root);}
      if(!members.size) {engineApi._toast?.('Nothing nested under this part to explode.');return null;}
      const current=subtree?.root===root ? subtree.amount : 0,target=amount ?? (current>.5?0:1);
      subtree={root,members,amount:current};peekTarget=null;
      animations.delete('subtree');
      animations.set('subtree',{from:current,to:target,start:performance.now(),duration:reduceMotion?0:900,componentIds:members,stagger:true,easing:explodeConfig().easing || 'ease-in-out'});
      const label=hierarchy.componentData.get(root).spec.label || root;
      engineApi._toast?.(target ? `Exploded ${label} · double-click again to reassemble` : `Reassembled ${label}`);
      onEvent({type:'explode:subtree',root,amount:target});return root;
    },
    autoExplode(button) {const target=modes.state.explode>.5?0:1;engineApi.explode(target,{duration:1100});button?.classList.toggle('sd-active',target===1);},
    toggleMode(mode) {
      if(!['xray','section','isolate','ghost','flow','traces','measure'].includes(mode)) throw new Error('Unknown mode: '+mode);
      if(mode!=='traces' && !enabled(compiledSpec.interactions[mode])) return;
      modes.state[mode]=!modes.state[mode];
      if(['isolate','ghost'].includes(mode) && modes.state[mode] && !modes.state.selected) {
        modes.state[mode]=false;engineApi._toast?.('Select a component first.');
      }
      if(mode==='measure') {pendingMeasure=null;engineApi._toast?.(modes.state.measure?'Measure: click two points (anchors snap). Esc clears.':'Measure off');stage.renderer.domElement.style.cursor=modes.state.measure?'crosshair':'default';}
      if(mode==='traces') traceCache.version=-1;
      modes.applyAppearance();modes.updateFlow(0);syncChrome();onEvent({type:'mode',mode,enabled:modes.state[mode]});
    },
    clearMeasurements() {measurements=[];pendingMeasure=null;syncChrome();},
    getMeasurements() {return measurements.map(m=>({text:m.text,distance:m.distance,from:m.a.anchor || m.a.id,to:m.b.anchor || m.b.id}));},
    select(id) {
      const info=id?engineApi.inspect(id):null;modes.state.selected=info?id:null;
      modes.applyAppearance();if(compiledSpec.interactions.inspect) engineApi._showInspect?.(info);
      refreshLinks();engineApi._announce?.(info ? `Selected ${info.label}` : 'Selection cleared');
      onEvent({type:'select',id:modes.state.selected});return info;
    },
    inspect(id) {
      const data=hierarchy.componentData.get(id);if(!data) return null;
      const children=[...hierarchy.componentData].filter(([,d])=>d.parent===id).map(([childId,d])=>({id:childId,label:d.spec.label || childId}));
      const parent=data.parent && hierarchy.componentData.get(data.parent);
      const balloon=annotationItems.find(item=>item.component===id && item.number!=null);
      return {id,label:data.spec.label || id,assembly:data.assemblySpec.id,parent:data.parent,parentLabel:parent?.spec.label || data.parent || null,
        fidelity:data.spec.fidelity || data.assemblySpec.fidelity || compiledSpec.scene.fidelity,
        properties:{geometry:data.spec.geometry.kind,material:typeof data.spec.material==='string'?data.spec.material:data.spec.material?.preset || 'custom',role:data.spec.properties?.role || '—',...data.spec.properties},
        anchors:Object.keys(data.spec.anchors),explodeVector:data.explodeVector,explodeOrder:data.order,children,item:balloon?.number ?? null};
    },
    getTree() {
      const nodes=new Map([...hierarchy.componentData].map(([id,d])=>[id,{id,label:d.spec.label || id,kind:'component',assembly:d.assemblySpec.id,visible:!hidden.has(id),children:[]}]));
      const roots=[];
      for(const [id,d] of hierarchy.componentData) {const parent=d.parent && nodes.get(d.parent);(parent ? parent.children : roots).push(nodes.get(id));}
      return (compiledSpec.assemblies || []).map(a=>({id:a.id,label:a.label || a.id,kind:'assembly',children:roots.filter(n=>n.assembly===a.id)}));
    },
    setComponentVisible(id,visible) {
      const node=hierarchy.componentNodes.get(id);if(!node) throw new Error('Unknown component: '+id);
      if(visible) hidden.delete(id);else hidden.add(id);
      node.visible=!!visible && hierarchy.componentData.get(id).spec.visible!==false;
      if(!visible && modes.state.selected===id) engineApi.select(null);
      computeFrameBoxes();poseVersion++;modes.updateConnectors();engineApi._syncTree?.();return engineApi;
    },
    focus(id) {
      const node=hierarchy.componentNodes.get(id);if(!node) return;
      const box=new THREE.Box3().setFromObject(node),o=currentOrientation();
      const fit=fitCamera(stage.camera,box,1.9,o.azimuth,o.elevation);
      rig.setPose({target:fit.target,distance:Math.max(fit.distance,8)});
      if(stage.camera.isOrthographicCamera && fit.zoom) {stage.camera.zoom=fit.zoom;stage.camera.updateProjectionMatrix();}
      rig.state.userFramed=true;
    },
    resetView() {frameDefault();engineApi._toast?.('View reset');},
    setCamera(newPose,immediate) {
      rig.setPose(compiledSpec.scene.renderMode==='blueprint'?{...newPose,azimuth:45,elevation:ISO_ELEVATION}:newPose,immediate);
      if(newPose.distance!=null || newPose.target) rig.state.userFramed=true;
    },
    setSectionAxis(axis,position=.5) {if(!['x','y','z'].includes(axis)) throw new Error('Invalid section axis.');configureSection(axis,position);},
    setAnnotationGroup(group,visible) {annotationVisibility.set(group,visible);annotationSys.setGroupVisibility(annotationItems,group,visible);syncChrome();},
    validate() {return {structural:validateSceneSpec(compiledSpec),audits:auditScene(compiledSpec,{partBounds:geometrySys.partBounds}),layout:annotationSys.auditLayout(annotationItems,container.clientWidth,container.clientHeight).filter(i=>i.code==='annotation:overlap')};},
    // Rendered-view audit at one or more explode amounts (default: assembled and exploded).
    auditVisual(opts={}) {
      const amounts=opts.explode!==undefined ? [].concat(opts.explode) : enabled(compiledSpec.interactions.explode) ? [0,1] : [modes.state.explode];
      const saved={explode:modes.state.explode,pose:pose(),zoom:stage.camera.zoom,framed:rig.state.userFramed,anim:new Map(animations)};
      animations.clear();
      const width=container.clientWidth,height=container.clientHeight,rect=container.getBoundingClientRect(),results=[];
      const annotated=new Set(annotationItems.map(item=>item.component).filter(Boolean));
      try {
        for(const amount of amounts) {
          applyExplode(amount,{});if(followEnabled()) applyFollow(true);rig.update();
          for(let pass=0;pass<2;pass++) {stage.camera.updateMatrixWorld();updateAnnotations({camera:stage.camera,width,height,occupied:chromeRects(),forceOcclusion:true,traces:traceSegments(),details:detailLayout(stage.camera,width,height,topInset()),partsList:partsListConfig(annotationItems)});}
          const collapsed=annotationItems.filter(item=>item.g.style.display==='none' && item.occluded).length;
          const result=visualAudit.run({hierarchy,camera:stage.camera,width,height,items:annotationItems,spec:compiledSpec,explode:amount,renderMode:compiledSpec.scene.renderMode,collapsed,annotatedComponents:annotated,
            pickAt:(x,y)=>picker.pickAt(rect.left+x,rect.top+y)?.componentId || null,layoutIssues:annotationSys.auditLayout(annotationItems,width,height)});
          results.push(result);
        }
      } finally {
        applyExplode(saved.explode,{});rig.setPose(saved.pose,true);stage.camera.zoom=saved.zoom;stage.camera.updateProjectionMatrix();rig.state.userFramed=saved.framed;rig.update();
        for(const [key,value] of saved.anim) animations.set(key,value);
        updateOverlay();renderFrame();
      }
      const all=results.flatMap(r=>r.issues);
      return {scene:compiledSpec.scene.id,results,summary:{warnings:all.filter(i=>i.level==='warning').length,infos:all.filter(i=>i.level==='info').length}};
    },
    compare(previousSpec) {
      const errors=validateSceneSpec(previousSpec).filter(i=>i.level==='error');
      if(errors.length) throw new Error('Comparison spec is invalid:\n'+errors.map(i=>i.message).join('\n'));
      const diff=applyDiff(normalizeSpec(previousSpec));engineApi._showDiff?.(diff);return diff;
    },
    clearDiff() {diffState=null;clearDiffGroup();modes.state.diff=new Map();modes.applyAppearance();engineApi._showDiff?.(null);syncChrome();},
    getShareState:shareState,
    applyShareState,
    shareURL() {return location.href.split('#')[0]+'#sd='+encodeShare(shareState());},
    async exportPNG(opts={}) {
      if(opts.figure || opts.widthMm || opts.scale || opts.width) {
        const dims=figureDims(opts),dpi=opts.dpi || 300,scale=opts.scale || (dims.widthMm ? dims.widthMm/25.4*dpi/dims.width : 1);
        const panel=renderPanel({width:dims.width,height:dims.height,camera:dims.widthMm || opts.width ? undefined : 'current',orientation:currentOrientation(),annotations:opts.annotations,traces:modes.state.traces,pixelRatio:scale,heading:opts.heading});
        const url=(await panelToCanvas(panel,scale)).toDataURL('image/png');
        download(url,`${compiledSpec.scene.id}.png`,'image/png',opts);engineApi._toast?.('PNG captured');return url;
      }
      stage.resize(container.clientWidth,container.clientHeight);rig.update();modes.updateFlow(0);updateOverlay();renderFrame();
      const source=stage.renderer.domElement,canvas=document.createElement('canvas');
      canvas.width=source.width;canvas.height=source.height;
      const context=canvas.getContext('2d');
      if(isVector(compiledSpec.scene.renderMode)) {
        context.drawImage(await loadImage(svgDataUrl(engineApi.exportSVG({...opts,download:false}))),0,0,canvas.width,canvas.height);
      } else context.drawImage(source,0,0);
      if(!isVector(compiledSpec.scene.renderMode) && opts.annotations!==false) {
        const svg=overlaySvg.cloneNode(true),width=container.clientWidth,height=container.clientHeight;
        svg.setAttribute('xmlns','http://www.w3.org/2000/svg');svg.setAttribute('width',String(width));svg.setAttribute('height',String(height));svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
        context.drawImage(await loadImage(svgDataUrl(new XMLSerializer().serializeToString(svg))),0,0,canvas.width,canvas.height);
      }
      const url=canvas.toDataURL('image/png');download(url,`${compiledSpec.scene.id}.png`,'image/png',opts);
      engineApi._toast?.('PNG captured');return url;
    },
    // Vector export of the active Blueprint/Illustration view. Journal presets:
    // {figure:'single-column'|'double-column'|..., fontPt, heightMm} size the SVG in millimetres.
    exportSVG(opts={}) {
      const mode=compiledSpec.scene.renderMode;
      if(!isVector(mode)) throw new Error('Switch to Blueprint or Illustration to export vector geometry.');
      stage.resize(container.clientWidth,container.clientHeight);rig.update();modes.updateFlow(0);
      const dims=figureDims(opts);
      const panel=renderPanel({mode,width:dims.width,height:dims.height,camera:dims.widthMm || opts.width ? undefined : 'current',orientation:currentOrientation(),
        annotations:opts.annotations,traces:opts.traces ?? modes.state.traces,measurements:true,heading:opts.heading ?? mode==='blueprint',hiddenLines:opts.hiddenLines});
      if(dims.widthMm) {panel.svg.setAttribute('width',`${dims.widthMm}mm`);panel.svg.setAttribute('height',`${Math.round(dims.heightMm*10)/10}mm`);}
      const svg=blueprint.serializeElement(panel.svg);
      download(svg,`${compiledSpec.scene.id}${opts.figure?'-'+opts.figure:''}.svg`,'image/svg+xml',opts);
      return svg;
    },
    // Multi-panel figure. panels: [{explode, caption, view, orientation, mode, highlight, hidden}]
    async exportFigure(opts={}) {
      const mode=opts.mode || compiledSpec.scene.renderMode,format=opts.format || (isVector(mode)?'svg':'png');
      if(format==='svg' && !isVector(mode) && !(opts.panels || []).every(p=>isVector(p.mode))) throw new Error('SVG figures need Blueprint or Illustration panels; use format "png" for 3D.');
      const panelDims=opts.panelWidth ? {width:opts.panelWidth,height:opts.panelHeight || Math.round(opts.panelWidth*.72)} : {width:Math.round(Math.min(720,container.clientWidth*.5)),height:Math.round(Math.min(720,container.clientWidth*.5)*.72)};
      const specs=opts.panels || [{explode:0,caption:'(a) Assembled'},{explode:1,caption:'(b) Exploded'}];
      const shared=opts.shareFraming ? frameBoxes.exploded : null;
      const panels=specs.map(p=>renderPanel({...panelDims,mode:p.mode || mode,explode:p.explode,orientation:p.orientation || currentOrientation(),view:p.view,highlight:p.highlight,hidden:p.hidden,bounds:shared || undefined,annotations:p.annotations ?? opts.annotations,traces:p.traces ?? (p.explode>0 && modes.state.traces),details:p.details ?? false,partsList:p.partsList ?? false,layout:p.layout}));
      const layout=gridLayout(panels,specs.map(p=>p.caption || ''),opts.columns || Math.min(specs.length,3),16,opts.title?44:16,mode,opts.title);
      const result=await compose(layout,format,opts.scale || 1);
      download(result,`${compiledSpec.scene.id}-figure.${format}`,format==='svg'?'image/svg+xml':'image/png',opts);
      engineApi._toast?.('Figure exported');return result;
    },
    exportComparison(opts={}) {return engineApi.exportFigure({...opts,panels:[{explode:0,caption:opts.captions?.[0] || '(a) Assembled'},{explode:1,caption:opts.captions?.[1] || '(b) Exploded'}]});},
    // Orthographic multi-view sheet with a title block. Default: third-angle TOP/ISO over FRONT/RIGHT.
    // views: any VIEW_PRESETS names, laid out as a 'strip' (one row) or 'grid'; orthographic views share
    // one scale and get overall dimension lines (dimensions:false to omit).
    async exportSheet(opts={}) {
      const mode=opts.mode || (compiledSpec.scene.renderMode==='blueprint'?'blueprint':'illustration'),format=opts.format || 'svg';
      const custom=Array.isArray(opts.views) && opts.views.length,layoutKind=custom ? (opts.layout || 'strip') : 'third-angle';
      for(const view of custom ? opts.views : []) if(!VIEW_PRESETS[view]) throw new Error('Unknown view: '+view+'. Use '+Object.keys(VIEW_PRESETS).join(', ')+'.');
      const names={front:'FRONT',back:'REAR',left:'LEFT SIDE',right:'RIGHT SIDE',top:'TOP',bottom:'BOTTOM',iso:'ISOMETRIC'};
      const list=custom ? opts.views : ['top','iso','front','right'];
      const columns=layoutKind==='strip' ? list.length : layoutKind==='grid' ? (opts.columns || Math.ceil(Math.sqrt(list.length))) : 2;
      const explode=opts.explode ?? 0,box=boundsAtExplode(explode) || frameBoxes.assembled,size3=box.getSize(new THREE.Vector3());
      const flats=list.filter(view=>view!=='iso'),dims=opts.dimensions!==false,pad=dims ? 1.42 : 1.22,gap=18,captionH=22;
      // In a strip with a side view, plan views turn so the length runs across the sheet like the side view.
      const side=list.find(view=>view==='left' || view==='right');
      const orient=view=>(view==='top' || view==='bottom') && side && layoutKind==='strip' ? {azimuth:VIEW_PRESETS[side].azimuth,elevation:VIEW_PRESETS[view].elevation} : VIEW_PRESETS[view];
      const extents=view=>{
        const o=orient(view),az=o.azimuth*Math.PI/180,el=o.elevation*Math.PI/180;
        const back=new THREE.Vector3(Math.cos(el)*Math.sin(az),Math.sin(el),Math.cos(el)*Math.cos(az)),right=new THREE.Vector3().crossVectors(back.clone().negate(),new THREE.Vector3(0,1,0)).normalize(),up=new THREE.Vector3().crossVectors(right,back.clone().negate()).normalize();
        const along=axis=>Math.abs(size3.x*axis.x)+Math.abs(size3.y*axis.y)+Math.abs(size3.z*axis.z);
        return {w:along(right),h:along(up)};
      };
      let pw=opts.panelWidth || (layoutKind==='strip' ? Math.max(260,Math.round(1500/list.length)) : 520),ph=opts.panelHeight || Math.round((layoutKind==='strip'?380:520)*(layoutKind==='strip'?1:.69));
      // One drawing scale for every orthographic view; strip panels are as wide as their view needs.
      let scale=Math.min(...flats.map(view=>(ph/pad)/Math.max(1e-6,extents(view).h)));
      if(layoutKind==='strip') {
        const budget=(opts.width || 1700)-gap*(list.length+1),isoW=list.includes('iso') ? ph*1.4 : 0;
        scale=Math.min(scale,(budget-isoW)/Math.max(1e-6,flats.reduce((sum,view)=>sum+extents(view).w*pad,0)));
      } else scale=Math.min(scale,...flats.map(view=>(pw/pad)/Math.max(1e-6,extents(view).w)));
      if(layoutKind==='strip' && !opts.panelHeight) {const fitted=Math.round(Math.max(...flats.map(view=>extents(view).h))*pad*scale+24);if(fitted<ph) {ph=Math.max(160,fitted);}}
      const widthOf=view=>layoutKind!=='strip' ? pw : view==='iso' ? Math.round(ph*1.4) : Math.max(150,Math.round(extents(view).w*pad*scale));
      const common={height:ph,mode:mode==='blueprint'?'illustration':mode,explode,bounds:box,annotations:false,details:false,partsList:false,footer:false,triad:false};
      const panels=list.map(view=>{
        const w=widthOf(view);
        return renderPanel({...common,width:w,mode,view:view==='iso'?'iso':undefined,orientation:view==='iso'?undefined:orient(view),projection:'orthographic',zoom:view==='iso'?undefined:scale*120/ph,annotations:view==='iso' && opts.annotations!==false,partsList:false,triad:mode==='blueprint' && view==='iso'});
      });
      const top=16;let cursorX=gap;
      const cells=list.map((view,i)=>{
        const col=layoutKind==='third-angle' ? [0,1,0,1][i] : i%columns,row=layoutKind==='third-angle' ? [0,0,1,1][i] : Math.floor(i/columns);
        const x=layoutKind==='strip' ? cursorX : gap+col*(pw+gap);
        if(layoutKind==='strip') cursorX+=panels[i].width+gap;
        return {panel:panels[i],view,x,y:top+row*(ph+gap+captionH),caption:names[view] || view.toUpperCase()};
      });
      const rows=Math.max(...cells.map(c=>Math.round((c.y-top)/(ph+gap+captionH))))+1;
      const width=layoutKind==='strip' ? cursorX : gap+columns*(pw+gap),blockH=96,height=top+rows*(ph+gap+captionH)+blockH+gap;
      const meta=compiledSpec.metadata || {},block=opts.titleBlock || {},units=compiledSpec.scene.units==='unitless'?'':' '+compiledSpec.scene.units;
      const approx=compiledSpec.scene.fidelity==='actual'?'':' (approx.)';
      const fields=[['TITLE',block.title || compiledSpec.scene.title || compiledSpec.scene.id],['DRAWING NO.',block.number || compiledSpec.scene.id.toUpperCase()],['UNITS',compiledSpec.scene.units],['SCALE',block.scale || 'NTS'],
        ['FIDELITY',compiledSpec.scene.fidelity.toUpperCase()],['REV',block.revision || meta.revision || '—'],['DATE',block.date || new Date().toISOString().slice(0,10)],['BY',block.author || meta.author || '—'],['PROJECTION',layoutKind==='third-angle'?'THIRD ANGLE':'ORTHOGRAPHIC'],['SHEET','1 / 1']];
      const size=box.getSize(new THREE.Vector3());
      const layout={cells,width,height,mode,extra:(root,el,palette)=>{
        if(dims) for(const cell of cells) {
          if(cell.view==='iso') continue;
          const camera=cell.panel.camera,cw=cell.panel.width;camera.updateMatrixWorld();
          let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
          for(const x of [box.min.x,box.max.x]) for(const y of [box.min.y,box.max.y]) for(const z of [box.min.z,box.max.z]) {
            const p=new THREE.Vector3(x,y,z).project(camera),sx=cell.x+(p.x*.5+.5)*cw,sy=cell.y+(-p.y*.5+.5)*ph;
            x0=Math.min(x0,sx);x1=Math.max(x1,sx);y0=Math.min(y0,sy);y1=Math.max(y1,sy);
          }
          const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1);
          const extent=axis=>Math.abs(size.x*axis.x)+Math.abs(size.y*axis.y)+Math.abs(size.z*axis.z);
          const g=el('g',{'class':'sd-sheet-dimension',stroke:palette.ink,fill:palette.ink,'font-family':palette.font,'font-size':9.5,'stroke-width':.7});
          const hy=Math.min(cell.y+ph-8,y1+16),vx=Math.min(cell.x+cw-8,x1+16);
          g.appendChild(el('path',{d:`M${x0} ${y1+3}V${hy+4}M${x1} ${y1+3}V${hy+4}M${x0} ${hy}H${x1}M${x0} ${hy-3}l6 3l-6 3M${x1} ${hy-3}l-6 3l6 3`,fill:'none'}));
          g.appendChild(el('text',{x:(x0+x1)/2,y:hy-4,'text-anchor':'middle',stroke:'none'},`${Math.round(extent(right))}${units}${approx}`));
          g.appendChild(el('path',{d:`M${x1+3} ${y0}H${vx+4}M${x1+3} ${y1}H${vx+4}M${vx} ${y0}V${y1}M${vx-3} ${y0}l3 6l3 -6M${vx-3} ${y1}l3 -6l3 6`,fill:'none'}));
          g.appendChild(el('text',{x:vx+12,y:(y0+y1)/2,'text-anchor':'middle',stroke:'none',transform:`rotate(-90 ${vx+12} ${(y0+y1)/2})`},`${Math.round(extent(up))}${units}`));
          root.appendChild(g);
        }
        const y=height-blockH-gap,x=gap,w=width-gap*2,colW=w/5,rowH=blockH/2;
        const g=el('g',{'class':'sd-title-block',fill:palette.ink,'font-family':palette.font});
        g.appendChild(el('rect',{x,y,width:w,height:blockH,fill:'none',stroke:palette.ink,'stroke-width':1.2}));
        fields.forEach(([label,value],i)=>{
          const cx=x+(i%5)*colW,cy=y+Math.floor(i/5)*rowH;
          g.appendChild(el('rect',{x:cx,y:cy,width:colW,height:rowH,fill:'none',stroke:palette.ink,'stroke-width':.6}));
          g.appendChild(el('text',{x:cx+6,y:cy+13,'font-size':7.5,fill:palette.muted,'letter-spacing':.6},label));
          g.appendChild(el('text',{x:cx+6,y:cy+33,'font-size':i===0?13:11,'font-weight':i===0?600:400},String(value).slice(0,i===0?38:30)));
        });
        root.appendChild(g);
      }};
      const result=await compose(layout,format,opts.scale || 1);
      download(result,`${compiledSpec.scene.id}-sheet.${format}`,format==='svg'?'image/svg+xml':'image/png',opts);
      engineApi._toast?.('Drawing sheet exported');return result;
    },
    instructionSteps() {return deriveInstructionSteps(hierarchy.componentData).map(step=>({...step}));},
    // Step-by-step assembly instructions as a multi-panel figure.
    async exportInstructions(opts={}) {
      const mode=opts.mode || compiledSpec.scene.renderMode,format=opts.format || (isVector(mode)?'svg':'png');
      const steps=deriveInstructionSteps(hierarchy.componentData,{maxPerStep:opts.maxPerStep});
      if(!steps.length) throw new Error('This scene has no movable parts to sequence.');
      const pw=opts.panelWidth || 420,ph=opts.panelHeight || 300,offset=opts.offset ?? .45;
      const all=[...hierarchy.componentData.keys()],bounds=boundsAtExplode(offset) || frameBoxes.exploded;
      const panels=steps.map(step=>{
        const visible=new Set([...step.placed,...step.adds]),componentExplode=new Map(all.map(id=>[id,step.adds.includes(id)?offset:0]));
        const snapshot=snapshotScene();
        applyPanelState({componentExplode,hidden:all.filter(id=>!visible.has(id))});
        const traces=step.adds.map(id=>{
          const node=hierarchy.componentNodes.get(id),disp=assemblySys.componentDisplacementWorld(hierarchy,id);
          if(!disp || disp.length()<1e-6) return null;
          const center=new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
          return {id,from:center,to:center.clone().sub(disp),dash:'none',width:1.3,color:mode==='illustration'?'#D55E00':mode==='blueprint'?'#65e7ff':'#ffb35c'};
        }).filter(Boolean);
        restoreScene(snapshot);
        return renderPanel({width:pw,height:ph,mode,componentExplode,hidden:all.filter(id=>!visible.has(id)),highlight:step.adds,highlightGhost:false,orientation:currentOrientation(),bounds,annotations:false,traces,details:false,partsList:false,footer:false});
      });
      const layout=gridLayout(panels,steps.map((s,i)=>`${i+1}. ${s.title}`),opts.columns || 3,16,opts.title===false?16:44,mode,opts.title===false?null:(opts.title || `${compiledSpec.scene.title || compiledSpec.scene.id} — assembly`));
      const result=await compose(layout,format,opts.scale || 1);
      download(result,`${compiledSpec.scene.id}-instructions.${format}`,format==='svg'?'image/svg+xml':'image/png',opts);
      engineApi._toast?.(`Instructions exported (${steps.length} steps)`);return result;
    },
    // One PNG with every state the evaluation loop should look at.
    async exportContactSheet(opts={}) {
      const pw=opts.panelWidth || 480,ph=opts.panelHeight || Math.round(pw*container.clientHeight/Math.max(1,container.clientWidth)),o=currentOrientation();
      const base=compiledSpec.scene.camera,explodable=enabled(compiledSpec.interactions.explode);
      const specs=[
        {mode:'webgl',explode:0,caption:'3D · assembled'},{mode:'webgl',explode:.5,caption:'3D · 50% explode'},{mode:'webgl',explode:explodable?1:0,caption:'3D · exploded'},
        {mode:'blueprint',explode:explodable?1:0,caption:'Blueprint'},{mode:'illustration',explode:explodable?1:0,caption:'Illustration'},
        ...[90,180,270].map(turn=>({mode:'webgl',explode:explodable?1:0,orientation:{azimuth:base.azimuth+turn,elevation:base.elevation},caption:`3D · azimuth +${turn}°`}))
      ];
      if(!explodable) specs.splice(1,1);
      const panels=specs.map(s=>renderPanel({width:pw,height:ph,mode:s.mode,explode:s.explode,orientation:s.orientation || {azimuth:base.azimuth,elevation:base.elevation},traces:s.explode>0 && modes.state.traces,partsList:false}));
      void o;
      const layout=gridLayout(panels,specs.map(s=>s.caption),opts.columns || 3,12,40,'webgl',`${compiledSpec.scene.title || compiledSpec.scene.id} — contact sheet`);
      const url=await compose(layout,'png',opts.scale || 1);
      download(url,`${compiledSpec.scene.id}-contact-sheet.png`,'image/png',opts);return url;
    },
    // WebM recording via MediaRecorder: turntable | explode | tour.
    async exportVideo(opts={}) {
      if(typeof MediaRecorder==='undefined') throw new Error('Video export needs MediaRecorder (Chromium, Firefox or Safari 14+).');
      const kind=opts.kind || 'turntable',duration=Math.max(1000,opts.duration || (kind==='tour'?Math.max(1,tourState.steps.length)*2600:6000)),fps=opts.fps || 30;
      const width=container.clientWidth,height=container.clientHeight,canvas=document.createElement('canvas');
      const scale=Math.min(2,window.devicePixelRatio || 1);canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);
      // Frames are pushed explicitly after each composite so slow (async) frames are never dropped or duplicated.
      const context=canvas.getContext('2d'),stream=canvas.captureStream(0),track=stream.getVideoTracks()[0];
      const type=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported?.(t)) || 'video/webm';
      const recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:opts.bitrate || 6e6}),chunks=[];
      recorder.ondataavailable=e=>{if(e.data.size) chunks.push(e.data);};
      const saved={pose:pose(),explode:modes.state.explode,framed:rig.state.userFramed};
      const finished=new Promise(resolve=>{recorder.onstop=resolve;});
      recorder.start(250);engineApi._toast?.('Recording…');
      if(kind==='tour') engineApi.tour.start();
      const start=performance.now();
      await new Promise(resolve=>{
        const frame=async()=>{
          const t=Math.min(1,(performance.now()-start)/duration);
          if(kind==='turntable') rig.setPose({azimuth:saved.pose.azimuth+360*t},true);
          else if(kind==='explode') {animations.clear();applyExplode(t<.5?smooth(t*2):smooth((1-t)*2),{});}
          else if(kind==='tour') {const index=Math.min(tourState.steps.length-1,Math.floor(t*tourState.steps.length));if(index!==tourState.index) engineApi.tour.goTo(index);}
          if(kind!=='turntable') applyFollow(true);
          rig.update();modes.updateFlow(1/fps);updateOverlay();renderFrame();
          context.fillStyle='#000';context.fillRect(0,0,canvas.width,canvas.height);
          if(isVector(compiledSpec.scene.renderMode)) context.drawImage(await loadImage(svgDataUrl(blueprint.serializeElement(blueprint.svg))),0,0,canvas.width,canvas.height);
          else context.drawImage(stage.renderer.domElement,0,0,canvas.width,canvas.height);
          if(opts.annotations!==false) {
            const svg=overlaySvg.cloneNode(true);svg.setAttribute('xmlns','http://www.w3.org/2000/svg');svg.setAttribute('width',width);svg.setAttribute('height',height);svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
            context.drawImage(await loadImage(svgDataUrl(new XMLSerializer().serializeToString(svg))),0,0,canvas.width,canvas.height);
          }
          track.requestFrame?.();
          if(t<1) requestAnimationFrame(frame);else setTimeout(resolve,120);
        };
        requestAnimationFrame(frame);
      });
      recorder.stop();await finished;
      if(kind==='tour') engineApi.tour.stop();
      if(kind==='explode') applyExplode(saved.explode,{});
      rig.setPose(saved.pose,true);rig.state.userFramed=saved.framed;
      const blob=new Blob(chunks,{type:'video/webm'});
      if(!blob.size) throw new Error('The browser recorded no video frames (is the tab hidden?).');
      download(blob,`${compiledSpec.scene.id}-${kind}.webm`,'video/webm',opts);engineApi._toast?.('Video exported');return blob;
    },
    exportGLB(opts={}) {return new Promise((resolve,reject)=>new THREE.GLTFExporter().parse(hierarchy.root,result=>{
      const blob=new Blob([result],{type:'model/gltf-binary'});
      if(opts.download!==false) downloadUrl(URL.createObjectURL(blob),`${compiledSpec.scene.id}.glb`);
      resolve(blob);
    },reject,{binary:true,onlyVisible:true}));},
    exportJSON(opts={}) {const json=JSON.stringify(compiledSpec,null,2);if(opts.download!==false) downloadUrl(URL.createObjectURL(new Blob([json],{type:'application/json'})),`${compiledSpec.scene.id}.scene.json`);return json;},
    dispose() {
      disposed=true;cancelAnimationFrame(raf);animations.clear();unbindPointer?.();rig?.dispose();modes?.dispose();clearDiffGroup();disposeCaps();caps.dispose();
      assemblySys.disposeHierarchy(hierarchy);stage?.dispose();materials.dispose();geometrySys.clearBoundsCache();overlaySvg?.remove();blueprint.dispose();
      container.classList.remove('sd-blueprint','sd-illustration','sd-light');chrome?.dispose();
    },
    _setHover:id=>setHover(id),_toast:null,_showInspect:null,_explodeSlider:null,_tooltip:null,_showTour:null,_showDiff:null,_syncTree:null,_toggleTree:null,_toggleHelp:null,_closeMenus:null,_announce:null
  };

  function syncChrome() {
    if(!chrome) return;
    const slider=chrome.bar.querySelector('.sd-slider');
    if(slider && document.activeElement!==slider) slider.value=String(Math.round(modes.state.explode*100));
    for(const mode of ['xray','section','isolate','ghost','flow','traces','measure']) {
      const button=chrome.bar.querySelector(`[data-id="${mode}"]`);
      button?.classList.toggle('sd-active',!!modes.state[mode]);
      button?.setAttribute('aria-pressed',String(!!modes.state[mode]));
    }
    for(const mode of RENDER_MODES) {
      const button=chrome.bar.querySelector(`[data-id="render-${mode}"]`),active=compiledSpec.scene.renderMode===mode;
      button?.classList.toggle('sd-active',active);button?.setAttribute('aria-pressed',String(active));
    }
    for(const [id,active] of [['explode-assembled',modes.state.explode<=.001],['explode-exploded',modes.state.explode>=.999]]) {
      const button=chrome.bar.querySelector(`[data-id="${id}"]`);button?.classList.toggle('sd-active',active);button?.setAttribute('aria-pressed',String(active));
    }
    for(const button of chrome.root.querySelectorAll('[data-vector-only]')) button.hidden=!isVector(compiledSpec.scene.renderMode);
    for(const checkbox of chrome.root.querySelectorAll('input[data-group]')) checkbox.checked=annotationVisibility.get(checkbox.dataset.group)!==false;
    chrome.sync?.();
  }

  Object.defineProperty(engineApi,'spec',{get:()=>compiledSpec});
  if(options.spec) loadSpec(options.spec);
  return engineApi;
}

function smooth(t) {return t*t*(3-2*t);}

function downloadUrl(url,filename) {
  const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;document.body.appendChild(anchor);anchor.click();anchor.remove();
  if(url.startsWith('blob:')) setTimeout(()=>URL.revokeObjectURL(url),10000);
}

function deepMerge(base,patch) {
  if(Array.isArray(patch)) return patch;
  if(patch && typeof patch==='object') {
    const out={...(base && typeof base==='object'?base:{})};
    for(const [key,value] of Object.entries(patch)) {if(!['__proto__','prototype','constructor'].includes(key)) out[key]=deepMerge(out[key],value);}
    return out;
  }
  return patch;
}
