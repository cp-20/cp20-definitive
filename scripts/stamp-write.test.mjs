import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeBody, throttleAt, retryDelay } from '../src/data/stamp-write.mjs';
test('sticker writes update the record and the throttle entry together', () => {
  const record = { updatedAt: { '.sv': 'timestamp' }, stamps: { 0: { kind: 1 } } };
  assert.deepEqual(writeBody('home', 'alice', record, { at: 1234, prev: 1000 }), {
    'pages/home/alice': record,
    'throttle/alice': { at: { '.sv': 'timestamp' }, prev: 1234 },
  });
  // The first write of an account, and removing the last sticker.
  assert.deepEqual(writeBody('about', 'bob', null, null), {
    'pages/about/bob': null,
    'throttle/bob': { at: { '.sv': 'timestamp' }, prev: 0 },
  });
});
test('malformed throttle entries count as no previous write', () => {
  for (const value of [undefined, null, {}, { at: '5' }, { at: Infinity }])
    assert.equal(throttleAt(value), 0);
});
test('a write rejected by the throttle is retried after the interval', () => {
  assert.equal(retryDelay(10_000, 10_000), 1100);
  assert.equal(retryDelay(10_000, 10_600), 500);
  assert.equal(retryDelay(10_000, 50_000), 150);
  assert.equal(retryDelay(50_000, 10_000), 1100);
});
test('database rules keep the write interval across deletes and partial writes', async () => {
  const { readFile } = await import('node:fs/promises');
  const { rules } = JSON.parse(await readFile(new URL('../database.rules.json', import.meta.url), 'utf8'));
  const record = rules.pages.$page.$uid;
  // Every record write must set the server time and update the throttle entry in the same request.
  assert.match(record['.validate'], /newData\.child\('updatedAt'\)\.val\(\) == now/);
  assert.match(record['.write'], /child\('throttle'\)\.child\(auth\.uid\)\.child\('at'\)\.val\(\) == now/);
  assert.doesNotMatch(record['.write'], /!data\.exists\(\)/, 'creating a record must not skip the interval');
  const throttle = rules.throttle.$uid;
  assert.match(throttle['.write'], /newData\.exists\(\)/, 'throttle entries cannot be deleted');
  assert.match(throttle['.write'], /now >= data\.child\('at'\)\.val\(\) \+ 1000/);
  assert.match(throttle['.validate'], /newData\.child\('prev'\)\.val\(\) == data\.child\('at'\)\.val\(\)/);
});
