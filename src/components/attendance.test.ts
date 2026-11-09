import { describe, expect, it } from 'vitest';
import { dayOf, daysIn, nearest, stampsOf, step, tipPlace, yearsOf } from './attendance.ts';

const article = (date: string, n = 0) => ({
  title: `t${n}`,
  url: `https://zenn.dev/a/${n}`,
  date,
  source: 'zenn.dev',
});

describe('dayOf', () => {
  it('reads the day in Japan time, as the site shows it', () => {
    expect(dayOf(article('2025-12-31T15:30:00.000Z'))).toEqual({ y: 2026, m: 1, d: 1 });
    expect(dayOf(article('2025-12-31T14:30:00.000Z'))).toEqual({ y: 2025, m: 12, d: 31 });
  });
});

describe('yearsOf / daysIn', () => {
  it('lists each year once, oldest first', () => {
    const items = ['2024-05-01', '2022-01-02', '2024-01-01', '2023-03-03'].map((d, i) =>
      article(`${d}T00:00:00.000Z`, i),
    );
    expect(yearsOf(items)).toEqual([2022, 2023, 2024]);
  });
  it('knows short months and leap years', () => {
    expect([daysIn(2024, 2), daysIn(2025, 2), daysIn(2025, 4), daysIn(2025, 12)]).toEqual([29, 28, 30, 31]);
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
  it("keeps only the year's articles, in date order", () => {
    expect(stampsOf(items, 2025).map((s) => s.a.title)).toEqual(['t4', 't2', 't1', 't5']);
  });
  it('presses a second and third stamp on the same day beside the first', () => {
    expect(stampsOf(items, 2025).map((s) => [s.m, s.d, s.nth])).toEqual([
      [1, 10, 0],
      [4, 2, 0],
      [4, 2, 1],
      [4, 2, 2],
    ]);
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
  it('moves to the stamp before or after with ← and →, and to the ends with Home and End', () => {
    expect([step(stamps, 2, 'ArrowLeft'), step(stamps, 2, 'ArrowRight')]).toEqual([1, 3]);
    expect([step(stamps, 2, 'Home'), step(stamps, 2, 'End')]).toEqual([0, 4]);
  });
  it('goes nowhere past the ends or for other keys', () => {
    expect([step(stamps, 0, 'ArrowLeft'), step(stamps, 4, 'ArrowRight')]).toEqual([undefined, undefined]);
    expect([step(stamps, 0, 'Home'), step(stamps, 1, 'Enter')]).toEqual([undefined, undefined]);
  });
  it('moves to the nearest day in the closest month with a stamp with ↑ and ↓', () => {
    expect(step(stamps, 1, 'ArrowDown')).toBe(3); // Jan 20 → Mar 28 (skips the empty February)
    expect(step(stamps, 0, 'ArrowDown')).toBe(2); // Jan 3 → Mar 1
    expect(step(stamps, 4, 'ArrowUp')).toBe(3); // Jun 15 → Mar 28 (13 days off, against 14)
    expect(step(stamps, 0, 'ArrowUp')).toBeUndefined();
    expect(step(stamps, 4, 'ArrowDown')).toBeUndefined();
  });
});

describe('nearest', () => {
  const centres = [
    { x: 10, y: 10 },
    { x: 30, y: 10 },
    { x: 100, y: 100 },
  ];
  it('finds the closest stamp within reach of a tap', () => {
    expect(nearest(centres, 18, 12, 24)).toBe(0);
    expect(nearest(centres, 24, 14, 24)).toBe(1);
    expect(nearest(centres, 90, 110, 24)).toBe(2);
  });
  it('finds none when every stamp is out of reach', () => {
    expect(nearest(centres, 60, 60, 24)).toBe(-1);
    expect(nearest([], 0, 0, 24)).toBe(-1);
  });
});

describe('tipPlace', () => {
  it('opens the slip toward the middle of the card and below the first months', () => {
    expect(tipPlace({ m: 1, d: 2 })).toEqual({ edge: 'start', below: true });
    expect(tipPlace({ m: 6, d: 16 })).toEqual({ edge: undefined, below: undefined });
    expect(tipPlace({ m: 12, d: 30 })).toEqual({ edge: 'end', below: undefined });
  });
});
