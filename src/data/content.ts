import { articles as builtArticles } from 'virtual:cp20-articles';
import {
  repos as snapshotRepos,
  sources as snapshotSources,
  updatedAt as snapshotUpdatedAt,
} from './generated.json';
import manual from './manual.json';
import baseWorks from './works.json';
import { mergeWorks } from './site-pages.mjs';
export type Article = { title: string; url: string; source: string; date: string };
// Merged with manual.json, validated and sorted at build time (vite.config.ts).
export const articles: Article[] = builtArticles;
export type Work = (typeof baseWorks)[number];
// Checked for malformed or duplicate ids (they become URLs and stamp page keys).
export const works: Work[] = mergeWorks(baseWorks, manual);
export const repos = snapshotRepos as {
  name: string;
  url: string;
  description: string;
  language: string;
  stars: number;
  updatedAt: string;
}[];
export const sources = snapshotSources as Record<
  string,
  { status: string; lastSuccess?: string; count?: number; reason?: string }
>;
export const updatedAt = snapshotUpdatedAt;
// One formatter for every date: creating an Intl.DateTimeFormat per call is the slow part.
const dateFormat = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'Asia/Tokyo',
});
export const formatDate = (date: string) => dateFormat.format(new Date(date));
