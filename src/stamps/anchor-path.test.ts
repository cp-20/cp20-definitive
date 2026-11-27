// How a sticker names the element it lies on.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { anchorSteps, joinAnchor, markedName } from './anchor-path.ts';

describe('anchor-path', () => {
  test('印の付いた名前から要素までの道筋を名前にし、読み戻せる', () => {
    const steps = [
      { index: 1, tag: 'div' },
      { index: 0, tag: 'h1' },
    ];
    const anchor = joinAnchor('intro', steps)!;
    assert.equal(anchor, 'intro--1div-0h1');
    assert.deepEqual(anchorSteps(anchor), steps);
    assert.equal(markedName(anchor), 'intro');
  });

  test('印の付いた要素そのものは名前だけ (以前からのシールと同じ形)', () => {
    assert.equal(joinAnchor('work-dice-spec-v2', []), 'work-dice-spec-v2');
    assert.deepEqual(anchorSteps('work-dice-spec-v2'), []);
    assert.equal(markedName('work-dice-spec-v2'), 'work-dice-spec-v2');
  });

  test('保存できない名前は作らない', () => {
    // 長すぎる (ANCHOR_PATTERN は96文字まで)
    assert.equal(
      joinAnchor(
        'intro',
        Array.from({ length: 20 }, () => ({ index: 12, tag: 'div' })),
      ),
      null,
    );
    // カスタム要素の名前や大きすぎる番号は手順に書けない
    assert.equal(joinAnchor('intro', [{ index: 0, tag: 'my-card' }]), null);
    assert.equal(joinAnchor('intro', [{ index: 1000, tag: 'div' }]), null);
  });

  test('最後の手順は文字の並びと、その中の一文字を指せる', () => {
    const steps = [
      { index: 0, tag: 'div' },
      { index: 1, tag: 'h1' },
      { index: 0, tag: 't' },
      { index: 2, tag: 'c' },
    ];
    const anchor = joinAnchor('intro', steps)!;
    assert.equal(anchor, 'intro--0div-1h1-0t-2c');
    assert.deepEqual(anchorSteps(anchor), steps);
    assert.deepEqual(anchorSteps('intro--0div-1h1-0t'), steps.slice(0, 3));
    // 文字の並びの中に要素はなく、一文字は文字の並びの中にしかない
    assert.equal(
      joinAnchor('intro', [
        { index: 0, tag: 't' },
        { index: 0, tag: 'span' },
      ]),
      null,
    );
    assert.equal(
      joinAnchor('intro', [
        { index: 0, tag: 'h1' },
        { index: 0, tag: 'c' },
      ]),
      null,
    );
    assert.equal(anchorSteps('intro--0t-0span'), null);
    assert.equal(anchorSteps('intro--0t-1c-2c'), null);
    assert.equal(anchorSteps('intro--0t-0t'), null);
  });

  test('壊れた道筋は読めない', () => {
    assert.equal(anchorSteps('intro--div'), null);
    assert.equal(anchorSteps('intro--1div-'), null);
  });
});
