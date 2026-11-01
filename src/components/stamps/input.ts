// How pointers, fingers and keys drive the sticker in hand (hand.ts).
// - A mouse drags a sticker, or clicks it up and clicks again where it goes.
// - A finger does the same, except that your stickers on the page let a swipe scroll past them:
//   one comes up to be dragged once held still for a moment, and a tap on one lying over a link
//   presses the link (src/data/stamp-hand.mjs).
// - The keys aim a sticker from an overlay: arrows move it, Enter sets it down, Escape or Tab
//   puts it back.
import { onSettled } from 'solid-js';
import type { PlacedStamp } from '../../data/stamp-types';
import {
  HOLD_MS,
  HOLD_SLOP,
  TAPPABLE,
  keptOnScreen,
  liftedSpot,
  waitsForHold,
} from '../../data/stamp-hand.mjs';
import { centerOf, pageElementAt } from './placement';
import type { Held, createHand } from './hand';
// How far one arrow key press moves the sticker aimed with the keys, and with Shift held.
const KEY_STEP = 16,
  KEY_JUMP = 96;
// The hint bar shown while a tapped sticker waits for its spot (.stamp-aim-bar in app.css) ends
// about this far down; a sticker floating up from under it goes below the finger instead.
const AIM_BAR_BOTTOM = 80;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};
// What the next tap or click does while a sticker waits for its spot.
export const aimHint = (h: Held) =>
  `${h.pointer === 'mouse' ? 'クリック' : 'タップ'}した場所に${h.from === 'page' ? '移動します' : '貼ります'}`;
export function createInput(
  hand: ReturnType<typeof createHand>,
  options: {
    signedIn: () => boolean;
    askToSignIn: () => void;
    isOwn: (s: PlacedStamp) => boolean;
    isLeaving: (s: PlacedStamp) => boolean;
    slotCenter: (kind: number) => { x: number; y: number };
    say: (text: string) => void;
  },
) {
  const { held, motion } = hand;
  const byKeys = () => held()?.pointer === 'keys';
  let overlay: HTMLElement | undefined,
    press = { x: 0, y: 0 },
    holdTimer = 0;
  // ── Pointers and fingers ──
  // Pressing a sheet sticker or one of yours on the page.
  function grab(e: PointerEvent, next: Omit<Held, 'mode' | 'pointer'>) {
    if (e.button !== 0 || !e.isPrimary) return;
    if (!options.signedIn()) return options.askToSignIn();
    const current = held();
    if (current?.mode === 'aim') {
      // Clicking the sticker you are holding puts it back; another one swaps it.
      if (current.from === 'sheet' && next.from === 'sheet' && current.kind === next.kind)
        return hand.returnHeld(current);
      hand.discard();
    }
    const el = e.currentTarget as Element;
    el.setPointerCapture(e.pointerId);
    const pressed: Held = { ...next, mode: 'press', pointer: e.pointerType };
    press = { x: e.clientX, y: e.clientY };
    hand.begin(pressed, centerOf(el), press);
    // A finger held still on your sticker picks it up to drag.
    clearTimeout(holdTimer);
    if (waitsForHold(pressed))
      holdTimer = window.setTimeout(() => {
        if (held() !== pressed) return;
        hand.lift(pressed, 'drag');
        navigator.vibrate?.(10);
      }, HOLD_MS);
  }
  function track(x: number, y: number) {
    const h = held();
    if (!h) return;
    const moved = Math.hypot(x - press.x, y - press.y);
    if (h.mode === 'press' && waitsForHold(h)) {
      // A finger that moves before the long press is scrolling: the sticker stays where it is.
      if (moved > HOLD_SLOP) cancel(false);
      return;
    }
    if (h.mode === 'press' && moved > 6) hand.lift(h, 'drag');
    hand.moveTo(x, y);
  }
  const follow = (e: PointerEvent) => track(e.clientX, e.clientY);
  function cancel(animated: boolean) {
    clearTimeout(holdTimer);
    hand.cancel(animated);
  }
  // The click that follows a tap which put the sticker in hand down (or back) would land on
  // whatever lies under the finger once the sticker or the overlay is gone, such as a link.
  // Catch that one click; `then` runs in its place, or after a moment if no click comes.
  let stopCatchingClick: (() => void) | undefined;
  function catchNextClick(then?: () => void) {
    stopCatchingClick?.();
    let timer = 0;
    const stop = () => {
      clearTimeout(timer);
      window.removeEventListener('click', caught, true);
      window.removeEventListener('pointerdown', stop, true);
      if (stopCatchingClick === stop) stopCatchingClick = undefined;
    };
    const caught = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      stop();
      then?.();
    };
    window.addEventListener('click', caught, true);
    // A new press means the click never came; that press starts something else.
    window.addEventListener('pointerdown', stop, true);
    timer = window.setTimeout(() => {
      stop();
      then?.();
    }, 600);
    stopCatchingClick = stop;
  }
  // A click (press without moving) keeps the sticker in hand; the next click sticks it.
  function release(e: PointerEvent) {
    const h = held();
    if (!h) return;
    clearTimeout(holdTimer);
    if (h.mode === 'drag') {
      // A finger lets go where it pressed after a long press too, and that tap's click would
      // follow the link under the sticker as it flies back or lands.
      if (h.pointer !== 'mouse') catchNextClick();
      return hand.drop(e.clientX, e.clientY);
    }
    if (h.mode !== 'press') return;
    // A tap on your sticker lying over a link or button presses that instead of lifting it.
    const control = waitsForHold(h)
      ? pageElementAt(e.clientX, e.clientY)?.closest<HTMLElement>(TAPPABLE)
      : null;
    if (control) {
      cancel(false);
      if (!control.matches('input, select, textarea')) return control.click();
      // A form field is used once the tap's own click is over, or that click would take its
      // focus (and close a list it opened). A select opens its list: click() does not do that.
      return catchNextClick(() => {
        control.focus();
        if (control instanceof HTMLSelectElement && 'showPicker' in control)
          try {
            return control.showPicker();
          } catch {
            // Not allowed without a recent tap (the click never came): focus is left on it.
            return;
          }
        control.click();
      });
    }
    hand.lift(h, 'aim');
    // The hint bar is the only guide for a pointer; read it once as it appears.
    options.say(`${aimHint(h)}。やめるボタンで戻せます`);
    if (h.pointer !== 'mouse') {
      // It floats clear of the finger, but never off screen or under the hint bar.
      const spot = liftedSpot(motion.x, motion.y, innerWidth, innerHeight, AIM_BAR_BOTTOM);
      hand.moveTo(spot.x, spot.y);
    }
  }
  // Your stickers let a swipe scroll the page (touch-action in app.css); once one is held long
  // enough to drag, the finger moves it instead. Only a listener that is not passive can stop that.
  const pinScroll = (el: HTMLElement) =>
    el.addEventListener(
      'touchmove',
      (e) => {
        if (held()?.mode === 'drag' && e.cancelable) e.preventDefault();
      },
      { passive: false },
    );
  // ── Keys ──
  function aimWithKeys(kind: number) {
    hand.forgetPlace();
    if (!options.signedIn()) return options.askToSignIn();
    const center = { x: innerWidth / 2, y: innerHeight / 2 };
    hand.begin({ kind, from: 'sheet', mode: 'aim', pointer: 'keys' }, options.slotCenter(kind), center);
    overlay?.focus();
    // Where it starts, once the overlay's own name has been read.
    hand.placeSoon(450);
  }
  // The keyboard's way to move one of your stickers: lift it where it lies, then aim as above.
  function moveWithKeys(target: PlacedStamp, button: HTMLElement) {
    hand.forgetPlace();
    if (!options.signedIn()) return options.askToSignIn();
    if (!options.isOwn(target) || options.isLeaving(target)) return;
    const from = centerOf(button.closest('.placed-stamp') || button);
    const start = { x: clamp(from.x, 25, innerWidth - 25), y: clamp(from.y, 25, innerHeight - 25) };
    const next: Held = { kind: target.kind, from: 'page', target, mode: 'aim', pointer: 'keys' };
    hand.begin(next, from, start);
    hand.lift(next, 'aim');
    overlay?.focus();
    hand.placeSoon(450);
  }
  // ── The overlay a sticker is aimed from ──
  let aimDown = { x: 0, y: 0, id: -1 };
  const overlayHandlers = {
    ref: (el: HTMLElement) => void (overlay = el),
    onKeyDown(e: KeyboardEvent) {
      if (held()?.mode !== 'aim') return;
      if (ARROWS[e.key]) {
        e.preventDefault();
        // Shift takes big steps, so crossing the screen is a handful of presses rather than dozens.
        const step = e.shiftKey ? KEY_JUMP : KEY_STEP;
        const [dx, dy] = ARROWS[e.key];
        hand.moveTo(
          clamp(motion.tx + dx * step, 25, innerWidth - 25),
          clamp(motion.ty + dy * step, 25, innerHeight - 25),
        );
        hand.placeSoon();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        hand.drop(motion.tx, motion.ty);
      }
    },
    onFocusOut(e: FocusEvent) {
      // Tabbing away puts the sticker back. Focus that just leaves the window keeps it.
      if (!e.relatedTarget) return;
      queueMicrotask(() => {
        const h = held();
        if (h?.mode === 'aim' && h.pointer === 'keys' && document.activeElement !== overlay) cancel(true);
      });
    },
    onPointerMove(e: PointerEvent) {
      if (e.pointerType === 'mouse') track(e.clientX, e.clientY);
    },
    onPointerDown(e: PointerEvent) {
      if (e.isPrimary && e.button === 0) aimDown = { x: e.clientX, y: e.clientY, id: e.pointerId };
    },
    onPointerUp(e: PointerEvent) {
      if (e.pointerId === aimDown.id && Math.hypot(e.clientX - aimDown.x, e.clientY - aimDown.y) < 8) {
        hand.moveTo(e.clientX, e.clientY);
        hand.drop(e.clientX, e.clientY);
        // The overlay is gone before the tap's click, which would reach the page under it.
        catchNextClick();
      }
      aimDown.id = -1;
    },
    onPointerCancel() {
      aimDown.id = -1;
    },
  };
  onSettled(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && held()) cancel(true);
    };
    const scrolled = () => {
      const h = held();
      if (h?.mode === 'aim' && h.pointer === 'keys') hand.placeSoon();
    };
    // A phone turned on its side while a sticker waits for its spot: keep the sticker in view.
    const keepInView = () => {
      if (held()?.mode !== 'aim') return;
      const spot = keptOnScreen(motion.tx, motion.ty, innerWidth, innerHeight, byKeys() ? 0 : AIM_BAR_BOTTOM);
      hand.moveTo(spot.x, spot.y);
      if (byKeys()) hand.placeSoon();
    };
    // A second finger makes it a pinch: the sticker under the first one stays where it was.
    const pinch = (e: PointerEvent) => {
      const h = held();
      if (e.isPrimary || !h || h.pointer !== e.pointerType || (h.mode !== 'press' && h.mode !== 'drag'))
        return;
      cancel(h.mode === 'drag');
    };
    document.addEventListener('keydown', escape);
    window.addEventListener('scroll', scrolled, { passive: true });
    window.addEventListener('resize', keepInView);
    document.addEventListener('pointerdown', pinch, true);
    return () => {
      document.removeEventListener('keydown', escape);
      window.removeEventListener('scroll', scrolled);
      window.removeEventListener('resize', keepInView);
      document.removeEventListener('pointerdown', pinch, true);
      stopCatchingClick?.();
      clearTimeout(holdTimer);
    };
  });
  return {
    byKeys,
    grab,
    follow,
    release,
    cancel,
    pinScroll,
    aimWithKeys,
    moveWithKeys,
    overlay: overlayHandlers,
  };
}
