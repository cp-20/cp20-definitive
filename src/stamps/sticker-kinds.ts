// The sticker designs. Their order is the `kind` stored in the database, so a design is only
// ever added at the end, and one taken off the sheet stays in its place, `retired`: the stickers
// already put on the pages with it still show (and can still be moved or peeled off), but the
// sheet no longer offers it. `symbol` names its picture under /stamps; the design without one is
// the site owner's own icon instead. Word stickers (「…」) say a short feeling in letters, after
// mixi2's Japanese word reactions (round pop letters in one soft colour each,
// public/stamps/LICENSE-GRAPHICS.txt).
export type StickerKind = { symbol: string; name: string; retired?: true };
export const STICKER_KINDS: readonly StickerKind[] = [
  { symbol: 'clover', name: 'クローバー' },
  { symbol: 'thumb', name: 'いいね', retired: true },
  { symbol: 'sparkles', name: 'きらきら', retired: true },
  { symbol: 'eyes', name: '見てる', retired: true },
  { symbol: 'heart', name: 'ハート', retired: true },
  { symbol: '', name: 'しーぴー' },
  { symbol: 'suki', name: '「すき」' },
  { symbol: 'naruhodo', name: '「なるほど」' },
  { symbol: 'arigato', name: '「ありがと」' },
  { symbol: 'emo', name: '「エモ」' },
  { symbol: 'wakaru', name: '「わかる」' },
  { symbol: 'manabi', name: '「学び」' },
  { symbol: 'erai', name: '「えらい」' },
  { symbol: 'kawaii', name: '「かわいい」' },
  { symbol: 'otsukare', name: '「おつかれ」' },
  { symbol: 'omedeto', name: '「おめでと」' },
];
/**
 * The stickers the sheet offers, by kind, in the order it lays them out: six to a row, the
 * clover and the owner's icon first, then the words, no two of a colour side by side or one
 * above the other.
 */
export const SHEET_KINDS: readonly number[] = [0, 5, 6, 7, 8, 9, 12, 11, 10, 14, 13, 15];
