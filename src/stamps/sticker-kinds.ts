// The sticker designs. Their order is the `kind` stored in the database, so a design is only
// ever added at the end. `symbol` names its picture under /stamps; the design without one is the
// site owner's own icon instead. Word stickers say a short feeling in letters, after mixi2's word
// reactions (round pop letters in one soft colour each, public/stamps/LICENSE-GRAPHICS.txt), and get
// a row of their own on the sheet.
export const STICKER_KINDS = [
  { symbol: 'clover', name: 'クローバー' },
  { symbol: 'thumb', name: 'いいね' },
  { symbol: 'sparkles', name: 'きらきら' },
  { symbol: 'eyes', name: '見てる' },
  { symbol: 'heart', name: 'ハート' },
  { symbol: '', name: 'しーぴー' },
  { symbol: 'suki', name: '「すき」', word: true },
  { symbol: 'naruhodo', name: '「なるほど」', word: true },
  { symbol: 'arigato', name: '「ありがと」', word: true },
];
