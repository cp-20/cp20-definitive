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

  test('壊れた道筋は読めない', () => {
    assert.equal(anchorSteps('intro--div'), null);
    assert.equal(anchorSteps('intro--1div-'), null);
  });
});
