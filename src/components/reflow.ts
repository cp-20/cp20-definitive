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

// A card that stays put but was caught fading in.
const still = (): Motion => ({ from: [0, 0], to: [0, 0], opacity: [1, 1], scale: [1, 1] });

const frames = (m: Motion, scaled: boolean): Keyframe[] =>
  [0, 1].map((i) => ({
    transform: `translate(${m[i ? 'to' : 'from'].join('px, ')}px)` + (scaled ? ` scale(${m.scale[i]})` : ''),
    opacity: m.opacity[i],
  }));

const running = new WeakMap<HTMLElement, Animation[]>();

function settle(row: HTMLElement) {
  if (!row.classList.contains('leaving')) return;
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
  // Where each card is seen now and how faded it is, mid-animation included, so a quick second
  // choice carries on from there: a card caught fading out fades on from where it is, or comes
  // back from there.
  const before = new Map<HTMLElement, DOMRect>();
  const caught = new Map<HTMLElement, { opacity: number; scale: number }>();
  const previous = running.get(list) ?? [];
  for (const a of previous) {
    const row = (a.effect as KeyframeEffect | null)?.target as HTMLElement | null;
    if (row?.parentElement !== list || caught.has(row)) continue;
    const style = getComputedStyle(row);
    const scale = style.transform === 'none' ? 1 : new DOMMatrixReadOnly(style.transform).a;
    caught.set(row, { opacity: Number(style.opacity), scale });
  }
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
  // the page is laid out once here and only animated after.
  for (const row of rows) {
    const from = before.get(row);
    if (!row.hidden || !from || from.bottom < -MARGIN || from.top > innerHeight + MARGIN) continue;
    const [inset, width] = kept.get(row) ?? [
      `${from.top - box.top}px auto auto ${from.left - box.left}px`,
      `${from.width}px`,
    ];
    row.classList.add('leaving');
    row.style.inset = inset;
    row.style.width = width;
  }
  const after = rows.map((row) => (row.hidden ? undefined : row.getBoundingClientRect()));
  const anims: Animation[] = [];
  const moved: [anchor: string, motion: Motion, timing: KeyframeAnimationOptions, card: Animation][] = [];
  rows.forEach((row, i) => {
    const from = before.get(row);
    const now = caught.get(row);
    const motion = motionFor(from, after[i], innerHeight) ?? (now && from && after[i] ? still() : null);
    if (!motion) return;
    const timing = motion.opacity[0] === motion.opacity[1] ? MOVE : FADE;
    // A card caught mid-animation on screen starts exactly where and as it is seen: no brighter,
    // and at the size and spot it had shrunk or moved to.
    if (now && from && from.bottom > 0 && from.top < innerHeight) {
      const at = after[i] ?? row.getBoundingClientRect();
      const grown = (1 - now.scale) / 2;
      motion.opacity[0] = Math.min(motion.opacity[0], now.opacity);
      motion.scale[0] = now.scale;
      motion.from = [from.left - at.left - grown * at.width, from.top - at.top - grown * at.height];
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
