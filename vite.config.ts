/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import solid from '@solidjs/vite-plugin';
import { readFileSync, readdirSync } from 'node:fs';
import { imageSize } from 'image-size';
import { dropWoffFallback, isFontFile } from './scripts/build/fonts.ts';
import { clientMedia, coverSrcsets } from './src/content/media.ts';
import { shownSeriesThumbnail } from './src/data/manga-covers.ts';
import { mergeArticles } from './src/content/normalize.ts';
import { thirdPartyLicenses } from './scripts/build/licenses.ts';
import { phrased, phraseWorks } from './scripts/build/phrases.ts';
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
      // The works' screenshots (scripts/sync/screenshots.ts): their WebP copies and their size,
      // which the page states so nothing moves when they load.
      const shotDirectory = new URL('./public/images/screenshots/', import.meta.url);
      this.addWatchFile(shotDirectory.pathname);
      const shotSrcsets = coverSrcsets(readdirSync(shotDirectory), '/images/screenshots/');
      const shots = Object.fromEntries(
        Object.entries(shotSrcsets).map(([file, srcset]) => {
          const { width, height } = imageSize(readFileSync(new URL(`./public${file}`, import.meta.url)));
          return [file, { srcset, width, height }];
        }),
      );
      return [
        `export const pages = ${JSON.stringify(pages)};`,
        `export const images = ${JSON.stringify(images)};`,
        `export const covers = ${JSON.stringify(covers)};`,
        `export const shots = ${JSON.stringify(shots)};`,
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
      // Titles break between phrases like the works' sentences (not in the tests: see below).
      const list = mergeArticles(snapshot.articles, [], manual).map((a) =>
        process.env.VITEST ? a : { ...a, title: phrased(a.title) },
      );
      return `export const articles = ${JSON.stringify(list)};\n`;
    },
  };
};
// The works' sentences with their phrase boundaries marked (scripts/build/phrases.ts), so they
// break between phrases on an iPhone too. Not in the tests, which check the data as written.
const phrasedWorks = (): Plugin => ({
  name: 'cp20-phrased-works',
  enforce: 'pre',
  transform(code, id) {
    if (process.env.VITEST || !/[\\/]src[\\/]data[\\/]works\.json$/.test(id)) return;
    return { code: JSON.stringify(phraseWorks(JSON.parse(code))), map: null };
  },
});
export default defineConfig({
  plugins: [
    woff2Only(),
    media(),
    articles(),
    phrasedWorks(),
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
