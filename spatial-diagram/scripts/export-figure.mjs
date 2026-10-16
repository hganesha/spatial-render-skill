#!/usr/bin/env node
// export-figure.mjs — headless figure export straight from a scene.json.
//
//   node scripts/export-figure.mjs scene.json --kind <kind> -o out.<ext> [options]
//
// kinds:
//   svg            vector drawing of the default view (blueprint/illustration)
//   png            raster of the default view (any mode)
//   pdf            vector PDF of the SVG drawing (sized in mm with --figure)
//   comparison     assembled | exploded side by side   (svg or png by extension)
//   sheet          front · top · right · iso drawing sheet with title block (--views front,left,back,top for a strip)
//   instructions   step-by-step assembly panels
//   contact        contact sheet of every state (png)
//   video          turntable WebM (--video turntable|explode|tour, --duration ms)
// options:
//   --mode webgl|blueprint|illustration   (default: illustration for vector kinds)
//   --figure single-column|one-and-half-column|double-column|full-page   [--font-pt 7]
//   --explode 0..1   --labels free|margins   --balloons   --hidden-lines
//   --width 1440 --height 900   --dpi 300   --azimuth deg --elevation deg
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildHtml} from './export-scene.mjs';
import {withScenePage, writeDataUrl} from './browser.mjs';

const argv = process.argv.slice(2), o = {width: 1440, height: 900};
const numeric = new Set(['width', 'height', 'dpi', 'explode', 'fontPt', 'azimuth', 'elevation', 'duration']);
const names = {'--kind': 'kind', '-o': 'out', '--mode': 'mode', '--figure': 'figure', '--explode': 'explode', '--labels': 'labels', '--width': 'width', '--height': 'height', '--dpi': 'dpi', '--font-pt': 'fontPt', '--azimuth': 'azimuth', '--elevation': 'elevation', '--video': 'video', '--duration': 'duration', '--browser-path': 'browserPath', '--views': 'views'};
for (let i = 0; i < argv.length; i++) {
  const key = names[argv[i]];
  if (key) {const value = argv[++i];o[key] = numeric.has(key) ? Number(value) : value;}
  else if (argv[i] === '--balloons') o.balloons = true;
  else if (argv[i] === '--hidden-lines') o.hiddenLines = true;
  else if (!argv[i].startsWith('-') && !o.scene) o.scene = argv[i];
  else {console.error('Unknown argument: ' + argv[i]);process.exit(2);}
}
const kinds = ['svg', 'png', 'pdf', 'comparison', 'sheet', 'instructions', 'contact', 'video'];
if (!o.scene || !fs.existsSync(o.scene) || !kinds.includes(o.kind)) {
  console.error('Usage: node scripts/export-figure.mjs scene.json --kind ' + kinds.join('|') + ' -o out.ext [--mode illustration] [--figure double-column] [--explode 1] [--labels margins] [--balloons]');
  process.exit(2);
}
const extension = o.kind === 'video' ? 'webm' : o.kind === 'contact' ? 'png' : ['svg', 'png', 'pdf'].includes(o.kind) ? o.kind : 'svg';
o.out = path.resolve(o.out || o.scene.replace(/\.json$/, '') + `-${o.kind}.${extension}`);
const format = path.extname(o.out).slice(1).toLowerCase();
const vectorKind = ['svg', 'pdf'].includes(o.kind) || (['comparison', 'sheet', 'instructions'].includes(o.kind) && format === 'svg');
o.mode = o.mode || (vectorKind ? 'illustration' : undefined);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'spatial-figure-'));
const html = path.join(temp, 'scene.html');
fs.writeFileSync(html, buildHtml(path.resolve(o.scene)));
fs.mkdirSync(path.dirname(o.out), {recursive: true});

try {
  await withScenePage(pathToFileURL(html).href, {width: o.width, height: o.height, wait: 300, browserPath: o.browserPath}, async page => {
    const result = await page.evaluate(async o => {
      const engine = window.sceneEngine;
      const patch = {scene: {}};
      if (o.mode) patch.scene.renderMode = o.mode;
      if (o.labels) patch.scene.labelLayout = o.labels;
      if (o.balloons) patch.scene.annotationStyle = 'balloon';
      if (o.hiddenLines) patch.scene.drawing = {...(engine.spec.scene.drawing || {}), hiddenLines: true};
      engine.updateSpec(patch);
      if (o.azimuth != null || o.elevation != null) engine.setCamera({azimuth: o.azimuth ?? engine.getState().camera.azimuth, elevation: o.elevation ?? engine.getState().camera.elevation}, true);
      const autoplay = engine.spec.behaviors.find(b => b.type === 'explode' && b.autoPlay !== false);
      engine.explode(o.explode ?? autoplay?.amount ?? 1, {immediate: true});
      engine.tour.active && engine.tour.stop();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const common = {download: false};
      const figure = o.figure ? {figure: o.figure, fontPt: o.fontPt} : {};
      switch (o.kind) {
        case 'svg': case 'pdf': return {text: engine.exportSVG({...common, ...figure})};
        case 'png': return {data: await engine.exportPNG({...common, ...figure, dpi: o.dpi})};
        case 'comparison': return o.format === 'svg' ? {text: await engine.exportComparison({...common, format: 'svg'})} : {data: await engine.exportComparison({...common, format: 'png'})};
        case 'sheet': {
          const sheet = {...common, views: o.views ? o.views.split(',') : undefined, explode: o.explode ?? 0};
          return o.format === 'svg' ? {text: await engine.exportSheet({...sheet, format: 'svg'})} : {data: await engine.exportSheet({...sheet, format: 'png'})};
        }
        case 'instructions': return o.format === 'svg' ? {text: await engine.exportInstructions({...common, format: 'svg'})} : {data: await engine.exportInstructions({...common, format: 'png'})};
        case 'contact': return {data: await engine.exportContactSheet(common)};
        case 'video': {
          const blob = await engine.exportVideo({...common, kind: o.video || 'turntable', duration: o.duration});
          const bytes = new Uint8Array(await blob.arrayBuffer());let binary = '';
          for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          return {data: 'data:video/webm;base64,' + btoa(binary)};
        }
      }
    }, {...o, format});
    if (o.kind === 'pdf') {
      const sizeMatch = /<svg[^>]*\swidth="([\d.]+)(mm)?"[^>]*\sheight="([\d.]+)(mm)?"/.exec(result.text);
      const width = sizeMatch ? sizeMatch[1] + (sizeMatch[2] ? 'mm' : 'px') : `${o.width}px`, height = sizeMatch ? sizeMatch[3] + (sizeMatch[4] ? 'mm' : 'px') : `${o.height}px`;
      const svgPath = path.join(temp, 'figure.svg');fs.writeFileSync(svgPath, result.text);
      await page.goto(pathToFileURL(svgPath).href);
      await page.pdf({path: o.out, width, height, printBackground: true, pageRanges: '1'});
    } else if (result.text) fs.writeFileSync(o.out, result.text);
    else writeDataUrl(fs, o.out, result.data);
  });
  console.log(`✓ ${o.kind} → ${o.out}`);
} catch (error) {
  console.error('Figure export failed: ' + error.message);
  process.exitCode = error.code === 'NO_BROWSER' ? 3 : 1;
} finally {
  fs.rmSync(temp, {recursive: true, force: true});
}
