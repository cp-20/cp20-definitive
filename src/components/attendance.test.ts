// The arithmetic of the yearly attendance cards: days, the stamps of a day, keys and taps.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { dayOf, daysIn, nearest, spot, stampsOf, step, tipPlace, toward, yearsOf } from './attendance.ts';

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
    assert.deepEqual(
      stampsOf(items, 2025).map((s) => s.a.title),
      ['t4', 't2', 't1', 't5'],
    );
  });
  test('同じ日のスタンプに番号を振り、その日の数を持たせる', () => {
    assert.deepEqual(
      stampsOf(items, 2025).map((s) => [s.m, s.d, s.nth, s.of]),
      [
        [1, 10, 0, 1],
        [4, 2, 0, 3],
        [4, 2, 1, 3],
        [4, 2, 2, 3],
      ],
    );
  });
});

describe('spot', () => {
  test('その日に1つだけのスタンプは真ん中に置く', () => {
    assert.deepEqual(spot({ nth: 0, of: 1 }), { x: 0, y: 0 });
  });
  test('同じ日に2つなら、真ん中をはさんで左上と右下に置く', () => {
    const [a, b] = [0, 1].map((nth) => spot({ nth, of: 2 }));
    assert.deepEqual([Math.sign(a.x), Math.sign(a.y)], [-1, -1]);
    assert.deepEqual([b.x, b.y], [-a.x, -a.y]);
  });
  for (const of of [2, 3, 5, 8])
    test(`同じ日に${of}つあっても、それぞれに離れた場所を、その日と隣の行の内側に与える`, () => {
      const at = Array.from({ length: of }, (_, nth) => spot({ nth, of }));
      // Inside the day's column, reaching at most into the rows above and below.
      assert.ok(
        at.every((p) => Math.abs(p.x) <= 0.3 && Math.abs(p.y) <= 0.4),
        JSON.stringify(at),
      );
      // No two closer than a fifth of a row, so each keeps a patch of its own.
      const closest = Math.min(
        ...at.flatMap((p, i) => at.slice(i + 1).map((q) => Math.hypot(p.x - q.x, p.y - q.y))),
      );
      assert.ok(closest > 0.2, `一番近い2つの間: ${closest}`);
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

describe('toward', () => {
  // A slip 200px wide whose bottom edge is 20px above the pointer.
  const slip = { left: 0, right: 200, top: 0, bottom: 80 };
  const from = { x: 100, y: 100 };
  test('紙片の近い辺へ斜めに向かう動きは、紙片へ向かっているとみなす', () => {
    assert.equal(toward(from, { x: 96, y: 96 }, slip), true);
    assert.equal(toward(from, { x: 104, y: 97 }, slip), true);
    assert.equal(toward(from, { x: 100, y: 94 }, slip), true);
  });
  test('真横や離れる向きの動きは、紙片へ向かっていない（隣のスタンプへ移る）', () => {
    assert.equal(toward(from, { x: 105, y: 100 }, slip), false);
    assert.equal(toward(from, { x: 95, y: 101 }, slip), false);
    assert.equal(toward(from, { x: 100, y: 104 }, slip), false);
    // Steeper than the corner: past the slip's side.
    assert.equal(toward(from, { x: 150, y: 96 }, slip), false);
  });
  test('下に開く紙片では、下へ向かう動きを見る', () => {
    const below = { left: 0, right: 200, top: 120, bottom: 200 };
    assert.equal(toward(from, { x: 103, y: 104 }, below, true), true);
    assert.equal(toward(from, { x: 103, y: 96 }, below, true), false);
  });
});
