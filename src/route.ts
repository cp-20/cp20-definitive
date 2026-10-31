import { getRequestEvent, isServer } from '@solidjs/web';
import { works } from './data/content';
export function currentUrl() {
  return new URL(isServer ? getRequestEvent()?.request.url || 'https://cp20.dev/' : location.href);
}
export function pageInfo(path = currentUrl().pathname.replace(/\/$/, '') || '/') {
  const work = works.find((w) => path === `/works/${w.id}`);
  const known = (
    {
      '/': 'しーぴーのポートフォリオ',
      '/about': 'プロフィール',
      '/works': '作品一覧',
      '/articles': '記事',
    } as Record<string, string>
  )[path];
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
