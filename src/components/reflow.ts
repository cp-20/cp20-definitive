// Switching a list of cards to another set (another year's articles): the cards that go fade out
// where they were, taken out of the flow, so the ones that come are in their places from the
// first frame and fade in there. Only opacity animates, so nothing is laid out again and the
// stickers on a card (placed against its stamp anchor) fade with it without moving off it.
// Cards off screen before and after are left alone. A quick second switch carries each card on
// from how faded it is, so none flashes back.
type Rect = { top: number; bottom: number };

const FADE = { duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };
// How far off screen still counts as on it, so a card just past the edge is not skipped.
const MARGIN = 40;

/**
 * A card's opacity from and to, given where it was and is (each when shown) and, if it was caught
 * fading, how faded it was then; null when it does not animate.
 */
export function fadeFor(
  was: Rect | undefined,
  now: Rect | undefined,
  viewport: number,
  caught?: number,
): [number, number] | null {
  const seen = (r: Rect | undefined) => !!r && r.bottom > -MARGIN && r.top < viewport + MARGIN;
  if (!seen(was) && !seen(now)) return null;
  const from = caught ?? (was ? 1 : 0),
    to = now ? 1 : 0;
  return Math.abs(from - to) < 0.01 ? null : [from, to];
}

const frames = (opacity: [number, number]): Keyframe[] => opacity.map((o) => ({ opacity: o }));

const running = new WeakMap<HTMLElement, Animation[]>();

function settle(row: HTMLElement) {
  if (!row.classList.contains('leaving')) return;
  row.classList.remove('leaving');
  row.style.removeProperty('inset');
  row.style.removeProperty('width');
}

/**
 * Runs `update` (which must apply its changes to the DOM before it returns, e.g. with Solid's
 * flush()) and fades `list`'s children that it hides ([hidden]) or shows.
 */
export function reflow(list: HTMLElement, update: () => void) {
  if (!list.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return update();
  const rows = [...list.children] as HTMLElement[];
  // How faded each card on screen from the last switch is (a card that has gone is not on screen),
  // and where each card shown now is.
  const caught = new Map<HTMLElement, number>();
  const previous = running.get(list) ?? [];
  for (const a of previous) {
    const row = (a.effect as KeyframeEffect | null)?.target as HTMLElement | null;
    if (!row || row.parentElement !== list || caught.has(row)) continue;
    if (!row.hidden || row.classList.contains('leaving'))
      caught.set(row, Number(getComputedStyle(row).opacity));
  }
  const before = new Map<HTMLElement, DOMRect>();
  const kept = new Map<HTMLElement, [string, string]>();
  for (const row of rows) {
    if (row.classList.contains('leaving')) kept.set(row, [row.style.inset, row.style.width]);
    if (!row.hidden || kept.has(row)) before.set(row, row.getBoundingClientRect());
  }
  const box = list.getBoundingClientRect();
  for (const a of previous) a.cancel();
  for (const row of rows) settle(row);
  update();
  // The cards that go are taken out of the flow where they were before anything is measured, so
  // the page is laid out once here and only animated after. One that is already invisible just goes.
  const going = new Map<HTMLElement, [number, number]>();
  for (const row of rows) {
    const from = before.get(row);
    const opacity = row.hidden && from && fadeFor(from, undefined, innerHeight, caught.get(row));
    if (!opacity) continue;
    const [inset, width] = kept.get(row) ?? [
      `${from.top - box.top}px auto auto ${from.left - box.left}px`,
      `${from.width}px`,
    ];
    row.classList.add('leaving');
    row.style.inset = inset;
    row.style.width = width;
    going.set(row, opacity);
  }
  const anims: Animation[] = [];
  const faded: [anchor: string, opacity: [number, number], card: Animation][] = [];
  for (const row of rows) {
    const now = row.hidden ? undefined : row.getBoundingClientRect();
    const opacity = now ? fadeFor(before.get(row), now, innerHeight, caught.get(row)) : going.get(row);
    if (!opacity) continue;
    // A card that goes stays faded until it is taken out, however late that runs, and then lets go.
    const anim = row.animate(frames(opacity), { ...FADE, fill: now ? 'none' : 'forwards' });
    if (!now)
      anim.onfinish = () => {
        settle(row);
        anim.cancel();
      };
    anims.push(anim);
    if (row.dataset.stampAnchor) faded.push([row.dataset.stampAnchor, opacity, anim]);
  }
  running.set(list, anims);
  if (!faded.length) return;
  // The stickers are placed again on the frame after a change to the page (placement.ts), so
  // they are picked up after that and put on their cards' clock. A sticker on a card that goes
  // stays faded until it is taken off with the card.
  queueMicrotask(() =>
    requestAnimationFrame(() => {
      if (running.get(list) !== anims) return;
      for (const [anchor, opacity, card] of faded)
        for (const el of document.querySelectorAll<HTMLElement>(
          `.placed-stamp[data-anchor="${CSS.escape(anchor)}"]`,
        )) {
          const anim = el.animate(frames(opacity), {
            ...FADE,
            fill: opacity[1] ? 'none' : 'forwards',
          });
          card.ready.then(
            () => anim.playState !== 'idle' && (anim.startTime = card.startTime),
            () => {},
          );
          anims.push(anim);
        }
    }),
  );
}
