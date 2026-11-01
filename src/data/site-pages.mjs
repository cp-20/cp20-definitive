// The one list of the site's pages. Routing, client-side navigation, the index tabs, prerendering,
// the sitemap and the stamp database rules (scripts/database-rules.mjs) all derive from it.
// Kept free of imports so Node scripts and the browser bundle can share it.

export const SITE_ORIGIN = 'https://cp20.dev';

/**
 * Pages other than the works' own. This order is the order of prerendering, the sitemap and the
 * page pattern in database.rules.json (changing it changes those files).
 * @type {readonly { path: string; title: string }[]}
 */
export const STATIC_PAGES = [
  { path: '/', title: 'しーぴーのポートフォリオ' },
  { path: '/about', title: 'プロフィール' },
  { path: '/articles', title: '記事' },
  { path: '/works', title: '作品一覧' },
];

/** The index tabs, top to bottom. Moving down the tabs turns the page forward. */
export const TAB_PATHS = /** @type {const} */ (['/', '/works', '/articles', '/about']);

/**
 * A work's id becomes its URL (/works/<id>) and its stamp page key (works--<id>), so it is
 * lower-case words joined by single hyphens: `--` would make the key ambiguous.
 */
export const WORK_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** @param {string} pathname */
export const normalizePath = (pathname) => pathname.replace(/\/$/, '') || '/';
/** @param {string} id */
export const workPath = (id) => `/works/${id}`;
/** @param {string} path */
export const canonicalUrl = (path) => `${SITE_ORIGIN}${path}`;

/**
 * Where a page's stamps are stored: pages/<key>. Existing records depend on this mapping.
 * @param {string} path
 */
export const pageKey = (path) => (path === '/' ? 'home' : path.replace(/^\/|\/$/g, '').replaceAll('/', '--'));

/**
 * The index tab a page belongs to (a work's detail page belongs to the works tab), or -1.
 * @param {string} path
 */
export const tabIndex = (path) =>
  path === '/' ? 0 : TAB_PATHS.findIndex((s, i) => i > 0 && path.startsWith(s));

/**
 * The section a page is drawn as (the colour of its paper and its tab): `/404` stays `404`.
 * @param {string} path
 */
export const sectionName = (path) =>
  path === '/' ? 'home' : path.startsWith('/works') ? 'works' : path.slice(1) || 'home';

/**
 * Throws if an id is malformed or used twice.
 * @template {{ id: string }} T
 * @param {readonly T[]} works
 * @returns {T[]}
 */
export function validateWorks(works) {
  const seen = new Set();
  for (const work of works) {
    const id = work?.id;
    if (typeof id !== 'string' || !WORK_ID_PATTERN.test(id))
      throw Error(
        `Invalid work id ${JSON.stringify(id)}: use lower-case letters, digits and single hyphens (e.g. "my-app-2")`,
      );
    if (seen.has(id)) throw Error(`Duplicate work id "${id}"`);
    seen.add(id);
  }
  return [...works];
}

/**
 * works.json followed by manual.json's projects, checked.
 * @template {{ id: string }} T
 * @param {readonly T[]} base
 * @param {{ projects?: readonly T[] }} manual
 * @returns {T[]}
 */
export const mergeWorks = (base, manual) => validateWorks([...base, ...(manual.projects ?? [])]);

/**
 * Every page that exists, in prerender order.
 * @param {readonly { id: string }[]} works
 */
export const sitePaths = (works) => [...STATIC_PAGES.map((p) => p.path), ...works.map((w) => workPath(w.id))];

/** @param {readonly { id: string }[]} works */
export const stampPageKeys = (works) => sitePaths(works).map(pageKey);
