import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyStreamEvent, coalesce } from '../src/data/stamp-stream.mjs';
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
test('a burst of stream events renders at most once per interval', () => {
  let time = 0,
    runs = 0;
  const timers = new Map();
  let nextId = 1;
  const clock = {
    now: () => time,
    setTimeout: (fn, ms) => (timers.set(nextId, { fn, at: time + ms }), nextId++),
    clearTimeout: (id) => timers.delete(id),
  };
  const advance = (ms) => {
    const end = time + ms;
    for (;;) {
      const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      time = due[1].at;
      due[1].fn();
    }
    time = end;
  };
  const render = coalesce(() => runs++, 250, clock);
  render.schedule();
  advance(0);
  assert.equal(runs, 1, 'the first event after a quiet period renders on the next tick');
  // 50 events a second for two seconds: at most one render per 250ms.
  for (let i = 0; i < 100; i++) {
    render.schedule();
    advance(20);
  }
  advance(250);
  assert.ok(runs >= 8 && runs <= 10, `renders: ${runs}`);
  render.schedule();
  render.cancel();
  advance(1000);
  const settled = runs;
  advance(1000);
  assert.equal(runs, settled, 'a cancelled render does not run');
});
