import { stripInvalidText } from '../src/data/normalize.mjs';
// Shared with the <link rel="alternate"> in src/Document.tsx (checked by scripts/seo.test.mjs).
export const feedTitle = 'cp20.dev — Articles';
export const feedUrl = 'https://cp20.dev/feed.xml';
export const escapeXml = (s) =>
  stripInvalidText(String(s)).replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c],
  );
// RSS 2.0 with an Atom self link; every article is included (the list is small and complete).
export function buildFeed(articles) {
  const newest = articles.reduce((max, a) => (a.date > max ? a.date : max), '');
  const lastBuild = newest ? `<lastBuildDate>${new Date(newest).toUTCString()}</lastBuildDate>` : '';
  return `<?xml version="1.0" encoding="utf-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${escapeXml(feedTitle)}</title><link>https://cp20.dev/articles</link><atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/><description>しーぴーの記事</description><language>ja</language>${lastBuild}${articles
    .map(
      (a) =>
        `<item><title>${escapeXml(a.title)}</title><link>${escapeXml(a.url)}</link><guid isPermaLink="true">${escapeXml(a.url)}</guid><pubDate>${new Date(a.date).toUTCString()}</pubDate><description>${escapeXml(`${a.source} に掲載`)}</description></item>`,
    )
    .join('')}</channel></rss>`;
}
