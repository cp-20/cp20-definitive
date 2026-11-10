import { getRequestEvent, isServer } from '@solidjs/web';
import { works } from '../content/content.ts';
import { plain } from '../content/phrase-marks.ts';
import { highlightIds, milestones } from '../data/editorial.ts';
import profile from '../data/profile.json';
import { SITE_ORIGIN, STATIC_PAGES, canonicalUrl, normalizePath, workPath } from './pages.ts';
export function currentUrl() {
  return new URL(isServer ? getRequestEvent()?.request.url || `${SITE_ORIGIN}/` : location.href);
}
// What a shared link says under its title: who he is and what came of it, from the same data the
// pages show (the school, the results on the home page's note). A work's page says what it is.
const school = profile.affiliations[0].name;
const results = highlightIds.map((id) => milestones.find((m) => m.id === id)!.title);
const descriptions: Record<string, string> = {
  '/': `しーぴー（cp20）のポートフォリオ。${school}。${results.join('、')}。`,
  '/about': `しーぴー（cp20）。${school}。${results.slice(0, 2).join('、')}。経歴と性能改善の実績。`,
  '/works': 'しーぴー（cp20）の作品一覧。代表作、年ごとの作品、主催したイベント、GitHub の最近の動き。',
  '/articles': 'しーぴー（cp20）がブログや traP、Zenn、Qiita などに書いた記事。',
};
/** A tag in a page's head: its element and attributes. */
export type HeadTag = { element: 'link' | 'meta'; attributes: Record<string, string> };
/**
 * What a page tells crawlers: a known page names its canonical URL (also as og:url); an unknown
 * path renders the 404 page, which asks not to be indexed and names no URL. Document.tsx renders
 * these tags and navigation.ts swaps them when the page changes.
 */
function indexingTags(path: string, found: boolean): HeadTag[] {
  if (!found) return [{ element: 'meta', attributes: { name: 'robots', content: 'noindex' } }];
  const url = canonicalUrl(path);
  return [
    { element: 'link', attributes: { rel: 'canonical', href: url } },
    { element: 'meta', attributes: { property: 'og:url', content: url } },
  ];
}
export function pageInfo(path = normalizePath(currentUrl().pathname)) {
  const work = works.find((w) => path === workPath(w.id));
  const known = STATIC_PAGES.find((p) => p.path === path)?.title;
  const title = work?.title ?? known ?? 'ページが見つかりません';
  const found = !!(work || known);
  return {
    path,
    work,
    found,
    indexing: indexingTags(path, found),
    title: `${title} — cp20.dev`,
    description: work ? plain(work.description) : (descriptions[path] ?? descriptions['/']),
  };
}
