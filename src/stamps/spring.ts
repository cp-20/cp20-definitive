// The sticker in hand, kept free of the DOM so it can be tested in Node: the spring it follows the
// pointer with, and how a finger handles your own stickers on the page.
//
// A swipe that starts on one of your stickers scrolls the page like anywhere else, however long
// the finger rested first; a finger never drags it. A tap opens its menu, which moves or peels it
// (input.ts), even when it lies over a link.

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Where the sticker is, where it is headed, and how fast it is going (px/s). `base` is the angle
 * it rests at (deg): a sticker keeps its own slant in hand instead of straightening up.
 */
export type Spring = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  tilt: number;
  base?: number;
  scale: number;
  ts: number;
  // How high it is held off the paper (0 lying on it, 1 in hand), which its shadow shows, and
  // how high it is headed.
  lift?: number;
  tl?: number;
};

export const MAX_TILT = 7;
// How quickly the sticker catches up (rad/s). In hand it trails the pointer by about 2/40 s;
// let go, it flies home more loosely, so the speed it was thrown with shows in its path.
export const HELD = 40;
export const FLYING = 22;
// The sideways speed (px/s) at which it leans about three quarters of the way to MAX_TILT; it
// nears the limit smoothly, so a faster drag still leans a little further.
const LEAN_SPEED = 1200;
// How quickly the lean follows the speed (rad/s): slower than the position, so the frame-to-frame
// unevenness of pointer events does not make the sticker shiver.
const LEAN_RATE = 12;
// How quickly a sticker in hand grows and rises off the paper (rad/s): about 150 ms, slower than
// it follows the pointer, so being picked up reads as one movement along with the lean.
const PICKUP = 16;

/**
 * Moves one axis of a critically damped spring `dt` seconds on, exactly, so it moves the same
 * at 60 and 120 frames a second. It never swings back and forth, but a sticker thrown towards
 * its target can carry on just past it once, as a real one would. `k` is the stiffness.
 */
function follow(x: number, v: number, to: number, dt: number, k: number): [number, number] {
  const off = x - to,
    decay = Math.exp(-k * dt),
    lead = v + k * off;
  return [to + (off + lead * dt) * decay, (v - k * lead * dt) * decay];
}

/**
 * Moves the spring `dt` seconds on toward its target (tx, ty, ts) in place. It keeps its speed
 * when the target changes, so a sticker let go flies on into its way home, and it leans by how
 * fast it moves sideways, coming back to its own angle once it stops. A long step lands it at once.
 * @param dt seconds
 * @param k stiffness: HELD or FLYING
 * @returns whether it has come to rest
 */
export function springStep(m: Spring, dt: number, k = HELD): boolean {
  [m.x, m.vx] = follow(m.x, m.vx, m.tx, dt, k);
  [m.y, m.vy] = follow(m.y, m.vy, m.ty, dt, k);
  const ease = 1 - Math.exp(-(k === HELD ? PICKUP : k) * dt);
  const base = m.base ?? 0;
  m.tilt += (base + MAX_TILT * Math.tanh(m.vx / LEAN_SPEED) - m.tilt) * (1 - Math.exp(-LEAN_RATE * dt));
  m.scale += (m.ts - m.scale) * ease;
  const tl = m.tl ?? 0;
  m.lift = (m.lift ?? tl) + (tl - (m.lift ?? tl)) * ease;
  return (
    Math.hypot(m.tx - m.x, m.ty - m.y) < 0.5 &&
    Math.hypot(m.vx, m.vy) < 5 &&
    Math.abs(m.tilt - base) < 1 &&
    Math.abs(m.ts - m.scale) < 0.005 &&
    Math.abs(tl - m.lift) < 0.02
  );
}

// How far a sticker let go of while moving slides on before it settles: the distance it would
// cover in this many seconds at the speed it was let go with, up to THROW_MAX px.
const THROW_TIME = 0.05,
  THROW_MAX = 120;
// Only the pointer's last moments count towards that speed (ms); one held still before it was
// let go is not thrown at all.
const THROW_WINDOW = 80;

type Sample = { x: number; y: number; t: number };
/**
 * How fast the pointer was moving when let go (px/s), from where it was over the last few
 * moments (`samples`, oldest first, `t` in ms), or nothing if it had stopped by `now`.
 */
export function releaseVelocity(samples: readonly Sample[], now: number) {
  const last = samples.at(-1);
  if (!last || now - last.t > THROW_WINDOW / 2) return { vx: 0, vy: 0 };
  const first = samples.find((s) => last.t - s.t <= THROW_WINDOW) ?? last;
  const dt = (last.t - first.t) / 1000;
  if (dt <= 0) return { vx: 0, vy: 0 };
  return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt };
}

// How long (ms) the slide onto its spot may take (stick-slide in app.css).
const SLIDE_MIN = 180,
  SLIDE_MAX = 400;
/**
 * How long (ms) a sticker let go at `m` (its speed in px/s) takes to slide to (x, y), so it carries
 * on at the speed it left the hand: stick-slide's ease-out cubic starts at 3× its mean speed, so
 * distance D at speed v takes 3D/v. Nothing (the default length) when it was let go at rest.
 */
export function slideTime(m: { x: number; y: number; vx: number; vy: number }, x: number, y: number) {
  const speed = Math.hypot(m.vx, m.vy);
  if (speed < 60) return undefined;
  return Math.round(clamp((3000 * Math.hypot(x - m.x, y - m.y)) / speed, SLIDE_MIN, SLIDE_MAX));
}

/** How far (px) a sticker let go at this speed (px/s) slides on, in the direction it was going. */
export function throwCarry(vx: number, vy: number) {
  const speed = Math.hypot(vx, vy);
  if (speed < 1) return { x: 0, y: 0 };
  const length = Math.min(speed * THROW_TIME, THROW_MAX);
  return { x: (vx / speed) * length, y: (vy / speed) * length };
}

// How far a finger on your sticker may wander and still tap it; any further and the page scrolls.
export const HOLD_SLOP = 10;
// How far above the finger a tapped sticker floats, so the finger does not hide it.
export const LIFT = 70;
// How far above the fingertip a dragged sticker's center is held: clear of the finger's pad.
export const DRAG_RISE = 56;

/**
 * Whether a press is a tap or a scroll, never a drag: your stickers on the page, by touch or pen.
 * A mouse drags at once; the sheet sits fixed over the page and never scrolls it.
 */
export const waitsForHold = (held: { from: string; pointer: string }) =>
  held.from === 'page' && held.pointer !== 'mouse';

/**
 * Where a sticker tapped up off the page floats: above the finger when there is room under
 * `top` (the hint bar), below it otherwise, and always fully on screen.
 * @param width viewport width
 * @param height viewport height
 * @param top the lowest edge it may not float above
 * @param margin half a sticker, kept between it and the edges
 */
export function liftedSpot(x: number, y: number, width: number, height: number, top = 25, margin = 25) {
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
 * @param width viewport width
 * @param height viewport height
 * @param top the lowest edge it may not sit above
 * @param margin half a sticker as it is drawn in hand (enlarged), kept from the edges
 */
export function keptOnScreen(x: number, y: number, width: number, height: number, top = 0, margin = 30) {
  return {
    x: clamp(x, margin, width - margin),
    y: clamp(y, Math.min(top + margin, height - margin), height - margin),
  };
}
