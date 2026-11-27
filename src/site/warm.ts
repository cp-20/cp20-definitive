// The next page's first pictures are fetched when a link to it is about to be followed: the pointer
// rests on it, a finger or the mouse button goes down on it, or the keyboard focuses it. The page
// then opens with its pictures already here rather than drawing them in over their blurred
// stand-ins. Which pictures each page shows first is listed at build time (scripts/build/warm.ts).

/** A picture as an <img> asks for it: the browser picks from `srcset` by `sizes` as on the page. */
export type WarmImage = { src: string; srcset?: string; sizes?: string };
/** The <meta> naming the list in the built pages. */
export const WARM_META = 'cp20-warm';
// A pointer resting this long on a link means it is likely to be clicked; passing over it does not.
const HOVER_MS = 60;

/**
 * Listens for the signs that a link to one of the site's pages is about to be followed.
 * @param pageOf the page path a link leads to within the app, or undefined
 * @returns the cleanup
 */
export function warmOnIntent(pageOf: (a: HTMLAnchorElement) => string | undefined) {
  const list = document.querySelector<HTMLMetaElement>(`meta[name="${WARM_META}"]`)?.content;
  // Not on the dev server (no list), nor for a visitor who asked to save data.
  if (!list || (navigator as { connection?: { saveData?: boolean } }).connection?.saveData) return () => {};
  let manifest: Promise<Record<string, WarmImage[]>> | undefined;
  const warmed = new Set<string>();
  // Kept until loaded, so a picture is not dropped half-way.
  const loading = new Set<HTMLImageElement>();
  const warm = (path: string) => {
    if (warmed.has(path)) return;
    warmed.add(path);
    manifest ||= fetch(list)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
    void manifest.then((pages) => {
      for (const picture of pages[path] || []) {
        const img = new Image();
        img.decoding = 'async';
        if (picture.srcset && picture.sizes) {
          img.sizes = picture.sizes;
          img.srcset = picture.srcset;
        }
        img.src = picture.src;
        loading.add(img);
        img.onload = img.onerror = () => loading.delete(img);
      }
    });
  };
  const linkOf = (e: Event) => {
    const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href]');
    const path = a && pageOf(a);
    return path && path !== location.pathname ? path : undefined;
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const over = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const path = linkOf(e);
    clearTimeout(timer);
    if (path) timer = setTimeout(() => warm(path), HOVER_MS);
  };
  const now = (e: Event) => {
    const path = linkOf(e);
    if (path) warm(path);
  };
  document.addEventListener('pointerover', over, { passive: true });
  document.addEventListener('pointerdown', now, { passive: true });
  document.addEventListener('focusin', now);
  return () => {
    clearTimeout(timer);
    document.removeEventListener('pointerover', over);
    document.removeEventListener('pointerdown', now);
    document.removeEventListener('focusin', now);
  };
}
