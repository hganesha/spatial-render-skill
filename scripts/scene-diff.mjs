#!/usr/bin/env node
// scene-diff.mjs — what changed between two revisions of a scene, by stable id.
//
//   node scripts/scene-diff.mjs before.json after.json            text summary
//   node scripts/scene-diff.mjs before.json after.json --json     machine-readable
//   node scripts/scene-diff.mjs before.json after.json --html diff.html
//        → self-contained viewer of `after` with the diff overlay: added parts green,
//          moved/changed amber (with a trace from the old position), removed parts as red ghosts.
// Exit code 0 when identical, 1 when there are differences, 2 on usage/validation errors.
import fs from 'node:fs';
import path from 'node:path';
import {diffScenes, formatDiff} from '../kit/engine/scene-diff.js';
import {validateSceneSpec} from '../kit/engine/spec-math.js';
import {buildHtml} from './export-scene.mjs';

const argv = process.argv.slice(2);
const files = argv.filter(a => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--html');
const htmlIndex = argv.indexOf('--html');
if (files.length !== 2) {console.error('Usage: node scripts/scene-diff.mjs before.json after.json [--json] [--html diff.html]');process.exit(2);}
const [before, after] = files.map(file => {
  try {return JSON.parse(fs.readFileSync(file, 'utf8'));} catch (error) {console.error(`${file}: ${error.message}`);process.exit(2);}
});
for (const [file, spec] of [[files[0], before], [files[1], after]]) {
  const errors = validateSceneSpec(spec).filter(issue => issue.level === 'error');
  if (errors.length) {console.error(`${file} is not a valid Scene Spec:\n` + errors.map(e => '  ' + e.message).join('\n'));process.exit(2);}
}
const diff = diffScenes(before, after);
if (argv.includes('--json')) console.log(JSON.stringify(diff, (key, value) => key === 'component' ? undefined : value, 2));
else console.log(formatDiff(diff));
if (htmlIndex >= 0) {
  const out = path.resolve(argv[htmlIndex + 1] || 'scene-diff.html');
  fs.mkdirSync(path.dirname(out), {recursive: true});
  fs.writeFileSync(out, buildHtml(path.resolve(files[1]), {compareWith: before}));
  console.log(`✓ diff viewer → ${out}`);
}
process.exitCode = diff.summary.total ? 1 : 0;
