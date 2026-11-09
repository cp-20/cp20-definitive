// The arithmetic of the yearly attendance cards: days, the stamps of a day, keys and taps.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { dayOf, daysIn, nearest, spot, stampsOf, step, tipPlace, yearsOf } from './attendance.ts';

const article = (date: string, n = 0) => ({
  title: `t${n}`,
  url: `https://zenn.dev/a/${n}`,
  date,
  source: 'zenn.dev',
});

describe('dayOf', () => {
  test('日本時間の日付で読む（サイトの表示と同じ）', () => {
    assert.deepEqual(dayOf(article('2025-12-31T15:30:00.000Z')), { y: 2026, m: 1, d: 1 });
    assert.deepEqual(dayOf(article('2025-12-31T14:30:00.000Z')), { y: 2025, m: 12, d: 31 });
  });
});

describe('yearsOf / daysIn', () => {
  test('記事のある年を古い順に1回ずつ挙げる', () => {
    const items = ['2024-05-01', '2022-01-02', '2024-01-01', '2023-03-03'].map((d, i) =>
      article(`${d}T00:00:00.000Z`, i),
    );
    assert.deepEqual(yearsOf(items), [2022, 2023, 2024]);
  });
  test('月の日数は、短い月とうるう年を知っている', () => {
    assert.deepEqual([daysIn(2024, 2), daysIn(2025, 2), daysIn(2025, 4), daysIn(2025, 12)], [29, 28, 30, 31]);
  });
});

describe('stampsOf', () => {
  const items = [
    article('2025-04-02T03:00:00.000Z', 1),
    article('2025-04-02T01:00:00.000Z', 2),
    article('2024-12-31T00:00:00.000Z', 3),
    article('2025-01-10T00:00:00.000Z', 4),
    article('2025-04-02T05:00:00.000Z', 5),
  ];
  test('その年の記事だけを日付順に並べる', () => {
    assert.deepEqual(stampsOf(items, 2025).map((s) => s.a.title), ['t4', 't2', 't1', 't5']);
  });
  test('同じ日のスタンプに番号を振り、その日の数を持たせる', () => {
    assert.deepEqual(stampsOf(items, 2025).map((s) => [s.m, s.d, s.nth, s.of]), [
      [1, 10, 0, 1],
      [4, 2, 0, 3],
      [4, 2, 1, 3],
      [4, 2, 2, 3],
    ]);
  });
});

describe('spot', () => {
  test('その日に1つだけのスタンプは真ん中に置く', () => {
    assert.deepEqual(spot({ nth: 0, of: 1 }), { x: 0, y: 0 });
  });
  test('同じ日に2つなら左上と右下に置く', () => {
    const [a, b] = [0, 1].map((nth) => spot({ nth, of: 2 }));
    assert.equal(a.x < 0 && a.y < 0 && b.x > 0 && b.y > 0, true);
    assert.deepEqual([a.x + b.x, a.y + b.y], [0, 0]);
  });
  test('混んだ日のスタンプにもそれぞれの場所を、その日と隣の行の内側に与える', () => {
    for (const of of [2, 3, 5, 8]) {
      const at = Array.from({ length: of }, (_, nth) => spot({ nth, of }));
      assert.equal(new Set(at.map((p) => `${p.x},${p.y}`)).size, of);
      for (const p of at) assert.equal(Math.abs(p.x) <= 0.3 && Math.abs(p.y) <= 0.4, true);
      // No two closer than a fifth of a row, so each keeps a patch of its own.
      for (const p of at)
        for (const q of at) if (p !== q) assert.ok(Math.hypot(p.x - q.x, p.y - q.y) > 0.2);
    }
  });
});

describe('step', () => {
  // Jan 3, Jan 20, Mar 1, Mar 28, Jun 15
  const stamps = [
    { m: 1, d: 3 },
    { m: 1, d: 20 },
    { m: 3, d: 1 },
    { m: 3, d: 28 },
    { m: 6, d: 15 },
  ];
  test('← → で前後のスタンプへ、Home・End で端へ移る', () => {
    assert.deepEqual([step(stamps, 2, 'ArrowLeft'), step(stamps, 2, 'ArrowRight')], [1, 3]);
    assert.deepEqual([step(stamps, 2, 'Home'), step(stamps, 2, 'End')], [0, 4]);
  });
  test('端より先やほかのキーでは移らない', () => {
    assert.deepEqual([step(stamps, 0, 'ArrowLeft'), step(stamps, 4, 'ArrowRight')], [undefined, undefined]);
    assert.deepEqual([step(stamps, 0, 'Home'), step(stamps, 1, 'Enter')], [undefined, undefined]);
  });
  test('↑ ↓ でスタンプのある一番近い月の、一番近い日へ移る', () => {
    assert.equal(step(stamps, 1, 'ArrowDown'), 3); // Jan 20 → Mar 28 (skips the empty February)
    assert.equal(step(stamps, 0, 'ArrowDown'), 2); // Jan 3 → Mar 1
    assert.equal(step(stamps, 4, 'ArrowUp'), 3); // Jun 15 → Mar 28 (13 days off, against 14)
    assert.equal(step(stamps, 0, 'ArrowUp'), undefined);
    assert.equal(step(stamps, 4, 'ArrowDown'), undefined);
  });
});

describe('nearest', () => {
  const centres = [
    { x: 10, y: 10 },
    { x: 30, y: 10 },
    { x: 100, y: 100 },
  ];
  test('タップの届く範囲で一番近いスタンプを選ぶ', () => {
    assert.equal(nearest(centres, 18, 12, 24), 0);
    assert.equal(nearest(centres, 24, 14, 24), 1);
    assert.equal(nearest(centres, 90, 110, 24), 2);
  });
  test('どれも届かなければ選ばない', () => {
    assert.equal(nearest(centres, 60, 60, 24), -1);
    assert.equal(nearest([], 0, 0, 24), -1);
  });
});

describe('tipPlace', () => {
  test('札はカードの内側へ、最初の数か月は下へ開く', () => {
    assert.deepEqual(tipPlace({ m: 1, d: 2 }), { edge: 'start', below: true });
    assert.deepEqual(tipPlace({ m: 6, d: 16 }), { edge: undefined, below: undefined });
    assert.deepEqual(tipPlace({ m: 12, d: 30 }), { edge: 'end', below: undefined });
  });
});
