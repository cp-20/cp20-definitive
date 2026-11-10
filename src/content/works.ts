// What a visitor is shown of the works in works.json: their order on /works, the short facts
// beside each one and where its buttons go.

/** A screenshot of a work's public site (scripts/sync/screenshots.ts takes them). */
export type Shot = { src: string; device: 'pc' | 'mobile'; alt: string };

/**
 * A work as works.json states it. The optional fields are shown only when present: `summary`
 * replaces the one-line `description` at the top of the work's page, `role` is what the owner did,
 * `outcome` the result with a number or an award, `status` whether the site can still be opened
 * by anyone, `kind: 'event'` marks an event the owner organised rather than something made.
 */
export type Work = {
  id: string;
  title: string;
  description: string;
  summary?: string;
  role?: string;
  outcome?: string;
  status?: 'active' | 'ended' | 'members-only';
  kind?: 'event';
  url: string;
  image?: string;
  icon?: string | null;
  /** Other pages about the work: the first is the button of a site that has ended. */
  links?: { label: string; url: string }[];
  repositories: string[];
  productionTime: string;
  screenshots?: Shot[];
  techStack: { label: string; type: string }[];
  tags: string[];
  comments: string[];
  relatedArticles: string[];
};

/** The role of every work made alone: said on its own page, left out of lists where all repeat it. */
export const SOLO_ROLE = '1人で企画・デザイン・実装';

const dateParts = (text: string) => {
  const m = text.match(/(\d{4})[/-](\d{1,2})(?:[/-](\d{1,2}))?/);
  return m ? { year: Number(m[1]), month: Number(m[2]), day: m[3] ? Number(m[3]) : undefined } : undefined;
};

/** The two ends of `productionTime` ("2023/09/25 ～ 2023/10/13", "2024/05 ～ now", "2026/09"). */
export function span(productionTime: string) {
  const [first, last = ''] = productionTime.split(/～|〜/);
  return { start: dateParts(first), end: dateParts(last), ongoing: /now/i.test(last) };
}

/** The year a work was started in: the year it is listed under on /works. */
export const startYear = (w: Pick<Work, 'productionTime'>) => span(w.productionTime).start?.year ?? 0;

/** "2023-09-25"-like key of a work's start, for sorting the newest first. */
const startKey = (w: Pick<Work, 'productionTime'>) => {
  const s = span(w.productionTime).start;
  return s ? [s.year, s.month, s.day ?? 0].map((n) => String(n).padStart(2, '0')).join('-') : '';
};
export const newestFirst = <T extends Pick<Work, 'productionTime'>>(list: T[]) =>
  [...list].sort((a, b) => startKey(b).localeCompare(startKey(a)));

/** The period as the pages write dates (2023.09.25), with "now" in Japanese and even spacing around the dash. */
export const period = (productionTime: string) =>
  productionTime
    .replace(/\s*[～〜]\s*/g, ' 〜 ')
    .replace(/\bnow\b/i, '現在')
    .replaceAll('/', '.')
    .trim();

/**
 * The period of a work that went on for months, as a list shows it ("2023.06〜2024.03",
 * "2024.05〜現在"); undefined for one made within a month or so (into the next month at most),
 * which the year heading above it already dates.
 */
export function longPeriod(productionTime: string) {
  const { start, end, ongoing } = span(productionTime);
  if (!start) return undefined;
  const month = (d: { year: number; month: number }) => `${d.year}.${String(d.month).padStart(2, '0')}`;
  if (ongoing) return `${month(start)}〜現在`;
  if (!end || (end.year - start.year) * 12 + end.month - start.month < 2) return undefined;
  return `${month(start)}〜${month(end)}`;
}

/** What kind of work it is, for the works made with others: a team, an event, a programme. */
export function kindLabel(w: Pick<Work, 'kind' | 'tags'>) {
  if (w.kind === 'event') return '主催したイベント';
  if (w.tags.includes('チーム開発')) return w.tags.includes('traP') ? 'traP のチーム開発' : 'チーム開発';
  if (w.tags.includes('SecHack365')) return 'SecHack365';
  return undefined;
}

/** Who can open the site, as a work's page states it beside 「公開」, when not everyone can. */
export const statusLabel = (w: Pick<Work, 'status'>) =>
  w.status === 'ended' ? '終了' : w.status === 'members-only' ? 'traP 部員向け（ログインが必要）' : undefined;
/** The same, short enough for a tag on a card. */
export const statusTag = (w: Pick<Work, 'status'>) =>
  w.status === 'ended' ? '公開終了' : w.status === 'members-only' ? '部員向け' : undefined;

/**
 * The main button of a work: named after where it goes. A site that has ended has none, unless the
 * work links another page about it (its first `links` entry). A site only traP members can log in
 * to shows anyone else a "Not authorized" page, so its button is what anyone can read about it:
 * its traP article, else its public repository (the site itself is `membersSite`).
 * @returns label: the button on the work's page; short: the small button on a card
 */
export function openLink(
  w: Pick<Work, 'url' | 'status' | 'links' | 'kind'> &
    Partial<Pick<Work, 'relatedArticles' | 'repositories'>>,
) {
  if (w.status === 'ended') {
    const page = w.links?.[0];
    return page ? { href: page.url, label: page.label, short: page.label } : undefined;
  }
  if (w.status === 'members-only') {
    const article = w.relatedArticles?.find((url) => new URL(url).hostname === 'trap.jp');
    if (article) return { href: article, label: 'traP の記事を読む', short: '記事' };
    const repository = w.repositories?.find((r) => r.startsWith('https://github.com/'));
    return repository ? { href: repository, label: 'GitHub で見る', short: 'GitHub' } : undefined;
  }
  return linkTo(w.url, w.kind);
}

function linkTo(url: string, kind?: Work['kind']) {
  const host = new URL(url).hostname;
  if (host === 'github.com') return { href: url, label: 'GitHub で見る', short: 'GitHub' };
  if (host === 'marketplace.visualstudio.com')
    return { href: url, label: 'VS Code Marketplace で見る', short: 'Marketplace' };
  if (host === 'trap.jp')
    return kind === 'event'
      ? { href: url, label: '開催記を読む', short: '開催記' }
      : { href: url, label: 'traP の記事を読む', short: '記事' };
  return { href: url, label: 'サイトを開く', short: '開く' };
}

/** The site of a work only traP members can use, as a secondary link beside the main button. */
export const membersSite = (w: Pick<Work, 'url' | 'status'>) =>
  w.status === 'members-only' ? { href: w.url, label: 'サイト（部員向け）' } : undefined;

/** Public repositories other than the page the main button opens: "owner/name" and URL. */
export const publicRepositories = (w: Pick<Work, 'url' | 'repositories'>, main = w.url) =>
  w.repositories
    .filter((r) => r.startsWith('https://github.com/') && r !== w.url && r !== main)
    .map((url) => ({ url, name: url.replace('https://github.com/', '') }));

/**
 * /works from top to bottom: the featured works, the rest by the year they were started (newest
 * first), the events, then the yearly editions of this portfolio. Each work appears once.
 */
export function workSections<T extends Work>(
  works: readonly T[],
  featuredIds: string[],
  editionIds: string[],
) {
  const byId = new Map(works.map((w) => [w.id, w]));
  const pick = (ids: string[]) =>
    ids.map((id) => {
      const work = byId.get(id);
      if (!work) throw Error(`No work "${id}"`);
      return work;
    });
  const featured = pick(featuredIds);
  const editions = pick(editionIds);
  const set = new Set([...featuredIds, ...editionIds]);
  const events = newestFirst(works.filter((w) => w.kind === 'event' && !set.has(w.id)));
  const rest = newestFirst(works.filter((w) => w.kind !== 'event' && !set.has(w.id)));
  const years = [...new Set(rest.map(startYear))].map((year) => ({
    year,
    works: rest.filter((w) => startYear(w) === year),
  }));
  return {
    featured,
    years,
    events,
    editions,
    order: [...featured, ...years.flatMap((y) => y.works), ...events, ...editions],
  };
}

/** The works before and after one in `order`, going round at the ends. */
export function neighbours<T extends { id: string }>(order: readonly T[], id: string) {
  const i = order.findIndex((w) => w.id === id);
  if (i < 0 || order.length < 2) return [];
  const before = order[(i - 1 + order.length) % order.length];
  const after = order[(i + 1) % order.length];
  return before === after ? [after] : [before, after];
}
