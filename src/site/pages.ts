// The one list of the site's pages. Routing, client-side navigation, the index tabs, prerendering,
// the sitemap and the stamp database rules (scripts/firebase/rules.ts) all derive from it.
// Kept free of imports so Node scripts and the browser bundle can share it.

export const SITE_ORIGIN = 'https://cp20.dev';

/**
 * Pages other than the works' own. This order is the order of prerendering, the sitemap and the
 * page pattern in database.rules.json (changing it changes those files).
 */
export const STATIC_PAGES: readonly { path: string; title: string }[] = [
  { path: '/', title: 'しーぴーのポートフォリオ' },
  { path: '/about', title: 'プロフィール' },
  { path: '/articles', title: '記事' },
  { path: '/works', title: '作品一覧' },
];

/** The index tabs, top to bottom. Moving down the tabs turns the page forward. */
export const TAB_PATHS = ['/', '/works', '/articles', '/about'] as const;

/**
 * A work's id becomes its URL (/works/<id>) and its stamp page key (works--<id>), so it is
 * lower-case words joined by single hyphens: `--` would make the key ambiguous.
 */
export const WORK_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const normalizePath = (pathname: string) => pathname.replace(/\/$/, '') || '/';
export const workPath = (id: string) => `/works/${id}`;
export const canonicalUrl = (path: string) => `${SITE_ORIGIN}${path}`;

/** Where a page's stamps are stored: pages/<key>. Existing records depend on this mapping. */
export const pageKey = (path: string) =>
  path === '/' ? 'home' : path.replace(/^\/|\/$/g, '').replaceAll('/', '--');

/** The index tab a page belongs to (a work's detail page belongs to the works tab), or -1. */
export const tabIndex = (path: string) =>
  path === '/' ? 0 : TAB_PATHS.findIndex((s, i) => i > 0 && path.startsWith(s));

/** The section a page is drawn as (the colour of its paper and its tab): `/404` stays `404`. */
export const sectionName = (path: string) =>
  path === '/' ? 'home' : path.startsWith('/works') ? 'works' : path.slice(1) || 'home';

/** Throws if an id is malformed or used twice. */
export function validateWorks<T extends { id: string }>(works: readonly T[]): T[] {
  const seen = new Set<string>();
  for (const work of works) {
    const id: unknown = work?.id;
    if (typeof id !== 'string' || !WORK_ID_PATTERN.test(id))
      throw Error(
        `Invalid work id ${JSON.stringify(id)}: use lower-case letters, digits and single hyphens (e.g. "my-app-2")`,
      );
    if (seen.has(id)) throw Error(`Duplicate work id "${id}"`);
    seen.add(id);
  }
  return [...works];
}

/** works.json followed by manual.json's projects, checked. */
export const mergeWorks = <T extends { id: string }>(
  base: readonly T[],
  manual: { projects?: readonly T[] },
) => validateWorks([...base, ...(manual.projects ?? [])]);

type LinkingWork = { id: string; relatedArticles?: readonly string[] };

/**
 * Related-article links whose article is not in the article list, as
 * "Work \"id\" links url" messages. A work page only shows related articles it
 * can title, so these would silently disappear from the page.
 */
export function missingRelatedArticles(
  works: readonly LinkingWork[],
  articles: readonly { url: string }[],
): string[] {
  const known = new Set(articles.map((a) => a.url));
  return works.flatMap((work) =>
    (work.relatedArticles ?? [])
      .filter((url) => !known.has(url))
      .map((url) => `Work "${work.id}" links ${url}, which is not in the article list`),
  );
}

/**
 * Fails when a work links a related article that the article list does not
 * hold, so a change to works.json or manual.json cannot drop one unnoticed.
 */
export function assertRelatedArticles(works: readonly LinkingWork[], articles: readonly { url: string }[]) {
  const [first] = missingRelatedArticles(works, articles);
  if (first) throw Error(`${first}: add it to manual.json articles`);
}

/** Every page that exists, in prerender order. */
export const sitePaths = (works: readonly { id: string }[]) => [
  ...STATIC_PAGES.map((p) => p.path),
  ...works.map((w) => workPath(w.id)),
];

export const stampPageKeys = (works: readonly { id: string }[]) => sitePaths(works).map(pageKey);
