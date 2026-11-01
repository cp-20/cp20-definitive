// npm run rules: regenerates database.rules.json from the page list (see database-rules.mjs).
// --check: exits 1 instead if the committed file differs (CI and npm run firebase:rules).
import { readFile, writeFile } from 'node:fs/promises';
import { generatedRules } from './database-rules.mjs';
const file = new URL('../database.rules.json', import.meta.url);
const next = await generatedRules();
const current = await readFile(file, 'utf8').catch(() => null);
if (process.argv.includes('--check')) {
  if (current !== next) {
    console.error('database.rules.json is out of date — run npm run rules');
    process.exit(1);
  }
  console.log('database.rules.json is up to date');
} else if (current === next) console.log('database.rules.json is up to date');
else {
  await writeFile(file, next);
  console.log('Wrote database.rules.json');
}
