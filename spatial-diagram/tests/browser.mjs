// Run with `npm run test:browser -- --out /absolute/separate/output/directory`.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {buildHtml} from '../scripts/export-scene.mjs';
const ROOT=fileURLToPath(new URL('..',import.meta.url));
const flag=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const out=path.resolve(flag('--out',fs.mkdtempSync(path.join(tmpdir(),'spatial-diagram-test-'))));
fs.mkdirSync(out,{recursive:true});
const puppeteer=(await import(process.env.PUPPETEER_MODULE || 'puppeteer')).default;
const executablePath=process.env.PUPPETEER_EXECUTABLE_PATH || (process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined);
const browser=await puppeteer.launch({headless:true,executablePath,args:['--no-sandbox','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const page=await browser.newPage();
await (await browser.target().createCDPSession()).send('Browser.setDownloadBehavior',{behavior:'deny'});
await page.setViewport({width:1440,height:900,deviceScaleFactor:1});await page.setOfflineMode(true);
const results={browser:await browser.version(),source:ROOT,checks:[],errors:[],requests:[]};
page.on('pageerror',e=>results.errors.push(String(e)));
page.on('request',r=>{if(/^https?:/.test(r.url()))results.requests.push(r.url());});
function check(name,pass,details={}) {
  results.checks.push({name,pass,details});console.log(`${pass?'PASS':'FAIL'} ${name}`);
  fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(results,null,2));
}
const frames=(n=2)=>page.evaluate(n=>new Promise(resolve=>{let count=0;const tick=()=>++count>=n?resolve():requestAnimationFrame(tick);requestAnimationFrame(tick);}),n);
const click=id=>page.click(`.sd-toolbar [data-id="${id}"]`);
async function openScene(name) {
  const source=path.join(ROOT,'examples',name,'scene.json'),target=path.join(out,`${name}.html`);
  fs.writeFileSync(target,buildHtml(source));
  await page.goto(pathToFileURL(target).href,{waitUntil:'load'});
  await page.waitForFunction(()=>window.sceneEngine);
  await page.evaluate(()=>sceneEngine.explode(1,{immediate:true,stagger:false}));await frames();
}
async function probes() {
  await page.evaluate(()=>{
    const spec=sceneEngine.getSpec();sceneEngine.dispose();
    class Renderer extends THREE.WebGLRenderer {constructor(...args){super(...args);const draw=this.render.bind(this);this.render=(scene,camera)=>{window.probe={scene,camera,renderer:this};draw(scene,camera);};}}
    window.sceneEngine=SpatialDiagram.createEngine({THREE:{...THREE,WebGLRenderer:Renderer},container:document.querySelector('#stage'),spec});
    sceneEngine.explode(1,{immediate:true,stagger:false});
    window.node=id=>probe.scene.getObjectByName(id);
    window.metrics=id=>{const object=node(id),center=new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()),p=center.clone().project(probe.camera);return {position:object.position.toArray(),center:center.toArray(),screen:[(p.x*.5+.5)*innerWidth,(-p.y*.5+.5)*innerHeight],opacity:object.children[0].material.opacity,clipping:object.children[0].material.clippingPlanes?.length || 0};};
  });await frames();
}
try {
  await openScene('gpu-exploded');check('GPU export boots offline',await page.evaluate(()=>sceneEngine.spec.assemblies[0].components.length===38));
  await probes();
  const original=await page.evaluate(()=>sceneEngine.getSpec());
  const initialPose=await page.evaluate(()=>sceneEngine.getState().camera);
  const point=await page.evaluate(()=>metrics('gpu').screen);
  await page.mouse.click(...point);await frames();
  check('real pointer picks GPU while annotation occlusion is active',await page.evaluate(()=>sceneEngine.getState().modes.selected==='gpu'));
  check('inspect card contains semantic GPU details',await page.$eval('.sd-inspect',el=>getComputedStyle(el).display!=='none' && el.innerText.includes('GPU compute die')));
  await page.screenshot({path:path.join(out,'gpu-selected.png')});
  await page.focus('.sd-slider');await page.keyboard.press('Home');await frames();
  check('keyboard explode slider reaches assembled pose',await page.evaluate(()=>Math.abs(metrics('gpu').position[1]-4)<1e-5));
  await click('auto-explode');await page.waitForFunction(()=>Math.abs(sceneEngine.getState().modes.explode-1)<1e-5);await frames();
  check('Auto explode reaches final pose',await page.evaluate(()=>Math.abs(metrics('gpu').position[1]-46)<1e-5));
  await click('xray');check('X-Ray fades explicitly marked cooler',await page.evaluate(()=>metrics('fan-left').opacity===.14 && metrics('gpu').opacity===1));await click('xray');
  for(const [mode,opacity] of [['isolate',.06],['ghost',.22]]) {await click(mode);check(`${mode} keeps selected GPU and fades context`,await page.evaluate(opacity=>metrics('gpu').opacity===1 && metrics('pcb').opacity===opacity,opacity));await click(mode);}
  await click('section');
  for(const mode of ['xray','isolate','ghost']) {await click(mode);check(`Section remains applied with ${mode}`,await page.evaluate(()=>[...probe.scene.getObjectByName('gpu-module').children].every(n=>n.children.filter(m=>m.isMesh).every(m=>m.material.clippingPlanes?.length===1))));await click(mode);}
  await page.evaluate(()=>sceneEngine.setSectionAxis('z',.3));
  check('section axis control updates the actual clipping plane',await page.evaluate(()=>node('gpu').children[0].material.clippingPlanes[0].normal.z===-1));await click('section');
  await page.evaluate(()=>sceneEngine.updateSpec({interactions:{section:{enabled:true,axis:'x'}}}));
  await click('section');check('declarative section-axis patch takes effect',await page.evaluate(()=>node('gpu').children[0].material.clippingPlanes[0].normal.x===-1));await click('section');
  await page.click('input[data-group="thermal"]');
  check('annotation group visibility changes',await page.$$eval('.sd-annotation[data-group="thermal"]',els=>els.every(el=>getComputedStyle(el).visibility==='hidden')));
  const before=await page.evaluate(()=>probe.camera.position.toArray());
  await page.mouse.move(1100,350);await page.mouse.down();await page.mouse.move(1210,410,{steps:10});await page.mouse.up();await frames(15);
  check('pointer orbit moves camera',await page.evaluate(before=>JSON.stringify(probe.camera.position.toArray())!==JSON.stringify(before),before));
  await page.mouse.wheel({deltaY:-120});await frames(15);
  const zoomed=await page.evaluate(()=>sceneEngine.getState().camera);
  check('wheel zoom changes distance',zoomed.distance!==initialPose.distance);
  await click('reset');await frames(45);
  const reset=await page.evaluate(()=>sceneEngine.getState().camera);
  check('Reset View restores startup framing including exploded bounds',JSON.stringify(reset)===JSON.stringify(initialPose),{initialPose,reset});
  await page.setViewport({width:720,height:450,deviceScaleFactor:1});await frames();
  const resize=await page.evaluate(()=>{const p=node('gpu').localToWorld(new THREE.Vector3(0,.9,0)).project(probe.camera),dot=document.querySelector('[data-id="ann-gpu"] circle');const expected=[(p.x*.5+.5)*innerWidth,(-p.y*.5+.5)*innerHeight],actual=[+dot.getAttribute('cx'),+dot.getAttribute('cy')];return {expected,actual,error:Math.hypot(expected[0]-actual[0],expected[1]-actual[1])};});
  check('SVG anchors track 720 × 450 viewport resize',resize.error<1,resize);await page.screenshot({path:path.join(out,'gpu-resized.png')});
  await page.setViewport({width:1440,height:900,deviceScaleFactor:1});await frames();
  await page.evaluate(()=>{window.oldCanvas=document.querySelector('canvas');window.oldNode=node('gpu');window.oldGeometry=oldNode.children[0].geometry;window.beforeState=sceneEngine.getState();});
  const patch=structuredClone(original);
  for(const component of patch.assemblies[0].components) if(component.id.startsWith('hbm-')) {
    const [x,,z]=component.transform.position;component.explode=[Math.sign(x+18)*22,42,Math.sign(z)*12];
  }
  patch.materials['test-interposer']={preset:'silicon',color:'#7cc8de',opacity:.28,transparent:true,side:'double'};
  patch.assemblies[0].components.find(c=>c.id==='interposer').material='test-interposer';
  patch.connectors=patch.assemblies[0].components.filter(c=>c.id.startsWith('hbm-')).map(c=>({id:`bus-${c.id}`,from:{anchor:'gpu'},to:{anchor:c.id},geometry:{kind:'bus',radius:.42,style:'flow'},material:'emissive-cyan',flow:{enabled:true,speed:1}}));patch.interactions.flow=true;
  await page.evaluate(patch=>sceneEngine.updateSpec(patch),{assemblies:patch.assemblies,materials:patch.materials,connectors:patch.connectors,interactions:patch.interactions});await frames();
  const revised=await page.evaluate(()=>({sameCanvas:document.querySelector('canvas')===oldCanvas,sameNode:node('gpu')===oldNode,sameGeometry:node('gpu').children[0].geometry===oldGeometry,state:sceneEngine.getState(),beforeState,ids:sceneEngine.spec.assemblies[0].components.map(c=>c.id),hbm:metrics('hbm-1'),interposer:metrics('interposer')}));
  check('live revision preserves canvas, component identity and unchanged geometry',revised.sameCanvas&&revised.sameNode&&revised.sameGeometry,revised);
  check('live revision preserves view, selection, explode and annotation choices',JSON.stringify(revised.state.camera)===JSON.stringify(revised.beforeState.camera)&&revised.state.modes.selected==='gpu'&&revised.state.modes.explode===1&&revised.state.annotationGroups.thermal===false);
  check('natural-language revision keeps every component ID',JSON.stringify(revised.ids)===JSON.stringify(original.assemblies[0].components.map(c=>c.id)));
  check('HBM separation and interposer transparency apply',revised.hbm.position[0]===-68&&revised.hbm.position[1]===46&&revised.interposer.opacity===.28);
  const connectorErrors=await page.evaluate(()=>probe.scene.getObjectByName('sd-connectors').children.filter(o=>o.userData.connectorId).map(o=>{const con=sceneEngine.spec.connectors.find(c=>c.id===o.userData.connectorId),curve=o.userData.curve;const center=id=>new THREE.Box3().setFromObject(node(id)).getCenter(new THREE.Vector3());return {id:con.id,start:curve.getPoint(0).distanceTo(center(con.from.anchor)),end:curve.getPoint(1).distanceTo(center(con.to.anchor))};}));
  check('all six connectors follow exploded GPU/HBM anchors',connectorErrors.length===6&&connectorErrors.every(e=>e.start<1e-5&&e.end<1e-5),{connectorErrors});
  await page.evaluate(()=>sceneEngine.explode(0,{immediate:true}));await frames();
  check('connectors also follow components back to assembled pose',await page.evaluate(()=>probe.scene.getObjectByName('sd-connectors').children.filter(o=>o.userData.connectorId).every(o=>Math.abs(o.userData.curve.getPoint(0).y-4)<1e-5)));
  await page.evaluate(()=>sceneEngine.explode(1,{immediate:true,stagger:false}));await frames();
  const dot0=await page.evaluate(()=>probe.scene.getObjectByName('sd-connectors').children.find(o=>o.userData.t!==undefined).position.toArray());await frames(3);
  check('flow pulses move along updated curves',await page.evaluate(before=>JSON.stringify(probe.scene.getObjectByName('sd-connectors').children.find(o=>o.userData.t!==undefined).position.toArray())!==JSON.stringify(before),dot0));
  await click('flow');
  check('Flow off stops pulses but retains connector bodies',await page.evaluate(()=>{const g=probe.scene.getObjectByName('sd-connectors');return g.visible && g.children.filter(o=>o.userData.connectorId).every(o=>o.visible) && g.children.filter(o=>o.userData.t!==undefined).every(o=>!o.visible);}));await click('flow');
  await page.evaluate(()=>sceneEngine.patchComponents([{id:'gpu',label:'GPU compute die · edited'}]));
  check('ID-based component patch retains all other components',await page.evaluate(()=>sceneEngine.spec.assemblies[0].components.length===38 && sceneEngine.inspect('gpu').label.endsWith('edited')));
  const rejected=await page.evaluate(()=>{const before=JSON.stringify(sceneEngine.getSpec());try{sceneEngine.patchComponents([{id:'gpu',geometry:{kind:'import',url:'x.glb'}}]);return false;}catch{return before===JSON.stringify(sceneEngine.getSpec());}});
  check('invalid live patches are rejected atomically',rejected);
  await page.evaluate(()=>sceneEngine.setAnnotationGroup('thermal',true));await page.evaluate(()=>sceneEngine.select(null));await frames();
  const images=await page.evaluate(async()=>({annotated:await sceneEngine.exportPNG({download:false}),bare:await sceneEngine.exportPNG({annotations:false,download:false})}));
  for(const [name,url] of Object.entries(images)) fs.writeFileSync(path.join(out,`gpu-${name}.png`),Buffer.from(url.split(',')[1],'base64'));
  const pngDiff=await page.evaluate(async images=>{
    const load=async src=>{const image=new Image();image.src=src;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,c.width,c.height);};
    const [a,b]=await Promise.all([load(images.annotated),load(images.bare)]);const rect=document.querySelector('[data-id="ann-gpu"] rect').getBoundingClientRect();let changed=0;
    for(let y=Math.floor(rect.y);y<Math.ceil(rect.bottom);y++)for(let x=Math.floor(rect.x);x<Math.ceil(rect.right);x++){const i=(y*a.width+x)*4;if(Math.abs(a.data[i]-b.data[i])+Math.abs(a.data[i+1]-b.data[i+1])+Math.abs(a.data[i+2]-b.data[i+2])>10)changed++;}
    return {changed,width:a.width,height:a.height};
  },images);
  check('PNG export composites visible SVG labels',pngDiff.changed>100,pngDiff);
  const glb=await page.evaluate(async()=>{const blob=await sceneEngine.exportGLB({download:false}),bytes=new Uint8Array(await blob.arrayBuffer());let text='';for(const byte of bytes)text+=String.fromCharCode(byte);return btoa(text);});const glbBytes=Buffer.from(glb,'base64');fs.writeFileSync(path.join(out,'gpu.glb'),glbBytes);
  check('GLB export remains valid after live editing',glbBytes.toString('ascii',0,4)==='glTF'&&glbBytes.readUInt32LE(8)===glbBytes.length);
  const json=await page.evaluate(()=>sceneEngine.exportJSON({download:false}));fs.writeFileSync(path.join(out,'gpu-modified.scene.json'),json);
  fs.writeFileSync(path.join(out,'gpu-modified.html'),buildHtml(path.join(out,'gpu-modified.scene.json')));
  check('JSON export preserves editable revised geometry',JSON.parse(json).connectors.length===6);
  const oldCount=await page.evaluate(()=>document.querySelectorAll('canvas').length);await page.evaluate(()=>sceneEngine.updateSpec({scene:{style:'studio-light'}}));await frames();
  check('stage-level edits preserve state and release old canvases',await page.evaluate(oldCount=>document.querySelectorAll('canvas').length===oldCount&&sceneEngine.getState().modes.explode===1,oldCount));
  await page.evaluate(()=>sceneEngine.updateSpec({scene:{style:'precision-editorial'}}));await frames();
  await page.evaluate(()=>{window.savedRAF=requestAnimationFrame;window.requestAnimationFrame=()=>0;});await new Promise(resolve=>setTimeout(resolve,150));
  const composited=await page.screenshot();
  await page.$eval('.sd-annotations',svg=>{svg.style.visibility='hidden';});
  const hidden=await page.screenshot();
  await page.$eval('.sd-annotations',svg=>{svg.style.visibility='';});
  const overlayDiff=await page.evaluate(async images=>{
    const read=async src=>{const image=new Image();image.src=src;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height);};
    const [a,b]=await Promise.all(images.map(read));const rect=document.querySelector('[data-id="ann-gpu"] rect').getBoundingClientRect();let changed=0;
    for(let y=Math.floor(rect.y);y<Math.ceil(rect.bottom);y++)for(let x=Math.floor(rect.x);x<Math.ceil(rect.right);x++){const i=(y*a.width+x)*4;if(Math.abs(a.data[i]-b.data[i])+Math.abs(a.data[i+1]-b.data[i+1])+Math.abs(a.data[i+2]-b.data[i+2])>10)changed++;}
    return changed;
  },[composited,hidden].map(bytes=>'data:image/png;base64,'+Buffer.from(bytes).toString('base64')));
  check('SVG annotations remain visibly composited after stage replacement',overlayDiff>100,{changedPixels:overlayDiff});
  await page.evaluate(()=>{window.requestAnimationFrame=savedRAF;sceneEngine.updateSpec({});});await frames();
  await page.screenshot({path:path.join(out,'gpu-modified.png')});
  check('default desktop annotations have no label collisions',await page.evaluate(()=>sceneEngine.validate().layout.length===0));
  for(const name of ['data-center-rack','mechanical-pump']) {await openScene(name);await page.screenshot({path:path.join(out,`${name}.png`)});check(`${name} boots with no structural errors`,await page.evaluate(()=>sceneEngine.validate().structural.length===0));}
  check('all scenes run without external network requests',results.requests.length===0,{requests:results.requests});
  check('no uncaught browser exceptions',results.errors.length===0,{errors:results.errors});
} catch(error) {results.fatal=error.stack;console.error(error);process.exitCode=1;}
finally {fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(results,null,2));await browser.close();}
if(results.checks.some(c=>!c.pass)) process.exitCode=1;
