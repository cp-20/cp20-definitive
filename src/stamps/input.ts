// How pointers, fingers and keys drive the sticker in hand (hand.ts).
// - A mouse drags a sticker, or clicks one from the sheet up and clicks again where it goes.
// - A finger does the same with the sheet. Your stickers on the page let a swipe scroll past
//   them and are never dragged by a finger (spring.ts), even one lying over a link.
// - A click or tap on one of your stickers opens its menu: move it, then click or tap where it
//   goes, or peel it off. The keys open the same menu.
// - The keys aim a sticker from an overlay: arrows move it, Enter sets it down, Escape or Tab
//   puts it back.
import { createSignal, flush, onSettled } from 'solid-js';
import type { PlacedStamp } from './types.ts';
import { clamp, HOLD_SLOP, keptOnScreen, liftedSpot, waitsForHold } from './spring.ts';
import { menuSpot, visualKey } from './layout.ts';
import { centerOf } from './placement.ts';
import type { Held, createHand } from './hand.ts';
// How far one arrow key press moves the sticker aimed with the keys, and with Shift held.
const KEY_STEP = 16,
  KEY_JUMP = 96;
// The hint bar shown while a tapped sticker waits for its spot (.stamp-aim-bar in app.css) ends
// about this far down; a sticker floating up from under it goes below the finger instead.
const AIM_BAR_BOTTOM = 80;
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
    erase: (s: PlacedStamp) => void;
    // One of the stickers drawn, by its visual key.
    find: (key: string) => PlacedStamp | undefined;
  },
) {
  const { held, motion } = hand;
  const byKeys = () => held()?.pointer === 'keys';
  let overlay: HTMLElement | undefined,
    press = { x: 0, y: 0 };
  // ── The menu of one of your stickers ──
  // Which sticker it belongs to, by its look (`key`: its id changes once it is saved), where it
  // sits (fixed, above the sticker or below it near the top), and whether the keys opened it
  // (focus goes into it).
  type Menu = { key: string; x: number; y: number; below: boolean; keys: boolean };
  const [menu, setMenu] = createSignal<Menu | null>(null);
  // The sticker the menu belongs to, as it is now.
  const menuTarget = () => {
    const m = menu();
    return m ? options.find(m.key) : undefined;
  };
  const stickerOf = (s: PlacedStamp) =>
    document.querySelector<HTMLElement>(`.stamp-layer [data-stamp-id="${CSS.escape(s.id)}"]`);
  function openMenu(target: PlacedStamp, keys = false) {
    const el = stickerOf(target);
    if (!el || !options.isOwn(target) || options.isLeaving(target)) return;
    const box = el.getBoundingClientRect();
    setMenu({ key: visualKey(target), keys, ...menuSpot(box, innerWidth) });
    if (!keys) return;
    flush();
    document.querySelector<HTMLElement>('.stamp-menu button')?.focus({ preventScroll: true });
  }
  // `refocus`: focus was in the menu, and goes back to the sticker it belongs to.
  function closeMenu(refocus = false) {
    const target = menuTarget();
    setMenu(null);
    if (refocus && target)
      stickerOf(target)?.querySelector<HTMLElement>('.stamp-open')?.focus({ preventScroll: true });
  }
  // A second press on the sticker whose menu is open closes it rather than opening it again.
  let closedBy = '';
  // The pointer that pressed a menu button; none means the keys (or a screen reader) did.
  let menuPointer = '';
  function moveFromMenu(e: MouseEvent) {
    const target = menuTarget();
    const pointer = menuPointer;
    menuPointer = '';
    closeMenu();
    const el = target && stickerOf(target);
    if (!el) return;
    if (!pointer) return moveWithKeys(target, el);
    // Lifted where it lies: it comes up to the mouse, or floats clear of the finger, and the
    // next click or tap puts it down.
    const from = centerOf(el);
    const next: Held = { kind: target.kind, from: 'page', target, mode: 'aim', pointer };
    hand.begin(next, from, from);
    hand.lift(next, 'aim');
    const spot =
      pointer === 'mouse'
        ? { x: e.clientX, y: e.clientY }
        : liftedSpot(from.x, from.y, innerWidth, innerHeight, AIM_BAR_BOTTOM);
    hand.aimAt(spot.x, spot.y);
    hand.say(`${aimHint(next)}。やめるボタンで戻せます`);
  }
  function peelFromMenu() {
    const target = menuTarget();
    menuPointer = '';
    // Erasing moves focus on from the menu (sheet.ts) before it closes.
    if (target) options.erase(target);
    closeMenu();
  }
  const menuHandlers = {
    onPointerDown(e: PointerEvent) {
      menuPointer = e.pointerType || 'mouse';
    },
    // A pointer leaves focus where it was: only the keys move it into the menu.
    onMouseDown(e: MouseEvent) {
      e.preventDefault();
    },
    onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      closeMenu(true);
    },
    onFocusOut(e: FocusEvent) {
      const to = e.relatedTarget as Node | null;
      if (to && !(e.currentTarget as Element).contains(to)) closeMenu();
    },
    move: moveFromMenu,
    peel: peelFromMenu,
  };
  // ── Pointers and fingers ──
  // Pressing a sheet sticker or one of yours on the page.
  function grab(e: PointerEvent, next: Omit<Held, 'mode' | 'pointer'>) {
    if (e.button !== 0 || !e.isPrimary) return;
    closeMenu();
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
  }
  function track(x: number, y: number) {
    const h = held();
    if (!h) return;
    const moved = Math.hypot(x - press.x, y - press.y);
    if (h.mode === 'press' && waitsForHold(h)) {
      // A finger that moves on your sticker is scrolling: the sticker stays where it is.
      if (moved > HOLD_SLOP) cancel(false);
      return;
    }
    if (h.mode === 'press' && moved > 6) hand.lift(h, 'drag');
    hand.moveTo(x, y);
  }
  const follow = (e: PointerEvent) => track(e.clientX, e.clientY);
  const cancel = (animated: boolean) => hand.cancel(animated);
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
    if (h.mode === 'drag') {
      // A finger lets go where the sheet's sticker lands; that tap's click would follow a link.
      if (h.pointer !== 'mouse') catchNextClick();
      return hand.drop(e.clientX, e.clientY);
    }
    if (h.mode !== 'press') return;
    // A click or tap on one of yours opens its menu (or closes it, if it was already open).
    if (h.from === 'page' && h.target) {
      cancel(false);
      const again = closedBy === h.target.id;
      closedBy = '';
      return again ? undefined : openMenu(h.target);
    }
    hand.lift(h, 'aim');
    // The hint bar is the only guide for a pointer; read it once as it appears.
    hand.say(`${aimHint(h)}。やめるボタンで戻せます`);
    if (h.pointer !== 'mouse') {
      // It floats clear of the finger, but never off screen or under the hint bar.
      const spot = liftedSpot(motion.x, motion.y, innerWidth, innerHeight, AIM_BAR_BOTTOM);
      hand.aimAt(spot.x, spot.y);
    }
  }
  // ── Keys ──
  function aimWithKeys(kind: number) {
    hand.forgetPlace();
    if (!options.signedIn()) return options.askToSignIn();
    const center = { x: innerWidth / 2, y: innerHeight / 2 };
    hand.begin({ kind, from: 'sheet', mode: 'aim', pointer: 'keys' }, hand.slotCenter(kind), center);
    overlay?.focus();
    // Where it starts, once the overlay's own name has been read.
    hand.placeSoon(450);
  }
  // The keyboard's way to move one of your stickers: lift it where it lies, then aim as above.
  function moveWithKeys(target: PlacedStamp, sticker: HTMLElement) {
    hand.forgetPlace();
    if (!options.signedIn()) return options.askToSignIn();
    if (!options.isOwn(target) || options.isLeaving(target)) return;
    const from = centerOf(sticker);
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
        hand.aimAt(
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
      if (e.key !== 'Escape') return;
      if (held()) cancel(true);
      closeMenu();
    };
    // The menu closes from a press anywhere else, or as the page scrolls or changes size.
    const pressedOutside = (e: PointerEvent) => {
      const target = menuTarget(),
        on = e.target as Element;
      closedBy = '';
      if (!menu() || on.closest?.('.stamp-menu')) return;
      const pressed = on.closest?.('[data-stamp-id]')?.getAttribute('data-stamp-id');
      if (target && pressed === target.id) closedBy = target.id;
      closeMenu();
      // That press only closes the menu: it does not also follow a link on the page under it.
      if (!on.closest?.('.stamp-ui, .placed-stamp')) catchNextClick();
    };
    const scrolled = () => {
      closeMenu();
      const h = held();
      if (h?.mode === 'aim' && h.pointer === 'keys') hand.placeSoon();
    };
    // A phone turned on its side while a sticker waits for its spot: keep the sticker in view.
    const keepInView = () => {
      closeMenu();
      if (held()?.mode !== 'aim') return;
      const spot = keptOnScreen(motion.tx, motion.ty, innerWidth, innerHeight, byKeys() ? 0 : AIM_BAR_BOTTOM);
      hand.aimAt(spot.x, spot.y);
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
    document.addEventListener('pointerdown', pressedOutside, true);
    return () => {
      document.removeEventListener('pointerdown', pressedOutside, true);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('scroll', scrolled);
      window.removeEventListener('resize', keepInView);
      document.removeEventListener('pointerdown', pinch, true);
      stopCatchingClick?.();
    };
  });
  return {
    byKeys,
    grab,
    follow,
    release,
    cancel,
    aimWithKeys,
    menu,
    menuTarget,
    openMenu,
    closeMenu,
    menuHandlers,
    overlay: overlayHandlers,
  };
}
