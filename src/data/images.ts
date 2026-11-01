import { images, covers } from 'virtual:cp20-media';
import { mangaCovers, shownSeriesThumbnail } from './editorial';
import type series from './series.json';
export const localImage = (source: string | null | undefined) => (source ? images[source] : undefined);
/** A committed cover (`/images/covers/…`) with the srcset of its WebP copies. */
export const coverImage = (file: string) => ({ src: file, srcset: covers[file] as string | undefined });
/** A series' volume 1 cover (with its WebP copies) or, without one, the series thumbnail. */
export const seriesCover = (s: (typeof series)[number]) => {
  const cover = mangaCovers[s.title]?.image;
  return cover ? coverImage(cover) : localImage(shownSeriesThumbnail(s));
};
