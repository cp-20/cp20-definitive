// The spring behind the sticker in hand: it follows its target and leans into the direction
// of travel. Kept free of the DOM so it can be tested in Node.

/** @typedef {{ x: number; y: number; tx: number; ty: number; tilt: number; scale: number; ts: number }} Spring */

export const MAX_TILT = 22;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/**
 * Moves the spring one frame toward its target (tx, ty, ts) in place.
 * @param {Spring} m
 * @returns {boolean} whether it had come to rest
 */
export function springStep(m) {
  const dx = m.tx - m.x,
    dy = m.ty - m.y;
  m.x += dx * 0.32;
  m.y += dy * 0.32;
  m.tilt += (clamp(dx * 0.5, -MAX_TILT, MAX_TILT) - m.tilt) * 0.2;
  m.scale += (m.ts - m.scale) * 0.25;
  return Math.abs(dx) < 0.4 && Math.abs(dy) < 0.4 && Math.abs(m.tilt) < 0.3;
}
