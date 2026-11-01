// Names of the smaller WebP copies written by scripts/image-variants.mjs. Shared with the client so
// the pages can build srcset candidates for files whose variants are known to exist.

/** `/media/abc.png`, 320 → `/media/abc-320w.webp` */
export const variantFile = (file, width) => file.replace(/\.[a-z0-9]+$/i, '') + `-${width}w.webp`;

/** Width of the single WebP copy of a site icon (shown at 26-38px, so this covers 2x screens). */
export const iconWidth = 96;
