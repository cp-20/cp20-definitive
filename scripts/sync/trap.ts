// traP blog posts by cp20, read from the public author pages (https://trap.jp/author/cp20/).
// Pages are followed through Ghost's <link rel="next">, not guessed until a 404.
// The Ghost Admin API sits behind traP SSO (HTTP 307 to q.trap.jp), and the author RSS only
// carries the latest 15 posts, so the paginated author pages are the only complete public list.
// The RSS is still read (best effort) for exact publication times; the pages only show the day.
import { XMLParser } from 'fast-xml-parser';
import { parse } from 'node-html-parser';
import { article, type Article } from '../../src/content/normalize.ts';
import { headElements } from './head.ts';
import type { Format } from './sync.ts';

const ORIGIN = 'https://trap.jp';
const AUTHOR = `${ORIGIN}/author/cp20/`;
const MAX_PAGES = 20;
/** Parses one author page into {url, title, day} cards. */
export function parseAuthorPage(html: string) {
  return parse(html)
    .querySelectorAll('a.article')
    .flatMap((card) => {
      const href = card.getAttribute('href') ?? '';
      if (!/^\/post\/\d{1,9}\/$/.test(href)) return [];
      const day = card.querySelector('small')?.text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
      const title = card.querySelector('strong')?.text.trim();
      if (!day || !title) throw new Error(`trap.jp: unexpected card markup for ${href}`);
      // Days are shown in JST.
      const date = `${day[1]}-${day[2].padStart(2, '0')}-${day[3].padStart(2, '0')}T00:00:00+09:00`;
      return [{ url: new URL(href, ORIGIN).href, title, day: date }];
    });
}

/** The `<link rel="next">` Ghost puts in the head of every page except the last. */
export const nextPage = (html: string) =>
  headElements(html, 'link[rel="next"]')[0]?.getAttribute('href') ?? null;

const rssParser = new XMLParser({ processEntities: true, parseTagValue: false });
/** Post URL → RFC 822 pubDate. */
export function rssDates(xml: string): Map<string, string> {
  const items: any[] = [rssParser.parse(xml).rss?.channel?.item ?? []].flat();
  return new Map(items.filter((i) => i?.link && i?.pubDate).map((i) => [String(i.link), String(i.pubDate)]));
}

export async function fetchTrapPosts(request: (url: string, format: Format) => Promise<any>) {
  let dates = new Map<string, string>();
  try {
    dates = rssDates(await request(`${AUTHOR}rss/`, 'xml'));
  } catch (error) {
    console.warn(
      `::warning::trap.jp: RSS unavailable (${(error as Error).message}); using the days from the author pages`,
    );
  }
  const posts: Article[] = [];
  const seen = new Set<string>();
  let url = AUTHOR;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const html = await request(url, 'html');
    const cards = parseAuthorPage(html);
    // Every page Ghost links to has posts; an empty one means the markup changed.
    if (!cards.length) throw new Error(`trap.jp: ${url} listed no posts`);
    for (const card of cards) {
      // A post published or removed mid-crawl shifts the pages, repeating or skipping a post.
      // Fail so the last snapshot is kept and the next scheduled run reads a consistent list.
      if (seen.has(card.url)) throw new Error(`trap.jp: ${card.url} appeared on two pages`);
      seen.add(card.url);
      posts.push(article(card.title, card.url, dates.get(card.url) ?? card.day, 'trap.jp'));
    }
    const next = nextPage(html);
    if (!next) return posts;
    const expected = `${AUTHOR}page/${page + 1}/`;
    if (next !== expected) throw new Error(`trap.jp: unexpected next page ${next} (expected ${expected})`);
    url = next;
  }
  throw new Error(`trap.jp: more than ${MAX_PAGES} author pages`);
}
