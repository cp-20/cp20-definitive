// The featured music and manga (tracks.json, series.json), chosen on the 2026 edition of the site
// and read from its public JSON, with the manga publishers' thumbnails. Every field is checked
// before it is kept: the links end up in the pages' hrefs.
import { headElements, headRequest } from './head.ts';
import { readData, repoDirs, writeData, type Dirs } from './files.ts';
import type { Request } from './sync.ts';

type Track = { title: string; composer: string; link: string; thumbnail: string };
type Series = { title: string; author: string; link: string; thumbnail: string; credit: string };

const allowedImages = new Set([
  'cdn-img.comic-action.com',
  'public.ynjn.jp',
  'eh96lnrmau.user-space.cdn.idcfcloud.net',
  'deliver.cdn.nicomanga.jp',
  'cdn.comic-walker.com',
]);
const publishers: Record<string, string> = {
  'comic-action.com': '双葉社 / webアクション',
  'ynjn.jp': '集英社 / ヤンジャン！',
  'yanmaga.jp': '講談社 / ヤンマガWeb',
  'manga.nicovideo.jp': 'ニコニコ漫画',
  'comic-walker.com': 'KADOKAWA / カドコミ',
};

/** The publisher thumbnail of a manga page: its og:image, if it is served from a known publisher CDN. */
export function ogImage(html: string) {
  for (const meta of headElements(html, 'meta[property="og:image"][content]')) {
    const u = new URL(meta.getAttribute('content')!);
    if (u.protocol === 'https:' && allowedImages.has(u.hostname)) return u.href;
  }
  throw Error('No supported publisher thumbnail');
}

/**
 * A featured track as the source lists it, checked: a https://youtu.be/<11-character id> link
 * and text title and composer. The link is rebuilt from the id, so no scheme, query or hash from
 * the source reaches the page. Throws on anything else.
 */
export function trackFrom(raw: any) {
  const u = new URL(raw?.link);
  const id = u.pathname.slice(1);
  if (
    u.protocol !== 'https:' ||
    u.hostname !== 'youtu.be' ||
    !/^[-_a-zA-Z0-9]{11}$/.test(id) ||
    typeof raw.title !== 'string' ||
    typeof raw.composer !== 'string'
  )
    throw Error('Invalid track');
  return { id, title: raw.title as string, composer: raw.composer as string, link: `https://youtu.be/${id}` };
}

/**
 * A featured manga as the source lists it, checked: an https link to a known publisher, credited
 * to it, and text title and author. It keeps the thumbnail `previous` had for the same link.
 */
export function seriesFrom(raw: any, previous: readonly Series[]): Series {
  const u = new URL(raw?.link);
  if (
    u.protocol !== 'https:' ||
    !publishers[u.hostname] ||
    typeof raw.title !== 'string' ||
    typeof raw.author !== 'string'
  )
    throw Error('Invalid series');
  return {
    title: raw.title,
    author: raw.author,
    link: raw.link,
    thumbnail: previous.find((p) => p.link === raw.link)?.thumbnail || '',
    credit: publishers[u.hostname],
  };
}

/**
 * The largest thumbnail YouTube has for video `id`: maxresdefault (1280×720) or sddefault (640×480)
 * when they exist (both answer 404 otherwise), else hqdefault (480×360), which every video has.
 */
export async function youtubeThumbnail(id: string, fetcher: typeof fetch = fetch) {
  for (const name of ['maxresdefault', 'sddefault']) {
    const url = `https://i.ytimg.com/vi/${id}/${name}.jpg`;
    try {
      const response = await fetcher(url, { method: 'HEAD', signal: AbortSignal.timeout(20000) });
      if (response.ok) return url;
    } catch {}
  }
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/** A list from the source: a non-empty array, each entry checked by `check` (one bad entry fails it). */
async function listFrom<T>(request: Request, url: string, check: (raw: unknown) => T) {
  const raw = await request(url);
  if (!Array.isArray(raw) || !raw.length) throw Error(`${url}: no entries`);
  return raw.map(check);
}

/**
 * Refreshes tracks.json and series.json. A source that fails or lists anything invalid keeps the
 * previous selection; so does a new shelf with a manga whose thumbnail cannot be read.
 * @returns whether either file changed
 */
export async function syncPicks(
  request: Request,
  { dirs = repoDirs, fetch = globalThis.fetch }: { dirs?: Dirs; fetch?: typeof globalThis.fetch } = {},
) {
  const [tracks, series]: [Track[], Series[]] = await Promise.all([
    readData(dirs, 'tracks'),
    readData(dirs, 'series'),
  ]);
  let nextTracks = tracks,
    nextSeries = series;
  try {
    const picked = await listFrom(request, 'https://2026.cp20.dev/featured-tracks?raw=true', trackFrom);
    nextTracks = await Promise.all(
      picked.map(async ({ id, ...track }) => ({ ...track, thumbnail: await youtubeThumbnail(id, fetch) })),
    );
  } catch {
    console.warn('::warning::Music source unavailable; keeping previous selection');
  }
  try {
    const picked = await listFrom(request, 'https://2026.cp20.dev/featured-series?raw=true', (raw) =>
      seriesFrom(raw, series),
    );
    const read = await Promise.allSettled(
      picked.map(async (s) => ({ ...s, thumbnail: ogImage(await request(s.link, { ...headRequest, fetch })) })),
    );
    const shelf = read.map((r, i) => (r.status === 'fulfilled' ? r.value : picked[i]));
    // An inaccessible new entry must not replace the previously working shelf.
    if (shelf.every((s) => s.thumbnail)) nextSeries = shelf;
  } catch {
    console.warn('::warning::Manga selection unavailable; keeping previous selection');
  }
  let changed = false;
  for (const [name, before, after] of [
    ['tracks', tracks, nextTracks],
    ['series', series, nextSeries],
  ] as const)
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      await writeData(dirs, name, after);
      changed = true;
    }
  return changed;
}
