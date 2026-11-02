// Filtering or sorting a list of cards (FLIP): the cards that stay glide from where they were to
// where the update puts them, the ones that go fade out where they were and the ones that come
// fade in where they land. Only transform and opacity animate, so nothing is laid out again and
// the list's real layout is in place from the first frame. Cards off screen before and after
// are left alone, and a card that moves between the screen and off it fades instead of flying.
// The stickers on a card (placed against its stamp anchor) follow it.
type Rect = { top: number; bottom: number; left: number };
type Motion = {
  from: [number, number];
  to: [number, number];
  opacity: [number, number];
  scale: [number, number];
};

const MOVE = { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };
const FADE = { duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };
// How far off screen still counts as on it, so a card just past the edge is not skipped.
const MARGIN = 40;
const SHRUNK = 0.96;

/** What a card does, given where it was (if shown) and where it is now (if shown). */
export function motionFor(from: Rect | undefined, to: Rect | undefined, viewport: number): Motion | null {
  const seen = (r: Rect | undefined): r is Rect => !!r && r.bottom > -MARGIN && r.top < viewport + MARGIN;
  const still: [number, number] = [0, 0];
  if (!to) return seen(from) ? { from: still, to: still, opacity: [1, 0], scale: [1, SHRUNK] } : null;
  if (!from) return seen(to) ? { from: still, to: still, opacity: [0, 1], scale: [SHRUNK, 1] } : null;
  const d: [number, number] = [from.left - to.left, from.top - to.top];
  if (Math.abs(d[0]) < 1 && Math.abs(d[1]) < 1) return null;
  if (seen(from) && seen(to)) return { from: d, to: still, opacity: [1, 1], scale: [1, 1] };
  // Comes onto the screen from far away: appears where it lands.
  if (seen(to)) return { from: still, to: still, opacity: [0, 1], scale: [SHRUNK, 1] };
  // Goes off the screen: fades where it was (held there by the transform), then is where it belongs.
  if (seen(from)) return { from: d, to: d, opacity: [1, 0], scale: [1, SHRUNK] };
  return null;
}

const frames = (m: Motion, scaled: boolean): Keyframe[] =>
  [0, 1].map((i) => ({
    transform: `translate(${m[i ? 'to' : 'from'].join('px, ')}px)` + (scaled ? ` scale(${m.scale[i]})` : ''),
    opacity: m.opacity[i],
  }));

const running = new WeakMap<HTMLElement, Animation[]>();

function settle(row: HTMLElement) {
  row.classList.remove('leaving');
  row.style.removeProperty('inset');
  row.style.removeProperty('width');
}

/**
 * Runs `update` (which must apply its changes to the DOM before it returns, e.g. with Solid's
 * flush()) and animates `list`'s children into place. Hidden children ([hidden]) are not shown.
 */
export function reflow(list: HTMLElement, update: () => void) {
  if (!list.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return update();
  const rows = [...list.children] as HTMLElement[];
  // Where each card is seen now, mid-animation included.
  const before = new Map<HTMLElement, DOMRect>();
  for (const row of rows)
    if (!row.hidden || row.classList.contains('leaving')) before.set(row, row.getBoundingClientRect());
  for (const a of running.get(list) ?? []) a.cancel();
  for (const row of rows) settle(row);
  update();
  const box = list.getBoundingClientRect();
  const after = rows.map((row) => (row.hidden ? undefined : row.getBoundingClientRect()));
  const anims: Animation[] = [];
  const moved: [anchor: string, motion: Motion, timing: KeyframeAnimationOptions, card: Animation][] = [];
  rows.forEach((row, i) => {
    const from = before.get(row);
    const motion = motionFor(from, after[i], innerHeight);
    if (!motion) return;
    const timing = motion.opacity[0] === motion.opacity[1] ? MOVE : FADE;
    if (!after[i]) {
      // Kept on the page where it was, out of the flow, until it has faded.
      row.classList.add('leaving');
      row.style.inset = `${from!.top - box.top}px auto auto ${from!.left - box.left}px`;
      row.style.width = `${from!.width}px`;
    }
    const anim = row.animate(frames(motion, true), timing);
    if (!after[i]) anim.onfinish = () => settle(row);
    anims.push(anim);
    // A sticker on a card that leaves stays faded until it is taken off with the card.
    if (row.dataset.stampAnchor)
      moved.push([
        row.dataset.stampAnchor,
        motion,
        after[i] ? timing : { ...timing, fill: 'forwards' },
        anim,
      ]);
  });
  running.set(list, anims);
  if (!moved.length) return;
  // The cards start moving on the first frame that shows the change, however long it takes.
  // The stickers are placed again on the frame after a change to the page (placement.ts), so
  // they are picked up after that and put on their cards' clock.
  queueMicrotask(() =>
    requestAnimationFrame(() => {
      if (running.get(list) !== anims) return;
      for (const [anchor, motion, timing, card] of moved)
        for (const el of document.querySelectorAll<HTMLElement>(
          `.placed-stamp[data-anchor="${CSS.escape(anchor)}"]`,
        )) {
          const anim = el.animate(frames(motion, false), timing);
          card.ready.then(
            () => anim.playState !== 'idle' && (anim.startTime = card.startTime),
            () => {},
          );
          anims.push(anim);
        }
    }),
  );
}
