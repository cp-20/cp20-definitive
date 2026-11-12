/**
 * Where an article came out, as that place's tile (public/images/brands/tiles): its own logo on a
 * rounded square of one shape and size, edged with the pencil line of an icon's tile. The square
 * is the ground of the place's own favicon: blog.cp20.dev's black under a white C, and white under
 * every other logo in its colour (note's n, Qiita's green disc, Zenn's blue, traP, sizu.me, M3,
 * whose favicons are on white or transparent), so every tile shows on every page's paper. Inside,
 * each logo is drawn at the size that makes the set weigh the same side by side: a solid shape
 * smaller (note's n at about the share of its favicon), a few thin lines larger (sizu.me, M3).
 * Judged by eye on the attendance card and in the lists, from about 9px (several on one day) to
 * 29px.
 */
const TILES: Record<string, string> = {
  'blog.cp20.dev': 'cp20-blog',
  'note.com': 'note',
  'qiita.com': 'qiita',
  'zenn.dev': 'zenn',
  'trap.jp': 'trap',
  'sizu.me': 'sizu',
  'm3tech.blog': 'm3tech',
};
/** The places with a tile, by host name (an article's `source`). */
export const tiledSources = Object.keys(TILES);
/** The tile of an article's source (its host name), if it has one. */
export const sourceTile = (source: string): string | undefined =>
  TILES[source] && `/images/brands/tiles/${TILES[source]}.svg`;
