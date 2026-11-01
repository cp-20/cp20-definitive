// A swipe across the featured works: which way it turns the deck.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { TURN_AT, coastDistance, fingerSpeed, swipeTurn } from '../src/data/deck-swipe.mjs';

describe('swipeTurn', () => {
  test('左へ大きくドラッグして止めて離すと、次の作品へ進む', () => {
    assert.equal(swipeTurn(-(TURN_AT + 1), 0, 0), 1);
  });

  test('右へ大きくドラッグして止めて離すと、前の作品へ戻る', () => {
    assert.equal(swipeTurn(TURN_AT + 1, 0, 0), -1);
  });

  test('少しだけゆっくり動かして離しても、めくれない', () => {
    assert.equal(swipeTurn(-30, 0, -0.1), 0);
  });

  test('短くても素早く払えば、めくれる', () => {
    assert.equal(swipeTurn(-20, 0, -1), 1);
  });

  test('大きく引いても、逆向きに払い戻せば、払った向きにめくれる', () => {
    assert.equal(swipeTurn(-80, 0, 2), -1);
  });

  test('大きく引いても、払い戻して勢いが打ち消し合えば、めくれない', () => {
    assert.equal(swipeTurn(-80, 0, 0.7), 0);
  });

  test('縦に近いスワイプはスクロールなので、速くてもめくれない', () => {
    assert.equal(swipeTurn(-100, 80, -3), 0);
  });
});

describe('coastDistance', () => {
  test('止まって離せば、その場で止まる', () => {
    assert.equal(coastDistance(0), 0);
  });

  test('速く離すほど遠くまで進み、向きは速さの向きに従う', () => {
    assert.ok(coastDistance(2) > coastDistance(1));
    assert.ok(coastDistance(-1) < 0);
  });
});

describe('fingerSpeed', () => {
  test('直近100ms の動きから、1ms あたりの速さを出す', () => {
    assert.equal(
      fingerSpeed(
        [
          { t: 0, x: 0 },
          { t: 50, x: 50 },
        ],
        100,
        100,
      ),
      1,
    );
  });

  test('100ms より前の動きは数えない', () => {
    assert.equal(
      fingerSpeed(
        [
          { t: 0, x: 0 },
          { t: 400, x: 300 },
          { t: 450, x: 310 },
        ],
        500,
        320,
      ),
      0.2,
    );
  });

  test('しばらく止めてから離せば、速さは 0', () => {
    assert.equal(fingerSpeed([{ t: 0, x: 0 }], 500, 0), 0);
  });

  test('動かさずに離せば、速さは 0', () => {
    assert.equal(fingerSpeed([], 10, 0), 0);
  });
});
