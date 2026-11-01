// How a finger handles your own stickers on the page. Kept free of the DOM so it can be tested
// in Node.
//
// A swipe that starts on one of your stickers scrolls the page like anywhere else; the sticker
// only comes up to be dragged once it has been held still for a moment. A short tap on one lying
// over a link or button presses that control, and a tap anywhere else lifts it so the next tap
// puts it down.

// How long a finger rests on your sticker before it can be dragged.
export const HOLD_MS = 350;
// How far the finger may wander while it is held; any further and the page scrolls instead.
export const HOLD_SLOP = 10;
// How far above the finger a tapped sticker floats, so the finger does not hide it.
export const LIFT = 70;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/**
 * Whether a press waits for a long press before it drags: your stickers on the page, by touch
 * or pen. A mouse drags at once; the sheet sits fixed over the page and never scrolls it.
 * @param {{ from: string; pointer: string }} held
 */
export const waitsForHold = (held) => held.from === 'page' && held.pointer !== 'mouse';

/**
 * Where a sticker tapped up off the page floats: above the finger when there is room under
 * `top` (the hint bar), below it otherwise, and always fully on screen.
 * @param {number} x
 * @param {number} y
 * @param {number} width viewport width
 * @param {number} height viewport height
 * @param {number} [top] the lowest edge it may not float above
 * @param {number} [margin] half a sticker, kept between it and the edges
 */
export function liftedSpot(x, y, width, height, top = 25, margin = 25) {
  const above = y - LIFT;
  return {
    x: clamp(x, margin, width - margin),
    y: clamp(above >= top ? above : y + LIFT, margin, height - margin),
  };
}

/**
 * Where a sticker waiting for its spot goes when the screen changes size (a phone turned on its
 * side): the nearest point still fully on screen and below `top` (the hint bar) where there is
 * room for it.
 * @param {number} x
 * @param {number} y
 * @param {number} width viewport width
 * @param {number} height viewport height
 * @param {number} [top] the lowest edge it may not sit above
 * @param {number} [margin] half a sticker as it is drawn in hand (enlarged), kept from the edges
 */
export function keptOnScreen(x, y, width, height, top = 0, margin = 30) {
  return {
    x: clamp(x, margin, width - margin),
    y: clamp(y, Math.min(top + margin, height - margin), height - margin),
  };
}

// Controls a tap on your sticker presses instead of lifting the sticker.
export const TAPPABLE =
  'a[href], button, summary, label, input, select, textarea, [role="button"], [role="link"], [role="tab"]';
