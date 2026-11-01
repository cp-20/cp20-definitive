// Regression tests for the GitHub Actions setup: every pull request and push to main runs the
// same checks as the Cloudflare build command, and the rules deploy never ships stale rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

test('verify runs the type check, the build and the tests', () => {
  const { scripts } = JSON.parse(read('package.json'));
  const steps = scripts.verify.split('&&').map((step) => step.trim());
  // Vite does not type-check, so `check` must be part of it; tests read dist, so they run last.
  assert.deepEqual(steps, ['npm run check', 'npm run build', 'npm test']);
});

test('CI runs verify on every pull request and on pushes to main', () => {
  const ci = read('.github/workflows/ci.yml');
  const on = ci.slice(ci.indexOf('\non:'), ci.indexOf('\npermissions:'));
  // An unfiltered pull_request trigger: no `paths:` that could skip a breaking change.
  assert.match(on, /\n {2}pull_request:\n/);
  assert.doesNotMatch(on, /paths/);
  assert.match(on, /\n {2}push:\n {4}branches: \[main\]\n/);
  assert.match(ci, /\n {2}verify:\n/, 'job name used as the required check');
  assert.match(ci, /- run: npm run verify\n/);
});

test('README tells Cloudflare to build with verify', () => {
  assert.match(read('README.md'), /Build command：`npm run verify`/);
});

test('the rules deploy skips when the deployed files no longer match main', () => {
  const workflow = read('.github/workflows/firebase-rules.yml');
  const deploy = workflow.slice(workflow.indexOf('\n  deploy:'));
  const guard = deploy.indexOf('id: latest');
  assert.ok(guard > 0, 'guard step exists');
  for (const file of ['database.rules.json', 'firebase.json', '.firebaserc']) {
    assert.ok(deploy.slice(guard).includes(file), `guard compares ${file}`);
  }
  // Both the credentials and the deploy itself are gated on the guard.
  const gated = deploy.match(/if: steps\.latest\.outputs\.deploy == 'true'/g) ?? [];
  assert.equal(gated.length, 2);
  assert.ok(deploy.indexOf('google-github-actions/auth') > guard);
  assert.ok(deploy.indexOf(' deploy --only') > guard);
});
