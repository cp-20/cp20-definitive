// Build-time helpers for the web font stylesheets (see vite.config.ts).

/** @param {string} file */
export const isFontFile = (file) => /\.(woff2?|ttf|otf|eot)(\?.*)?$/i.test(file);

/**
 * Removes `url(...woff) format('woff')` fallbacks from @font-face src lists that also offer WOFF2.
 * @param {string} css
 * @returns {string}
 */
export const dropWoffFallback = (css) =>
  css.replace(/src:([^;}]*)/g, (whole, list) =>
    /format\(\s*['"]woff2['"]\s*\)/.test(list)
      ? `src:${list.replace(/,\s*url\([^)]*\.woff(\?[^)]*)?\)\s*format\(\s*['"]woff['"]\s*\)/g, '')}`
      : whole,
  );
