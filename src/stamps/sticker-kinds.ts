// The sticker designs. Their order is the `kind` stored in the database, so a design is only
// ever added at the end, and one taken off the sheet stays in its place, `retired`: the stickers
// already put on the pages with it still show (and can still be moved or peeled off), but the
// sheet no longer offers it. `symbol` names its picture under /stamps; the design without one is
// the site owner's own icon instead. Word stickers (「…」) say a short feeling in letters, after
// mixi2's Japanese word reactions (Cherry Bomb One's round pop letters in one soft colour each,
// public/stamps/LICENSE-GRAPHICS.txt). The face has kana but no kanji, so a word is written in kana
// (「てんさい」, 「まなび」). Pictures are Twemoji, as mixi2 offers emoji beside its words.
export type StickerKind = { symbol: string; name: string; retired?: true };
export const STICKER_KINDS: readonly StickerKind[] = [
  { symbol: 'clover', name: 'クローバー' },
  { symbol: 'thumb', name: 'いいね' },
  { symbol: 'sparkles', name: 'きらきら' },
  { symbol: 'eyes', name: '見てる' },
  { symbol: 'heart', name: 'ハート' },
  { symbol: '', name: 'しーぴー' },
  { symbol: 'suki', name: '「すき」' },
  { symbol: 'naruhodo', name: '「なるほど」' },
  { symbol: 'arigato', name: '「ありがと」' },
  { symbol: 'emo', name: '「エモ」', retired: true },
  { symbol: 'wakaru', name: '「わかる」' },
  { symbol: 'manabi', name: '「まなび」', retired: true },
  { symbol: 'erai', name: '「えらい」', retired: true },
  { symbol: 'kawaii', name: '「かわいい」', retired: true },
  { symbol: 'otsukare', name: '「おつかれ」', retired: true },
  { symbol: 'omedeto', name: '「おめでと」' },
  { symbol: 'tensai', name: '「てんさい」' },
];
/**
 * The stickers the sheet offers, by kind, in the order it lays them out: six to a row, pictures
 * and words taking turns as in mixi2's reactions (the clover first, the owner's icon last), no
 * two of a colour side by side or one above the other.
 */
export const SHEET_KINDS: readonly number[] = [0, 6, 1, 7, 2, 8, 16, 4, 15, 3, 10, 5];
