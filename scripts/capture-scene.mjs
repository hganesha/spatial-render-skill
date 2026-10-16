#!/usr/bin/env node
// Capture WebGL + SVG + UI for the evaluation loop, optionally with a contact sheet
// (every state in one PNG) and the rendered-view audit as JSON.
//
//   node scripts/capture-scene.mjs index.html [-o capture.png] [--wait 4500]
//        [--mode webgl|blueprint|illustration] [--explode 0..1]
//        [--contact-sheet sheet.png] [--audit audit.json] [--strict]
//        [--width 1440 --height 900] [--browser-path /path/to/chrome]
import fs from 'node:fs';
import {resolve, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {withScenePage, writeDataUrl} from './browser.mjs';

const argv = process.argv.slice(2), options = {width: 1440, height: 900, wait: 4500};
const flags = {'-o': 'out', '--width': 'width', '--height': 'height', '--wait': 'wait', '--browser-path': 'browserPath', '--mode': 'mode', '--explode': 'explode', '--contact-sheet': 'contactSheet', '--audit': 'audit'};
for (let i = 0; i < argv.length; i++) {
  if (flags[argv[i]]) {const key = flags[argv[i]], value = argv[++i];options[key] = ['width', 'height', 'wait', 'explode'].includes(key) ? Number(value) : value;}
  else if (argv[i] === '--strict') options.strict = true;
  else if (!argv[i].startsWith('-') && !options.input) options.input = argv[i];
  else {console.error('Unknown capture argument: ' + argv[i]);process.exit(2);}
}
if (!options.input || !fs.existsSync(resolve(options.input)) || ![options.width, options.height].every(n => Number.isFinite(n) && n > 0) || !Number.isFinite(options.wait) || options.wait < 0) {
  console.error('Usage: node scripts/capture-scene.mjs index.html [-o capture.png] [--wait 4500] [--mode illustration] [--explode 1] [--contact-sheet sheet.png] [--audit audit.json] [--strict]');process.exit(2);
}
options.out = resolve(options.out || options.input.replace(/\.html?$/, '') + '.png');
for (const file of [options.out, options.contactSheet, options.audit].filter(Boolean)) fs.mkdirSync(dirname(resolve(file)), {recursive: true});

try {
  const report = await withScenePage(pathToFileURL(resolve(options.input)).href, {...options, scale: 2}, async page => {
    await page.evaluate(({mode, explode}) => {
      if (mode) sceneEngine.setRenderMode(mode);
      if (Number.isFinite(explode)) sceneEngine.explode(explode, {immediate: true});
    }, {mode: options.mode, explode: options.explode});
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({path: options.out});
    console.log('✓ captured complete diagram: ' + options.out);
    if (options.contactSheet) {
      const url = await page.evaluate(() => sceneEngine.exportContactSheet({download: false}));
      writeDataUrl(fs, resolve(options.contactSheet), url);
      console.log('✓ contact sheet: ' + resolve(options.contactSheet));
    }
    if (options.audit || options.strict) return page.evaluate(() => sceneEngine.auditVisual());
    return null;
  });
  if (report) {
    if (options.audit) {fs.writeFileSync(resolve(options.audit), JSON.stringify(report, null, 2));console.log('✓ visual audit: ' + resolve(options.audit));}
    for (const result of report.results) {
      console.log(`  explode ${result.metrics.explode} · ${result.metrics.renderMode} · frame fill ${result.metrics.frameFill ?? '?'}`);
      for (const issue of result.issues) console.log(`    ${issue.level === 'warning' ? '⚠' : 'ℹ'} ${issue.code} — ${issue.message}`);
    }
    console.log(`  ── ${report.summary.warnings} warning(s), ${report.summary.infos} note(s)`);
    if (options.strict && report.summary.warnings) process.exitCode = 1;
  }
} catch (error) {
  console.error('Capture failed. ' + error.message);
  process.exitCode = error.code === 'NO_BROWSER' ? 3 : 1;
}
