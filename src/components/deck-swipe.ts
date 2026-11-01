// A swipe across the featured works, kept free of the DOM so it can be tested in Node.
// Whether it turns the deck is judged by where the card would coast to after the finger lets go,
// so a quick short flick turns it as surely as a long slow drag.

// The card slows by 1% every millisecond once let go, like a page that stops soon.
const DECAY = 0.99;
// How far (px) the card must be going to travel before the deck turns.
export const TURN_AT = 72;

/** How far a card let go at `speed` (px/ms) coasts on before it stops. */
export const coastDistance = (speed: number) => (speed * DECAY) / (1 - DECAY);

/**
 * The finger's speed (px/ms) over the moves it made in the last 100ms before `now`.
 * @param moves oldest first
 * @param x where the finger is at `now`
 */
export function fingerSpeed(moves: { t: number; x: number }[], now: number, x: number) {
  const first = moves.find((m) => now - m.t <= 100);
  return first && now > first.t ? (x - first.x) / (now - first.t) : 0;
}

/**
 * Which way a swipe let go turns the deck: 1 to the next work, -1 to the previous, 0 not at all.
 * Mostly vertical swipes are scrolls and never turn it.
 * @param dx px moved across since the finger came down
 * @param dy px moved down
 * @param speed px/ms across when let go
 */
export function swipeTurn(dx: number, dy: number, speed: number) {
  if (Math.abs(dx) <= Math.abs(dy) * 1.4) return 0;
  const coast = dx + coastDistance(speed);
  return Math.abs(coast) <= TURN_AT ? 0 : coast < 0 ? 1 : -1;
}
