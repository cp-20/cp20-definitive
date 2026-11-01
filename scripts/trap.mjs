// traP blog posts by cp20, read from the public author pages (https://trap.jp/author/cp20/).
// The Ghost Admin API sits behind traP SSO (HTTP 307 to q.trap.jp), and the author RSS only
// carries the latest 15 posts, so the paginated author pages are the only complete public list.
// The RSS is still read (best effort) for exact publication times; the pages only show the day.
import { XMLParser } from 'fast-xml-parser';

const ORIGIN = 'https://trap.jp';
const AUTHOR = `${ORIGIN}/author/cp20/`;
const MAX_PAGES = 20;
const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (text) =>
  text
    .replace(/<[^>]{0,200}>/g, '')
    .replace(/&(?:#x([0-9a-f]{1,6})|#(\d{1,7})|([a-z]{2,6}));/gi, (match, hex, dec, name) => {
      if (hex || dec) {
        const code = hex ? parseInt(hex, 16) : Number(dec);
        return code <= 0x10ffff ? String.fromCodePoint(code) : match;
      }
      return entities[name.toLowerCase()] ?? match;
    })
    .trim();

/**
 * Parses one author page into {url, title, day} cards.
 * @param {string} html
 */
export function parseAuthorPage(html) {
  const cards = [];
  // Split on the card links so every pattern below runs on one bounded card, never the whole page.
  const parts = html.split(/<a href="(\/post\/\d{1,9}\/)" class="article">/);
  for (let i = 1; i < parts.length; i += 2) {
    const body = parts[i + 1].slice(0, 4000);
    const day = body.match(/<small>(\d{4})年(\d{1,2})月(\d{1,2})日<\/small>/);
    const title = body.match(/<strong>([^<]{1,1000})<\/strong>/);
    if (!day || !title) throw new Error(`trap.jp: unexpected card markup for ${parts[i]}`);
    cards.push({
      url: new URL(parts[i], ORIGIN).href,
      title: decode(title[1]),
      // Days are shown in JST.
      day: `${day[1]}-${day[2].padStart(2, '0')}-${day[3].padStart(2, '0')}T00:00:00+09:00`,
    });
  }
  return cards;
}

const rssParser = new XMLParser({ processEntities: true, parseTagValue: false });
/** @returns {Map<string, string>} post URL → RFC 822 pubDate */
export function rssDates(xml) {
  const items = [rssParser.parse(xml).rss?.channel?.item ?? []].flat();
  return new Map(items.filter((i) => i?.link && i?.pubDate).map((i) => [String(i.link), String(i.pubDate)]));
}

/**
 * @param {(url: string, format?: string) => Promise<any>} request
 * @param {(title: string, url: string, date: string, source: string) => any} normalize
 */
export async function fetchTrapPosts(request, normalize) {
  let dates = new Map();
  try {
    dates = rssDates(await request(`${AUTHOR}rss/`, 'xml'));
  } catch (error) {
    console.warn(
      `::warning::trap.jp: RSS unavailable (${error.message}); using the days from the author pages`,
    );
  }
  const posts = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    let html;
    try {
      html = await request(page === 1 ? AUTHOR : `${AUTHOR}page/${page}/`, 'html');
    } catch (error) {
      // Ghost answers 404 one page past the last one.
      if (page > 1 && error.status === 404) return posts;
      throw error;
    }
    const cards = parseAuthorPage(html);
    if (!cards.length) {
      if (page === 1) throw new Error('trap.jp: the author page listed no posts');
      return posts;
    }
    for (const card of cards)
      posts.push(normalize(card.title, card.url, dates.get(card.url) ?? card.day, 'trap.jp'));
  }
  throw new Error(`trap.jp: more than ${MAX_PAGES} author pages`);
}
