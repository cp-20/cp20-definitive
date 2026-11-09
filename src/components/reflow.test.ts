// How a card moves when the list it is in is filtered or sorted.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { motionFor } from './reflow.ts';

const at = (left: number, top: number) => ({ left, top, bottom: top + 200 });
const H = 800;
const fadeOut = { opacity: [1, 0], scale: [1, 0.96] };
const fadeIn = { opacity: [0, 1], scale: [0.96, 1] };

describe('motionFor', () => {
  test('画面に残るカードは、元の場所から滑らせる', () => {
    assert.deepEqual(motionFor(at(300, 100), at(0, 400), H), {
      from: [300, -300],
      to: [0, 0],
      opacity: [1, 1],
      scale: [1, 1],
    });
  });

  test('動かないカードや画面外のままのカードは動かさない', () => {
    assert.deepEqual(
      [
        motionFor(at(0, 100), at(0.4, 100.4), H),
        motionFor(at(0, 2000), at(300, 3000), H),
        motionFor(undefined, at(0, 3000), H),
        motionFor(at(0, -900), undefined, H),
      ],
      [null, null, null, null],
    );
  });

  test('絞り込みで消えるカードはその場で消し、現れるカードはその場で出す', () => {
    assert.deepEqual(motionFor(at(0, 100), undefined, H), { from: [0, 0], to: [0, 0], ...fadeOut });
    assert.deepEqual(motionFor(undefined, at(0, 100), H), { from: [0, 0], to: [0, 0], ...fadeIn });
  });

  test('画面の内外をまたぐカードは、飛ばさずに着く場所で出すか、元の場所に留めて消す', () => {
    assert.deepEqual(motionFor(at(0, 6000), at(0, 100), H), { from: [0, 0], to: [0, 0], ...fadeIn });
    assert.deepEqual(motionFor(at(0, 100), at(0, 6000), H), { from: [0, -5900], to: [0, -5900], ...fadeOut });
  });

  test('画面の端を少し出たカードは画面内として扱い、滑らせる', () => {
    assert.deepEqual(motionFor(at(0, 820), at(0, 500), H), {
      from: [0, 320],
      to: [0, 0],
      opacity: [1, 1],
      scale: [1, 1],
    });
  });
});
