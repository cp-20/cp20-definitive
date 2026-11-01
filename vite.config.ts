/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import solid from '@solidjs/vite-plugin';
import { readFileSync, readdirSync } from 'node:fs';
import { dropWoffFallback, isFontFile } from './src/data/font-css.mjs';
import { clientMedia, coverSrcsets } from './src/content/media.ts';
import { shownSeriesThumbnail } from './src/data/manga-covers.ts';
import { mergeArticles } from './src/content/normalize.ts';
import { thirdPartyLicenses } from './scripts/licenses.mjs';
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
// bundling previews.json and image-cache.json with their source URLs and timestamps, plus the
// srcset of each manga cover from its WebP copies.
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
        // Series with their own cover never show the publisher's thumbnail, so it is not mapped.
        [...tracks.map((t: { thumbnail?: string }) => t.thumbnail), ...series.map(shownSeriesThumbnail)],
      );
      const coverDirectory = new URL('./public/images/covers/', import.meta.url);
      this.addWatchFile(coverDirectory.pathname);
      const covers = coverSrcsets(readdirSync(coverDirectory));
      return [
        `export const pages = ${JSON.stringify(pages)};`,
        `export const images = ${JSON.stringify(images)};`,
        `export const covers = ${JSON.stringify(covers)};`,
        '',
      ].join('\n');
    },
  };
};
// `virtual:cp20-articles`: the article list merged, validated and sorted once at build time, so
// the pages do not repeat that work (URL parsing, sorting) every time they load.
const articles = (): Plugin => {
  const id = 'virtual:cp20-articles';
  const data = ['generated', 'manual'].map((name) => new URL(`./src/data/${name}.json`, import.meta.url));
  return {
    name: 'cp20-articles',
    resolveId: (source) => (source === id ? '\0' + id : undefined),
    load(resolved) {
      if (resolved !== '\0' + id) return;
      for (const file of data) this.addWatchFile(file.pathname);
      const [snapshot, manual] = data.map((file) => JSON.parse(readFileSync(file, 'utf8')));
      return `export const articles = ${JSON.stringify(mergeArticles(snapshot.articles, [], manual))};\n`;
    },
  };
};
export default defineConfig({
  plugins: [
    woff2Only(),
    media(),
    articles(),
    thirdPartyLicenses(),
    solid({ start: { renderMode: 'async', devtools: false }, ssr: true }),
  ],
  build: {
    // Fonts stay separate files: inlined as data: URIs they bloat the stylesheet and are
    // refused by the font-src 'self' content security policy.
    assetsInlineLimit: (file) => (isFontFile(file) ? false : undefined),
  },
  // The tests check logic and build output in Node; none of them needs a DOM.
  test: { environment: 'node' },
});
