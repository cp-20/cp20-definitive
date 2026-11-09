// The arithmetic of the yearly attendance cards (AttendanceCard.tsx): which day of which year an
// article was stamped on, where a second stamp on the same day goes, and how the keyboard and a
// fingertip find a stamp on a card whose days are only a few pixels wide.
import { formatDate, type Article } from '../content/content.ts';

export type Day = { y: number; m: number; d: number };
export type Stamp = Day & { a: Article; nth: number };

const days = new Map<string, Day>();
/** The day an article came out, in Japan time (the dates the site shows). */
export function dayOf(a: Article): Day {
  let day = days.get(a.date);
  if (!day) {
    const [y, m, d] = formatDate(a.date).split('/').map(Number);
    days.set(a.date, (day = { y, m, d }));
  }
  return day;
}
export const yearOf = (a: Article) => dayOf(a).y;
/** The years with articles, oldest first. */
export const yearsOf = (items: Article[]) => [...new Set(items.map(yearOf))].sort((a, b) => a - b);
export const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * A year's stamps in date order (the order they are read and stepped through). A second article
 * on a day is pressed beside the first (`nth`).
 */
export function stampsOf(items: Article[], year: number): Stamp[] {
  const stamps = items
    .filter((a) => yearOf(a) === year)
    .map((a) => ({ a, ...dayOf(a), nth: 0 }))
    .sort((p, q) => p.a.date.localeCompare(q.a.date));
  stamps.forEach((s, i) => {
    const before = stamps[i - 1];
    if (before && before.m === s.m && before.d === s.d) s.nth = before.nth + 1;
  });
  return stamps;
}

/**
 * Where an arrow key goes from `from` among `stamps` (in date order): ←/→ to the stamp before or
 * after, ↑/↓ to the nearest day in the closest month above or below that has a stamp, Home/End
 * to the first and last. Undefined for any other key, or when there is nowhere to go.
 */
export function step(stamps: Pick<Day, 'm' | 'd'>[], from: number, key: string): number | undefined {
  const last = stamps.length - 1;
  const to =
    key === 'ArrowLeft'
      ? from - 1
      : key === 'ArrowRight'
        ? from + 1
        : key === 'Home'
          ? 0
          : key === 'End'
            ? last
            : key === 'ArrowUp' || key === 'ArrowDown'
              ? nearestInRow(stamps, from, key === 'ArrowUp' ? -1 : 1)
              : undefined;
  return to === undefined || to < 0 || to > last || to === from ? undefined : to;
}
function nearestInRow(stamps: Pick<Day, 'm' | 'd'>[], from: number, dir: -1 | 1) {
  const here = stamps[from];
  let best: number | undefined;
  stamps.forEach((s, i) => {
    if ((s.m - here.m) * dir <= 0) return;
    const b = best === undefined ? undefined : stamps[best];
    if (
      !b ||
      Math.abs(s.m - here.m) < Math.abs(b.m - here.m) ||
      (s.m === b.m && Math.abs(s.d - here.d) < Math.abs(b.d - here.d))
    )
      best = i;
  });
  return best;
}

/**
 * The stamp a tap at (x, y) means: the nearest one whose centre is within `reach`, so a finger
 * finds a stamp on a day only a few pixels wide. -1 when none is that close.
 */
export function nearest(centres: { x: number; y: number }[], x: number, y: number, reach: number) {
  let best = -1,
    bestDistance = reach;
  centres.forEach((c, i) => {
    const distance = Math.hypot(c.x - x, c.y - y);
    if (distance <= bestDistance) [best, bestDistance] = [i, distance];
  });
  return best;
}

/**
 * Which way a stamp's slip opens so it stays on the card: from the stamp's left edge early in
 * the month, from its right edge late in it, centred between; below the stamp in the first
 * months (above them is the card's heading), above it after.
 */
export const tipPlace = (s: Pick<Day, 'm' | 'd'>) => ({
  edge: s.d <= 11 ? 'start' : s.d >= 21 ? 'end' : undefined,
  below: s.m <= 3 || undefined,
});
