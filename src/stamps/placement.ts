// Where stickers go on the page: the anchors they are stored against, where each one is drawn,
// and what lies under a point on screen.
import { createMemo, createSignal, onSettled } from 'solid-js';
import type { PlacedStamp } from './types.ts';
import { layoutStamps, spotIn, stampAt, type Box, type ShownStamp } from './layout.ts';
import { stampPlace } from './a11y.ts';
import { anchorSteps, joinAnchor, markedName, type Step } from './anchor-path.ts';

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
// Inline elements that still have a box of their own.
const REPLACED = new Set([
  'img',
  'picture',
  'video',
  'canvas',
  'iframe',
  'input',
  'button',
  'select',
  'textarea',
]);
// Whether a sticker can lie on an element itself: an inline run of text (split over lines) or an
// element without a box of its own (display: contents) is left to the element around it.
function holdsSticker(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const display = getComputedStyle(el).display;
  return display !== 'contents' && display !== 'none' && (display !== 'inline' || REPLACED.has(el.localName));
}
// The children a step down counts: the sticker UI put into the page is not part of it.
const stepChildren = (el: Element) => [...el.children].filter((c) => !c.matches(STAMP_UI_SELECTOR));
// The anchor naming an element: its own data-stamp-anchor name, or the way down to it from the
// nearest marked element around it; null outside every marked element or when it cannot be stored.
function anchorOf(el: HTMLElement): string | null {
  const steps: Step[] = [];
  for (let node: HTMLElement = el; ; ) {
    if (node.dataset.stampAnchor) return joinAnchor(node.dataset.stampAnchor, steps.reverse());
    const parent = node.parentElement;
    if (!parent) return null;
    steps.push({ index: stepChildren(parent).indexOf(node), tag: node.localName });
    node = parent;
  }
}
// The element an anchor names, or its marked element when the way down no longer leads to one
// alike (the page changed since). null when even the marked element is missing.
function anchorElement(anchor: string) {
  let el = anchorNamed(markedName(anchor));
  const base = el;
  for (const step of anchorSteps(anchor) ?? []) {
    const next = el ? stepChildren(el)[step.index] : undefined;
    if (!next || next.localName !== step.tag || !(next instanceof HTMLElement)) return base;
    el = next;
  }
  return el;
}
// Text in the element, not in a block inside it: a short heading or label is narrower than its
// line, and a sticker beside its words should stay beside them on a wider screen.
function holdsText(el: HTMLElement) {
  let text = false;
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) text ||= !!node.textContent?.trim();
    else if (node instanceof Element && !getComputedStyle(node).display.startsWith('inline')) return false;
  }
  return text;
}
// The box a sticker on an element is placed against: the element's, or for an element of text
// just the part its words cover.
function stickBox(el: HTMLElement): Box {
  const box = layoutBox(el);
  if (!box.w || !box.h || !holdsText(el)) return box;
  const range = document.createRange();
  range.selectNodeContents(el);
  const words = range.getBoundingClientRect(),
    whole = el.getBoundingClientRect();
  if (!words.width || !words.height || !whole.width || !whole.height) return box;
  // Measured on screen, so a transform (a card lifting) is taken back out. Words cut off (a
  // clamped description) are left out with the rest of the overflow.
  const sx = box.w / whole.width,
    sy = box.h / whole.height;
  const left = Math.max(0, (words.left - whole.left) * sx),
    top = Math.max(0, (words.top - whole.top) * sy),
    right = Math.min(box.w, (words.right - whole.left) * sx),
    bottom = Math.min(box.h, (words.bottom - whole.top) * sy);
  if (right <= left || bottom <= top) return box;
  return { x: box.x + left, y: box.y + top, w: right - left, h: bottom - top };
}
// Page coordinates follow the document, so stickers scroll natively with the content.
function toPage(x: number, y: number) {
  const page = document.body.getBoundingClientRect();
  return { px: x - page.left, py: y - page.top };
}
// The topmost page element at a point on screen, under any sticker UI.
export const pageElementAt = (x: number, y: number) =>
  document.elementsFromPoint(x, y).find((el) => !el.closest(STAMP_UI_SELECTOR));
// Where a point on screen lands on the page: the innermost element under it that a sticker can
// lie on, within a marked one, or null where no sticker can go (the index tabs, an inert page on
// its way out).
export function locate(x: number, y: number) {
  const below = pageElementAt(x, y);
  const page = anchorNamed('page');
  if (below?.closest('.rail') || below?.closest('[inert]') || !page || page.closest('[inert]')) return null;
  const { px, py } = toPage(x, y);
  const within = below && page.contains(below) ? below : page;
  for (let el: Element | null = within; el && page.contains(el); el = el.parentElement) {
    if (!holdsSticker(el)) continue;
    const anchor = anchorOf(el);
    const spot = anchor && spotIn(stickBox(el), px, py);
    if (spot) return { anchor, ...spot };
  }
  return null;
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
  const anchor = anchorNamed(markedName(spot.anchor));
  const labelledBy = anchor?.getAttribute('aria-labelledby');
  const heading = anchor?.querySelector('h1, h2, h3');
  const named = labelledBy ? document.getElementById(labelledBy) : null;
  const label = (heading && spokenText(heading).trim()) || (named && spokenText(named));
  return stampPlace(markedName(spot.anchor), label);
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
// Measures each anchor once: null when it is missing, inert, hidden or has no size. An element
// inside a marked one that cannot be measured (hidden on this screen) gives the marked one's box.
function createAnchorMeasure() {
  const boxes = new Map<string, Box | null>();
  const shown = (el: HTMLElement | null) =>
    !!el && !el.closest('[inert]') && getComputedStyle(el).visibility !== 'hidden';
  const measure = (el: HTMLElement | null) => {
    const box = el && shown(el) ? stickBox(el) : null;
    return box?.w && box.h ? box : null;
  };
  return (anchor: string) => {
    if (!boxes.has(anchor)) {
      const el = anchorElement(anchor);
      boxes.set(
        anchor,
        measure(el) ?? (el?.dataset.stampAnchor ? null : measure(anchorNamed(markedName(anchor)))),
      );
    }
    return boxes.get(anchor)!;
  };
}
export type { ShownStamp };
// The stickers as drawn, measured again (at most once a frame) whenever the page's layout may
// have changed.
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
