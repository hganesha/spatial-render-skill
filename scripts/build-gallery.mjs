#!/usr/bin/env node
// build-gallery.mjs — a catalog scene with every Level-2 recipe at its default
// parameters, laid out on a labeled grid, so agents and people pick recipes by sight.
//
//   node scripts/build-gallery.mjs                    → examples/recipe-gallery/{scene.json,index.html}
//   node scripts/build-gallery.mjs --capture          → also references/recipe-gallery.png (illustration)
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import '../kit/vendor/three.min.js';
import {createGeometrySystem} from '../kit/engine/geometry.js';
import {buildHtml} from './export-scene.mjs';
import {withScenePage, writeDataUrl} from './browser.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const geometry = createGeometrySystem(globalThis.THREE);
const kinds = Object.keys(geometry.RECIPES).filter(kind => kind !== 'generic-recipe');
const boxes = kinds.map(kind => {
  const parts = geometry.partBounds({kind});
  const min = [0, 1, 2].map(i => Math.min(...parts.map(p => p.min[i]))), max = [0, 1, 2].map(i => Math.max(...parts.map(p => p.max[i])));
  return {kind, min, max, size: max.map((v, i) => v - min[i])};
});
// Each recipe is normalized to its cell so shapes read at a glance; labels state the scale used.
const columns = 8, cell = 150, target = 84;
const components = [], annotations = [];
const ratio = scale => scale >= 1 ? `×${scale.toFixed(scale >= 10 ? 0 : 1)}` : `1:${(1 / scale).toFixed(1)}`;
boxes.forEach((box, i) => {
  const longest = Math.max(...box.size), scale = target / longest;
  const x = (i % columns - (columns - 1) / 2) * cell, z = Math.floor(i / columns) * cell;
  const center = box.min.map((v, k) => (v + box.max[k]) / 2);
  const id = 'recipe-' + box.kind;
  components.push({id, label: box.kind, geometry: {kind: box.kind},
    transform: {position: [x - center[0] * scale, -box.min[1] * scale, z - center[2] * scale], scale: [scale, scale, scale]},
    anchors: {top: [center[0], box.max[1], center[2]]},
    properties: {recipe: box.kind, displayScale: ratio(scale), defaultSize: box.size.map(v => Math.round(v * 10) / 10).join(' × ') + ' mm'}});
  annotations.push({id: 'label-' + box.kind, type: 'label', text: `${box.kind} · ${Math.round(longest)} mm`, target: {anchor: id + '.top'}, offset: [18, -26], side: 'right'});
});
const spec = {
  $schema: '../../schemas/scene.schema.json',
  scene: {id: 'recipe-gallery', title: 'Recipe gallery', description: `All ${kinds.length} Level-2 recipes at default parameters.`, type: 'schematic-3d', units: 'mm', fidelity: 'illustrative',
    renderMode: 'illustration', camera: {azimuth: 24, elevation: 46, framing: 'fit'}, ground: {enabled: true, grid: true, shadows: false},
    illustration: {shading: 'tonal'}, drawing: {footer: false}},
  assemblies: [{id: 'gallery', label: 'Recipes', components}],
  annotations,
  interactions: {explode: false, section: false, flow: false, isolate: true, ghost: true, xray: false},
  metadata: {author: 'scripts/build-gallery.mjs', notes: 'Generated catalog. Rebuild after adding a recipe; do not edit by hand.'}
};
const dir = path.join(ROOT, 'examples/recipe-gallery');
fs.mkdirSync(dir, {recursive: true});
fs.writeFileSync(path.join(dir, 'scene.json'), JSON.stringify(spec, null, 2) + '\n');
fs.writeFileSync(path.join(dir, 'index.html'), buildHtml(path.join(dir, 'scene.json')));
console.log(`✓ ${kinds.length} recipes → ${path.join(dir, 'scene.json')} + index.html`);
if (process.argv.includes('--capture')) {
  const out = path.join(ROOT, 'references/recipe-gallery.png');
  await withScenePage(pathToFileURL(path.join(dir, 'index.html')).href, {width: 1800, height: 1200, wait: 800}, async page => {
    const url = await page.evaluate(() => sceneEngine.exportPNG({download: false, width: 1800, height: 1200, scale: 1.4}));
    writeDataUrl(fs, out, url);
  });
  console.log('✓ ' + out);
}
