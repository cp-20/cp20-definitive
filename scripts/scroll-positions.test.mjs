// Scroll positions kept per history entry across reloads.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readPositions, writePositions } from '../src/data/scroll-positions.mjs';

describe('readPositions / writePositions', () => {
  test('書いたスクロール位置を、そのまま読み戻せる', () => {
    const positions = new Map([
      ['a', [0, 2500]],
      ['b', [10, 20]],
    ]);
    assert.deepEqual(readPositions(writePositions(positions)), positions);
  });

  for (const raw of [null, '', '{', '{}', '"x"', '[[1,[0,0]],["c",[0]],["d",[0,-1]],["e",["1",2]]]'])
    test(`壊れた保存値 ${JSON.stringify(raw)} からは何も読まない`, () => {
      assert.equal(readPositions(raw).size, 0);
    });

  test('新しいほうから50件だけを残す', () => {
    const many = new Map(Array.from({ length: 80 }, (_, i) => [`k${i}`, [0, i]]));
    const kept = readPositions(writePositions(many));
    assert.deepEqual([kept.size, kept.has('k29'), kept.has('k30')], [50, false, true]);
  });
});
