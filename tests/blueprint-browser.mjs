// Real offline browser tests for the shared WebGL/SVG scene, exports and editing.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {buildHtml} from '../scripts/export-scene.mjs';
const ROOT=fileURLToPath(new URL('..',import.meta.url));
const flag=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const out=path.resolve(flag('--out',fs.mkdtempSync(path.join(tmpdir(),'spatial-blueprint-'))));fs.mkdirSync(out,{recursive:true});
const puppeteer=(await import(process.env.PUPPETEER_MODULE || 'puppeteer')).default;
const browser=await puppeteer.launch({headless:true,executablePath:process.env.PUPPETEER_EXECUTABLE_PATH || (process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined),args:['--no-sandbox','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const page=await browser.newPage();await page.setViewport({width:1440,height:1000,deviceScaleFactor:1});await page.setOfflineMode(true);
const results={browser:await browser.version(),source:ROOT,checks:[],errors:[],requests:[]};
page.on('pageerror',e=>results.errors.push(String(e)));page.on('request',r=>{if(/^https?:/.test(r.url()))results.requests.push(r.url());});
const save=()=>fs.writeFileSync(path.join(out,'blueprint-results.json'),JSON.stringify(results,null,2));
function check(name,pass,details={}) {pass=!!pass;results.checks.push({name,pass,details});console.log(`${pass?'PASS':'FAIL'} ${name}`);save();}
const frames=(n=2)=>page.evaluate(n=>new Promise(resolve=>{let i=0;const tick=()=>++i>=n?resolve():requestAnimationFrame(tick);requestAnimationFrame(tick);}),n);
const click=id=>page.click(`.sd-toolbar [data-id="${id}"]`);
const lines=()=>page.$eval('.sd-blueprint-geometry',el=>el.innerHTML);
async function openScene(name,mode='webgl') {
  const spec=JSON.parse(fs.readFileSync(path.join(ROOT,'examples',name,'scene.json')));spec.scene.renderMode=mode;delete spec.detailViews;delete spec.tour;
  const json=path.join(out,`${name}.scene.json`),html=path.join(out,`${name}.html`);
  fs.writeFileSync(json,JSON.stringify(spec,null,2));fs.writeFileSync(html,buildHtml(json));
  await page.goto(pathToFileURL(html).href,{waitUntil:'load'});await page.waitForFunction(()=>window.sceneEngine);
  await page.evaluate(()=>sceneEngine.explode(1,{immediate:true,stagger:false}));await frames();
}
try {
  await openScene('gpu-exploded');
  await page.evaluate(()=>{
    const spec=sceneEngine.getSpec();sceneEngine.dispose();
    class Renderer extends THREE.WebGLRenderer {constructor(...args){super(...args);const draw=this.render.bind(this);this.render=(scene,camera)=>{window.probe={scene,camera};draw(scene,camera);};}}
    class Ortho extends THREE.OrthographicCamera {constructor(...args){super(...args);window.ortho=this;}}
    window.sceneEngine=SpatialDiagram.createEngine({THREE:{...THREE,WebGLRenderer:Renderer,OrthographicCamera:Ortho},container:document.querySelector('#stage'),spec});
    sceneEngine.explode(1,{immediate:true,stagger:false});
  });await frames();
  await page.evaluate(()=>{
    sceneEngine.select('gpu');sceneEngine.setAnnotationGroup('thermal',false);
    window.savedView=sceneEngine.getState();window.savedCanvas=document.querySelector('canvas');
    window.savedNode=probe.scene.getObjectByName('gpu');window.savedGeometry=savedNode.children[0].geometry;
  });
  await click('render-blueprint');await frames();
  check('toolbar switches to real SVG geometry',await page.evaluate(()=>sceneEngine.getState().renderMode==='blueprint' && document.querySelectorAll('.sd-blueprint-geometry .sd-blueprint-edge').length>100 && +document.querySelector('.sd-blueprint-drawing').dataset.faceCount>1000));
  check('switch retains canvas, component and mesh identity',await page.evaluate(()=>document.querySelector('canvas')===savedCanvas && probe.scene.getObjectByName('gpu')===savedNode && savedNode.children[0].geometry===savedGeometry));
  check('switch preserves selection, exploded pose and annotation groups',await page.evaluate(()=>{const state=sceneEngine.getState();return state.modes.selected==='gpu' && state.modes.explode===1 && state.annotationGroups.thermal===false && savedNode.position.y===46;}));
  const axes=await page.evaluate(()=>{
    const points=[[0,0,0],[1,0,0],[0,1,0],[0,0,1]].map(a=>{const p=new THREE.Vector3(...a).project(ortho);return [p.x*innerWidth/2,-p.y*innerHeight/2];});
    const vectors=points.slice(1).map(p=>[p[0]-points[0][0],p[1]-points[0][1]]),lengths=vectors.map(p=>Math.hypot(...p));
    return {lengths,angles:vectors.map(p=>Math.atan2(p[1],p[0])*180/Math.PI),ratio:Math.max(...lengths)/Math.min(...lengths),projection:sceneEngine.getState().camera.projection};
  });
  check('true isometric projection has equal axis scale and 30-degree diagonals',axes.projection==='orthographic' && axes.ratio<1.000001 && Math.abs(axes.angles[0]-30)<.0001 && Math.abs(axes.angles[2]-150)<.0001,axes);
  check('render buttons announce the active mode',await page.evaluate(()=>document.querySelector('[data-id="render-blueprint"]').getAttribute('aria-pressed')==='true' && document.querySelector('[data-id="render-webgl"]').getAttribute('aria-pressed')==='false' && !document.querySelector('[data-id="svg"]').hidden));
  await click('render-webgl');await frames();
  check('3D mode restores the exact previous camera',await page.evaluate(()=>JSON.stringify(sceneEngine.getState().camera)===JSON.stringify(savedView.camera)));
  check('WebGL export does not claim vector geometry',await page.evaluate(()=>{try{sceneEngine.exportSVG({download:false});return false;}catch(e){return e.message.includes('Blueprint') && document.querySelector('[data-id="svg"]').hidden;}}));
  await click('render-blueprint');await frames();
  await page.evaluate(()=>sceneEngine.select(null));
  const point=await page.evaluate(()=>{const v=new THREE.Box3().setFromObject(probe.scene.getObjectByName('fan-left')).getCenter(new THREE.Vector3()).project(ortho);return [(v.x*.5+.5)*innerWidth,(-v.y*.5+.5)*innerHeight];});
  await page.mouse.click(...point);await frames();
  const picked=await page.evaluate(()=>sceneEngine.getState().modes.selected);
  check('real pointer selects visible fan through the SVG overlay',picked==='fan-left',{picked,point});
  await page.evaluate(()=>sceneEngine.select('gpu'));
  const beforeExplode=await lines();await page.evaluate(()=>sceneEngine.explode(0,{immediate:true,stagger:false}));await frames();
  check('explode updates the SVG and the shared component transforms',beforeExplode!==await lines() && await page.evaluate(()=>savedNode.position.y===4));
  await page.evaluate(()=>sceneEngine.explode(1,{immediate:true,stagger:false}));await frames();
  await click('xray');await frames();
  check('X-Ray opacity reaches vector groups',await page.evaluate(()=>[...document.querySelectorAll('.sd-blueprint-geometry [data-component-id="fan-left"]')].every(el=>Math.abs(+el.getAttribute('opacity')-.14)<.001)));await click('xray');
  for(const [mode,opacity] of [['ghost',.22],['isolate',.06]]) {
    await click(mode);await frames();
    check(`${mode} reaches vector context opacity`,await page.evaluate(opacity=>{
      const nodes=[...document.querySelectorAll('.sd-blueprint-geometry [data-component-id="pcb"]')];
      return nodes.length>0 && nodes.every(el=>Math.abs(+el.getAttribute('opacity')-opacity)<.001);
    },opacity));await click(mode);
  }
  const uncut=await lines();await click('section');await frames();
  check('section clips actual SVG surfaces',uncut!==await lines() && await page.evaluate(()=>document.querySelectorAll('.sd-blueprint-geometry path').length>0));
  await page.evaluate(()=>sceneEngine.setSectionAxis('z',.4));await frames();await click('section');
  const beforeZoom=await page.evaluate(()=>sceneEngine.getState().camera.zoom),beforeZoomLines=await lines();
  await page.mouse.move(1150,300);await page.mouse.wheel({deltaY:-120});await frames();
  check('orthographic wheel zoom changes vector coordinates',await page.evaluate(before=>sceneEngine.getState().camera.zoom>before,beforeZoom) && beforeZoomLines!==await lines());
  const beforePan=await page.evaluate(()=>sceneEngine.getState().camera);
  await page.mouse.move(1150,300);await page.mouse.down();await page.mouse.move(1200,330,{steps:3});await page.mouse.up();await frames(15);
  const afterPan=await page.evaluate(()=>sceneEngine.getState().camera);
  check('blueprint drag pans while preserving the isometric angles',JSON.stringify(beforePan.target)!==JSON.stringify(afterPan.target) && afterPan.azimuth===45 && Math.abs(afterPan.elevation-35.264389682754654)<1e-8);
  await page.evaluate(()=>sceneEngine.setCamera({azimuth:130,elevation:10,target:[0,30,0]},true));
  check('camera API preserves blueprint isometry',await page.evaluate(()=>sceneEngine.getState().camera.azimuth===45 && sceneEngine.getState().camera.elevation===35.264389682754654));
  await click('reset');await frames(30);
  await page.evaluate(()=>{window.beforePatchState=sceneEngine.getState();sceneEngine.patchComponents([
    {id:'hbm-1',explode:[-22,42,-12]},
    {id:'interposer',opacity:.28}
  ]);sceneEngine.updateSpec({connectors:[{id:'gpu-hbm',from:{anchor:'gpu'},to:{anchor:'hbm-1'},geometry:{kind:'arrow',radius:.4,style:'flow'},material:'emissive-cyan',flow:{enabled:true,speed:1}}],interactions:{flow:true}});});await frames();
  check('live natural-language edit reuses unaffected meshes in Blueprint',await page.evaluate(()=>probe.scene.getObjectByName('gpu')===savedNode && savedNode.children[0].geometry===savedGeometry && sceneEngine.spec.assemblies[0].components.length===38));
  check('live edit preserves blueprint view and interaction state',await page.evaluate(()=>JSON.stringify(sceneEngine.getState().camera)===JSON.stringify(beforePatchState.camera) && sceneEngine.getState().modes.selected==='gpu' && sceneEngine.getState().modes.explode===1 && sceneEngine.getState().annotationGroups.thermal===false));
  check('translucent interposer renders in SVG',await page.evaluate(()=>[...document.querySelectorAll('.sd-blueprint-geometry [data-component-id="interposer"]')].some(el=>+el.getAttribute('opacity')===.28)));
  check('connectors and animated flow are vectors',await page.evaluate(()=>document.querySelectorAll('.sd-blueprint-connectors path[data-connector-id="gpu-hbm"]').length===1 && document.querySelectorAll('.sd-blueprint-pulse').length>0 && document.querySelectorAll('.sd-blueprint-arrow').length===1));
  const flowPoint=await page.$eval('.sd-blueprint-pulse',el=>el.getAttribute('cx')+el.getAttribute('cy'));await frames(3);
  check('flow pulse position animates in SVG',flowPoint!==await page.$eval('.sd-blueprint-pulse',el=>el.getAttribute('cx')+el.getAttribute('cy')));
  const connectorPath=await page.$eval('[data-connector-id="gpu-hbm"]',el=>el.getAttribute('d'));
  await page.evaluate(()=>sceneEngine.explode(0,{immediate:true}));await frames();
  check('vector connectors follow assembly motion',connectorPath!==await page.$eval('[data-connector-id="gpu-hbm"]',el=>el.getAttribute('d')));
  await page.evaluate(()=>{sceneEngine.explode(1,{immediate:true,stagger:false});sceneEngine.setAnnotationGroup('thermal',true);sceneEngine.select(null);});await frames();
  await page.setViewport({width:800,height:600,deviceScaleFactor:1});await frames();
  check('SVG viewport resizes with live annotations',await page.evaluate(()=>document.querySelector('.sd-blueprint-drawing').getAttribute('viewBox')==='0 0 800 600' && [...document.querySelectorAll('.sd-annotation circle')].every(el=>Number.isFinite(+el.getAttribute('cx')))));
  await page.screenshot({path:path.join(out,'gpu-blueprint-compact.png')});
  await page.setViewport({width:1440,height:1000,deviceScaleFactor:1});await frames();
  const exported=await page.evaluate(()=>({svg:sceneEngine.exportSVG({download:false}),bare:sceneEngine.exportSVG({download:false,annotations:false}),json:sceneEngine.exportJSON({download:false})}));
  fs.writeFileSync(path.join(out,'gpu-blueprint.svg'),exported.svg);fs.writeFileSync(path.join(out,'gpu-blueprint-modified.scene.json'),exported.json);fs.writeFileSync(path.join(out,'gpu-blueprint-modified.html'),buildHtml(path.join(out,'gpu-blueprint-modified.scene.json')));
  const svgAudit=await page.evaluate(({svg,bare})=>{
    const doc=new DOMParser().parseFromString(svg,'image/svg+xml');return {errors:doc.querySelectorAll('parsererror').length,paths:doc.querySelectorAll('.sd-blueprint-geometry path').length,images:doc.querySelectorAll('image,foreignObject').length,labels:doc.querySelectorAll('.sd-annotation').length,bareLabels:new DOMParser().parseFromString(bare,'image/svg+xml').querySelectorAll('.sd-annotation').length,finite:![...doc.querySelectorAll('path')].some(p=>/NaN|Infinity/.test(p.getAttribute('d'))),title:doc.querySelector('title')?.textContent};
  },exported);
  check('SVG export is valid, finite and contains vector geometry and labels',svgAudit.errors===0 && svgAudit.paths>100 && svgAudit.images===0 && svgAudit.labels>10 && svgAudit.bareLabels===0 && svgAudit.finite,svgAudit);
  const images=await page.evaluate(async()=>({png:await sceneEngine.exportPNG({download:false}),bare:await sceneEngine.exportPNG({download:false,annotations:false})}));
  for(const [key,url] of Object.entries(images))fs.writeFileSync(path.join(out,`gpu-blueprint-${key}.png`),Buffer.from(url.split(',')[1],'base64'));
  const pngAudit=await page.evaluate(async images=>{
    const read=async src=>{const image=new Image();image.src=src;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height);};
    const [a,b]=await Promise.all([read(images.png),read(images.bare)]);let changed=0,edges=0;
    for(let i=0;i<a.data.length;i+=4){if(Math.abs(a.data[i]-b.data[i])+Math.abs(a.data[i+1]-b.data[i+1])>20)changed++;if(b.data[i]>60&&b.data[i+1]>100)edges++;}
    return {changed,edges,width:a.width,height:a.height,background:Array.from(b.data.slice((150*b.width+150)*4,(150*b.width+150)*4+4))};
  },images);
  check('PNG export rasterizes blueprint geometry and optional labels',pngAudit.changed>1000 && pngAudit.edges>1000 && pngAudit.width===1440 && pngAudit.background[2]>pngAudit.background[0],pngAudit);
  await page.screenshot({path:path.join(out,'gpu-blueprint-modified.png')});
  check('occluded blueprint anchors keep legible label text and dashed leaders',await page.evaluate(()=>{
    const labels=[...document.querySelectorAll('.sd-annotation[data-anchor-occluded="true"]')];
    return labels.length>0 && labels.every(el=>+el.getAttribute('opacity')===1 && el.querySelector('line').getAttribute('stroke-dasharray')==='3 3');
  }));
  check('desktop blueprint labels have no collisions',await page.evaluate(()=>sceneEngine.validate().layout.length===0));
  check('JSON export persists render mode for reopening',JSON.parse(exported.json).scene.renderMode==='blueprint');
  await page.goto(pathToFileURL(path.join(out,'gpu-blueprint-modified.html')).href);await page.waitForFunction(()=>window.sceneEngine);await frames();
  check('exported HTML reopens directly in Blueprint without a network',await page.evaluate(()=>sceneEngine.getState().renderMode==='blueprint' && document.querySelector('.sd-blueprint-geometry path')));
  await page.evaluate(()=>sceneEngine.updateSpec({scene:{camera:{projection:'orthographic'}}}));
  await click('render-webgl');await frames();
  check('camera changes in Blueprint reframe the new 3D projection',await page.evaluate(()=>sceneEngine.getState().camera.projection==='orthographic' && sceneEngine.getState().camera.zoom<1));
  await click('render-blueprint');await frames();
  check('invalid render modes leave the current scene untouched',await page.evaluate(()=>{
    const before=JSON.stringify(sceneEngine.getSpec());try{sceneEngine.setRenderMode('wire');return false;}catch{return JSON.stringify(sceneEngine.getSpec())===before;}
  }));
  for(const name of ['mechanical-pump','data-center-rack']) {
    await openScene(name,'blueprint');await page.screenshot({path:path.join(out,`${name}-blueprint.png`)});
    check(`${name} also renders as SVG`,await page.evaluate(()=>+document.querySelector('.sd-blueprint-drawing').dataset.faceCount>100 && sceneEngine.validate().structural.length===0));
  }
  check('all blueprint scenes run offline',results.requests.length===0,{requests:results.requests});
  check('no uncaught browser errors',results.errors.length===0,{errors:results.errors});
} catch(error){results.fatal=error.stack;console.error(error);process.exitCode=1;}
finally {save();await browser.close();}
if(results.checks.some(c=>!c.pass))process.exitCode=1;
