// Generated at build time from previews.json and image-cache.json by vite.config.ts (clientMedia).
declare module 'virtual:cp20-media' {
  /** Page URL → its cached OG image (with smaller WebP candidates) and icon. */
  export const pages: Record<
    string,
    { image?: string; srcset?: string; width: number; height: number; icon?: string }
  >;
  /** Source URL → cached file (with smaller WebP candidates), for the music and manga thumbnails. */
  export const images: Record<string, { src: string; srcset?: string }>;
  /** Cover path under /images/covers → srcset of its WebP copies. */
  export const covers: Record<string, string>;
}

// Generated at build time from generated.json and manual.json by vite.config.ts (mergeArticles).
declare module 'virtual:cp20-articles' {
  export const articles: { title: string; url: string; source: string; date: string }[];
}
