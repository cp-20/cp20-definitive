// Post-processing of the prerendered HTML.

// Raw text elements: a character reference inside them is not decoded by the parser, so it is
// left as it is.
const RAW_TEXT = /(<(script|style)\b[^>]*>[\s\S]*?<\/\2>)/i;
// A numeric character reference for anything past ASCII. The ASCII ones (&#60; and the like) may
// stand for markup and stay escaped.
const NON_ASCII_REFERENCE = /&#(?:x([0-9a-f]+)|(\d+));/gi;

/**
 * Writes the non-ASCII characters that Solid's native compiler escapes as numeric references
 * (`&#12375;` for し) as the characters themselves: in UTF-8 a kana or kanji takes 3 bytes instead
 * of 8, so the Japanese pages are much lighter. The page is the same text once parsed.
 */
export function decodeNonAsciiReferences(html: string) {
  return html
    .split(RAW_TEXT)
    .map((part, i) =>
      // split() with two groups yields [text, element, tag name, text, …].
      i % 3 === 0
        ? part.replace(
            NON_ASCII_REFERENCE,
            (reference, hex: string | undefined, decimal: string | undefined) => {
              const code = hex ? parseInt(hex, 16) : Number(decimal);
              // C1 controls (&#128; is parsed as €), surrogates and out-of-range numbers are not
              // characters to write out as they are.
              if (code < 0xa0 || (code >= 0xd800 && code <= 0xdfff) || code > 0x10ffff) return reference;
              return String.fromCodePoint(code);
            },
          )
        : i % 3 === 1
          ? part
          : '',
    )
    .join('');
}

/**
 * Puts the app's stylesheets (/assets/*.css, the ones that block the first paint) into the page
 * itself, in place of their <link>: the page paints without a second round trip for its styles.
 * The other pages are opened by in-app navigation, which needs no stylesheet again, so the copy
 * in each page costs only a visitor who opens several pages by their address.
 * @param read the text of a stylesheet by its path under the site (/assets/…)
 */
export function inlineStylesheets(html: string, read: (href: string) => string) {
  return html.replace(
    /<link rel="stylesheet" href="(\/assets\/[^"]+\.css)">/g,
    // A `</style` in the stylesheet would end the element early.
    (_, href: string) => `<style>${read(href).replaceAll('</style', '<\\/style')}</style>`,
  );
}
