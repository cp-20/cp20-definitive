import { getRequestEvent, isServer } from '@solidjs/web';
import { works } from '../content/content.ts';
import { plain } from '../content/phrase-marks.ts';
import { highlightIds, milestones } from '../data/editorial.ts';
import profile from '../data/profile.json';
import { SITE_ORIGIN, STATIC_PAGES, normalizePath, workPath } from './pages.ts';
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
  '/works': 'しーぴー（cp20）が2022年から、個人開発を中心につくってきたもの。',
  '/articles': 'しーぴー（cp20）がブログや traP、Zenn、Qiita などに書いた記事。',
};
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
    description: work ? plain(work.description) : (descriptions[path] ?? descriptions['/']),
  };
}
