// The branches of saving one queued sticker operation, against a fake client.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveOperation, writeDelay } from '../src/data/stamp-save.mjs';

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
    saveOperation(api, { type: 'move', id: 'op', path: '/', target, stamp: sticker('l2', 'local') }, who, same),
    /does not hold the sticker/,
  );
});

test('writes are spaced a little over the database interval', () => {
  assert.equal(writeDelay(0, 5000), 0);
  assert.equal(writeDelay(5000, 5000), 1100);
  assert.equal(writeDelay(5000, 5600), 500);
  assert.equal(writeDelay(5000, 7000), 0);
});
