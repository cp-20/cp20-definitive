// How a card fades when the list it is in switches to another year.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { fadeFor } from './reflow.ts';

const at = (top: number) => ({ top, bottom: top + 200 });
const H = 800;

describe('fadeFor', () => {
  test('画面で消えるカードはその場で消し、現れるカードはその場で出す', () => {
    assert.deepEqual(fadeFor(at(100), undefined, H), [1, 0]);
    assert.deepEqual(fadeFor(undefined, at(100), H), [0, 1]);
  });

  test('画面の外のままのカードと、残って動かないカードは動かさない', () => {
    assert.deepEqual(
      [fadeFor(at(-900), undefined, H), fadeFor(undefined, at(3000), H), fadeFor(at(100), at(100), H)],
      [null, null, null],
    );
  });

  test('画面の端を少し出たカードは画面内として扱う', () => {
    assert.deepEqual(fadeFor(undefined, at(820), H), [0, 1]);
  });

  test('続けて切り替えると、途中の濃さから続ける（明るく戻らない）', () => {
    assert.deepEqual(fadeFor(at(100), undefined, H, 0.4), [0.4, 0]);
    assert.deepEqual(fadeFor(at(100), at(100), H, 0.4), [0.4, 1]);
  });
});
