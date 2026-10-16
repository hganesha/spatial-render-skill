#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const schema = JSON.parse(readFileSync(new URL('../schemas/scene.schema.json', import.meta.url), 'utf8'));
const target = fileURLToPath(new URL('../kit/engine/schema-data.js', import.meta.url));
writeFileSync(target, '// Generated from schemas/scene.schema.json by scripts/sync-schema.mjs.\nexport const SCENE_SCHEMA = ' + JSON.stringify(schema) + ';\n');
console.log('Updated schema-data.js');
