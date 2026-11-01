// The branches of saving one queued sticker operation, against a fake client.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSaveLedger, saveOperation, writeDelay } from '../src/data/stamp-save.mjs';

const who = { uid: 'u1', avatar: 'a'.repeat(64) };
const sticker = (id, owner, extra = {}) => ({
  id,
  owner,
  slot: owner === 'local' ? '' : '0',
  anchor: 'intro',
  x: 0.5,
  y: 0.5,
  kind: 1,
  angle: 3,
  createdAt: 10,
  ...extra,
});
function fakeApi() {
  const calls = [];
  const saved = (placed) => ({ owner: who.uid, stamps: placed ? [placed] : [], ...(placed && { placed }) });
  return {
    calls,
    place: async (path, stamp, account) => {
      calls.push(['place', path, stamp, account]);
      return saved(sticker('u1-0', 'u1', stamp));
    },
    move: async (path, target, stamp, account) => {
      calls.push(['move', path, target.id, stamp, account]);
      return saved(sticker(target.id, 'u1', stamp));
    },
    remove: async (path, target, account) => {
      calls.push(['remove', path, target.id, account]);
      return saved();
    },
  };
}
const data = ({ anchor, x, y, kind, angle }) => ({ anchor, x, y, kind, angle });
const same = (s) => s;

test('adding places the sticker data only', async () => {
  const api = fakeApi();
  const stamp = sticker('l1', 'local', { x: 0.2 });
  const { result, placed } = await saveOperation(api, { type: 'add', id: 'op', path: '/', stamp }, who, same);
  assert.deepEqual(api.calls, [['place', '/', data(stamp), who]]);
  assert.equal(placed.id, 'u1-0');
  assert.equal(result.owner, 'u1');
});

test('moving a sticker that never saved places it afresh', async () => {
  const api = fakeApi();
  const target = sticker('l1', 'local');
  const stamp = sticker('l2', 'local', { x: 0.9 });
  const out = await saveOperation(api, { type: 'move', id: 'op', path: '/works', target, stamp }, who, same);
  assert.deepEqual(api.calls, [['place', '/works', data(stamp), who]]);
  assert.equal(out.placed.x, 0.9);
});

test('a sticker saved earlier in the queue is moved and removed by its saved id', async () => {
  const local = sticker('l1', 'local');
  const resolve = (s) => (s.id === 'l1' ? sticker('u1-3', 'u1', { slot: '3' }) : s);
  const stamp = sticker('l2', 'local', { y: 0.1 });
  let api = fakeApi();
  await saveOperation(api, { type: 'move', id: 'op', path: '/', target: local, stamp }, who, resolve);
  assert.deepEqual(api.calls, [['move', '/', 'u1-3', data(stamp), who]]);
  api = fakeApi();
  const removed = await saveOperation(
    api,
    { type: 'remove', id: 'op', path: '/', target: local },
    who,
    resolve,
  );
  assert.deepEqual(api.calls, [['remove', '/', 'u1-3', who]]);
  assert.deepEqual(removed, { result: { owner: 'u1', stamps: [] } });
});

test('removing a sticker that never saved sends nothing', async () => {
  const api = fakeApi();
  const out = await saveOperation(
    api,
    { type: 'remove', id: 'op', path: '/', target: sticker('l1', 'local') },
    who,
    same,
  );
  assert.deepEqual(out, { result: null });
  assert.deepEqual(api.calls, []);
});

test('a failed request is passed on to the queue', async () => {
  const api = { ...fakeApi(), place: async () => Promise.reject(Error('offline')) };
  await assert.rejects(
    saveOperation(api, { type: 'add', id: 'op', path: '/', stamp: sticker('l1', 'local') }, who, same),
    /offline/,
  );
});

test('a place or move whose saved record lacks the sticker fails', async () => {
  const lacking = async () => ({ owner: who.uid, stamps: [] });
  const api = { ...fakeApi(), place: lacking, move: lacking };
  await assert.rejects(
    saveOperation(api, { type: 'add', id: 'op', path: '/', stamp: sticker('l1', 'local') }, who, same),
    /does not hold the sticker/,
  );
  const target = sticker('u1-0', 'u1');
  await assert.rejects(
    saveOperation(
      api,
      { type: 'move', id: 'op', path: '/', target, stamp: sticker('l2', 'local') },
      who,
      same,
    ),
    /does not hold the sticker/,
  );
});

test('writes are spaced a little over the database interval', () => {
  assert.equal(writeDelay(0, 5000), 0);
  assert.equal(writeDelay(5000, 5000), 1100);
  assert.equal(writeDelay(5000, 5600), 500);
  assert.equal(writeDelay(5000, 7000), 0);
});

// Runs operations the way the write queue in Stamps.tsx does, keeping the failed ones for a retry.
async function runQueue(api, ledger, ops, failed = []) {
  for (const op of ops) {
    if (ledger.superseded(op)) continue;
    ledger.start(op);
    failed = failed.filter((item) => !ledger.superseded(item));
    try {
      const { placed } = await saveOperation(api, op, who, ledger.resolve);
      if (placed && op.type !== 'remove') ledger.saved(op, placed);
    } catch {
      ledger.failed(op);
      failed = [...failed, op];
    }
  }
  return failed;
}
const failingOnce = (api, name) => {
  let failed = false;
  return {
    ...api,
    [name]: async (...args) => {
      if (!failed) {
        failed = true;
        api.calls.push(['failed', name]);
        throw Error('offline');
      }
      return api[name](...args);
    },
  };
};

test('a failed add that a later move placed afresh is not sent again by the retry', async () => {
  const api = fakeApi();
  const ledger = createSaveLedger();
  const first = sticker('l1', 'local', { x: 0.6 });
  const moved = sticker('l2', 'local', { x: 0.4 });
  const ops = [
    { type: 'add', id: 'a', path: '/', stamp: first },
    { type: 'move', id: 'm', path: '/', target: first, stamp: moved },
  ];
  const failed = await runQueue(failingOnce(api, 'place'), ledger, ops);
  assert.deepEqual(failed, []);
  // Even a retry of the add sent before the ledger dropped it saves nothing.
  await runQueue(api, ledger, [{ ...ops[0], id: 'retry' }]);
  assert.deepEqual(
    api.calls.map((c) => c[0]),
    ['failed', 'place'],
  );
  assert.equal(api.calls[1][2].x, 0.4);
});

test('a failed add that was peeled off before the retry is not sent again', async () => {
  const api = fakeApi();
  const ledger = createSaveLedger();
  const first = sticker('l1', 'local');
  const ops = [
    { type: 'add', id: 'a', path: '/', stamp: first },
    { type: 'remove', id: 'r', path: '/', target: first },
  ];
  assert.deepEqual(await runQueue(failingOnce(api, 'place'), ledger, ops), []);
  assert.deepEqual(api.calls, [['failed', 'place']]);
});

test('moving a sticker whose move failed moves the saved one it came from', async () => {
  const api = fakeApi();
  const ledger = createSaveLedger();
  const saved = sticker('u1-0', 'u1');
  const half = sticker('l1', 'local', { x: 0.3 });
  const end = sticker('l2', 'local', { x: 0.8 });
  const ops = [
    { type: 'move', id: 'm1', path: '/', target: saved, stamp: half },
    { type: 'move', id: 'm2', path: '/', target: half, stamp: end },
  ];
  assert.deepEqual(await runQueue(failingOnce(api, 'move'), ledger, ops), []);
  assert.deepEqual(api.calls[1].slice(0, 3), ['move', '/', 'u1-0']);
  assert.equal(api.calls[1][3].x, 0.8);
});

test('every failed save stays for the retry when nothing took it over', async () => {
  const api = fakeApi();
  const ledger = createSaveLedger();
  const broken = { ...api, place: async () => Promise.reject(Error('offline')) };
  const ops = [
    { type: 'add', id: 'a', path: '/', stamp: sticker('l1', 'local') },
    { type: 'add', id: 'b', path: '/', stamp: sticker('l2', 'local') },
  ];
  const failed = await runQueue(broken, ledger, ops);
  assert.deepEqual(
    failed.map((op) => op.id),
    ['a', 'b'],
  );
  await runQueue(api, ledger, failed);
  assert.equal(api.calls.length, 2);
});

test('only a retried place or move asks the client to reuse an identical saved sticker', async () => {
  const flags = [];
  const api = fakeApi();
  const place = api.place;
  api.place = async (path, stamp, account, reuse) => (flags.push(reuse), place(path, stamp, account));
  const stamp = sticker('l1', 'local');
  await saveOperation(api, { type: 'add', id: 'a', path: '/', stamp }, who, same);
  await saveOperation(api, { type: 'add', id: 'b', path: '/', stamp, retry: true }, who, same);
  assert.deepEqual(flags, [false, true]);
});

// After a failed move the saved sticker it came from is shown again, and later edits act on it.
test('a failed move is not retried once the saved sticker it came from was peeled off', async () => {
  const api = fakeApi();
  const ledger = createSaveLedger();
  const saved = sticker('u1-0', 'u1');
  const moved = {
    type: 'move',
    id: 'm',
    path: '/',
    target: saved,
    stamp: sticker('l1', 'local', { x: 0.4 }),
  };
  let failed = await runQueue(failingOnce(api, 'move'), ledger, [moved]);
  assert.deepEqual(
    failed.map((op) => op.id),
    ['m'],
  );
  failed = await runQueue(api, ledger, [{ type: 'remove', id: 'r', path: '/', target: saved }], failed);
  assert.deepEqual(failed, []);
  // Even a retry sent before the list was updated brings nothing back.
  await runQueue(api, ledger, [{ ...moved, id: 'retry', retry: true }]);
  assert.deepEqual(
    api.calls.map((c) => c[0]),
    ['failed', 'remove'],
  );
});

test('a failed move is not retried once the saved sticker it came from was moved again', async () => {
  const api = fakeApi();
  const ledger = createSaveLedger();
  const saved = sticker('u1-0', 'u1');
  const moved = {
    type: 'move',
    id: 'm',
    path: '/',
    target: saved,
    stamp: sticker('l1', 'local', { x: 0.4 }),
  };
  let failed = await runQueue(failingOnce(api, 'move'), ledger, [moved]);
  const again = {
    type: 'move',
    id: 'm2',
    path: '/',
    target: saved,
    stamp: sticker('l2', 'local', { x: 0.7 }),
  };
  failed = await runQueue(api, ledger, [again], failed);
  assert.deepEqual(failed, []);
  await runQueue(api, ledger, [{ ...moved, id: 'retry', retry: true }]);
  assert.deepEqual(
    api.calls.map((c) => c[0]),
    ['failed', 'move'],
  );
  assert.equal(api.calls[1][3].x, 0.7);
});

test('a failed move that nothing took over is sent again by the retry', async () => {
  const api = fakeApi();
  const ledger = createSaveLedger();
  const saved = sticker('u1-0', 'u1');
  const moved = {
    type: 'move',
    id: 'm',
    path: '/',
    target: saved,
    stamp: sticker('l1', 'local', { x: 0.4 }),
  };
  const failed = await runQueue(failingOnce(api, 'move'), ledger, [moved]);
  const retry = failed.map((op) => ({ ...op, id: 'retry', retry: true }));
  assert.deepEqual(await runQueue(api, ledger, retry), []);
  assert.deepEqual(api.calls[1].slice(0, 3), ['move', '/', 'u1-0']);
  assert.equal(api.calls[1][3].x, 0.4);
});
