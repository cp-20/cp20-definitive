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
// A stand-in for the database's write rules on one account: compare-and-swap on `prev` and one
// write a second, with a clock that the retry's wait advances.
function server() {
  const db = { now: 100_000, throttle: null, record: null, saves: 0, waited: 0 };
  db.write = (record, throttle) => {
    db.saves++;
    const at = throttleAt(db.throttle);
    if (throttleAt(throttle) !== at || (db.throttle && db.now < at + 1000)) return { denied: true };
    db.throttle = { at: db.now, prev: at };
    db.record = record;
    return { record };
  };
  return db;
}
test('a write that loses a race with another tab is saved on the next attempt', async () => {
  const { writeWithRetry } = await import('../src/data/stamp-write.mjs');
  const db = server();
  db.write({ stamps: { 0: 'old' } }, null);
  db.now += 5000;
  db.saves = 0;
  let raced = false;
  const io = {
    readThrottle: async () => db.throttle,
    readRecord: async () => db.record,
    save: async (record, throttle) => {
      // The other tab writes between this tab's read and its save, once.
      if (!raced) {
        raced = true;
        db.write({ stamps: { ...db.record.stamps, 1: 'other tab' } }, db.throttle);
        db.now += 5;
      }
      return db.write(record, throttle);
    },
    wait: async (ms) => {
      db.waited += ms;
      db.now += ms;
    },
  };
  // Date.now() stands in for the server clock in retryDelay.
  const realNow = Date.now;
  Date.now = () => db.now;
  try {
    const saved = await writeWithRetry(io, (data) => ({ stamps: { ...data?.stamps, 2: 'this tab' } }));
    assert.deepEqual(saved.stamps, { 0: 'old', 1: 'other tab', 2: 'this tab' });
  } finally {
    Date.now = realNow;
  }
  // The other tab's write, then two from this tab: the denied one and the retry after the
  // interval, never a retry that is denied again for coming too soon.
  assert.equal(db.saves, 3);
  assert.ok(db.waited >= 995 && db.waited <= 1100, `waited ${db.waited}ms`);
});
test('a write the rules keep rejecting gives up, and a no-op update writes nothing', async () => {
  const { writeWithRetry } = await import('../src/data/stamp-write.mjs');
  let saves = 0;
  const io = {
    readThrottle: async () => null,
    readRecord: async () => ({ stamps: { 0: 'kept' } }),
    save: async () => (saves++, { denied: true }),
    wait: async () => {},
  };
  await assert.rejects(
    writeWithRetry(io, () => ({})),
    /Concurrent update/,
  );
  assert.equal(saves, 4);
  saves = 0;
  assert.deepEqual(await writeWithRetry(io, () => undefined), { stamps: { 0: 'kept' } });
  assert.equal(saves, 0);
});
