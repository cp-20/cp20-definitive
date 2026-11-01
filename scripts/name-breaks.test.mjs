// Repository names wrap between words, not in the middle of one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nameParts } from '../src/data/name-breaks.mjs';

test('nameParts breaks after separators and between PascalCase words', () => {
  assert.deepEqual(nameParts('zundamon-explainer'), ['zundamon-', 'explainer']);
  assert.deepEqual(nameParts('KotonohaCollector'), ['Kotonoha', 'Collector']);
  assert.deepEqual(nameParts('veryl_cpu'), ['veryl_', 'cpu']);
  assert.deepEqual(nameParts('2026.cp20.dev'), ['2026.', 'cp20.', 'dev']);
  assert.deepEqual(nameParts('traQ-clickup-notifier'), ['traQ-', 'clickup-', 'notifier']);
  assert.deepEqual(nameParts('traQing'), ['traQing']);
  assert.deepEqual(nameParts('read-stack-extension'), ['read-', 'stack-', 'extension']);
  assert.deepEqual(nameParts('awoo'), ['awoo']);
  // A trailing separator is not split off into an empty part.
  assert.deepEqual(nameParts('a-'), ['a-']);
});

test('nameParts joins back to every listed repository name', async () => {
  const { readFile } = await import('node:fs/promises');
  const { repos } = JSON.parse(
    await readFile(new URL('../src/data/generated.json', import.meta.url), 'utf8'),
  );
  for (const { name } of repos) {
    const parts = nameParts(name);
    assert.equal(parts.join(''), name);
    assert.ok(parts.every(Boolean), name);
  }
});
