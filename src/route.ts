import { getRequestEvent, isServer } from '@solidjs/web';
import { works } from './data/content';
import { SITE_ORIGIN, STATIC_PAGES, normalizePath, workPath } from './data/site-pages.mjs';
export function currentUrl() {
  return new URL(isServer ? getRequestEvent()?.request.url || `${SITE_ORIGIN}/` : location.href);
}
export function pageInfo(path = normalizePath(currentUrl().pathname)) {
  const work = works.find((w) => path === workPath(w.id));
  const known = STATIC_PAGES.find((p) => p.path === path)?.title;
  const title = work?.title ?? known ?? 'ページが見つかりません';
  return {
    path,
    work,
    // Unknown paths render the 404 page: noindex, and no canonical/og:url pointing at them.
    found: !!(work || known),
    title: `${title} — cp20.dev`,
    description:
      work?.description ||
      'しーぴー（cp20）のポートフォリオ。ダイススペック、自作Cコンパイラ、みんなのものさしなどの制作物、技術記事、プロフィール。',
  };
}
