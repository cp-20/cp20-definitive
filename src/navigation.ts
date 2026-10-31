import { createSignal, onSettled, flush } from 'solid-js';
import { currentUrl, pageInfo } from './route';
import { works } from './data/content';
import { SCROLL_KEY, readPositions, writePositions } from './data/resilience.mjs';
const paths = new Set(['/', '/about', '/articles', '/works', ...works.map((w) => `/works/${w.id}`)]);
// The order of the index tabs. Moving down the tabs turns the page forward.
const sections = ['/', '/works', '/articles', '/about'];
const sectionIndex = (path: string) =>
  path === '/' ? 0 : sections.findIndex((s, i) => i > 0 && path.startsWith(s));
function flipDirection(from: string, to: string) {
  const a = sectionIndex(from),
    b = sectionIndex(to);
  if (a < 0 || b < 0 || from === to) return 'fade';
  if (a !== b) return b > a ? 'forward' : 'back';
  // Within a section, the deeper page (a work's detail) is the next page.
  return to.length > from.length ? 'forward' : 'back';
}
// The page flips around the sheet's binding, so the animation is clipped to the sheet's rect.
function markSheet(prefix: string) {
  const sheet = document.querySelector('.site-body')?.getBoundingClientRect();
  if (!sheet) return;
  const root = document.documentElement.style;
  root.setProperty(`--${prefix}-left`, `${Math.max(0, sheet.left)}px`);
  root.setProperty(`--${prefix}-right`, `${Math.max(0, innerWidth - sheet.right)}px`);
  root.setProperty(`--${prefix}-top`, `${Math.max(0, sheet.top)}px`);
  root.setProperty(`--${prefix}-bottom`, `${Math.max(0, innerHeight - sheet.bottom)}px`);
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
  const [path, setPath] = createSignal(currentUrl().pathname.replace(/\/$/, '') || '/');
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
    const move = (url: URL, restore?: [number, number], animate = true) => {
      const ticket = ++version;
      aim = undefined;
      transition?.skipTransition();
      const update = () => {
        if (ticket !== version) return;
        setPath(url.pathname.replace(/\/$/, '') || '/');
        flush();
        const info = pageInfo(path());
        document.title = info.title;
        for (const selector of ['meta[name="description"]', 'meta[property="og:description"]'])
          document.querySelector(selector)?.setAttribute('content', info.description);
        document.querySelector('meta[property="og:title"]')?.setAttribute('content', info.title);
        syncIndexing(info.found ? `https://cp20.dev${info.path}` : undefined);
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
          (target && !restore && focusableTarget(target)) || document.querySelector<HTMLElement>('main h1');
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
        root.dataset.flip = flipDirection(path(), url.pathname.replace(/\/$/, '') || '/');
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
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const a = (e.target as Element).closest<HTMLAnchorElement>('a[href]');
      if (!a || a.hasAttribute('download') || (a.target && a.target !== '_self')) return;
      const url = new URL(a.href);
      if (url.origin !== location.origin || !paths.has(url.pathname.replace(/\/$/, '') || '/')) return;
      if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
      e.preventDefault();
      if (url.href === location.href) return;
      persist();
      key = crypto.randomUUID();
      history.pushState({ cp20Entry: key }, '', url);
      move(url, undefined, e.detail !== 0);
    };
    const pop = (e: PopStateEvent) => {
      key = e.state?.cp20Entry || crypto.randomUUID();
      move(new URL(location.href), positions.get(key), false);
    };
    document.addEventListener('click', click);
    window.addEventListener('scroll', remember, { passive: true });
    window.addEventListener('popstate', pop);
    window.addEventListener('pagehide', persist);
    return () => {
      transition?.skipTransition();
      document.removeEventListener('click', click);
      window.removeEventListener('scroll', remember);
      window.removeEventListener('popstate', pop);
      window.removeEventListener('pagehide', persist);
      history.scrollRestoration = oldRestoration;
    };
  });
  return path;
}
