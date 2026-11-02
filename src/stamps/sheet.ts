// The sticker sheet and the tab it folds into: whether it is open, where keyboard focus goes as
// either appears or its controls change, and the room it takes at the bottom of the screen.
import { createEffect, createSignal, flush, onSettled } from 'solid-js';
import type { PlacedStamp } from './types.ts';
import { sheetStartsOpen } from './sheet-start.ts';
import { focusAfterRemoval } from './a11y.ts';
import { STAMPS_PER_PAGE as LIMIT } from './limits.ts';
import { SHEET_KEY, readPref, writePref } from './prefs.ts';
// The phone layout in app.css: tabs along the bottom edge and the sheet pinned across the screen.
const PHONE_LAYOUT = '(max-width: 760px)';
// Creates signals: call it synchronously inside the component that owns them.
export function createSheet(options: {
  enabled: () => boolean;
  signedIn: () => boolean;
  // Signing in, or a returning visitor being signed back in.
  busy: () => boolean;
  connect: () => void;
  // Stickers you could still place on this page once `without` is gone.
  remaining: (without?: PlacedStamp) => number;
  // The sheet is closing: a sticker taken from it goes back.
  closing: () => void;
}) {
  // null until the stored preference is read, so neither the sheet nor its tab flashes.
  const [open, setOpen] = createSignal<boolean | null>(null);
  let sheet: HTMLElement | undefined, tab: HTMLButtonElement | undefined;
  // The first control the sheet offers, for focus to land on when it opens or its header changes.
  const sheetStart = () =>
    sheet?.querySelector<HTMLElement>('.sticker-sheet-head :is(a[href], button:not(:disabled))');
  function toggle() {
    const next = !open();
    // The tab and the sheet each turn inert as the other appears; focus follows to the other one.
    const active = document.activeElement;
    const hadFocus = !!active && (!!tab?.contains(active) || !!sheet?.contains(active));
    setOpen(next);
    if (!next) options.closing();
    if (next) options.connect();
    writePref(SHEET_KEY, next ? 'open' : 'closed');
    if (!hadFocus) return;
    flush();
    focusOnceShown(next ? sheetStart() || sheetFocus() : tab);
  }
  // The sheet and the tab turn visible through a transition (a very short one with reduced
  // motion), and focus() does nothing until they are: try again over the next few frames.
  // A newer call replaces one still waiting.
  let focusFrame = 0;
  function focusOnceShown(el: HTMLElement | undefined, tries = 10) {
    cancelAnimationFrame(focusFrame);
    if (!el?.isConnected) return;
    el.focus({ preventScroll: true });
    const active = document.activeElement;
    // Focus still on the control that just turned inert (or already dropped to the page).
    const lost = !active || active === document.body || !!active.closest('[inert]');
    if (active !== el && lost && tries > 0)
      focusFrame = requestAnimationFrame(() => focusOnceShown(el, tries - 1));
  }
  // Somewhere on the sheet that stays put, for when the focused control goes away. The undo
  // button only while one of your stickers stays after `without` is peeled off (else it disables).
  function sheetFocus(without?: PlacedStamp) {
    if (!open()) return tab;
    const undoButton = sheet?.querySelector<HTMLButtonElement>('.stamp-undo');
    if (undoButton && !undoButton.disabled && options.remaining(without) < LIMIT) return undoButton;
    if (sheet) sheet.tabIndex = -1;
    return sheet;
  }
  // A sticker peeled off from its menu (or while focused) goes: move on to the next one of yours.
  function focusPastSticker(target: PlacedStamp) {
    const buttons = [...document.querySelectorAll<HTMLElement>('.stamp-layer .stamp-open')];
    const mine = buttons.find(
      (b) => b.closest<HTMLElement>('[data-stamp-id]')?.dataset.stampId === target.id,
    );
    // Focus on the sticker itself, or in its menu (peel).
    const active = document.activeElement;
    if (!mine || !(active === mine || active?.closest('.stamp-menu'))) return;
    const next = focusAfterRemoval(buttons, mine);
    (next || sheetFocus(target))?.focus({ preventScroll: !next });
  }
  // Where a sticker of the sheet sits on screen (the tab while the sheet is closed), and its size
  // there as a scale of one in hand (40px), so it leaves and goes back at the size it is drawn.
  function slotCenter(kind: number) {
    const slot = open() ? sheet?.querySelector(`[data-sticker-kind="${kind}"]`) : null;
    const img = (slot || document.querySelector('.sticker-tab'))?.querySelector('img');
    const box = (slot || img)?.getBoundingClientRect();
    const scale = img ? parseFloat(getComputedStyle(img).width) / 40 : 0.6;
    return box
      ? { x: box.left + box.width / 2, y: box.top + box.height / 2, scale }
      : { x: innerWidth - 80, y: innerHeight - 80, scale };
  }
  // The sheet (or its tab) is pinned over the bottom of the screen. Its height goes straight into
  // scroll-padding-bottom, so whatever gets keyboard focus is scrolled clear of it, and on a phone
  // into the body's bottom padding, so the last links can scroll above it. Only those two elements
  // are restyled (a custom property on <html> would restyle every element), and only on a change.
  let cover = '';
  function measureCover() {
    const el = open() ? sheet : open() === false ? tab : undefined;
    const px = Math.round(
      el?.isConnected && options.enabled()
        ? el.offsetHeight + (parseFloat(getComputedStyle(el).bottom) || 0)
        : 0,
    );
    const phone = matchMedia(PHONE_LAYOUT).matches;
    if (cover === `${px} ${phone}`) return;
    cover = `${px} ${phone}`;
    const root = document.documentElement.style,
      body = document.body.style;
    if (px) root.setProperty('scroll-padding-bottom', `calc(max(${px}px, var(--tabs-cover)) + 16px)`);
    else root.removeProperty('scroll-padding-bottom');
    if (px && phone) body.setProperty('padding-bottom', `max(96px, ${px + 16}px)`);
    else body.removeProperty('padding-bottom');
  }
  createEffect(
    () => [open(), options.enabled()] as const,
    () => measureCover(),
  );
  // Signing in or out swaps the sheet's header (the sign-in button for the avatar and back), and a
  // sign-in disables its button while it waits. Focus that was on one of them would fall to the
  // page. While a sign-in is pending, focus waits on the sheet itself, then moves on to what it
  // brought.
  let focusInSheet = false,
    parked: HTMLElement | undefined;
  createEffect(
    () => [options.signedIn(), options.busy()] as const,
    ([, busy]) => {
      queueMicrotask(() => {
        const active = document.activeElement;
        const lost = !active || active === document.body || !active.isConnected;
        if (!focusInSheet || !open() || !(lost || (parked && active === parked))) return;
        const target = busy ? sheetFocus() : sheetStart() || sheetFocus();
        parked = busy ? target : undefined;
        focusOnceShown(target);
      });
    },
  );
  onSettled(() => {
    // Start with the sheet tucked away unless it fits on the desk beside the page, so it never
    // covers content.
    const page = document.querySelector('.site-body')?.getBoundingClientRect();
    // The first state is just there; only opening and closing it later moves.
    const still = [sheet, tab].filter((el) => !!el);
    for (const el of still) el.dataset.still = '';
    setOpen(
      sheetStartsOpen(
        readPref(SHEET_KEY),
        document.documentElement.clientWidth,
        page ? page.right : Infinity,
      ),
    );
    flush();
    for (const el of still) {
      getComputedStyle(el).opacity;
      delete el.dataset.still;
    }
    const track = (e: FocusEvent) => {
      focusInSheet = !!sheet?.contains(e.target as Node);
    };
    document.addEventListener('focusin', track);
    window.addEventListener('resize', measureCover);
    const covered = new ResizeObserver(measureCover);
    if (sheet) covered.observe(sheet);
    if (tab) covered.observe(tab);
    return () => {
      document.removeEventListener('focusin', track);
      window.removeEventListener('resize', measureCover);
      covered.disconnect();
      cancelAnimationFrame(focusFrame);
      cover = '';
      document.documentElement.style.removeProperty('scroll-padding-bottom');
      document.body.style.removeProperty('padding-bottom');
    };
  });
  return {
    open,
    toggle,
    sheet: () => sheet,
    tab: () => tab,
    setSheet: (el: HTMLElement) => void (sheet = el),
    setTab: (el: HTMLButtonElement) => void (tab = el),
    focusOnceShown,
    sheetFocus,
    focusPastSticker,
    slotCenter,
  };
}
