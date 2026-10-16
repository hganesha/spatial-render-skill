// Public runtime. Scene edits reconcile semantic components without replacing the WebGL stage.
import { normalizeSpec, validateSceneSpec, auditScene, aabbRadius } from './spec-math.js';
import { createMaterialSystem } from './materials.js';
import { createGeometrySystem } from './geometry.js';
import { createAssemblySystem } from './assembly.js';
import { createAnnotationSystem } from './annotations.js';
import { createInteractionSystem } from './interactions.js';
import { createRendererSystem } from './renderer.js';
import { createBlueprintSystem } from './blueprint.js';
import { createUISystem } from './ui.js';

export const ENGINE_VERSION = '1.2.0';

export function createEngine(options) {
  const THREE=options.THREE || globalThis.THREE, container=options.container;
  if(!THREE || !container) throw new Error('SpatialDiagram requires THREE and a container.');
  const onEvent=options.onEvent || (()=>{});
  const materials=createMaterialSystem(THREE), geometrySys=createGeometrySystem(THREE);
  const assemblySys=createAssemblySystem(THREE), annotationSys=createAnnotationSystem(THREE);
  const ix=createInteractionSystem(THREE), rend=createRendererSystem(THREE), ui=createUISystem();
  let stage=null,hierarchy=null,compiledSpec=null,rig=null,picker=null,modes=null,chrome=null;
  let overlaySvg=null,annotationItems=[],updateAnnotations=null,clipPlane=null,unbindPointer=null;
  const blueprint=createBlueprintSystem(THREE,container);
  let webglView=null,blueprintView=null;
  let raf=0,lastT=0,disposed=false;
  const animations=new Map(),explodeStates=new Map(),annotationVisibility=new Map();
  if(getComputedStyle(container).position==='static') container.style.position='relative';
  container.style.overflow='hidden';
  const enabled=value=>!!value && (typeof value!=='object' || value.enabled!==false);

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
    const savedState=preserve && modes ? {...modes.state} : null;
    const savedPose=preserve ? pose() : null;
    const savedZoom=stage?.camera.zoom;
    const modeChanged=!!previous && previous.scene.renderMode!==next.scene.renderMode;
    if(modeChanged && preserve) {
      if(previous.scene.renderMode==='webgl') webglView={pose:savedPose,zoom:savedZoom};
      else blueprintView={pose:savedPose,zoom:savedZoom};
    }
    if(!preserve) {webglView=null;blueprintView=null;}
    const replaceStage=!stage || stageKey(previous)!==stageKey(next);
    const cameraChanged=!!previous && JSON.stringify(previous.scene.camera)!==JSON.stringify(next.scene.camera);
    if(cameraChanged) {webglView=null;blueprintView=null;}
    animations.clear();
    modes?.dispose();
    if(replaceStage) {
      unbindPointer?.();rig?.dispose();assemblySys.disposeHierarchy(hierarchy);stage?.dispose();
      hierarchy=null;stage=rend.createStage(container,next);
    }
    compiledSpec=next;
    hierarchy=assemblySys.buildHierarchy(next,buildParts,hierarchy);
    if(!hierarchy.root.parent) stage.scene.add(hierarchy.root);
    if(!preserve) {explodeStates.clear();annotationVisibility.clear();}
    for(const id of [...explodeStates.keys()]) if(!hierarchy.assemblyNodes.has(id)) explodeStates.delete(id);
    modes=ix.createModeController(hierarchy,materials);
    if(savedState) Object.assign(modes.state,savedState);
    if(!hierarchy.componentData.has(modes.state.selected)) {
      modes.state.selected=null;modes.state.isolate=false;modes.state.ghost=false;
    }
    if(!hierarchy.componentData.has(modes.state.hovered)) modes.state.hovered=null;
    for(const [id,state] of explodeStates) assemblySys.applyExplode(hierarchy,state.amount,{...state,assemblyId:id});
    stage.setProjection(next.scene.renderMode==='blueprint'?'orthographic':next.scene.camera.projection);
    if(replaceStage) {
      const radius=hierarchy.bounds?.getSize(new THREE.Vector3()).length()/2 || 100;
      rig=ix.createOrbitRig(stage.camera,stage.renderer.domElement,{minDistance:radius*.08,maxDistance:radius*24,enabled:next.interactions.orbit});
      bindPointer();
    }
    rig.setCamera(stage.camera);rig.setRotationEnabled(next.scene.renderMode!=='blueprint');
    rig.setEnabled(next.interactions.orbit);
    stage.renderer.domElement.style.opacity=next.scene.renderMode==='blueprint'?'0':'1';
    blueprint.svg.style.display=next.scene.renderMode==='blueprint'?'block':'none';
    container.classList.toggle('sd-blueprint',next.scene.renderMode==='blueprint');
    if(stage.camera.isPerspectiveCamera) {stage.camera.fov=next.scene.camera.fov;stage.camera.updateProjectionMatrix();}
    stage.resize(container.clientWidth,container.clientHeight);
    const bounds=displayBounds();
    if(bounds) {stage.fitShadowCamera(bounds);stage.setGroundY(bounds.min.y);}
    const restoredView=modeChanged && !cameraChanged ? (next.scene.renderMode==='blueprint'?blueprintView:webglView) : null;
    if(restoredView) {rig.setPose(restoredView.pose,true);stage.camera.zoom=restoredView.zoom;stage.camera.updateProjectionMatrix();}
    else if(!preserve || cameraChanged || modeChanged) frameDefault(true);
    else if(replaceStage && savedPose) {rig.setPose(savedPose,true);stage.camera.zoom=savedZoom;stage.camera.updateProjectionMatrix();}
    rig.update();
    picker=ix.createPicker(stage.scene,stage.camera,stage.renderer.domElement);
    clipPlane=new THREE.Plane();
    const sectionConfig=next.interactions.section;
    const sectionChanged=previous && JSON.stringify(previous.interactions.section)!==JSON.stringify(sectionConfig);
    configureSection(!sectionChanged && savedState ? savedState.sectionAxis : sectionConfig?.axis || 'y', !sectionChanged && savedState ? savedState.sectionPosition : .5);
    if(!enabled(sectionConfig)) modes.state.section=false;
    for(const mode of ['xray','isolate','ghost']) if(!next.interactions[mode]) modes.state[mode]=false;
    modes.state.flow=preserve && previous?.interactions.flow===next.interactions.flow ? savedState.flow : !!next.interactions.flow;
    const connectors=modes.buildFlowDots(next.connectors,resolveTarget,con=>materials.buildMaterial(next.materials,con.material || {preset:'emissive-cyan'}));
    if(connectors) stage.scene.add(connectors);
    modes.applyAppearance();
    if(!overlaySvg) overlaySvg=annotationSys.createOverlay(container);
    annotationItems=annotationSys.buildAnnotations(overlaySvg,next);
    for(const [group,visible] of annotationVisibility) annotationSys.setGroupVisibility(annotationItems,group,visible);
    updateAnnotations=annotationSys.updateAnnotations(annotationItems,stage.camera,container.clientWidth,container.clientHeight,resolveTarget,occlusionProbe);
    chrome?.dispose();chrome=ui.buildChrome(container,engineApi);
    if(modes.state.selected && next.interactions.inspect) engineApi._showInspect(engineApi.inspect(modes.state.selected));
    syncChrome();renderFrame();
    if(!preserve) for(const behavior of next.behaviors) if(behavior.autoPlay!==false) {
      engineApi.explode(behavior.amount ?? 1,{assemblyId:behavior.assembly,duration:behavior.duration || 1200,easing:behavior.easing,stagger:behavior.stagger});
    }
    startLoop();
    onEvent({type:preserve?'scene:updated':'scene:loaded',sceneId:next.scene.id,components:hierarchy.componentData.size});
    return engineApi;
  }

  function displayBounds() {
    const positions=new Map([...hierarchy.componentNodes].map(([id,node])=>[id,node.position.clone()]));
    let bounds=assemblySys.computeBounds(hierarchy,false);
    assemblySys.applyExplode(hierarchy,0,{stagger:false});
    const assembled=assemblySys.computeBounds(hierarchy,false);
    if(assembled) bounds=bounds ? bounds.union(assembled) : assembled;
    if(enabled(compiledSpec.interactions.explode)) {
      assemblySys.applyExplode(hierarchy,1,{stagger:false});
      const exploded=assemblySys.computeBounds(hierarchy,false);
      if(exploded) bounds=bounds ? bounds.union(exploded) : exploded;
    }
    for(const [id,position] of positions) hierarchy.componentNodes.get(id).position.copy(position);
    hierarchy.root.updateWorldMatrix(true,true);
    return bounds;
  }

  function frameDefault(immediate=false) {
    const config=compiledSpec.scene.renderMode==='blueprint' ? {...compiledSpec.scene.camera,azimuth:45,elevation:35.264389682754654,framing:'fit-padded',distance:undefined} : compiledSpec.scene.camera;
    if(compiledSpec.scene.renderMode==='blueprint') {rig.setPose({azimuth:45,elevation:35.264389682754654},true);rig.update();}
    if(config.framing==='manual') rig.setPose({...config,distance:config.distance || 300},immediate);
    else {
      const framed=stage.frameBounds(displayBounds(),config.framing==='fit'?1.08:1.14);
      rig.setPose({...config,target:framed.target,distance:config.distance || framed.distance},immediate);
    }
  }

  function resolveTarget(target) {
    if(target?.position) return new THREE.Vector3().fromArray(target.position);
    if(!target?.anchor) return null;
    const ref=target.anchor;
    if(hierarchy.componentData.has(ref)) return assemblySys.componentAnchorWorld(hierarchy,ref);
    const id=[...hierarchy.componentData.keys()].filter(id=>ref.startsWith(id+'.')).sort((a,b)=>b.length-a.length)[0];
    return id ? assemblySys.componentAnchorWorld(hierarchy,id,ref.slice(id.length+1)) : null;
  }

  function occlusionProbe(world,target) {
    const direction=stage.camera.isOrthographicCamera ? stage.camera.getWorldDirection(new THREE.Vector3()) : world.clone().sub(stage.camera.position).normalize();
    const distance=world.distanceTo(stage.camera.position),origin=stage.camera.isOrthographicCamera ? world.clone().addScaledVector(direction,-distance) : stage.camera.position.clone();
    if(distance<1e-3) return false;
    const ref=target?.anchor;
    const ownId=ref && [...hierarchy.componentData.keys()].filter(id=>ref===id || ref.startsWith(id+'.')).sort((a,b)=>b.length-a.length)[0];
    return !!picker.occludedProbe(origin,direction,stage.camera.isOrthographicCamera?distance-1e-3:distance*.9,ownId);
  }

  function bindPointer() {
    const element=stage.renderer.domElement;let down=null;
    const onDown=e=>{down={x:e.clientX,y:e.clientY};};
    const onUp=e=>{
      const start=down;down=null;
      if(!start || Math.hypot(e.clientX-start.x,e.clientY-start.y)>6 || !compiledSpec.interactions.select) return;
      engineApi.select(picker.pickAt(e.clientX,e.clientY)?.componentId || null);
    };
    const onMove=e=>{
      if(down || !compiledSpec.interactions.select) return;
      const id=picker.pickAt(e.clientX,e.clientY)?.componentId || null;
      if(id!==modes.state.hovered) {modes.state.hovered=id;modes.applyAppearance();element.style.cursor=id?'pointer':'default';}
    };
    const onCancel=()=>{down=null;};
    element.addEventListener('pointerdown',onDown);element.addEventListener('pointerup',onUp);
    element.addEventListener('pointermove',onMove);element.addEventListener('pointercancel',onCancel);
    unbindPointer=()=>{element.removeEventListener('pointerdown',onDown);element.removeEventListener('pointerup',onUp);element.removeEventListener('pointermove',onMove);element.removeEventListener('pointercancel',onCancel);};
  }

  function configureSection(axis,position) {
    modes.state.sectionAxis=axis;modes.state.sectionPosition=Math.max(0,Math.min(1,position));
    const bounds=assemblySys.computeBounds(hierarchy,false) || hierarchy.bounds;
    const index=axis==='x'?0:axis==='z'?2:1;
    clipPlane.normal.set(0,0,0).setComponent(index,-1);
    clipPlane.constant=bounds.min.getComponent(index)+(bounds.max.getComponent(index)-bounds.min.getComponent(index))*modes.state.sectionPosition;
    modes.updateSection(clipPlane);
  }

  function applyExplode(amount,opts={}) {
    const config=compiledSpec.interactions.explode;
    const stagger=opts.stagger ?? (typeof config==='object' ? config.autoStagger!==false : true);
    const easing=opts.easing || config?.easing || 'ease-in-out';
    modes.state.explode=amount;
    for(const id of hierarchy.assemblyNodes.keys()) if(!opts.assemblyId || id===opts.assemblyId) {
      explodeStates.set(id,{amount,stagger,easing});
      assemblySys.applyExplode(hierarchy,amount,{stagger,easing,assemblyId:id});
    }
    syncChrome();
  }

  function syncChrome() {
    if(!chrome) return;
    const slider=chrome.bar.querySelector('.sd-slider');
    if(slider && document.activeElement!==slider) slider.value=String(Math.round(modes.state.explode*100));
    for(const mode of ['xray','section','isolate','ghost','flow']) {
      const button=chrome.bar.querySelector(`[data-id="${mode}"]`);
      button?.classList.toggle('sd-active',!!modes.state[mode]);
      button?.setAttribute('aria-pressed',String(!!modes.state[mode]));
    }
    for(const mode of ['webgl','blueprint']) {
      const button=chrome.bar.querySelector(`[data-id="render-${mode}"]`),active=compiledSpec.scene.renderMode===mode;
      button?.classList.toggle('sd-active',active);button?.setAttribute('aria-pressed',String(active));
    }
    const svgButton=chrome.bar.querySelector('[data-id="svg"]');
    if(svgButton) svgButton.hidden=compiledSpec.scene.renderMode!=='blueprint';
    for(const checkbox of chrome.root.querySelectorAll('input[data-group]')) checkbox.checked=annotationVisibility.get(checkbox.dataset.group)!==false;
  }

  function renderFrame() {
    if(compiledSpec.scene.renderMode==='blueprint') blueprint.update(hierarchy,stage.scene,stage.camera,compiledSpec,modes.state);
    else stage.render();
  }

  function startLoop() {
    cancelAnimationFrame(raf);lastT=performance.now();
    const tick=time=>{
      if(disposed) return;
      const dt=Math.min(.05,(time-lastT)/1000);lastT=time;
      for(const [key,animation] of animations) {
        const fraction=Math.min(1,(time-animation.start)/animation.duration);
        applyExplode(animation.from+(animation.to-animation.from)*fraction,animation);
        if(fraction===1) animations.delete(key);
      }
      rig.update();stage.resize(container.clientWidth,container.clientHeight);
      modes.updateFlow(dt);updateAnnotations();renderFrame();raf=requestAnimationFrame(tick);
    };
    raf=requestAnimationFrame(tick);
  }

  const engineApi={
    version:ENGINE_VERSION,
    loadSpec,
    getSpec:()=>JSON.parse(JSON.stringify(compiledSpec)),
    getState:()=>({renderMode:compiledSpec.scene.renderMode,camera:{...pose(),zoom:stage.camera.zoom,projection:stage.camera.isOrthographicCamera?'orthographic':'perspective'},modes:{...modes.state},explode:Object.fromEntries(explodeStates),annotationGroups:Object.fromEntries(annotationVisibility)}),
    setRenderMode(mode) {
      if(!['webgl','blueprint'].includes(mode)) throw new Error('Unknown render mode: '+mode);
      if(compiledSpec.scene.renderMode!==mode) engineApi.updateSpec({scene:{renderMode:mode}});
      onEvent({type:'render:mode',mode});return engineApi;
    },
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
      const target=Math.max(0,Math.min(1,amount)),key=opts.assemblyId || '*';
      if(opts.assemblyId && !hierarchy.assemblyNodes.has(opts.assemblyId)) throw new Error('Unknown assembly: '+opts.assemblyId);
      if(key==='*') animations.clear();else animations.delete(key);
      const from=opts.assemblyId ? explodeStates.get(opts.assemblyId)?.amount || 0 : modes.state.explode;
      if(opts.immediate) applyExplode(target,opts);
      else animations.set(key,{...opts,from,to:target,start:performance.now(),duration:opts.duration || 900});
      onEvent({type:'explode',amount:target});
    },
    autoExplode(button) {const target=modes.state.explode>.5?0:1;engineApi.explode(target,{duration:1100});button?.classList.toggle('sd-active',target===1);},
    toggleMode(mode) {
      if(!['xray','section','isolate','ghost','flow'].includes(mode)) throw new Error('Unknown mode: '+mode);
      if(!enabled(compiledSpec.interactions[mode])) return;
      modes.state[mode]=!modes.state[mode];
      if(['isolate','ghost'].includes(mode) && modes.state[mode] && !modes.state.selected) {
        modes.state[mode]=false;engineApi._toast?.('Select a component first.');
      }
      modes.applyAppearance();modes.updateFlow(0);syncChrome();onEvent({type:'mode',mode,enabled:modes.state[mode]});
    },
    select(id) {
      const info=id?engineApi.inspect(id):null;modes.state.selected=info?id:null;
      modes.applyAppearance();if(compiledSpec.interactions.inspect) engineApi._showInspect?.(info);
      onEvent({type:'select',id:modes.state.selected});return info;
    },
    inspect(id) {
      const data=hierarchy.componentData.get(id);if(!data) return null;
      return {id,label:data.spec.label || id,assembly:data.assemblySpec.id,parent:data.parent,
        fidelity:data.spec.fidelity || data.assemblySpec.fidelity || compiledSpec.scene.fidelity,
        properties:{geometry:data.spec.geometry.kind,material:typeof data.spec.material==='string'?data.spec.material:data.spec.material?.preset || 'custom',role:data.spec.properties?.role || '—',...data.spec.properties},
        anchors:Object.keys(data.spec.anchors),explodeVector:data.explodeVector};
    },
    focus(id) {
      const node=hierarchy.componentNodes.get(id);if(!node) return;
      const box=new THREE.Box3().setFromObject(node),radius=box.getSize(new THREE.Vector3()).length()/2;
      const distance=Math.max(radius/Math.tan((stage.camera.fov || 38)*Math.PI/360)*1.6,8);
      if(stage.camera.isOrthographicCamera) stage.frameBounds(box,1.3);
      rig.setPose({target:box.getCenter(new THREE.Vector3()).toArray(),distance});
    },
    resetView() {frameDefault();engineApi._toast?.('View reset');},
    setCamera(newPose,immediate) {
      rig.setPose(compiledSpec.scene.renderMode==='blueprint'?{...newPose,azimuth:45,elevation:35.264389682754654}:newPose,immediate);
    },
    setSectionAxis(axis,position=.5) {if(!['x','y','z'].includes(axis)) throw new Error('Invalid section axis.');configureSection(axis,position);},
    setAnnotationGroup(group,visible) {annotationVisibility.set(group,visible);annotationSys.setGroupVisibility(annotationItems,group,visible);syncChrome();},
    validate() {return {structural:validateSceneSpec(compiledSpec),audits:auditScene(compiledSpec,{partBounds:geometrySys.partBounds}),layout:annotationSys.auditLayout(annotationItems)};},
    async exportPNG(opts={}) {
      stage.resize(container.clientWidth,container.clientHeight);rig.update();modes.updateFlow(0);updateAnnotations();renderFrame();
      const source=stage.renderer.domElement,canvas=document.createElement('canvas');
      canvas.width=source.width;canvas.height=source.height;
      const context=canvas.getContext('2d');
      if(compiledSpec.scene.renderMode==='blueprint') {
        const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(engineApi.exportSVG({...opts,download:false}));
        await image.decode();context.drawImage(image,0,0,canvas.width,canvas.height);
      } else context.drawImage(source,0,0);
      if(compiledSpec.scene.renderMode!=='blueprint' && opts.annotations!==false) {
        const svg=overlaySvg.cloneNode(true),width=container.clientWidth,height=container.clientHeight;
        svg.setAttribute('xmlns','http://www.w3.org/2000/svg');svg.setAttribute('width',String(width));svg.setAttribute('height',String(height));svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
        const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(svg));
        await image.decode();context.drawImage(image,0,0,canvas.width,canvas.height);
      }
      const url=canvas.toDataURL('image/png');if(opts.download!==false) downloadUrl(url,`${compiledSpec.scene.id}.png`);
      engineApi._toast?.('PNG captured');return url;
    },
    exportSVG(opts={}) {
      if(compiledSpec.scene.renderMode!=='blueprint') throw new Error('Switch to Blueprint to export vector geometry.');
      stage.resize(container.clientWidth,container.clientHeight);rig.update();modes.updateFlow(0);updateAnnotations();renderFrame();
      const svg=blueprint.serialize(compiledSpec,opts.annotations===false?null:overlaySvg);
      if(opts.download!==false) downloadUrl(URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})),`${compiledSpec.scene.id}.svg`);
      return svg;
    },
    exportGLB(opts={}) {return new Promise((resolve,reject)=>new THREE.GLTFExporter().parse(hierarchy.root,result=>{
      const blob=new Blob([result],{type:'model/gltf-binary'});
      if(opts.download!==false) downloadUrl(URL.createObjectURL(blob),`${compiledSpec.scene.id}.glb`);
      resolve(blob);
    },reject,{binary:true,onlyVisible:true}));},
    exportJSON(opts={}) {const json=JSON.stringify(compiledSpec,null,2);if(opts.download!==false) downloadUrl(URL.createObjectURL(new Blob([json],{type:'application/json'})),`${compiledSpec.scene.id}.scene.json`);return json;},
    dispose() {
      disposed=true;cancelAnimationFrame(raf);animations.clear();unbindPointer?.();rig?.dispose();modes?.dispose();
      assemblySys.disposeHierarchy(hierarchy);stage?.dispose();materials.dispose();geometrySys.clearBoundsCache();overlaySvg?.remove();blueprint.dispose();container.classList.remove('sd-blueprint');chrome?.dispose();
    },
    _toast:null,_showInspect:null,_explodeSlider:null
  };
  Object.defineProperty(engineApi,'spec',{get:()=>compiledSpec});
  if(options.spec) loadSpec(options.spec);
  return engineApi;
}

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
