export function safeUrl(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password) throw new Error('Invalid HTTPS URL');
  u.hash = '';
  ['utm_source', 'utm_medium', 'utm_campaign', 'ref'].forEach((k) => u.searchParams.delete(k));
  return u.href;
}
export function article(title, url, date, source) {
  if (typeof title !== 'string' || !title.trim() || title.length > 1000 || !Number.isFinite(Date.parse(date)))
    throw new Error(`Invalid article from ${source}`);
  const normalizedUrl = safeUrl(url);
  if (new URL(normalizedUrl).hostname.replace(/^www\./, '') !== source.replace(/^www\./, ''))
    throw new Error('Unexpected article host');
  return { title: title.trim(), url: normalizedUrl, date: new Date(date).toISOString(), source };
}
/**
 * @typedef {{title:string,url:string,date:string,source:string}} Article
 * @param {Article[]} previous
 * @param {Article[]} incoming
 * @param {{articles:Article[],exclude:string[],overrides:Record<string,Partial<Article>>}} manual
 */
export function mergeArticles(previous, incoming, manual = { articles: [], exclude: [], overrides: {} }) {
  const merged = new Map([...previous, ...incoming, ...manual.articles].map((a) => [safeUrl(a.url), a]));
  const excluded = new Set(manual.exclude.map(safeUrl));
  return [...merged]
    .filter(([url]) => !excluded.has(url))
    .map(([url, a]) => {
      const result = { ...a, ...manual.overrides[url], url };
      // Validate manual content too; it shares the same rendering boundary.
      return article(result.title, result.url, result.date, result.source);
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.url.localeCompare(b.url));
}
