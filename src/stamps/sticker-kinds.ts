// The sticker designs. Their order is the `kind` stored in the database, so a design is only
// ever added at the end. `symbol` names its picture under /stamps; the last design is the site
// owner's own icon instead.
export const STICKER_KINDS = [
  { symbol: 'clover', name: 'クローバー' },
  { symbol: 'thumb', name: 'いいね' },
  { symbol: 'sparkles', name: 'きらきら' },
  { symbol: 'eyes', name: '見てる' },
  { symbol: 'heart', name: 'ハート' },
  { symbol: '', name: 'しーぴー' },
];
