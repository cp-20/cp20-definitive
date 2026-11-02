// Where stickers go on the page: the anchors they are stored against, where each one is drawn,
// and what lies under a point on screen.
import { createMemo, createSignal, onSettled } from 'solid-js';
import type { PlacedStamp } from './types.ts';
import { layoutStamps, spotIn, stampAt, type Box, type ShownStamp } from './layout.ts';
import { stampPlace } from './a11y.ts';

// The sticker UI itself, which a point on screen looks through to find the page below.
const STAMP_UI_SELECTOR =
  '.sticker-sheet,.sticker-tab,.stamp-overlay,.stamp-aim-bar,.stamp-layer,.sticker-ghost,.stamp-menu';
const anchorNamed = (name: string) =>
  document.querySelector<HTMLElement>(`[data-stamp-anchor="${CSS.escape(name)}"]`);
// Layout position relative to <body>, ignoring transforms and scroll.
function layoutBox(el: HTMLElement): Box {
  let x = 0,
    y = 0,
    node: HTMLElement | null = el;
  while (node && node !== document.body) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}
// Page coordinates follow the document, so stickers scroll natively with the content.
function toPage(x: number, y: number) {
  const page = document.body.getBoundingClientRect();
  return { px: x - page.left, py: y - page.top };
}
// The topmost page element at a point on screen, under any sticker UI.
export const pageElementAt = (x: number, y: number) =>
  document.elementsFromPoint(x, y).find((el) => !el.closest(STAMP_UI_SELECTOR));
// Where a point on screen lands on the page: the innermost anchor that contains it, or null
// where no sticker can go (the index tabs, an inert page on its way out).
export function locate(x: number, y: number) {
  const below = pageElementAt(x, y);
  let anchor = below?.closest<HTMLElement>('[data-stamp-anchor]') || anchorNamed('page');
  if (!anchor || below?.closest('.rail') || anchor.closest('[inert]')) return null;
  const { px, py } = toPage(x, y);
  for (;;) {
    const spot = spotIn(layoutBox(anchor), px, py);
    if (spot) return { anchor: anchor.dataset.stampAnchor!, ...spot };
    anchor = anchor.parentElement?.closest<HTMLElement>('[data-stamp-anchor]') || null;
    if (!anchor) return null;
  }
}
// The sheet (or the tab) under a point: a sticker set down there goes back instead.
export const overSheetAt = (x: number, y: number) =>
  document
    .elementsFromPoint(x, y)
    .some((el) => el.closest('.sticker-sheet[data-open], .sticker-tab[data-open]'));
// What the page under a point is called, when a sticker can go there (same test as locate()).
export function placeAt(x: number, y: number) {
  const spot = locate(x, y);
  if (!spot) return undefined;
  const anchor = anchorNamed(spot.anchor);
  const labelledBy = anchor?.getAttribute('aria-labelledby');
  const heading = anchor?.querySelector('h1, h2, h3');
  const named = labelledBy ? document.getElementById(labelledBy) : null;
  const label = (heading && spokenText(heading).trim()) || (named && spokenText(named));
  return stampPlace(spot.anchor, label);
}
export function centerOf(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
// An element's text as a screen reader hears it: aria-hidden parts (an icon's initial letter)
// are left out, and a block or <br> inside it is a word break, not glued to the next word.
function spokenText(el: Element): string {
  let text = '';
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
    else if (node instanceof Element && node.getAttribute('aria-hidden') !== 'true') {
      const display = getComputedStyle(node).display;
      const apart = node.localName === 'br' || (display !== 'inline' && display !== 'contents');
      text += apart ? ` ${spokenText(node)} ` : spokenText(node);
    }
  }
  return text;
}
// Measures each anchor once: null when it is missing, inert, hidden or has no size.
function createAnchorMeasure() {
  const boxes = new Map<string, Box | null>();
  return (name: string) => {
    if (boxes.has(name)) return boxes.get(name)!;
    const anchor = anchorNamed(name);
    const box =
      !anchor || anchor.closest('[inert]') || getComputedStyle(anchor).visibility === 'hidden'
        ? null
        : layoutBox(anchor);
    boxes.set(name, box?.w && box.h ? box : null);
    return boxes.get(name)!;
  };
}
export type { ShownStamp };
// The stickers as drawn, measured again (at most once a frame) whenever the page's layout may
// have changed. Creates signals: call it synchronously inside the component that owns them.
export function createPlacement(stamps: () => PlacedStamp[], hidden: () => boolean) {
  const [revision, setRevision] = createSignal(0);
  let frame = 0,
    shown = new Map<string, ShownStamp>();
  const visible = createMemo(() => {
    revision();
    shown = hidden() ? new Map() : layoutStamps(stamps(), createAnchorMeasure(), shown);
    return [...shown.values()];
  });
  function reposition() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      setRevision((n) => n + 1);
    });
  }
  onSettled(() => {
    window.addEventListener('resize', reposition);
    const resize = new ResizeObserver(reposition);
    resize.observe(document.querySelector('.site-body')!);
    const mutations = new MutationObserver(reposition);
    mutations.observe(document.querySelector('main')!, {
      attributes: true,
      attributeFilter: ['class', 'inert', 'hidden'],
      childList: true,
      subtree: true,
    });
    return () => {
      window.removeEventListener('resize', reposition);
      resize.disconnect();
      mutations.disconnect();
      cancelAnimationFrame(frame);
    };
  });
  // The topmost drawn sticker under a point on screen that `accept` takes.
  function stickerAt(x: number, y: number, accept: (s: ShownStamp) => boolean) {
    const { px, py } = toPage(x, y);
    return stampAt(visible(), px, py, accept);
  }
  return { visible, reposition, stickerAt };
}
