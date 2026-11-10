// The sticker in hand: taken from the sheet or lifted off the page, it follows the pointer (or
// the arrow keys) on a spring drawn outside Solid on every frame, so dragging stays smooth, and
// is then set down, put back or peeled off. How pointers, fingers and keys drive it is in
// input.ts.
import { createSignal, flush } from 'solid-js';
import type { PlacedStamp } from './types.ts';
import { DRAG_RISE, FLYING, clamp, releaseVelocity, slideTime, springStep, throwCarry } from './spring.ts';
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
export function createHand(options: {
  isOwn: (s: PlacedStamp) => boolean;
  // Yours that are not peeling off.
  own: () => PlacedStamp[];
  remaining: () => number;
  put: (
    x: number,
    y: number,
    kind: number,
    angle: number,
    from: Point & { t?: number },
    target?: PlacedStamp,
  ) => string;
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
  const [held, setHeld] = createSignal<Held | null>(null),
    // The sticker drawn in hand; it stays while flying back after `held` is cleared.
    [ghostKind, setGhostKind] = createSignal(-1),
    // Your sticker lifted off the page, hidden under the one in hand.
    [lifted, setLifted] = createSignal(''),
    // The sheet sticker that is in hand or flying back to its slot, faded until it lands.
    [taken, setTaken] = createSignal(-1);
  const ghost = createGhost(() => !!held());
  const { motion } = ghost;
  const places = createPlaceAnnouncer(held, motion, say);
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
    motion.scale = next.from === 'sheet' ? options.slotCenter(next.kind).scale : 1;
    motion.ts = next.mode === 'press' ? 1.06 : 1.12;
    // A pointer holds it where it pressed, that spot growing with the sticker; the keys aim its
    // center.
    const grow = motion.ts / motion.scale;
    motion.ox = next.pointer === 'keys' ? 0 : (pointer.x - start.x) * grow;
    motion.oy = next.pointer === 'keys' ? 0 : (pointer.y - start.y) * grow;
    motion.tx = pointer.x - motion.ox;
    motion.ty = pointer.y - motion.oy;
    // One of yours keeps its own slant; a new one from the sheet takes a slight random one as it
    // comes up, so it is set down at the angle it is seen at.
    motion.tilt = next.target?.angle ?? 0;
    motion.base = next.target?.angle ?? Math.round(Math.random() * 16 - 8);
    // Pressed, it only just comes off the paper; it is lifted clear once moved or clicked up.
    motion.lift = 0;
    motion.tl = next.mode === 'press' ? 0.35 : 1;
    flush();
    ghost.start();
  }
  // Picked up to drag or aim: one of yours from the page hides where it lay.
  function lift(h: Held, mode: 'drag' | 'aim') {
    if (h.mode !== mode) setHeld({ ...h, mode });
    motion.ts = 1.12;
    motion.tl = 1;
    // A tapped sticker floats clear of the finger, and the next tap puts its center there.
    if (mode === 'aim' && h.pointer !== 'mouse') motion.ox = motion.oy = 0;
    // A dragged one rises above the fingertip, so the finger never hides where it will land.
    if (mode === 'drag' && h.pointer !== 'mouse' && h.pointer !== 'keys') {
      const px = motion.tx + motion.ox,
        py = motion.ty + motion.oy;
      motion.ox = 0;
      motion.oy = DRAG_RISE;
      motion.tx = px;
      motion.ty = py - DRAG_RISE;
    }
    if (h.from === 'page' && h.target) setLifted(visualKey(h.target));
  }
  // Put the sticker in hand down. The keyboard overlay goes with it, so focus returns to the
  // sheet sticker it was taken from (or the tab when the sheet has been closed).
  // A sticker moved with the keys hands focus to its own button, where it now lies (`movedTo`).
  let refocus: HTMLElement | undefined;
  function letGo(h: Held, movedTo?: string) {
    const hadFocus = !!document.activeElement?.matches('.stamp-overlay');
    setHeld(null);
    if (!hadFocus) return;
    flush();
    const id = h.from === 'page' ? movedTo || h.target?.id : undefined;
    const moved = id
      ? document.querySelector<HTMLElement>(`[data-stamp-id="${CSS.escape(id)}"] .stamp-open`)
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
      say(stampAnnouncement(event, stickerName(h.kind), options.remaining()));
    }
    letGo(h);
    if (reducedMotion()) return finish();
    if (h.from === 'page' && h.target) return ghost.flyTo(homeOf(h), 1, finish);
    flyHome(h);
  }
  // Back on the sheet it lies straight and as large as the ones there; its slot stays faded until
  // it lands.
  function flyHome(h: Held) {
    const slot = options.slotCenter(h.kind);
    motion.base = 0;
    setTaken(h.kind);
    ghost.flyTo(slot, slot.scale, finish);
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
  // Set the sticker in hand down where the pointer lets go of it (x, y).
  function drop(px: number, py: number) {
    const h = held();
    if (!h) return;
    // The sticker itself (above a dragging finger) is what goes onto the sheet.
    if (overSheetAt(px - motion.ox, py - motion.oy)) {
      // Putting one of your stickers back on the sheet peels it off the page.
      if (h.from === 'page' && h.target) options.erase(h.target, false);
      else if (h.pointer === 'keys')
        say(stampAnnouncement('returned', stickerName(h.kind), options.remaining()));
      letGo(h);
      return flyHome(h);
    }
    // It lands under the spot it is held by; let go while moving, it slides on a little.
    const thrown = h.mode === 'drag' && !reducedMotion() ? ghost.releaseVelocity() : { vx: 0, vy: 0 };
    const carry = throwCarry(thrown.vx, thrown.vy);
    const x = clamp(px - motion.ox + carry.x, STICKER_RADIUS, innerWidth - STICKER_RADIUS),
      y = clamp(py - motion.oy + carry.y, STICKER_RADIUS, innerHeight - STICKER_RADIUS);
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
    const from = { x: motion.x, y: motion.y, t: slideTime(motion, x, y) };
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
        stickerName(h.kind),
        options.remaining(),
        pushedOut ? stickerName(pushedOut.kind) : undefined,
        place,
      ),
    );
    ghost.stop();
  }
  return {
    held,
    ghostKind,
    lifted,
    taken,
    motion,
    setGhost: ghost.setElement,
    begin,
    lift,
    moveTo: ghost.follow,
    aimAt: ghost.aimAt,
    drop,
    returnHeld,
    cancel,
    // Lets go of the sticker in hand at once, as another one is taken instead.
    discard: () => {
      setHeld(null);
      setLifted('');
    },
    placeSoon: places.soon,
    forgetPlace: places.forget,
    say,
    slotCenter: options.slotCenter,
    stop: () => {
      ghost.stop();
      places.stop();
    },
  };
}

// ── The sticker drawn in hand ──
/**
 * The sticker drawn in hand: a spring (spring.ts) that follows its target and is painted outside
 * Solid on every frame, so dragging stays smooth. It runs while `holding()` and while it flies to
 * where it was sent.
 */
function createGhost(holding: () => boolean) {
  let element: HTMLElement | undefined;
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
    lift: 0,
    tl: 0,
    // Where the pointer holds it, from its center: the same spot stays under the pointer.
    ox: 0,
    oy: 0,
    // Called once the sticker has flown to where it was sent.
    home: null as null | (() => void),
  };
  let raf = 0;
  // Where the pointer has been lately, for the speed a sticker is let go with.
  let trail: { x: number; y: number; t: number }[] = [];
  function paint() {
    if (!element) return;
    element.style.transform = `translate(${motion.x}px, ${motion.y}px) rotate(${motion.tilt}deg) scale(${motion.scale})`;
    element.style.setProperty('--lift', motion.lift.toFixed(3));
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
      if (holding() || motion.home) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  return {
    motion,
    setElement: (el: HTMLElement) => void (element = el),
    /** Draws it as `motion` now has it, picked up afresh, and sets the spring going. */
    start() {
      trail = [];
      paint();
      animate();
    },
    /** Follows the pointer, held where it was pressed. */
    follow(x: number, y: number) {
      motion.tx = x - motion.ox;
      motion.ty = y - motion.oy;
      trail.push({ x, y, t: performance.now() });
      if (trail.length > 12) trail.shift();
    },
    /** Sends its center to a point (the keys, or keeping it on screen). */
    aimAt(x: number, y: number) {
      motion.tx = x;
      motion.ty = y;
    },
    /**
     * Sends it to a point on screen at a scale, then calls `done`. It keeps the speed it was let
     * go with, so a throw carries on into the flight.
     */
    flyTo(point: Point, scale: number, done: () => void) {
      motion.tx = point.x;
      motion.ty = point.y;
      motion.ts = scale;
      motion.tl = 0;
      motion.home = done;
      animate();
    },
    /** How fast the pointer was moving as it let go (px/s). */
    releaseVelocity: () => releaseVelocity(trail, performance.now()),
    stop: () => cancelAnimationFrame(raf),
  };
}

// ── Saying where it is ──
/**
 * While a sticker is aimed with the keyboard, says what it is over once it stops moving: the
 * sheet, a place it can go, or neither.
 */
function createPlaceAnnouncer(
  held: () => Held | null,
  motion: { tx: number; ty: number },
  say: (text: string) => void,
) {
  let timer = 0,
    last = '';
  function announce() {
    const h = held();
    if (!h || h.mode !== 'aim') return;
    // Same tests, in the same order, as drop(): the sheet first, then a spot the page accepts.
    const place = overSheetAt(motion.tx, motion.ty)
      ? OVER_SHEET
      : placeAt(motion.tx, motion.ty) || 'ここには貼れません';
    if (place === last) return;
    last = place;
    say(place);
  }
  return {
    // Scrolling (PageDown, a wheel) moves the page under a sticker held still with the keys too.
    soon(wait = 350) {
      clearTimeout(timer);
      timer = window.setTimeout(announce, wait);
    },
    forget() {
      last = '';
    },
    stop: () => clearTimeout(timer),
  };
}
