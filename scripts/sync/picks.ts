// The thumbnails of the featured music and manga. The selection itself (tracks.json, series.json)
// is edited by hand in this repository; the sync only refreshes each entry's thumbnail, from the
// YouTube video or the manga page's og:image, and never changes which entries are listed.
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
/** The sites a featured manga may link to. */
export const mangaSites = new Set([
  'comic-action.com',
  'ynjn.jp',
  'yanmaga.jp',
  'manga.nicovideo.jp',
  'comic-walker.com',
]);

/** The publisher thumbnail of a manga page: its og:image, if it is served from a known publisher CDN. */
export function ogImage(html: string) {
  for (const meta of headElements(html, 'meta[property="og:image"][content]')) {
    const u = new URL(meta.getAttribute('content')!);
    if (u.protocol === 'https:' && allowedImages.has(u.hostname)) return u.href;
  }
  throw Error('No supported publisher thumbnail');
}

/** The video id of a featured track's link, which must be a bare https://youtu.be/<11-character id>. */
export function trackId(link: string) {
  const match = /^https:\/\/youtu\.be\/([-_a-zA-Z0-9]{11})$/.exec(link);
  if (!match) throw Error(`Invalid track link: ${link}`);
  return match[1];
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

/**
 * Refreshes the thumbnails in tracks.json and series.json. A manga page that cannot be read keeps
 * its previous thumbnail.
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
  const nextTracks = await Promise.all(
    tracks.map(async (t) => ({ ...t, thumbnail: await youtubeThumbnail(trackId(t.link), fetch) })),
  );
  const nextSeries = await Promise.all(
    series.map(async (s) => {
      try {
        return { ...s, thumbnail: ogImage(await request(s.link, { ...headRequest, fetch })) };
      } catch {
        console.warn(`::warning::No thumbnail for ${s.title}; keeping the previous one`);
        return s;
      }
    }),
  );
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
