import { mergeArticles } from './normalize.mjs';
import snapshot from './generated.json';
import manual from './manual.json';
import baseWorks from './works.json';
import { mergeWorks } from './site-pages.mjs';
export type Article = { title: string; url: string; source: string; date: string };
export const articles: Article[] = mergeArticles(snapshot.articles, [], manual);
export type Work = (typeof baseWorks)[number];
// Checked for malformed or duplicate ids (they become URLs and stamp page keys).
export const works: Work[] = mergeWorks(baseWorks, manual);
export const repos = snapshot.repos as {
  name: string;
  url: string;
  description: string;
  language: string;
  stars: number;
  updatedAt: string;
}[];
export const sources = snapshot.sources as Record<
  string,
  { status: string; lastSuccess?: string; count?: number; reason?: string }
>;
export const updatedAt = snapshot.updatedAt;
export const formatDate = (date: string) =>
  new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Tokyo',
  }).format(new Date(date));
