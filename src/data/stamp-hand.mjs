// @ts-check
// The sticker in hand, kept free of the DOM so it can be tested in Node: the spring it follows the
// pointer with, and how a finger handles your own stickers on the page.
//
// A swipe that starts on one of your stickers scrolls the page like anywhere else; the sticker
// only comes up to be dragged once it has been held still for a moment. A short tap on one lying
// over a link or button presses that control, and a tap anywhere else lifts it so the next tap
// puts it down.

/** @param {number} v @param {number} min @param {number} max */
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/**
 * Where the sticker is, where it is headed, and how fast it is going (px/s). `base` is the angle
 * it rests at (deg): a sticker keeps its own slant in hand instead of straightening up.
 * @typedef {{ x: number; y: number; vx: number; vy: number; tx: number; ty: number; tilt: number; base?: number; scale: number; ts: number }} Spring
 */

export const MAX_TILT = 18;
// How quickly the sticker catches up (rad/s). In hand it trails the pointer by about 2/40 s;
// let go, it flies home more loosely, so the speed it was thrown with shows in its path.
export const HELD = 40;
export const FLYING = 22;
// The sideways speed (px/s) at which it leans about three quarters of the way to MAX_TILT; it
// nears the limit smoothly, so a faster drag still leans a little further.
const LEAN_SPEED = 1500;

/**
 * Moves one axis of a critically damped spring `dt` seconds on, exactly, so it moves the same
 * at 60 and 120 frames a second. It never swings back and forth, but a sticker thrown towards
 * its target can carry on just past it once, as a real one would.
 * @param {number} x
 * @param {number} v
 * @param {number} to
 * @param {number} dt
 * @param {number} k stiffness
 */
function follow(x, v, to, dt, k) {
  const off = x - to,
    decay = Math.exp(-k * dt),
    lead = v + k * off;
  return [to + (off + lead * dt) * decay, (v - k * lead * dt) * decay];
}

/**
 * Moves the spring `dt` seconds on toward its target (tx, ty, ts) in place. It keeps its speed
 * when the target changes, so a sticker let go flies on into its way home, and it leans by how
 * fast it moves sideways, coming back to its own angle once it stops. A long step lands it at once.
 * @param {Spring} m
 * @param {number} dt seconds
 * @param {number} [k] stiffness: HELD or FLYING
 * @returns {boolean} whether it has come to rest
 */
export function springStep(m, dt, k = HELD) {
  [m.x, m.vx] = follow(m.x, m.vx, m.tx, dt, k);
  [m.y, m.vy] = follow(m.y, m.vy, m.ty, dt, k);
  const ease = 1 - Math.exp(-k * dt);
  const base = m.base ?? 0;
  m.tilt += (base + MAX_TILT * Math.tanh(m.vx / LEAN_SPEED) - m.tilt) * ease;
  m.scale += (m.ts - m.scale) * ease;
  return (
    Math.hypot(m.tx - m.x, m.ty - m.y) < 0.5 &&
    Math.hypot(m.vx, m.vy) < 5 &&
    Math.abs(m.tilt - base) < 1 &&
    Math.abs(m.ts - m.scale) < 0.005
  );
}

// How long a finger rests on your sticker before it can be dragged.
export const HOLD_MS = 350;
// How far the finger may wander while it is held; any further and the page scrolls instead.
export const HOLD_SLOP = 10;
// How far above the finger a tapped sticker floats, so the finger does not hide it.
export const LIFT = 70;

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
