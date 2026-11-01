// The sticker in hand: its spring, and how a finger handles your stickers on the page.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIFT,
  MAX_TILT,
  keptOnScreen,
  liftedSpot,
  springStep,
  waitsForHold,
} from '../src/data/stamp-hand.mjs';

// Runs the spring until it rests (at most 200 frames) and reports where it went.
function settle(spring) {
  let frames = 0,
    widest = 0;
  while (!springStep(spring) && frames < 200) {
    frames++;
    widest = Math.max(widest, Math.abs(spring.tilt));
  }
  return { frames, widest };
}
const far = () => ({ x: 0, y: 0, tx: 400, ty: -300, tilt: 0, scale: 1, ts: 1.18 });

describe('springStep', () => {
  test('ばねは数十フレームで目標の位置に止まる', () => {
    const spring = far();
    const { frames } = settle(spring);
    assert.ok(frames < 200);
    assert.deepEqual([Math.round(spring.x), Math.round(spring.y)], [400, -300]);
  });

  test('止まるころには目標の大きさになる', () => {
    const spring = far();
    settle(spring);
    assert.equal(spring.scale.toFixed(2), '1.18');
  });

  test('動く向きに傾くが、上限より傾かない', () => {
    const { widest } = settle(far());
    assert.ok(widest > 10 && widest <= MAX_TILT, String(widest));
  });

  test('すでに目標にあるばねは、そのまま止まっている', () => {
    assert.equal(springStep({ x: 5, y: 5, tx: 5, ty: 5, tilt: 0, scale: 1, ts: 1 }), true);
  });
});

describe('waitsForHold', () => {
  for (const [from, pointer, waits] of [
    ['page', 'touch', true],
    ['page', 'pen', true],
    ['page', 'mouse', false],
    ['sheet', 'touch', false],
  ])
    test(`${from} のシールを ${pointer} で押すと、長押し待ち${waits ? 'になる' : 'にならない'}`, () => {
      assert.equal(waitsForHold({ from, pointer }), waits);
    });
});

describe('liftedSpot', () => {
  test('上に余裕があれば、指の上に浮かぶ', () => {
    assert.deepEqual(liftedSpot(200, 400, 390, 664, 80), { x: 200, y: 400 - LIFT });
  });

  test('ヒントバーの下に入るなら、指の下に浮かぶ', () => {
    assert.deepEqual(liftedSpot(300, 120, 390, 664, 80), { x: 300, y: 120 + LIFT });
  });

  for (const [x, y, w, h] of [
    [2, 0, 390, 664],
    [389, 660, 390, 664],
    [100, 40, 390, 100],
  ])
    test(`画面の端（${x}, ${y} / ${w}×${h}）でも、シール半分の余白を残して画面に収まる`, () => {
      const spot = liftedSpot(x, y, w, h, 80);
      assert.deepEqual(
        [spot.x >= 25, spot.x <= w - 25, spot.y >= 25, spot.y <= h - 25],
        [true, true, true, true],
      );
    });
});

describe('keptOnScreen', () => {
  test('縦向きの下のほうで持っていたシールは、横向きにすると画面の下端に寄る', () => {
    assert.deepEqual(keptOnScreen(322, 672, 839, 412, 80), { x: 322, y: 412 - 30 });
  });

  test('画面の中にあるシールは動かさない', () => {
    assert.deepEqual(keptOnScreen(200, 300, 839, 412, 80), { x: 200, y: 300 });
  });

  test('ヒントバーの下と右端の内側に収める', () => {
    assert.deepEqual(keptOnScreen(900, 10, 839, 412, 80), { x: 839 - 30, y: 80 + 30 });
  });

  test('両方は収まらない低い画面では、画面に収めるほうを優先する', () => {
    assert.deepEqual(keptOnScreen(100, 10, 300, 90, 80), { x: 100, y: 60 });
  });
});
