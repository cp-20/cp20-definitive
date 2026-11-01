import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moveIn, placeIn, removeFrom, stampEntries } from '../src/data/stamp-record.mjs';
const stamp = { anchor: 'intro', x: 0.5, y: 0.5, kind: 0, angle: 0, createdAt: 1 };
assert.deepEqual(stampEntries(null), []);
assert.deepEqual(stampEntries({ stamps: [null, stamp, null] }), [['1', stamp]]);
assert.deepEqual(stampEntries({ stamps: { 0: null, 4: stamp } }), [['4', stamp]]);
test('stickers the rules would not accept are dropped', () => {
  const odd = (fields) => stampEntries({ stamps: { 0: { ...stamp, ...fields } } });
  assert.deepEqual(odd({ x: { '.value': 0.5, '.priority': 'p' } }), []);
  assert.deepEqual(odd({ kind: { '.value': 0, '.priority': 'p' } }), []);
  assert.deepEqual(odd({ angle: { '.value': 0, '.priority': 'p' } }), []);
  assert.deepEqual(odd({ createdAt: { '.sv': 'timestamp' } }), []);
  assert.deepEqual(odd({ kind: 1.5 }), []);
  assert.deepEqual(odd({ anchor: 'Not An Anchor' }), []);
  assert.deepEqual(odd({ y: NaN }), []);
  assert.deepEqual(stampEntries({ stamps: { 0: stamp, '.priority': 'junk', 7: stamp } }), [['0', stamp]]);
});
const remaining = Object.fromEntries(stampEntries({ stamps: [null, stamp] }));
delete remaining['1'];
assert.equal(Object.keys(remaining).length, 0, 'removing the last occupied slot must delete the record');

const TS = { '.sv': 'timestamp' };
const full = {
  updatedAt: 9,
  stamps: Object.fromEntries(
    [0, 1, 2, 3, 4].map((i) => [String(i), { ...stamp, x: i / 10, createdAt: 10 + i }]),
  ),
};
const seen = (slot) => ({ ...full.stamps[slot], slot, id: `me-${slot}`, owner: 'me' });
test('a move with five stickers rewrites its own slot and keeps its age', () => {
  const edit = moveIn(full, seen('3'), { ...seen('3'), x: 0.57, y: 0.01 }, TS);
  assert.equal(edit.slot, '3');
  assert.equal(Object.keys(edit.stamps).length, 5);
  for (const slot of ['0', '1', '2', '4']) assert.deepEqual(edit.stamps[slot], full.stamps[slot]);
  // createdAt stays the stored value (the rules accept it unchanged), and no extra fields leak.
  assert.deepEqual(edit.stamps['3'], { anchor: 'intro', x: 0.57, y: 0.01, kind: 0, angle: 0, createdAt: 13 });
  assert.equal(full.stamps['3'].x, 0.3, 'the stored record is not mutated');
});
test('placing with five stickers replaces the oldest; a free slot is used first', () => {
  assert.equal(placeIn(full, stamp, TS).slot, '0');
  const holes = { stamps: [null, { ...stamp, createdAt: 5 }, null] };
  assert.equal(placeIn(holes, stamp, TS).slot, '0');
  assert.equal(placeIn(null, stamp, TS).slot, '0');
  assert.deepEqual(placeIn(null, { ...stamp, id: 'x', owner: 'y', slot: '3' }, TS).stamps['0'], {
    ...stamp,
    createdAt: TS,
  });
});
test('removing or moving a sticker another tab replaced in its slot leaves it alone', () => {
  const replaced = { stamps: { ...full.stamps, 3: { ...full.stamps['3'], createdAt: 99 } } };
  assert.equal(removeFrom(replaced, seen('3')).stamps, undefined);
  assert.equal(
    removeFrom({ stamps: { ...full.stamps, 3: { ...stamp, x: 0.9 } } }, seen('3')).stamps,
    undefined,
  );
  assert.deepEqual(Object.keys(removeFrom(full, seen('3')).stamps), ['0', '1', '2', '4']);
  // A move of a sticker that is gone places it as a new one, never in the replaced slot.
  const moved = moveIn(replaced, seen('3'), { ...stamp, x: 0.57 }, TS);
  assert.equal(moved.slot, '0');
  assert.equal(moved.stamps['3'].createdAt, 99);
  assert.equal(moved.stamps['0'].createdAt, TS);
});
test('a retried place or move whose first request was saved does not save the sticker twice', () => {
  const kept = { ...full.stamps['2'] };
  // Without `reuse` an identical sticker is a new one (two stickers can be placed alike).
  assert.equal(placeIn(full, kept, TS).slot, '0');
  const again = placeIn(full, kept, TS, true);
  assert.deepEqual(again, { slot: '2', stamps: undefined });
  // A move whose reply was lost: the slot already holds the moved sticker, so the retry's
  // target no longer matches and it would otherwise be placed afresh.
  const movedTo = { ...seen('3'), x: 0.57 };
  const after = { stamps: { ...full.stamps, 3: { ...full.stamps['3'], x: 0.57 } } };
  assert.equal(moveIn(after, seen('3'), movedTo, TS).slot, '0');
  assert.deepEqual(moveIn(after, seen('3'), movedTo, TS, true), { slot: '3', stamps: undefined });
});
