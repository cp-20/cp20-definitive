// The sticker designs. Their order is the `kind` stored in the database (0 … STICKER_KIND_COUNT - 1).
export const STICKER_KINDS = [
  { symbol: 'clover', name: 'クローバー' },
  { symbol: 'thumb', name: 'いいね' },
  { symbol: 'sparkles', name: 'きらきら' },
  { symbol: 'eyes', name: '見てる' },
  { symbol: 'heart', name: 'ハート' },
  { symbol: '', name: 'しーぴー' },
];
// The last design is the site owner's own icon rather than a Twemoji.
const AVATAR_KIND = 5;
export const stickerName = (kind: number) => STICKER_KINDS[kind]?.name || 'しーぴー';
export const gravatarUrl = (hash: string, size = 64) =>
  `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`;
export function StickerFace(props: { kind: number }) {
  return (
    <img
      src={
        props.kind === AVATAR_KIND
          ? '/images/avatar-384.webp'
          : `/stamps/${STICKER_KINDS[props.kind]?.symbol || 'clover'}.svg`
      }
      alt=""
      width="40"
      height="40"
      draggable={false}
    />
  );
}
