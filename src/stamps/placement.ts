// Where stickers go on the page: the anchors they are stored against, where each one is drawn,
// and what lies under a point on screen.
import { createMemo, createSignal, onSettled } from 'solid-js';
import type { PlacedStamp } from './types.ts';
import { layoutStamps, spotIn, stampAt, type Box, type ShownStamp } from './layout.ts';
import { stampPlace } from './a11y.ts';
import { anchorSteps, CHAR_STEP, joinAnchor, markedName, TEXT_STEP, type Step } from './anchor-path.ts';

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
// The runs of words lying straight in an element (its text nodes that are not blank).
const wordsIn = (el: Element) =>
  [...el.childNodes].filter((n): n is Text => n.nodeType === Node.TEXT_NODE && !!n.textContent?.trim());
// The anchor naming an element: its own data-stamp-anchor name, or the way down to it from the
// nearest marked element around it, then `last` (to a character in it) when given; null outside
// every marked element or when it cannot be stored.
function anchorOf(el: HTMLElement, last: readonly Step[] = []): string | null {
  const steps: Step[] = [...last].reverse();
  for (let node: HTMLElement = el; ; ) {
    if (node.dataset.stampAnchor) return joinAnchor(node.dataset.stampAnchor, steps.reverse());
    const parent = node.parentElement;
    if (!parent) return null;
    steps.push({ index: stepChildren(parent).indexOf(node), tag: node.localName });
    node = parent;
  }
}
// The range of one character of a run of words (both halves of a character past U+FFFF).
function charRange(words: Text, at: number) {
  const code = words.data.charCodeAt(at);
  const range = document.createRange();
  range.setStart(words, at);
  range.setEnd(words, Math.min(words.length, at + (code >= 0xd800 && code < 0xdc00 ? 2 : 1)));
  return range;
}
function wholeRange(node: Node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  return range;
}
const covers = (range: Range, x: number, y: number) =>
  [...range.getClientRects()].some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
// The character of a run of words drawn at a point on screen, if any.
function charIn(words: Text, x: number, y: number, hint = -1) {
  if (!words.data.trim() || !covers(wholeRange(words), x, y)) return -1;
  for (const at of [hint, hint - 1])
    if (at >= 0 && at < words.length && covers(charRange(words, at), x, y)) return at;
  for (let at = 0; at < words.length; at++) if (covers(charRange(words, at), x, y)) return at;
  return -1;
}
// Elements that draw over what lies under them even without a background.
const DRAWS = new Set(['img', 'picture', 'video', 'canvas', 'iframe', 'svg', 'input', 'select', 'textarea']);
// Whether what lies under an element shows through it where it has no words: a clear overlay (a
// stretched link or button over a card) does, anything painted or a picture does not.
function seeThrough(el: Element) {
  if (DRAWS.has(el.localName)) return false;
  const style = getComputedStyle(el);
  return style.backgroundImage === 'none' && /^(transparent|rgba\(.*,\s*0\))$/.test(style.backgroundColor);
}
// The character drawn at a point on screen, in a run of words lying straight in its element, or
// null off any words (a gap, a picture, the blank between two lines). `stack` is the page under the
// point, topmost first; words under a clear overlay count.
function characterAt(x: number, y: number, stack: readonly Element[]): { words: Text; at: number } | null {
  const caret = document.caretPositionFromPoint?.(x, y);
  const range = caret ? null : document.caretRangeFromPoint?.(x, y);
  const node = caret ? caret.offsetNode : range?.startContainer;
  const offset = caret ? caret.offset : (range?.startOffset ?? 0);
  for (const el of stack) {
    for (const words of wordsIn(el)) {
      const at = charIn(words, x, y, words === node ? offset : -1);
      if (at >= 0) return { words, at };
    }
    if (!seeThrough(el)) return null;
  }
  return null;
}
// The element whose box a part of the page is measured in: the nearest one around it that a
// sticker can lie on (an inline link's box splits over lines).
function holderOf(el: HTMLElement | null) {
  for (let node: Element | null = el; node; node = node.parentElement) if (holdsSticker(node)) return node;
  return null;
}
// What an anchor names: an element and, for words in it, the range of the character (or of the run
// of words) the sticker is on. When the way down no longer leads to one alike (the page changed
// since) it is the marked element, or just the element when its words changed. el is null when even
// the marked element is missing.
function anchorTarget(anchor: string): { el: HTMLElement | null; part?: Range } {
  let el = anchorNamed(markedName(anchor));
  const base = el;
  const steps = anchorSteps(anchor) ?? [];
  for (const [i, step] of steps.entries()) {
    if (step.tag === TEXT_STEP) {
      const words = el && wordsIn(el)[step.index];
      if (!words) return { el };
      const at = steps[i + 1]?.index;
      if (at === undefined) return { el, part: wholeRange(words) };
      return at < words.length ? { el, part: charRange(words, at) } : { el };
    }
    const next = el ? stepChildren(el)[step.index] : undefined;
    if (!next || next.localName !== step.tag || !(next instanceof HTMLElement)) return { el: base };
    el = next;
  }
  return { el };
}
// The box a sticker is placed against, in the box of `el`: the part of the page `part` covers (a
// character), or with no part the element's own box, or for an element with words in it just
// what its content covers (a short heading or label is narrower than its line, and a sticker beside
// its words should stay beside them on a wider screen). null when the part is not shown in it (cut
// off with a clamped description, or of no size).
function stickBox(el: HTMLElement, part?: Range): Box | null {
  const box = layoutBox(el);
  if (!box.w || !box.h) return part ? null : box;
  if (!part && !wordsIn(el).length) return box;
  const content = (part ?? wholeRange(el)).getBoundingClientRect(),
    whole = el.getBoundingClientRect();
  if (!content.width || !content.height || !whole.width || !whole.height) return part ? null : box;
  // Measured on screen, so a transform (a card lifting) is taken back out. Words cut off (a
  // clamped description) are left out with the rest of the overflow.
  const sx = box.w / whole.width,
    sy = box.h / whole.height;
  const left = Math.max(0, (content.left - whole.left) * sx),
    top = Math.max(0, (content.top - whole.top) * sy),
    right = Math.min(box.w, (content.right - whole.left) * sx),
    bottom = Math.min(box.h, (content.bottom - whole.top) * sy);
  if (right <= left || bottom <= top) return part ? null : box;
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
  // On words, the sticker goes with the character under it.
  const stack = document.elementsFromPoint(x, y).filter((el) => !el.closest(STAMP_UI_SELECTOR));
  const char = below && page.contains(below) ? characterAt(x, y, stack) : null;
  if (char && page.contains(char.words) && !char.words.parentElement?.closest('[inert]')) {
    const el = char.words.parentElement!;
    const run = wordsIn(el).indexOf(char.words);
    const holder = holderOf(el);
    const anchor =
      anchorOf(el, [
        { index: run, tag: TEXT_STEP },
        { index: char.at, tag: CHAR_STEP },
      ]) ?? anchorOf(el, [{ index: run, tag: TEXT_STEP }]);
    const box =
      holder &&
      anchor &&
      stickBox(holder, anchor.endsWith(TEXT_STEP) ? wholeRange(char.words) : charRange(char.words, char.at));
    const spot = box && spotIn(box, px, py);
    if (anchor && spot) return { anchor, ...spot };
  }
  for (let el: Element | null = within; el && page.contains(el); el = el.parentElement) {
    if (!holdsSticker(el)) continue;
    const anchor = anchorOf(el);
    const box = anchor && stickBox(el);
    const spot = box && spotIn(box, px, py);
    if (anchor && spot) return { anchor, ...spot };
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
  const measure = (el: HTMLElement | null, part?: Range) => {
    const box = el && shown(el) ? stickBox(el, part) : null;
    return box?.w && box.h ? box : null;
  };
  return (anchor: string) => {
    if (!boxes.has(anchor)) {
      const { el, part } = anchorTarget(anchor);
      // Words are measured in the element around them that a sticker can lie on; words gone or not
      // shown leave the sticker on that element.
      const holder = part ? holderOf(el) : el;
      boxes.set(
        anchor,
        (part && measure(holder, part)) ||
          measure(holder) ||
          (holder?.dataset.stampAnchor ? null : measure(anchorNamed(markedName(anchor)))),
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
