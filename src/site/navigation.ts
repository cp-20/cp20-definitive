// In-app navigation: links to the site's pages swap the page in place (turning it like a sheet
// where the browser can), keeping each history entry's scroll position and focus, and the head
// in step with the page.
import { createSignal, onSettled, flush } from 'solid-js';
import { currentUrl, pageInfo, type HeadTag } from './route.ts';
import { works } from '../content/content.ts';
import { SCROLL_KEY, readPositions, writePositions } from './scroll-positions.ts';
import { normalizePath, sitePaths, tabIndex } from './pages.ts';
import { openFromHash, openerOf } from '../components/Modal.tsx';
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
// The rect goes into a rule for the transition's own pseudo-elements, the only place it is read
// (the image pair takes the binding as its perspective origin; the images inherit the rest):
// a custom property on <html> would restyle every element of the page on each turn.
const flipRects: Record<string, string> = {};
let flipStyle: HTMLStyleElement | undefined;
function markSheet(prefix: 'flip-old' | 'flip-new') {
  const sheet = document.querySelector('.site-body')?.getBoundingClientRect();
  if (!sheet) return;
  const part = prefix === 'flip-old' ? 'old' : 'new';
  flipRects[part] =
    `::view-transition-image-pair(root){` +
    `--${prefix}-left:${Math.max(0, sheet.left)}px;` +
    `--${prefix}-right:${Math.max(0, innerWidth - sheet.right)}px;` +
    `--${prefix}-top:${Math.max(0, sheet.top)}px;` +
    `--${prefix}-bottom:${Math.max(0, innerHeight - sheet.bottom)}px}`;
  if (!flipStyle?.isConnected) document.head.append((flipStyle = document.createElement('style')));
  const text = Object.values(flipRects).join('\n');
  if (flipStyle.textContent !== text) flipStyle.textContent = text;
}

// ── The head ──
/** Puts the head in step with the page now shown: its title, description and indexing tags. */
function syncHead(info: ReturnType<typeof pageInfo>) {
  document.title = info.title;
  for (const selector of ['meta[name="description"]', 'meta[property="og:description"]'])
    document.querySelector(selector)?.setAttribute('content', info.description);
  document.querySelector('meta[property="og:title"]')?.setAttribute('content', info.title);
  replaceIndexing(info.indexing);
}
// The indexing tags Document.tsx rendered for the first page are replaced by this page's.
function replaceIndexing(tags: HeadTag[]) {
  for (const old of document.head.querySelectorAll('[data-indexing]')) old.remove();
  for (const { element, attributes } of tags) {
    const tag = document.createElement(element);
    for (const [name, value] of Object.entries(attributes)) tag.setAttribute(name, value);
    tag.dataset.indexing = '';
    document.head.append(tag);
  }
}

// ── Scroll positions ──
/**
 * Each history entry's scroll position, kept in sessionStorage so a reload or a visit to another
 * document comes back to it (the browser's own restoring is off, so back/forward can restore after
 * the page has been swapped). Restores the position of the entry the page opened at.
 */
function createScrollMemory() {
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
  const remember = () => {
    positions.delete(key);
    positions.set(key, [scrollX, scrollY]);
  };
  return {
    /** The history entry shown now. */
    key: () => key,
    /** Switches to another history entry and returns its position, if one was kept. */
    enter(next: string) {
      key = next;
      return positions.get(key);
    },
    /** Keeps the current position (on every scroll). */
    remember,
    /** Keeps the current position and stores them all (before leaving the entry or the page). */
    persist() {
      remember();
      try {
        sessionStorage.setItem(SCROLL_KEY, writePositions(positions));
      } catch {}
    },
    dispose() {
      history.scrollRestoration = oldRestoration;
    },
  };
}

// ── Focus ──
// A hash target is focused through its own heading, so a screen reader announces the section.
function focusableTarget(target: HTMLElement) {
  if (
    /^H[1-6]$/.test(target.tagName) ||
    target.matches('a[href], button, input, select, textarea, [tabindex]')
  )
    return target;
  return target.querySelector<HTMLElement>('h1, h2, h3, h4, h5, h6') || target;
}
// Back/forward returns focus to the link that left the page (when the keyboard followed it),
// else to the first heading on screen, so the next Tab carries on from the restored position.
// A page can link one place twice (a card's image and its title): the nth Tab stop is the one.
const linksTo = (href: string) =>
  [...document.querySelectorAll<HTMLAnchorElement>('a[href]')].filter(
    (a) => a.href === href && a.tabIndex >= 0 && !a.closest('[aria-hidden="true"], [inert]'),
  );
function restoredFocus(saved: unknown) {
  const { href, n } = (saved || {}) as { href?: unknown; n?: unknown };
  const link = typeof href === 'string' && typeof n === 'number' ? linksTo(href)[n] : undefined;
  if (link) return link;
  return (
    [...document.querySelectorAll<HTMLElement>('main :is(h1, h2, h3)')].find((h) => {
      const r = h.getBoundingClientRect();
      return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight;
    }) || null
  );
}
/** Moves focus without scrolling, making a heading focusable by script if it is not already. */
function focusQuietly(element: HTMLElement | null) {
  if (element && element.tabIndex < 0 && !element.hasAttribute('tabindex')) element.tabIndex = -1;
  element?.focus({ preventScroll: true });
}

// ── Fragments and dialogs ──
/** The fragment of the QR code's address, which names nothing on the page. */
export const QR_DIGITS = /^#\d+$/;
// The element a URL's #fragment names on the current page.
const hashTarget = (url: { hash: string }) =>
  url.hash ? document.getElementById(decodeURIComponent(url.hash.slice(1))) : null;
// A fragment can name a dialog (/about#isucon2026, /#qr). Behind one opened from the page's
// content, the page shows the button that opens it, to come back to when the dialog closes; the
// shell's own (the QR code in the footer) leave the page where it starts.
function showOpener(dialog: HTMLDialogElement) {
  const opener = openerOf(dialog.id);
  if (!opener?.closest('main')) return false;
  opener.scrollIntoView({ block: 'center', behavior: 'instant' });
  return true;
}
// A link to a dialog on the same page changes only the fragment; so does opening one at its URL.
function openHashDialog() {
  const target = hashTarget(location);
  if (target instanceof HTMLDialogElement && !target.open) {
    showOpener(target);
    openFromHash(target);
  }
}

/** The path shown, following the site's links, back/forward and the history entry it opened at. */
export function createNavigation() {
  const [path, setPath] = createSignal(normalizePath(currentUrl().pathname));
  onSettled(() => {
    // The QR code's address ends in #<digits> that only draw its clover (scripts/build/qr.ts):
    // the page drops them from the address and opens as at its plain URL.
    if (QR_DIGITS.test(location.hash))
      history.replaceState(history.state, '', location.pathname + location.search);
    const scroll = createScrollMemory();
    let transition: ViewTransition | undefined,
      version = 0;
    // A fragment's target, scrolled to again after the turn if a smooth scroll left it short.
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
    /** Shows `url`'s page at `restore` (back/forward) or at its fragment, turning the page if `animate`. */
    const move = (url: URL, restore?: [number, number], animate = true, focusLink?: unknown) => {
      const ticket = ++version;
      aim = undefined;
      transition?.skipTransition();
      // A dialog belongs to the page it was opened on (the credits live in the shell and would stay).
      for (const d of document.querySelectorAll<HTMLDialogElement>('dialog[open]')) d.close();
      // A dialog the URL names opens once the page has turned: during the turn the tabs are drawn
      // above everything, its backdrop included.
      let dialog: HTMLDialogElement | null = null;
      const openDialog = () => {
        if (dialog && ticket === version) openFromHash(dialog);
      };
      const update = () => {
        if (ticket !== version) return;
        // From now on pages arrive with the turn alone: the first page's entrance is not repeated.
        document.documentElement.dataset.turned = '';
        setPath(normalizePath(url.pathname));
        flush();
        syncHead(pageInfo(path()));
        document.dispatchEvent(new Event('cp20:navigation'));
        const target = hashTarget(url);
        if (target instanceof HTMLDialogElement) dialog = target;
        if (restore) window.scrollTo({ left: restore[0], top: restore[1], behavior: 'instant' });
        else if (dialog) {
          if (!showOpener(dialog)) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        } else if (target) {
          target.scrollIntoView({ behavior: 'instant' });
          // A smooth scroll still running when the link was clicked can leave the jump short.
          aim = target;
        } else window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        // Focus lands where the link pointed: the target section's heading, else the page heading.
        // Otherwise the next Tab would start back at the top of the page.
        focusQuietly(
          (restore && restoredFocus(focusLink)) ||
            (target && !restore && !dialog && focusableTarget(target)) ||
            document.querySelector<HTMLElement>('main h1'),
        );
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
            openDialog();
          });
      } else {
        update();
        requestAnimationFrame(settleAim);
        openDialog();
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
    // A plain click on a link to one of the site's pages swaps the page instead of loading it.
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const a = (e.target as Element).closest<HTMLAnchorElement>('a[href]');
      if (!a || a.hasAttribute('download') || (a.target && a.target !== '_self')) return;
      const url = new URL(a.href);
      if (url.origin !== location.origin || !paths.has(normalizePath(url.pathname))) return;
      if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
      e.preventDefault();
      if (url.href === location.href) return;
      scroll.persist();
      // A keyboard-followed link (detail 0) is where focus goes when this entry is returned to.
      history.replaceState(
        {
          ...history.state,
          cp20Entry: scroll.key(),
          cp20Focus: e.detail === 0 ? { href: a.href, n: linksTo(a.href).indexOf(a) } : undefined,
        },
        '',
      );
      const key = crypto.randomUUID();
      scroll.enter(key);
      history.pushState({ cp20Entry: key }, '', url);
      move(url, undefined, e.detail !== 0);
    };
    const pop = (e: PopStateEvent) => {
      const restore = scroll.enter(e.state?.cp20Entry || crypto.randomUUID());
      move(new URL(location.href), restore, false, e.state?.cp20Focus);
    };
    document.addEventListener('click', relay, true);
    document.addEventListener('click', click);
    window.addEventListener('scroll', scroll.remember, { passive: true });
    window.addEventListener('popstate', pop);
    window.addEventListener('pagehide', scroll.persist);
    window.addEventListener('hashchange', openHashDialog);
    // The page was opened at a dialog's URL.
    openHashDialog();
    return () => {
      transition?.skipTransition();
      document.removeEventListener('click', relay, true);
      document.removeEventListener('click', click);
      window.removeEventListener('scroll', scroll.remember);
      window.removeEventListener('popstate', pop);
      window.removeEventListener('hashchange', openHashDialog);
      window.removeEventListener('pagehide', scroll.persist);
      scroll.dispose();
    };
  });
  return path;
}
