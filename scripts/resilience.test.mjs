// Small helpers that keep the page usable on flaky networks, and the font stylesheet filter.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reconnectDelay,
  deadline,
  TimeoutError,
  readPositions,
  writePositions,
} from '../src/data/resilience.mjs';
import { dropWoffFallback, isFontFile } from '../src/data/font-css.mjs';

describe('reconnectDelay', () => {
  for (const [attempt, ms] of [
    [0, 2000],
    [1, 4000],
    [4, 32000],
    [5, 60000],
    [20, 60000],
    [-1, 2000],
  ])
    test(`${attempt} 回目の再接続は ${ms}ms 待つ`, () => {
      assert.equal(reconnectDelay(attempt), ms);
    });
});

describe('deadline', () => {
  test('期限までに終わらなければ TimeoutError で失敗する', async () => {
    await assert.rejects(deadline(new Promise(() => {}), 20), TimeoutError);
  });

  test('TimeoutError の code は timeout', async () => {
    await assert.rejects(deadline(new Promise(() => {}), 20), (e) => e.code === 'timeout');
  });

  test('期限までに終わればその値を返す', async () => {
    assert.equal(await deadline(Promise.resolve(7), 20), 7);
  });

  test('期限までの失敗はそのまま伝える', async () => {
    const failure = Error('denied');
    await assert.rejects(deadline(Promise.reject(failure), 20), (e) => e === failure);
  });

  test('一時停止の合図のあとは、期限を過ぎても待ち続ける', async () => {
    let finish;
    const result = deadline(new Promise((resolve) => (finish = resolve)), 20, Promise.resolve());
    await new Promise((resolve) => setTimeout(resolve, 60));
    finish('signed in');
    assert.equal(await result, 'signed in');
  });
});

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

describe('dropWoffFallback', () => {
  test('WOFF2 もある src から WOFF の候補を外す', () => {
    const css =
      "@font-face{font-weight:500;src:url(./a.woff2) format('woff2'),url(./a.woff) format('woff');}";
    assert.equal(dropWoffFallback(css), "@font-face{font-weight:500;src:url(./a.woff2) format('woff2');}");
  });

  test('WOFF しかない src はそのまま残す', () => {
    const only = "@font-face{src:url(./a.woff) format('woff');}";
    assert.equal(dropWoffFallback(only), only);
  });
});

describe('isFontFile', () => {
  for (const [file, font] of [
    ['/x/zen-maru-gothic-10-500-normal.woff2', true],
    ['a.woff?v=1', true],
    ['/images/avatar.png', false],
  ])
    test(`${file} は${font ? 'フォント' : 'フォントではない'}`, () => {
      assert.equal(isFontFile(file), font);
    });
});
