import { defineConfig, type Plugin } from 'vite';
import solid from '@solidjs/vite-plugin';
import { dropWoffFallback, isFontFile } from './src/data/font-css.mjs';
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
export default defineConfig({
  plugins: [woff2Only(), solid({ start: { renderMode: 'async', devtools: false }, ssr: true })],
  build: {
    // Fonts stay separate files: inlined as data: URIs they bloat the stylesheet and are
    // refused by the font-src 'self' content security policy.
    assetsInlineLimit: (file) => (isFontFile(file) ? false : undefined),
  },
});
