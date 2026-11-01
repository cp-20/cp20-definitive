import { createSignal, onSettled, flush } from 'solid-js';
import { currentUrl, pageInfo } from './route';
import { works } from './data/content';
import { SCROLL_KEY, readPositions, writePositions } from './data/resilience.mjs';
import { canonicalUrl, normalizePath, sitePaths, tabIndex } from './data/site-pages.mjs';
const paths = new Set(sitePaths(works));
function flipDirection(from: string, to: string) {
  const a = tabIndex(from),
    b = tabIndex(to);
  if (a < 0 || b < 0 || from === to) return 'fade';
  if (a !== b) return b > a ? 'forward' : 'back';
  // Within a section, the deeper page (a work's detail) is the next page.
  return to.length > from.length ? 'forward' : 'back';
}
// The page flips around the sheet's binding, so the animation is clipped to the sheet's rect.
// The rect goes into a rule for the transition's own pseudo-element, the only place it is read:
// a custom property on <html> would restyle every element of the page on each turn.
const flipRects: Record<string, string> = {};
let flipStyle: HTMLStyleElement | undefined;
function markSheet(prefix: 'flip-old' | 'flip-new') {
  const sheet = document.querySelector('.site-body')?.getBoundingClientRect();
  if (!sheet) return;
  const part = prefix === 'flip-old' ? 'old' : 'new';
  flipRects[part] =
    `::view-transition-${part}(root){` +
    `--${prefix}-left:${Math.max(0, sheet.left)}px;` +
    `--${prefix}-right:${Math.max(0, innerWidth - sheet.right)}px;` +
    `--${prefix}-top:${Math.max(0, sheet.top)}px;` +
    `--${prefix}-bottom:${Math.max(0, innerHeight - sheet.bottom)}px}`;
  if (!flipStyle?.isConnected) document.head.append((flipStyle = document.createElement('style')));
  const text = Object.values(flipRects).join('\n');
  if (flipStyle.textContent !== text) flipStyle.textContent = text;
}
// Mirror Document.tsx: known pages get canonical + og:url, the 404 page gets noindex instead.
function syncIndexing(url: string | undefined) {
  const head = document.head;
  const tag = <T extends HTMLElement>(selector: string, create: () => T) => {
    let el = head.querySelector<T>(selector);
    if (!el) head.append((el = create()));
    return el;
  };
  if (url) {
    head.querySelector('meta[name="robots"]')?.remove();
    tag('link[rel="canonical"]', () =>
      Object.assign(document.createElement('link'), { rel: 'canonical' }),
    ).href = url;
    tag('meta[property="og:url"]', () => {
      const meta = document.createElement('meta');
      meta.setAttribute('property', 'og:url');
      return meta;
    }).content = url;
  } else {
    head.querySelector('link[rel="canonical"]')?.remove();
    head.querySelector('meta[property="og:url"]')?.remove();
    tag('meta[name="robots"]', () =>
      Object.assign(document.createElement('meta'), { name: 'robots' }),
    ).content = 'noindex';
  }
}
// A hash target is focused through its own heading, so a screen reader announces the section.
function focusableTarget(target: HTMLElement) {
  if (
    /^H[1-6]$/.test(target.tagName) ||
    target.matches('a[href], button, input, select, textarea, [tabindex]')
  )
    return target;
  return target.querySelector<HTMLElement>('h1, h2, h3, h4, h5, h6') || target;
}
export function createNavigation() {
  const [path, setPath] = createSignal(normalizePath(currentUrl().pathname));
  onSettled(() => {
    // Positions survive a reload or a visit to another document (the browser's own restoring
    // is off so in-app back/forward can restore after the page has been swapped).
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(SCROLL_KEY);
    } catch {}
    const positions = readPositions(stored);
    const entry = history.state?.cp20Entry;
    let key = entry || crypto.randomUUID();
    history.replaceState({ ...history.state, cp20Entry: key }, '');
    const oldRestoration = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    const saved = entry && !location.hash ? positions.get(entry) : undefined;
    if (saved && scrollX === 0 && scrollY === 0)
      window.scrollTo({ left: saved[0], top: saved[1], behavior: 'instant' });
    let transition: ViewTransition | undefined,
      version = 0;
    const remember = () => {
      positions.delete(key);
      positions.set(key, [scrollX, scrollY]);
    };
    const persist = () => {
      remember();
      try {
        sessionStorage.setItem(SCROLL_KEY, writePositions(positions));
      } catch {}
    };
    let aim: HTMLElement | undefined;
    const settleAim = () => {
      const target = aim;
      aim = undefined;
      if (
        target?.isConnected &&
        Math.abs(
          target.getBoundingClientRect().top - (parseFloat(getComputedStyle(target).scrollMarginTop) || 0),
        ) > 1
      )
        target.scrollIntoView({ behavior: 'instant' });
    };
    // Back/forward returns focus to the link that left the page (when the keyboard followed it),
    // else to the first heading on screen, so the next Tab carries on from the restored position.
    // A page can link one place twice (a card's image and its title): the nth Tab stop is the one.
    const linksTo = (href: string) =>
      [...document.querySelectorAll<HTMLAnchorElement>('a[href]')].filter(
        (a) => a.href === href && a.tabIndex >= 0 && !a.closest('[aria-hidden="true"], [inert]'),
      );
    const restoredFocus = (saved: unknown) => {
      const { href, n } = (saved || {}) as { href?: unknown; n?: unknown };
      const link = typeof href === 'string' && typeof n === 'number' ? linksTo(href)[n] : undefined;
      if (link) return link;
      return (
        [...document.querySelectorAll<HTMLElement>('main :is(h1, h2, h3)')].find((h) => {
          const r = h.getBoundingClientRect();
          return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight;
        }) || null
      );
    };
    const move = (url: URL, restore?: [number, number], animate = true, focusLink?: unknown) => {
      const ticket = ++version;
      aim = undefined;
      transition?.skipTransition();
      const update = () => {
        if (ticket !== version) return;
        setPath(normalizePath(url.pathname));
        flush();
        const info = pageInfo(path());
        document.title = info.title;
        for (const selector of ['meta[name="description"]', 'meta[property="og:description"]'])
          document.querySelector(selector)?.setAttribute('content', info.description);
        document.querySelector('meta[property="og:title"]')?.setAttribute('content', info.title);
        syncIndexing(info.found ? canonicalUrl(info.path) : undefined);
        document.dispatchEvent(new Event('cp20:navigation'));
        const target = url.hash ? document.getElementById(decodeURIComponent(url.hash.slice(1))) : null;
        if (restore) window.scrollTo({ left: restore[0], top: restore[1], behavior: 'instant' });
        else if (target) {
          target.scrollIntoView({ behavior: 'instant' });
          // A smooth scroll still running when the link was clicked can leave the jump short.
          aim = target;
        } else window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        // Focus lands where the link pointed: the target section's heading, else the page heading.
        // Otherwise the next Tab would start back at the top of the page.
        const heading =
          (restore && restoredFocus(focusLink)) ||
          (target && !restore && focusableTarget(target)) ||
          document.querySelector<HTMLElement>('main h1');
        if (heading && heading.tabIndex < 0 && !heading.hasAttribute('tabindex')) heading.tabIndex = -1;
        heading?.focus({ preventScroll: true });
        markSheet('flip-new');
      };
      if (
        animate &&
        document.startViewTransition &&
        !matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        const root = document.documentElement;
        root.dataset.flip = flipDirection(path(), normalizePath(url.pathname));
        markSheet('flip-old');
        transition = document.startViewTransition(update);
        void transition.ready.catch(() => {});
        const current = transition;
        void transition.finished
          .catch(() => {})
          .finally(() => {
            if (transition !== current) return;
            delete root.dataset.flip;
            settleAim();
          });
      } else {
        update();
        requestAnimationFrame(settleAim);
      }
    };
    // While a page turns, the transition's snapshots take every hit and a click lands on <html>.
    // The new page is already in place underneath, so end the turn and hand the click to it.
    const relay = (e: MouseEvent) => {
      const root = document.documentElement;
      if (e.target !== root || !root.dataset.flip || !transition) return;
      transition.skipTransition();
      delete root.dataset.flip;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el === root) return;
      e.stopImmediatePropagation();
      el.dispatchEvent(new MouseEvent('click', e));
    };
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const a = (e.target as Element).closest<HTMLAnchorElement>('a[href]');
      if (!a || a.hasAttribute('download') || (a.target && a.target !== '_self')) return;
      const url = new URL(a.href);
      if (url.origin !== location.origin || !paths.has(normalizePath(url.pathname))) return;
      if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
      e.preventDefault();
      if (url.href === location.href) return;
      persist();
      // A keyboard-followed link (detail 0) is where focus goes when this entry is returned to.
      history.replaceState(
        {
          ...history.state,
          cp20Entry: key,
          cp20Focus: e.detail === 0 ? { href: a.href, n: linksTo(a.href).indexOf(a) } : undefined,
        },
        '',
      );
      key = crypto.randomUUID();
      history.pushState({ cp20Entry: key }, '', url);
      move(url, undefined, e.detail !== 0);
    };
    const pop = (e: PopStateEvent) => {
      key = e.state?.cp20Entry || crypto.randomUUID();
      move(new URL(location.href), positions.get(key), false, e.state?.cp20Focus);
    };
    document.addEventListener('click', relay, true);
    document.addEventListener('click', click);
    window.addEventListener('scroll', remember, { passive: true });
    window.addEventListener('popstate', pop);
    window.addEventListener('pagehide', persist);
    return () => {
      transition?.skipTransition();
      document.removeEventListener('click', relay, true);
      document.removeEventListener('click', click);
      window.removeEventListener('scroll', remember);
      window.removeEventListener('popstate', pop);
      window.removeEventListener('pagehide', persist);
      history.scrollRestoration = oldRestoration;
    };
  });
  return path;
}
