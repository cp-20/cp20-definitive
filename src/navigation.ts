import { createSignal, onSettled, flush } from 'solid-js';
import { currentUrl, pageInfo } from './route';
import { works } from './data/content';
const paths = new Set(['/', '/about', '/articles', '/works', ...works.map((w) => `/works/${w.id}`)]);
export function createNavigation() {
  const [path, setPath] = createSignal(currentUrl().pathname.replace(/\/$/, '') || '/');
  onSettled(() => {
    const positions = new Map<string, [number, number]>();
    let key = history.state?.cp20Entry || crypto.randomUUID();
    history.replaceState({ ...history.state, cp20Entry: key }, '');
    const oldRestoration = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    let transition: ViewTransition | undefined,
      version = 0;
    const remember = () => positions.set(key, [scrollX, scrollY]);
    const move = (url: URL, restore?: [number, number], animate = true) => {
      const ticket = ++version;
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
        document
          .querySelector('meta[property="og:url"]')
          ?.setAttribute('content', `https://cp20.dev${info.path}`);
        document.querySelector('link[rel="canonical"]')?.setAttribute('href', `https://cp20.dev${info.path}`);
        document.dispatchEvent(new Event('cp20:navigation'));
        const target = url.hash ? document.getElementById(decodeURIComponent(url.hash.slice(1))) : null;
        if (restore) window.scrollTo({ left: restore[0], top: restore[1], behavior: 'instant' });
        else if (target) target.scrollIntoView({ behavior: 'instant' });
        else window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        const heading = document.querySelector<HTMLElement>('main h1');
        if (heading) {
          heading.tabIndex = -1;
          heading.focus({ preventScroll: true });
        }
      };
      if (
        animate &&
        document.startViewTransition &&
        !matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        transition = document.startViewTransition(update);
        void transition.ready.catch(() => {});
        void transition.finished.catch(() => {});
      } else update();
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
      remember();
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
    return () => {
      transition?.skipTransition();
      document.removeEventListener('click', click);
      window.removeEventListener('scroll', remember);
      window.removeEventListener('popstate', pop);
      history.scrollRestoration = oldRestoration;
    };
  });
  return path;
}
