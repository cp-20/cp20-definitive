// Where placed stickers are drawn. A sticker is stored as a fraction of its anchor's box (a
// section, a heading, the page), so it stays on the same content at any screen width.

import type { PlacedStamp, Stamp } from './types.ts';

export type Box = { x: number; y: number; w: number; h: number };
export type ShownStamp = PlacedStamp & { key: string; left: number; top: number };

/** Half of a placed sticker's 46px box (.placed-stamp in app.css). */
export const STICKER_RADIUS = 23;

/** What a sticker looks like and where it lies; two stickers alike are drawn as one. */
export const visualKey = (s: Omit<Stamp, 'createdAt'>) => `${s.anchor}|${s.x}|${s.y}|${s.kind}|${s.angle}`;

/** Where a point (in page coordinates) lies in a box, as fractions; null when outside it. */
export function spotIn(box: Box, px: number, py: number) {
  if (px < box.x || px > box.x + box.w || py < box.y || py > box.y + box.h) return null;
  return { x: (px - box.x) / box.w, y: (py - box.y) / box.h };
}

const sameShown = (a: PlacedStamp, b: PlacedStamp) =>
  a.id === b.id &&
  a.owner === b.owner &&
  a.slot === b.slot &&
  a.avatar === b.avatar &&
  a.createdAt === b.createdAt;

/**
 * The stickers to draw, with their page coordinates, by visual key. A sticker whose anchor is not
 * shown (`boxOf` gives null) is left out. The index tabs hang off the page's right edge, so a
 * sticker is kept left of it (a little more than its radius, since a tilted one reaches past its
 * box). An entry of `previous` that did not change is reused as it is, so redrawing touches only
 * the stickers that moved.
 */
export function layoutStamps(
  stamps: readonly PlacedStamp[],
  boxOf: (anchor: string) => Box | null,
  previous: ReadonlyMap<string, ShownStamp> = new Map(),
): Map<string, ShownStamp> {
  const shown = new Map<string, ShownStamp>();
  for (const stamp of stamps) {
    const box = boxOf(stamp.anchor);
    if (!box) continue;
    // Asked here, not before the loop: a page without stickers measures nothing (and there is no
    // page to measure while prerendering). boxOf measures each anchor once.
    const page = boxOf('page');
    const right = page ? page.x + page.w - STICKER_RADIUS - 8 : Infinity;
    const key = visualKey(stamp),
      left = Math.min(box.x + box.w * stamp.x, right),
      top = box.y + box.h * stamp.y,
      before = previous.get(key);
    const unchanged = before && before.left === left && before.top === top && sameShown(before, stamp);
    shown.set(key, unchanged ? before : { ...stamp, key, left, top });
  }
  return shown;
}

/** The topmost drawn sticker under a point (in page coordinates) that `accept` takes. */
export const stampAt = (
  shown: readonly ShownStamp[],
  px: number,
  py: number,
  accept: (stamp: ShownStamp) => boolean,
) => shown.findLast((s) => accept(s) && Math.hypot(s.left - px, s.top - py) <= STICKER_RADIUS);

/** The menu of one of your stickers (.stamp-menu in app.css): two 44px buttons in a pill. */
export const MENU_WIDTH = 104,
  MENU_HEIGHT = 56;
// Kept between the menu and the sticker, and between the menu and the screen's edges.
const MENU_GAP = 8;

/**
 * Where the menu of a sticker on screen (`box`, viewport coordinates) goes: centered above it,
 * or below it when there is no room above, and never past the sides of a screen `width` wide.
 * @returns its center `x`, and `y`: its bottom edge above the sticker, or its top edge below it
 */
export function menuSpot(box: { left: number; top: number; right: number; bottom: number }, width: number) {
  const half = MENU_WIDTH / 2 + MENU_GAP;
  const x = Math.min(Math.max((box.left + box.right) / 2, half), Math.max(half, width - half));
  const below = box.top - MENU_GAP - MENU_HEIGHT < MENU_GAP;
  return { x, y: below ? box.bottom + MENU_GAP : box.top - MENU_GAP, below };
}
