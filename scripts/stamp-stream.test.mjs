import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyStreamEvent } from '../src/data/stamp-stream.mjs';
test('Firebase stream initial snapshot, nested patch, removal and reconnect replace stale records', () => {
  let rows = applyStreamEvent({}, 'put', {
    path: '/',
    data: { alice: { stamps: { 0: { kind: 1, x: 0.2 } } } },
  });
  rows = applyStreamEvent(rows, 'patch', {
    path: '/alice',
    data: { 'stamps/0/x': 0.4, 'stamps/1': { kind: 2, x: 0.8 } },
  });
  assert.equal(rows.alice.stamps[0].x, 0.4);
  assert.equal(rows.alice.stamps[1].kind, 2);
  rows = applyStreamEvent(rows, 'put', { path: '/alice/stamps/0', data: null });
  assert.equal(rows.alice.stamps[0], undefined);
  rows = applyStreamEvent(rows, 'put', { path: '/alice', data: null });
  assert.deepEqual(rows, {});
  rows = applyStreamEvent({ stale: {} }, 'put', { path: '/', data: null });
  assert.deepEqual(rows, {});
  assert.throws(() => applyStreamEvent({}, 'patch', { path: '/', data: { '__proto__/polluted': true } }));
  assert.equal({}.polluted, undefined);
});
