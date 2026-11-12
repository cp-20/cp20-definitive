import { SHEET_KINDS, STICKER_KINDS } from './sticker-kinds.ts';
export { SHEET_KINDS, STICKER_KINDS };
export const stickerName = (kind: number) => STICKER_KINDS[kind]?.name || 'しーぴー';
export const gravatarUrl = (hash: string, size = 64) =>
  `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`;
export function StickerFace(props: { kind: number }) {
  return (
    <img
      src={
        // The design without a symbol is the site owner's own icon rather than a Twemoji.
        STICKER_KINDS[props.kind]?.symbol === ''
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
