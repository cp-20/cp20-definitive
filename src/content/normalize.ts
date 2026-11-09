// The collected snapshot (src/data/generated.json) as the site stores it: articles with checked
// HTTPS URLs on the source's own host, valid dates and titles without characters XML forbids, the
// public repositories, and how each source fared. Shared by the collector (scripts/sync) and the build.
export type Article = { title: string; url: string; date: string; source: string };
export type Repo = {
  name: string;
  url: string;
  description: string;
  language: string;
  stars: number;
  updatedAt: string;
  fork: boolean;
  archived: boolean;
};
export type Source = { status: string; lastSuccess?: string; count?: number; reason?: string };
export type Snapshot = {
  articles: Article[];
  repos: Repo[];
  sources: Record<string, Source>;
  updatedAt: string;
  checkedAt?: string;
};
export type ManualArticles = {
  articles: Article[];
  exclude: string[];
  overrides: Record<string, Partial<Article>>;
};

export function safeUrl(value: string) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password) throw new Error('Invalid HTTPS URL');
  u.hash = '';
  ['utm_source', 'utm_medium', 'utm_campaign', 'ref'].forEach((k) => u.searchParams.delete(k));
  return u.href;
}
// Characters that XML 1.0 forbids (C0 controls except tab/LF/CR, DEL, U+FFFE/U+FFFF, lone surrogates).
const invalidText =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
export const stripInvalidText = (value: string) => value.replace(invalidText, '');
// The fields come from third-party APIs and feeds, so they are checked rather than trusted.
export function article(title: unknown, url: unknown, date: unknown, source: string): Article {
  if (typeof title === 'string') title = stripInvalidText(title);
  if (
    typeof title !== 'string' ||
    !title.trim() ||
    title.length > 1000 ||
    !Number.isFinite(Date.parse(date as string))
  )
    throw new Error(`Invalid article from ${source}`);
  const normalizedUrl = safeUrl(url as string);
  if (new URL(normalizedUrl).hostname.replace(/^www\./, '') !== source.replace(/^www\./, ''))
    throw new Error('Unexpected article host');
  return { title: title.trim(), url: normalizedUrl, date: new Date(date as string).toISOString(), source };
}
export function mergeArticles(
  previous: Article[],
  incoming: Article[],
  manual: ManualArticles = { articles: [], exclude: [], overrides: {} },
) {
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
