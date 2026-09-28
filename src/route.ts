import { getRequestEvent, isServer } from '@solidjs/web';
import { works } from './data/content';
export function currentUrl() {
  return new URL(isServer ? getRequestEvent()?.request.url || 'https://cp20.dev/' : location.href);
}
export function pageInfo(path = currentUrl().pathname.replace(/\/$/, '') || '/') {
  const work = works.find((w) => path === `/works/${w.id}`);
  const title =
    work?.title ??
    ({ '/': 'しーぴーのポートフォリオ', '/about': 'プロフィール', '/works': '作品一覧', '/articles': '記事' }[
      path
    ] ||
      'ページが見つかりません');
  return {
    path,
    work,
    title: `${title} — cp20.dev`,
    description:
      work?.description ||
      'しーぴー（cp20）のポートフォリオ。ダイススペック、自作Cコンパイラ、みんなのものさしなどの制作物、技術記事、プロフィール。',
  };
}
