// Where placed stickers are drawn. A sticker is stored as a fraction of its anchor's box (a
// section, a heading, the page), so it stays on the same content at any screen width. Kept free
// of the DOM so it can be tested in Node.

/** @typedef {import('./stamp-types').PlacedStamp} PlacedStamp */
/** @typedef {{ x: number; y: number; w: number; h: number }} Box */
/** @typedef {PlacedStamp & { key: string; left: number; top: number }} ShownStamp */

/** Half of a placed sticker's 46px box (.placed-stamp in app.css). */
export const STICKER_RADIUS = 23;

/** What a sticker looks like and where it lies; two stickers alike are drawn as one. */
export const visualKey = (s) => `${s.anchor}|${s.x}|${s.y}|${s.kind}|${s.angle}`;

/**
 * Where a point (in page coordinates) lies in a box, as fractions; null when outside it.
 * @param {Box} box
 * @param {number} px
 * @param {number} py
 */
export function spotIn(box, px, py) {
  if (px < box.x || px > box.x + box.w || py < box.y || py > box.y + box.h) return null;
  return { x: (px - box.x) / box.w, y: (py - box.y) / box.h };
}

const sameShown = (a, b) =>
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
 * @param {readonly PlacedStamp[]} stamps
 * @param {(anchor: string) => Box | null} boxOf
 * @param {ReadonlyMap<string, ShownStamp>} [previous]
 * @returns {Map<string, ShownStamp>}
 */
export function layoutStamps(stamps, boxOf, previous = new Map()) {
  const shown = new Map();
  for (const stamp of stamps) {
    const box = boxOf(stamp.anchor);
    if (!box) continue;
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

/**
 * The topmost drawn sticker under a point (in page coordinates) that `accept` takes.
 * @param {readonly ShownStamp[]} shown in drawing order
 * @param {number} px
 * @param {number} py
 * @param {(stamp: ShownStamp) => boolean} accept
 */
export const stampAt = (shown, px, py, accept) =>
  shown.findLast((s) => accept(s) && Math.hypot(s.left - px, s.top - py) <= STICKER_RADIUS);
