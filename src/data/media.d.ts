// Generated at build time from previews.json and image-cache.json by vite.config.ts (clientMedia).
declare module 'virtual:cp20-media' {
  /** Page URL → its cached OG image (with smaller WebP candidates) and icon. */
  export const pages: Record<
    string,
    { image?: string; srcset?: string; width: number; height: number; icon?: string }
  >;
  /** Source URL → cached file, for the music and manga thumbnails. */
  export const images: Record<string, string>;
}
