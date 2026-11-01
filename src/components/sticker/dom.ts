// Where stickers go on the page: anchors, their layout boxes and the point under the pointer.

// The sticker UI itself, which a point on screen looks through to find the page below.
export const STAMP_UI_SELECTOR = '.sticker-sheet,.sticker-tab,.stamp-overlay,.stamp-layer,.sticker-ghost';
export type Box = { x: number; y: number; w: number; h: number };
// Layout position relative to <body>, ignoring transforms and scroll.
export function layoutBox(el: HTMLElement): Box {
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
// The topmost page element at a point on screen, under any sticker UI.
export const pageElementAt = (x: number, y: number) =>
  document.elementsFromPoint(x, y).find((el) => !el.closest(STAMP_UI_SELECTOR));
// That element and the innermost anchor around it (the page itself when there is none).
export function anchorAt(x: number, y: number) {
  const below = pageElementAt(x, y);
  const anchor =
    below?.closest<HTMLElement>('[data-stamp-anchor]') ||
    document.querySelector<HTMLElement>('[data-stamp-anchor="page"]');
  return { below, anchor };
}
// Where a point on screen lands on the page: the innermost anchor that contains it.
export function locate(x: number, y: number) {
  const found = anchorAt(x, y);
  let anchor = found.anchor;
  if (!anchor || found.below?.closest('.rail') || anchor.closest('[inert]')) return null;
  // Page coordinates follow the document, so stickers scroll natively with the content.
  const page = document.body.getBoundingClientRect(),
    px = x - page.left,
    py = y - page.top;
  let box = layoutBox(anchor);
  while (px < box.x || px > box.x + box.w || py < box.y || py > box.y + box.h) {
    anchor = anchor.parentElement?.closest<HTMLElement>('[data-stamp-anchor]') || null;
    if (!anchor) return null;
    box = layoutBox(anchor);
  }
  return { anchor: anchor.dataset.stampAnchor!, x: (px - box.x) / box.w, y: (py - box.y) / box.h };
}
export function centerOf(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
// Measures each anchor once: null when it is missing, inert, hidden or has no size.
export function createAnchorMeasure() {
  const boxes = new Map<string, Box | null>();
  return (name: string) => {
    if (boxes.has(name)) return boxes.get(name)!;
    const anchor = document.querySelector<HTMLElement>(`[data-stamp-anchor="${CSS.escape(name)}"]`);
    const box =
      !anchor || anchor.closest('[inert]') || getComputedStyle(anchor).visibility === 'hidden'
        ? null
        : layoutBox(anchor);
    boxes.set(name, box?.w && box.h ? box : null);
    return boxes.get(name)!;
  };
}
