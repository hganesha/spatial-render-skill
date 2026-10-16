#!/usr/bin/env node
// validate-scene.mjs — structural validation + geometry audits for Scene Specs.
// Usage: node scripts/validate-scene.mjs <scene.json> [more.json ...]
//        node scripts/validate-scene.mjs --all          (validates examples/*)
// Exit code: 1 if any errors, 0 otherwise (warnings allowed).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkScene } from './scene-validation.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const engineDir = resolve(__dirname, '../kit/engine');

const specMath = await import(join(engineDir, 'spec-math.js'));
const { validateSceneSpec, auditScene } = specMath;

const LEVEL_ICON = { error: '✖', warning: '⚠', info: 'ℹ' };
const LEVEL_COLOR = { error: '\x1b[31m', warning: '\x1b[33m', info: '\x1b[36m' };
const RESET = '\x1b[0m', BOLD = '\x1b[1m', DIM = '\x1b[2m';

function validateFile(path) {
  let spec;
  try {
    spec = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    console.log(`${BOLD}${basename(path)}${RESET}`);
    console.log(`  ${LEVEL_ICON.error} ${LEVEL_COLOR.error}error${RESET} spec:json — ${e.message}\n`);
    return { errors: 1, warnings: 0, infos: 0 };
  }
  const { structural, audits } = checkScene(spec);
  const all = [...structural, ...audits];

  const errors = all.filter((i) => i.level === 'error').length;
  const warnings = all.filter((i) => i.level === 'warning').length;
  const infos = all.filter((i) => i.level === 'info').length;

  console.log(`${BOLD}${basename(path)}${RESET} ${DIM}(${spec.scene?.id || 'no-id'})${RESET}`);
  if (all.length === 0) {
    console.log(`  ${LEVEL_COLOR.info}✓ clean — no issues${RESET}`);
  }
  for (const issue of all) {
    const color = LEVEL_COLOR[issue.level] || '';
    const ctx = issue.context ? ` ${DIM}${JSON.stringify(issue.context)}${RESET}` : '';
    console.log(`  ${LEVEL_ICON[issue.level] || '·'} ${color}${issue.level}${RESET} ${issue.code} — ${issue.message}${ctx}`);
  }
  console.log(`  ${DIM}── ${errors} error(s), ${warnings} warning(s), ${infos} note(s)${RESET}\n`);
  return { errors, warnings, infos };
}

function collectTargets(argv) {
  if (argv.includes('--all')) {
    const exDir = resolve(__dirname, '../examples');
    return readdirSync(exDir)
      .map((d) => join(exDir, d, 'scene.json'))
      .filter((p) => { try { return statSync(p).isFile(); } catch { return false; } });
  }
  return argv.filter((a) => !a.startsWith('--')).map((p) => resolve(process.cwd(), p));
}

const targets = collectTargets(process.argv.slice(2));
if (targets.length === 0) {
  console.error('Usage: node scripts/validate-scene.mjs <scene.json> [more.json ...] | --all');
  process.exit(2);
}

let totals = { errors: 0, warnings: 0, infos: 0 };
for (const t of targets) {
  const r = validateFile(t);
  totals.errors += r.errors; totals.warnings += r.warnings; totals.infos += r.infos;
}
console.log(`${BOLD}Totals:${RESET} ${totals.errors} error(s), ${totals.warnings} warning(s), ${totals.infos} note(s) across ${targets.length} file(s)`);
process.exit(totals.errors > 0 || (process.argv.includes('--strict') && totals.warnings > 0) ? 1 : 0);
