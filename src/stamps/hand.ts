// The sticker in hand: taken from the sheet or lifted off the page, it follows the pointer (or
// the arrow keys) on a spring drawn outside Solid on every frame, so dragging stays smooth, and
// is then set down, put back or peeled off. How pointers, fingers and keys drive it is in
// input.ts.
import { createSignal, flush } from 'solid-js';
import type { PlacedStamp } from './types.ts';
import { FLYING, clamp, springStep } from './spring.ts';
import { OVER_SHEET, stampAnnouncement } from './a11y.ts';
import { STICKER_RADIUS, visualKey } from './layout.ts';
import { overSheetAt, placeAt } from './placement.ts';
import { reducedMotion } from './prefs.ts';
import { stickerName } from './kinds.tsx';
// A sticker in hand: pressed (not moved yet), dragged, or aimed (click-to-place / keyboard).
export type Held = {
  kind: number;
  from: 'sheet' | 'page';
  target?: PlacedStamp;
  mode: 'press' | 'drag' | 'aim';
  pointer: string;
};
type Point = { x: number; y: number };
// Creates signals: call it synchronously inside the component that owns them.
export function createHand(options: {
  isOwn: (s: PlacedStamp) => boolean;
  // Yours that are not peeling off.
  own: () => PlacedStamp[];
  remaining: () => number;
  put: (x: number, y: number, kind: number, angle: number, from: Point, target?: PlacedStamp) => string;
  erase: (target: PlacedStamp, animate: boolean) => void;
  say: (text: string) => void;
  open: () => boolean | null;
  sheet: () => HTMLElement | undefined;
  tab: () => HTMLElement | undefined;
  sheetFocus: () => HTMLElement | undefined;
  // Also the scale it is drawn at there, against one in hand.
  slotCenter: (kind: number) => Point & { scale: number };
}) {
  const { say } = options;
  const nameOf = stickerName;
  const [held, setHeld] = createSignal<Held | null>(null),
    // The sticker drawn in hand; it stays while flying back after `held` is cleared.
    [ghostKind, setGhostKind] = createSignal(-1),
    // Your sticker lifted off the page, hidden under the one in hand.
    [lifted, setLifted] = createSignal(''),
    // The sheet sticker that is in hand or flying back to its slot, faded until it lands.
    [taken, setTaken] = createSignal(-1);
  let ghost: HTMLElement | undefined;
  // ── The spring ──
  // Its position follows the target and leans into the direction of travel (spring.ts).
  const motion = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    tx: 0,
    ty: 0,
    tilt: 0,
    // The angle it rests at in hand, and is set down at when held still.
    base: 0,
    scale: 1,
    ts: 1,
    // Called once the sticker has flown to where it was sent.
    home: null as null | (() => void),
  };
  let raf = 0;
  function paint() {
    if (ghost)
      ghost.style.transform = `translate(${motion.x}px, ${motion.y}px) rotate(${motion.tilt}deg) scale(${motion.scale})`;
  }
  function animate() {
    cancelAnimationFrame(raf);
    let last = performance.now();
    const step = (now: number) => {
      // A frame late by more than 1/30s moves it no further than one on time would; with reduced
      // motion one long step lands it where it is going at once.
      const dt = reducedMotion() ? 10 : Math.min(Math.max(now - last, 0) / 1000, 1 / 30);
      last = now;
      const settled = springStep(motion, dt, motion.home ? FLYING : undefined);
      paint();
      if (motion.home && settled) {
        const done = motion.home;
        motion.home = null;
        done();
        return;
      }
      if (held() || motion.home) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  const stop = () => cancelAnimationFrame(raf);
  // Send the sticker to a point on screen at a scale, then call `done`. It keeps the speed it was
  // let go with, so a throw carries on into the flight.
  function flyTo(point: Point, scale: number, done: () => void) {
    motion.tx = point.x;
    motion.ty = point.y;
    motion.ts = scale;
    motion.home = done;
    animate();
  }
  // ── Taking it and putting it down ──
  function homeOf(h: Held) {
    const box =
      h.from === 'page' && h.target
        ? document.querySelector(`[data-stamp-id="${CSS.escape(h.target.id)}"]`)?.getBoundingClientRect()
        : undefined;
    return box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : options.slotCenter(h.kind);
  }
  function begin(next: Held, start: Point, pointer: Point) {
    refocus = undefined;
    setHeld(next);
    setGhostKind(next.kind);
    setTaken(next.from === 'sheet' ? next.kind : -1);
    motion.home = null;
    motion.x = start.x;
    motion.y = start.y;
    motion.vx = 0;
    motion.vy = 0;
    motion.tx = pointer.x;
    motion.ty = pointer.y;
    // One of yours keeps its own slant; a new one from the sheet takes a slight random one as it
    // comes up, so it is set down at the angle it is seen at.
    motion.tilt = next.target?.angle ?? 0;
    motion.base = next.target?.angle ?? Math.round(Math.random() * 16 - 8);
    motion.scale = next.from === 'sheet' ? options.slotCenter(next.kind).scale : 1;
    motion.ts = next.mode === 'press' ? 1.06 : 1.12;
    flush();
    paint();
    animate();
  }
  // Picked up to drag or aim: one of yours from the page hides where it lay.
  function lift(h: Held, mode: 'drag' | 'aim') {
    if (h.mode !== mode) setHeld({ ...h, mode });
    motion.ts = 1.12;
    if (h.from === 'page' && h.target) setLifted(visualKey(h.target));
  }
  function moveTo(x: number, y: number) {
    motion.tx = x;
    motion.ty = y;
  }
  // Put the sticker in hand down. The keyboard overlay goes with it, so focus returns to the
  // sheet sticker it was taken from (or the tab when the sheet has been closed).
  // A sticker moved with the keys hands focus to its own move button, where it now lies (`movedTo`).
  let refocus: HTMLElement | undefined;
  function letGo(h: Held, movedTo?: string) {
    const hadFocus = !!document.activeElement?.matches('.stamp-overlay');
    setHeld(null);
    if (!hadFocus) return;
    flush();
    const id = h.from === 'page' ? movedTo || h.target?.id : undefined;
    const moved = id
      ? document.querySelector<HTMLElement>(`[data-stamp-id="${CSS.escape(id)}"] .stamp-move`)
      : null;
    // A sticker going back where it was stays hidden under the one in hand until that lands.
    if (moved?.closest('[data-lifted]')) return void (refocus = moved);
    const open = options.open();
    const origin =
      moved ||
      (open ? options.sheet()?.querySelector<HTMLElement>(`[data-sticker-kind="${h.kind}"]`) : null) ||
      (h.from === 'page' && open ? options.sheetFocus() : options.tab());
    origin?.focus({ preventScroll: true });
  }
  // The sticker in hand has landed or flown back: it disappears.
  function finish() {
    setGhostKind(-1);
    setLifted('');
    setTaken(-1);
    const next = refocus;
    refocus = undefined;
    if (!next?.isConnected || (document.activeElement && document.activeElement !== document.body)) return;
    flush();
    next.focus({ preventScroll: true });
  }
  // Let go of the sticker: it flies back to the sheet (or to where it was) and disappears.
  function returnHeld(h: Held, blocked = false) {
    if (h.pointer === 'keys' || blocked) {
      // One of yours from the page goes back where it was, not to the sheet.
      const page = h.from === 'page';
      const event = blocked ? (page ? 'blocked-kept' : 'blocked') : page ? 'kept' : 'returned';
      say(stampAnnouncement(event, nameOf(h.kind), options.remaining()));
    }
    letGo(h);
    if (reducedMotion()) return finish();
    if (h.from === 'page' && h.target) return flyTo(homeOf(h), 1, finish);
    flyHome(h);
  }
  // Back on the sheet it lies straight and as large as the ones there; its slot stays faded until
  // it lands.
  function flyHome(h: Held) {
    const slot = options.slotCenter(h.kind);
    motion.base = 0;
    setTaken(h.kind);
    flyTo(slot, slot.scale, finish);
  }
  function cancel(animated: boolean) {
    const h = held();
    if (!h) return;
    if (animated) returnHeld(h);
    else {
      letGo(h);
      finish();
    }
  }
  // Set the sticker in hand down at a point on screen.
  function drop(x: number, y: number) {
    const h = held();
    if (!h) return;
    if (overSheetAt(x, y)) {
      // Putting one of your stickers back on the sheet peels it off the page.
      if (h.from === 'page' && h.target) options.erase(h.target, false);
      else if (h.pointer === 'keys') say(stampAnnouncement('returned', nameOf(h.kind), options.remaining()));
      letGo(h);
      return flyHome(h);
    }
    // Set down where it was picked up: nothing changes. A finger cannot aim as finely as a
    // mouse, and a tapped sticker floats away from its spot, so a tap on either puts it back.
    // The keys always set it down under the sticker in hand, so only its old spot counts there.
    if (h.from === 'page') {
      const home = homeOf(h),
        reach = h.pointer === 'mouse' ? 6 : STICKER_RADIUS,
        tapped = h.mode === 'aim' && h.pointer !== 'mouse' && h.pointer !== 'keys';
      if (
        Math.hypot(x - home.x, y - home.y) < reach ||
        (tapped && Math.hypot(x - motion.x, y - motion.y) < reach)
      )
        return returnHeld(h);
    }
    // It is set down at the angle it is in hand, so it does not twist as it touches the paper.
    const angle = Math.round(clamp(motion.tilt, -14, 14));
    const from = { x: motion.x, y: motion.y };
    const moving = h.from === 'page' && h.target && options.isOwn(h.target) ? h.target : undefined;
    const before = options.own();
    const place = placeAt(x, y);
    const placed = options.put(x, y, h.kind, angle, from, moving);
    if (!placed) return returnHeld(h, true);
    if (h.pointer === 'touch') navigator.vibrate?.(10);
    letGo(h, placed);
    finish();
    flush();
    // A sticker over the limit pushes your oldest one off the page.
    const pushedOut = before.find((s) => s.id !== moving?.id && !options.own().some((o) => o.id === s.id));
    say(
      stampAnnouncement(
        'placed',
        nameOf(h.kind),
        options.remaining(),
        pushedOut ? nameOf(pushedOut.kind) : undefined,
        place,
      ),
    );
    stop();
  }
  // While aiming with the keyboard, say what the sticker is over once it stops moving.
  let placeTimer = 0,
    lastPlace = '';
  function announcePlace() {
    const h = held();
    if (!h || h.mode !== 'aim') return;
    // Same tests, in the same order, as drop(): the sheet first, then a spot the page accepts.
    const place = overSheetAt(motion.tx, motion.ty)
      ? OVER_SHEET
      : placeAt(motion.tx, motion.ty) || 'ここには貼れません';
    if (place === lastPlace) return;
    lastPlace = place;
    say(place);
  }
  // Scrolling (PageDown, a wheel) moves the page under a sticker held still with the keys too.
  function placeSoon(wait = 350) {
    clearTimeout(placeTimer);
    placeTimer = window.setTimeout(announcePlace, wait);
  }
  function forgetPlace() {
    lastPlace = '';
  }
  return {
    held,
    ghostKind,
    lifted,
    taken,
    motion,
    setGhost: (el: HTMLElement) => void (ghost = el),
    begin,
    lift,
    moveTo,
    drop,
    returnHeld,
    cancel,
    // Lets go of the sticker in hand at once, as another one is taken instead.
    discard: () => {
      setHeld(null);
      setLifted('');
    },
    placeSoon,
    forgetPlace,
    say,
    slotCenter: options.slotCenter,
    stop: () => {
      stop();
      clearTimeout(placeTimer);
    },
  };
}
