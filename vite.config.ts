import { defineConfig, type Plugin } from 'vite';
import solid from '@solidjs/vite-plugin';
import { readFileSync } from 'node:fs';
import { dropWoffFallback, isFontFile } from './src/data/font-css.mjs';
import { clientMedia } from './src/data/client-media.mjs';
// Every browser that runs this site reads WOFF2, so the WOFF fallback in @fontsource's
// @font-face rules only adds weight to the render-blocking stylesheet.
const woff2Only = (): Plugin => ({
  name: 'cp20-woff2-only',
  enforce: 'pre',
  transform(code, id) {
    if (/[\\/]@fontsource[^\\/]*[\\/].*\.css(\?|$)/.test(id))
      return { code: dropWoffFallback(code), map: null };
  },
});
// `virtual:cp20-media`: only the local paths, srcset candidates and sizes the pages render, instead of
// bundling previews.json and image-cache.json with their source URLs and timestamps.
const media = (): Plugin => {
  const id = 'virtual:cp20-media';
  const data = ['previews', 'image-cache', 'tracks', 'series'].map(
    (name) => new URL(`./src/data/${name}.json`, import.meta.url),
  );
  return {
    name: 'cp20-media',
    resolveId: (source) => (source === id ? '\0' + id : undefined),
    load(resolved) {
      if (resolved !== '\0' + id) return;
      for (const file of data) this.addWatchFile(file.pathname);
      const [previews, cache, tracks, series] = data.map((file) => JSON.parse(readFileSync(file, 'utf8')));
      const { pages, images } = clientMedia(
        previews,
        cache,
        [...tracks, ...series].map((item: { thumbnail?: string }) => item.thumbnail),
      );
      return `export const pages = ${JSON.stringify(pages)};\nexport const images = ${JSON.stringify(images)};\n`;
    },
  };
};
export default defineConfig({
  plugins: [woff2Only(), media(), solid({ start: { renderMode: 'async', devtools: false }, ssr: true })],
  build: {
    // Fonts stay separate files: inlined as data: URIs they bloat the stylesheet and are
    // refused by the font-src 'self' content security policy.
    assetsInlineLimit: (file) => (isFontFile(file) ? false : undefined),
  },
});
