// The sticker in hand: its spring, and how a finger handles your stickers on the page.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import {
  FLYING,
  LIFT,
  MAX_TILT,
  keptOnScreen,
  liftedSpot,
  releaseVelocity,
  slideTime,
  springStep,
  throwCarry,
  waitsForHold,
  type Spring,
} from './spring.ts';

const FRAME = 1 / 60;
// Runs the spring at `fps` until it rests (at most 2 seconds) and reports how it went.
function settle(spring: Spring, fps = 60, k?: number) {
  let time = 0,
    widest = 0,
    furthest = -Infinity;
  while (!springStep(spring, 1 / fps, k) && time < 2) {
    time += 1 / fps;
    widest = Math.max(widest, Math.abs(spring.tilt));
    furthest = Math.max(furthest, spring.x);
  }
  return { time, widest, furthest };
}
// A sticker at rest at the origin, sent 400px right and 300px up, to be enlarged as when picked up.
const far = (): Spring => ({ x: 0, y: 0, vx: 0, vy: 0, tx: 400, ty: -300, tilt: 0, scale: 1, ts: 1.12 });

describe('springStep', () => {
  test('離れた目標まで 0.5 秒ほどで行き、目標の大きさになって止まる', () => {
    const spring = far();
    const { time } = settle(spring);
    assert.ok(time < 0.6, String(time));
    assert.deepEqual(
      [Math.round(spring.x), Math.round(spring.y), spring.scale.toFixed(2)],
      [400, -300, '1.12'],
    );
  });

  test('止まっていたシールは、目標を行き過ぎない', () => {
    const { furthest } = settle(far());
    assert.ok(furthest <= 400, String(furthest));
  });

  test('120Hz の画面でも 60Hz と同じ速さで動く', () => {
    const at60 = far(),
      at120 = far();
    for (let i = 0; i < 6; i++) springStep(at60, 1 / 60);
    for (let i = 0; i < 12; i++) springStep(at120, 1 / 120);
    assert.ok(Math.abs(at60.x - at120.x) < 0.5, `${at60.x} / ${at120.x}`);
  });

  test('横へ動く向きに傾くが、上限より傾かない', () => {
    const { widest } = settle(far());
    assert.ok(widest > MAX_TILT / 2 && widest <= MAX_TILT, String(widest));
  });

  test('右へ動くと時計回りに、左へ動くと反時計回りに傾く', () => {
    const right = far(),
      left = { ...far(), tx: -400 };
    springStep(right, FRAME);
    springStep(left, FRAME);
    assert.deepEqual([right.tilt > 0, left.tilt < 0], [true, true]);
  });

  test('止まるころには、もとの角度（base）に戻っている', () => {
    const straight = far(),
      slanted = { ...far(), tilt: 7, base: 7 };
    settle(straight);
    settle(slanted);
    assert.ok(Math.abs(straight.tilt) < 1, String(straight.tilt));
    assert.ok(Math.abs(slanted.tilt - 7) < 1, String(slanted.tilt));
  });


  test('傾きは速さに応じて増え、普通の速さでは上限に張り付かない', () => {
    // Dragged sideways at a steady speed (px/s) for half a second.
    const lean = (speed: number) => {
      const spring = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, tilt: 0, scale: 1, ts: 1 };
      for (let i = 0; i < 30; i++) {
        spring.tx += speed * FRAME;
        springStep(spring, FRAME);
      }
      return spring.tilt;
    };
    const slow = lean(300),
      usual = lean(1000),
      fast = lean(3000);
    assert.ok(slow < usual && usual < fast && fast < MAX_TILT, `${slow} / ${usual} / ${fast}`);
    assert.ok(usual < MAX_TILT * 0.75, String(usual));
  });

  test('手から離れて飛ぶシールは、投げられた勢いを保ったまま向きを変える', () => {
    // Thrown to the right, then sent home to the left: the first frame still carries it right.
    const spring = { x: 0, y: 0, vx: 3000, vy: 0, tx: -300, ty: 0, tilt: 0, scale: 1, ts: 1 };
    springStep(spring, FRAME, FLYING);
    assert.ok(spring.x > 0, String(spring.x));
  });

  test('勢いよく投げたシールは、目標を一度だけ少し越えて戻る', () => {
    const spring = { x: 0, y: 0, vx: 5000, vy: 0, tx: 100, ty: 0, tilt: 0, scale: 1, ts: 1 };
    const { furthest } = settle(spring, 60, FLYING);
    assert.ok(furthest > 100 && furthest < 160, String(furthest));
    assert.equal(Math.round(spring.x), 100);
  });

  test('長い1歩（動きを減らす設定）では、その場で目標に着いて止まる', () => {
    const spring = far();
    assert.equal(springStep(spring, 10), true);
    assert.deepEqual([spring.x, spring.y, spring.scale, spring.tilt.toFixed(2)], [400, -300, 1.12, '0.00']);
  });

  test('すでに目標にあるばねは、自分の角度のまま止まっている', () => {
    const spring = { x: 5, y: 5, vx: 0, vy: 0, tx: 5, ty: 5, tilt: 7, base: 7, scale: 1, ts: 1 };
    assert.equal(springStep(spring, FRAME), true);
    for (let i = 0; i < 30; i++) springStep(spring, FRAME);
    assert.deepEqual([spring.x, spring.y, spring.tilt], [5, 5, 7]);
  });
});

describe('throwing', () => {
  // Moved 20px right every 16ms, the last move at t = 160.
  const steady = Array.from({ length: 11 }, (_, i) => ({ x: i * 20, y: 0, t: i * 16 }));

  test('動かしながら離すと、その速さで投げられる', () => {
    const { vx, vy } = releaseVelocity(steady, 170);
    assert.equal(Math.round(vx), 1250);
    assert.equal(vy, 0);
  });

  test('止めてから離すと、投げられない', () => {
    assert.deepEqual(releaseVelocity(steady, 300), { vx: 0, vy: 0 });
    assert.deepEqual(releaseVelocity([], 0), { vx: 0, vy: 0 });
  });

  test('投げたシールは進んでいた向きに少し滑り、強く投げても滑りすぎない', () => {
    const gentle = throwCarry(1000, 0),
      hard = throwCarry(0, -20000);
    assert.ok(gentle.x > 20 && gentle.x < 80 && gentle.y === 0, JSON.stringify(gentle));
    assert.ok(hard.y < -60 && hard.y >= -120 && hard.x === 0, JSON.stringify(hard));
    assert.deepEqual(throwCarry(0, 0), { x: 0, y: 0 });
  });
});

describe('springStep の高さ', () => {
  test('持ち上げると約150msで浮き、止まるころには目標の高さになる', () => {
    const spring: Spring = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      tx: 0,
      ty: 0,
      tilt: 0,
      scale: 1,
      ts: 1,
      lift: 0,
      tl: 1,
    };
    for (let i = 0; i < 3; i++) springStep(spring, FRAME);
    assert.ok(spring.lift! < 0.6, String(spring.lift));
    for (let i = 0; i < 7; i++) springStep(spring, FRAME);
    assert.ok(spring.lift! > 0.9, String(spring.lift));
    settle(spring);
    assert.ok(Math.abs(spring.lift! - 1) < 0.02, String(spring.lift));
  });
});

describe('waitsForHold', () => {
  for (const [from, pointer, waits] of [
    ['page', 'touch', true],
    ['page', 'pen', true],
    ['page', 'mouse', false],
    ['sheet', 'touch', false],
  ] as const)
    test(`${from} のシールを ${pointer} で押すと、${waits ? 'タップかスクロールになる' : 'ドラッグできる'}`, () => {
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

describe('slideTime', () => {
  test('離した速さのまま滑り出す長さにし、止まって離したときは既定の長さにする', () => {
    // 60 px at 900 px/s: 3 × 60 / 900 s = 200 ms.
    assert.equal(slideTime({ x: 0, y: 0, vx: 900, vy: 0 }, 60, 0), 200);
    assert.equal(slideTime({ x: 0, y: 0, vx: 4000, vy: 0 }, 10, 0), 180);
    assert.equal(slideTime({ x: 0, y: 0, vx: 100, vy: 0 }, 100, 0), 400);
    assert.equal(slideTime({ x: 0, y: 0, vx: 10, vy: 0 }, 5, 0), undefined);
  });
});
