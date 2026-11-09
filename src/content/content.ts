import { articles as builtArticles } from 'virtual:cp20-articles';
import {
  repos as snapshotRepos,
  sources as snapshotSources,
  updatedAt as snapshotUpdatedAt,
} from '../data/generated.json';
import manual from '../data/manual.json';
import baseWorks from '../data/works.json';
import { mergeWorks } from '../site/pages.ts';
import { editions, featuredIds } from '../data/editorial.ts';
import type { Article } from './normalize.ts';
import { workSections, type Work } from './works.ts';
export type { Article, Work };
// Merged with manual.json, validated and sorted at build time (vite.config.ts).
export const articles: Article[] = builtArticles;
// Checked for malformed or duplicate ids (they become URLs and stamp page keys); the fields are
// checked against the Work type by src/content/works.test.ts.
export const works: Work[] = mergeWorks(baseWorks as Work[], manual as { projects?: Work[] });
/** The yearly editions of this portfolio, each a work of its own (`<year>-portfolio`). */
export const editionWorks = editions.map((e) => ({ ...e, id: `${e.year}-portfolio` }));
/** /works from top to bottom, and the order a work's page steps through to the next. */
export const sections = workSections(
  works,
  featuredIds,
  editionWorks.map((e) => e.id),
);
/** A work's technologies as listed: without the languages, which its frameworks already imply. */
export const workStack = (w: Work) => w.techStack.filter((t) => t.type !== 'language');
/** The few named beside a work in a list: its frameworks. */
export const keyStack = (w: Work) =>
  workStack(w)
    .filter((t) => t.type === 'main' || t.type === 'framework')
    .slice(0, 3)
    .map((t) => t.label);
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
