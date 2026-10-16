#!/usr/bin/env node
// new-scene.mjs — scaffold a valid starter Scene Spec for a scene type, with sensible
// camera, materials, explode stops, annotation groups, a parts list and a tour skeleton.
//
//   node scripts/new-scene.mjs <scene-id> [--type exploded-view|technical-assembly|systems-topology|cutaway]
//                              [--title "Title"] [-o path/scene.json] [--force]
import fs from 'node:fs';
import path from 'node:path';
import {validateSceneSpec} from '../kit/engine/spec-math.js';

const argv = process.argv.slice(2);
const id = argv.find((a, i) => !a.startsWith('-') && !['--type', '--title', '-o'].includes(argv[i - 1]));
const flag = name => {const i = argv.indexOf(name);return i >= 0 ? argv[i + 1] : undefined;};
const type = flag('--type') || 'exploded-view';
const types = ['exploded-view', 'technical-assembly', 'systems-topology', 'cutaway'];
if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id) || !types.includes(type)) {
  console.error('Usage: node scripts/new-scene.mjs <scene-id (kebab-case)> [--type ' + types.join('|') + '] [--title "Title"] [-o scene.json] [--force]');
  process.exit(2);
}
const out = path.resolve(flag('-o') || path.join('examples', id, 'scene.json'));
if (fs.existsSync(out) && !argv.includes('--force')) {console.error(`${out} exists; pass --force to overwrite.`);process.exit(2);}
const title = flag('--title') || id.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

const base = {
  $schema: path.relative(path.dirname(out), path.resolve('schemas/scene.schema.json')).split(path.sep).join('/'),
  scene: {id, title, description: 'TODO: one sentence on what this diagram explains and for whom.', type, units: 'mm', fidelity: 'representative', style: 'precision-editorial',
    camera: {mode: 'isometric', projection: 'perspective', azimuth: 40, elevation: 24, fov: 36, framing: 'fit-padded'},
    illustration: {spotColor: '#D55E00', shading: 'tonal', palette: 'okabe-ito'}},
  materials: {
    'housing': {preset: 'aluminum', finish: 'satin'},
    'internal': {preset: 'steel-dark', finish: 'matte'},
    'accent': {preset: 'emissive-cyan', emissiveIntensity: 0.8}
  },
  assemblies: [],
  connectors: [],
  annotations: [],
  interactions: {orbit: true, select: true, inspect: true, explode: {enabled: true, slider: true, autoStagger: true, easing: 'ease-in-out', stops: [0, 0.5, 1], traces: true}, xray: true, section: {enabled: true, axis: 'y'}, isolate: true, ghost: true, flow: false},
  behaviors: [{type: 'explode', amount: 1, stagger: true, duration: 2000, easing: 'ease-in-out', autoPlay: true}],
  partsList: {title: 'Parts list', position: 'right', columns: ['item', 'description', 'qty', 'material']},
  metadata: {author: 'TODO', notes: 'Representative geometry. TODO: state omitted features, exaggerated dimensions and sources for any product-specific claim.', sources: []}
};

if (type === 'systems-topology') {
  base.assemblies = [{id: 'system', label: 'System', components: [
    {id: 'node-a', label: 'Node A', geometry: {kind: 'server-blade', params: {width: 440, height: 44, depth: 600}}, material: 'housing', transform: {position: [0, 0, 0]}, anchors: {front: [0, 0, 300]}, explode: [-300, 0, 0], properties: {role: 'compute'}},
    {id: 'node-b', label: 'Node B', geometry: {kind: 'server-blade', params: {width: 440, height: 44, depth: 600}}, material: 'housing', transform: {position: [0, 120, 0]}, anchors: {front: [0, 0, 300]}, explode: [-300, 60, 0], properties: {role: 'compute'}},
    {id: 'switch', label: 'Switch', geometry: {kind: 'server-blade', params: {width: 440, height: 44, depth: 400}}, material: 'internal', transform: {position: [0, 260, 0]}, anchors: {ports: [0, 0, 200]}, explode: [0, 140, 120], properties: {role: 'network'}}]}];
  base.connectors = [
    {id: 'link-a', from: {anchor: 'node-a.front'}, to: {anchor: 'switch.ports'}, geometry: {kind: 'cable', radius: 3, sag: 40}, material: 'accent', flow: {enabled: true, speed: 1, direction: 'from-to', color: '#3ce0ff'}},
    {id: 'link-b', from: {anchor: 'node-b.front'}, to: {anchor: 'switch.ports'}, geometry: {kind: 'cable', radius: 3, sag: 30}, material: 'accent', flow: {enabled: true, speed: 1, direction: 'from-to', color: '#3ce0ff'}}];
  base.interactions.flow = true;
  base.annotations = [
    {id: 'ann-switch', type: 'label', text: 'Switch', target: {anchor: 'switch.ports'}, offset: [30, -16], group: 'network', emphasis: 'primary'},
    {id: 'ann-node', type: 'label', text: 'Compute node', target: {anchor: 'node-a.front'}, offset: [30, 14], group: 'compute'}];
} else {
  base.assemblies = [{id: 'main', label: title, explode: {direction: [0, 1, 0]}, components: [
    {id: 'base', label: 'Base plate', geometry: {kind: 'chamferBox', size: [160, 10, 100], radius: 2}, material: 'housing', transform: {position: [0, 0, 0]}, anchors: {top: [0, 5, 0]}, explode: {direction: [0, 1, 0], distance: 0, order: 3}, properties: {role: 'structure', partNumber: 'TODO-001'}},
    {id: 'core', label: 'Core', parent: 'base', geometry: {kind: 'cylinder', radius: 30, height: 40, segments: 48}, material: 'internal', transform: {position: [0, 25, 0]}, anchors: {top: [0, 20, 0]}, explode: {direction: [0, 1, 0], distance: 50, order: 2}, properties: {role: 'function', partNumber: 'TODO-002'}},
    {id: 'cover', label: 'Cover', parent: 'core', geometry: {kind: 'chamferBox', size: [120, 8, 80], radius: 2}, material: 'housing', transform: {position: [0, 49, 0]}, anchors: {top: [0, 4, 0]}, explode: {direction: [0, 1, 0], distance: 100, order: 1}, xray: 'outer', properties: {role: 'enclosure', partNumber: 'TODO-003'}},
    {id: 'screw-1', label: 'Screw', parent: 'cover', geometry: {kind: 'screw'}, material: 'internal', transform: {position: [-50, 54, -30]}, explode: {direction: [0, 1, 0], distance: 150, order: 0}, properties: {role: 'fastener', qty: 4}},
    {id: 'screw-2', label: 'Screw', parent: 'cover', geometry: {kind: 'screw'}, material: 'internal', transform: {position: [50, 54, -30]}, explode: {direction: [0, 1, 0], distance: 150, order: 0}, properties: {role: 'fastener', qty: 4}},
    {id: 'screw-3', label: 'Screw', parent: 'cover', geometry: {kind: 'screw'}, material: 'internal', transform: {position: [-50, 54, 30]}, explode: {direction: [0, 1, 0], distance: 150, order: 0}, properties: {role: 'fastener', qty: 4}},
    {id: 'screw-4', label: 'Screw', parent: 'cover', geometry: {kind: 'screw'}, material: 'internal', transform: {position: [50, 54, 30]}, explode: {direction: [0, 1, 0], distance: 150, order: 0}, properties: {role: 'fastener', qty: 4}}]}];
  base.annotations = [
    {id: 'ann-cover', type: 'label', text: 'Cover', target: {anchor: 'cover.top'}, offset: [40, -18], group: 'structure'},
    {id: 'ann-core', type: 'label', text: 'Core', target: {anchor: 'core.top'}, offset: [40, -10], group: 'function', emphasis: 'primary'},
    {id: 'ann-screw', type: 'label', text: 'M4 screws (4)', target: {anchor: 'screw-1'}, offset: [-40, -14], side: 'left', group: 'structure'},
    {id: 'dim-width', type: 'dimension', target: {position: [-80, -5, 50]}, targetB: {position: [80, -5, 50]}, value: '160 mm', offset: [0, 20], group: 'dimensions'}];
  if (type === 'cutaway') {
    base.scene.drawing = {sectionCaps: true};
    base.interactions.section = {enabled: true, axis: 'x'};
    base.detailViews = [{id: 'detail-core', label: 'A', target: {anchor: 'core.top'}, magnification: 3, caption: 'TODO'}];
  }
  if (type === 'technical-assembly') base.scene.labelLayout = 'margins';
}
base.tour = {steps: [
  {id: 'overview', title: 'Overview', caption: 'TODO: what the reader should notice first.', camera: 'auto', explode: 0},
  {id: 'inside', title: 'Inside', caption: 'TODO: what the explode reveals.', camera: 'auto', explode: 1, highlight: [base.assemblies[0].components[1].id]}
]};
const errors = validateSceneSpec(base).filter(issue => issue.level === 'error');
if (errors.length) {console.error('Internal scaffold error:\n' + errors.map(e => e.message).join('\n'));process.exit(1);}
fs.mkdirSync(path.dirname(out), {recursive: true});
fs.writeFileSync(out, JSON.stringify(base, null, 2) + '\n');
const shown = out.startsWith(process.cwd() + path.sep) ? path.relative(process.cwd(), out) : out;
console.log(`✓ ${type} scaffold → ${out}\n  next: edit components, then node scripts/validate-scene.mjs ${shown} --strict`);
