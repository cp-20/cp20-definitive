// The site's web fonts at build time. Subsets Zen Maru Gothic 500 to the characters the built site
// can show and 700 to those it sets in bold, each split into the home page's characters, the
// profile's other ones and the rest (unicode-range): the home page loads two small files, and no
// page more than six, instead of dozens of @fontsource slices. Runs after prerender, so the text of
// every page and every string in the client JavaScript (client-rendered views, sticker messages) is
// included. Also the stylesheet filter vite.config.ts applies to the other @fontsource fonts.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import subsetFont from 'subset-font';
import { parse } from 'node-html-parser';

export const family = 'Zen Maru Gothic';
export const weights = [500, 700];
const source = (weight: number) =>
  new URL(`../../fonts/zen-maru-gothic/zen-maru-gothic-${weight}.woff2`, import.meta.url);

export const isFontFile = (file: string) => /\.(woff2?|ttf|otf|eot)(\?.*)?$/i.test(file);

/** Removes `url(...woff) format('woff')` fallbacks from @font-face src lists that also offer WOFF2. */
export const dropWoffFallback = (css: string) =>
  css.replace(/src:([^;}]*)/g, (whole, list: string) =>
    /format\(\s*['"]woff2['"]\s*\)/.test(list)
      ? `src:${list.replace(/,\s*url\([^)]*\.woff(\?[^)]*)?\)\s*format\(\s*['"]woff['"]\s*\)/g, '')}`
      : whole,
  );

/**
 * Every character that can be rendered from these files: literal text plus \uXXXX / \u{…} escapes
 * and HTML character references, with printable ASCII always included.
 */
export function collectCharacters(texts: string[]) {
  const chars = new Set<string>();
  for (let c = 0x20; c < 0x7f; c++) chars.add(String.fromCharCode(c));
  const add = (text: string) => {
    for (const c of text) if (c.codePointAt(0)! >= 0x20) chars.add(c);
  };
  for (const text of texts) {
    add(text);
    for (const m of text.matchAll(
      /\\u\{([0-9a-f]{1,6})\}|\\u([0-9a-f]{4})|&#x([0-9a-f]{1,6});|&#(\d{1,7});/gi,
    )) {
      const code = m[1] || m[2] || m[3] ? parseInt(m[1] || m[2] || m[3], 16) : Number(m[4]);
      if (code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)) add(String.fromCodePoint(code));
    }
  }
  return [...chars].sort().join('');
}

// Splits a selector list at its top-level commas (not those inside :is(…) and the like).
function splitSelectors(list: string) {
  const out: string[] = [];
  let depth = 0,
    start = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      out.push(list.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(list.slice(start).trim());
  return out.filter(Boolean);
}

const BOLD =
  /(?:^|;)\s*font-weight:\s*(?:bold(?:er)?|[6-9]00)\s*(?:;|$)|(?:^|;)\s*font:[^;]*\b(?:bold|[6-9]00)\b/;

/**
 * What a stylesheet sets in bold: the selectors of every rule with a weight of 600 or more, and
 * the text of every `content` (a pseudo-element's text, such as the seal on an award in the history).
 * Rules inside @media count too: a selector that is bold anywhere is bold.
 */
export function boldRules(css: string) {
  const selectors: string[] = [],
    content: string[] = [];
  // Innermost blocks are the style rules: a prelude, then declarations with no braces in them.
  for (const [, prelude, declarations] of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    for (const m of declarations.matchAll(/content:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g))
      content.push(m[1].slice(1, -1));
    const selector = prelude.slice(prelude.lastIndexOf(';') + 1).trim();
    if (!selector || selector.startsWith('@') || !BOLD.test(declarations)) continue;
    selectors.push(...splitSelectors(selector));
  }
  return { selectors, content };
}

// A selector for a pseudo-element's box: its text is the rule's `content`, not the element's.
const GENERATED =
  /::?(?:before|after|marker|placeholder|backdrop|selection|-webkit-[\w-]+|-moz-[\w-]+|view-transition)/;
// The states a visitor puts things in (hover, focus) are dropped, so a selector matches the element
// at rest.
const STATE = /:(?:hover|focus|focus-visible|focus-within|active|visited|target)\b|::?first-(?:letter|line)/g;
const PSEUDO = /:{1,2}[\w-]+(?:\((?:[^()]|\([^()]*\))*\))?/g;
const tidy = (selector: string) =>
  selector
    .trim()
    .replace(/[\s>+~]+$/, '')
    .replace(/^[>+~]/, '* $&');

/**
 * The text of every page that is set in bold: the elements the bold rules match (with all their
 * text: a part set back to regular inside one only adds a few letters), headings and <strong>,
 * pseudo-element text, and the strings only the client script shows (status messages and the
 * like, which cannot be placed from the HTML alone).
 */
export function boldTexts(pages: string[], css: string[], scripts: string[]) {
  const rules = css.map(boldRules);
  const selectors = [
    'h1, h2, h3, h4, h5, h6, b, strong, th',
    ...rules
      .flatMap((r) => r.selectors)
      .filter((s) => !GENERATED.test(s))
      .map((s) => tidy(s.replace(STATE, ''))),
  ].filter(Boolean);
  const texts = rules.flatMap((r) => r.content);
  for (const html of pages) {
    const root = parse(html);
    for (const selector of new Set(selectors)) {
      let found;
      try {
        found = root.querySelectorAll(selector);
      } catch {
        // A pseudo-class the parser does not know: match without any, which only finds more.
        try {
          found = root.querySelectorAll(tidy(selector.replace(PSEUDO, '')) || '*:not(*)');
        } catch {
          continue;
        }
      }
      for (const element of found) texts.push(element.textContent);
    }
  }
  const inPages = new Set(collectCharacters(pages));
  texts.push([...collectCharacters(scripts)].filter((c) => !inPages.has(c)).join(''));
  return texts;
}

/** Code points as a unicode-range value, runs of consecutive ones as one range: `U+20-7e,U+3042`. */
export function unicodeRange(chars: string) {
  const points = [...new Set([...chars].map((c) => c.codePointAt(0)!))].sort((a, b) => a - b);
  const ranges: string[] = [];
  for (let i = 0; i < points.length; i++) {
    let j = i;
    while (points[j + 1] === points[j] + 1) j++;
    ranges.push(`U+${points[i].toString(16)}${j > i ? `-${points[j].toString(16)}` : ''}`);
    i = j;
  }
  return ranges.join(',');
}

/**
 * The pages whose characters get files of their own, in this order: the home page (where most
 * visits start: the QR code, the social profiles) and the profile. Every other character goes in a
 * last file, which only a page that shows one of them loads.
 */
export const landingPages = ['index.html', 'about/index.html'];

/**
 * `chars` split into those of each page in turn not already in an earlier part, then the rest: one
 * part per page plus one (a part can be empty).
 */
export function slices(chars: string, pages: string[]) {
  const taken = new Set<string>();
  return [...pages, chars].map((page) => {
    const part = [...chars].filter((c) => page.includes(c) && !taken.has(c));
    for (const c of part) taken.add(c);
    return part.join('');
  });
}

// The text a page draws: its body without scripts and styles.
const drawnText = (html: string) => {
  const root = parse(html);
  for (const element of root.querySelectorAll('script, style')) element.remove();
  return root.querySelector('body')?.textContent ?? '';
};

/**
 * `<head>` addition for the subset files: an @font-face per file, each with the characters it has
 * as its unicode-range, so a page downloads only the files with characters it shows. A landing page
 * also preloads its own files (`preload`): Chrome then holds the first paint until they arrive, for
 * a moment, and the page appears in its font instead of changing font (and shifting) as it is read.
 * On 1.6 Mbps / 150 ms / CPU 4x (iPhone 13 size) the fonts arrived about 0.6 s sooner (home 2.1 →
 * 1.5 s, /about 2.4 → 1.8 s; /about's LCP 2.2 → 1.6 s, layout shift 0.02 → 0–0.01) for a first paint
 * 0.2–0.4 s later. With one 140 kB file per weight, preloading only delayed the first paint.
 */
export function fontHead(files: { weight: number; href: string; range?: string }[], preload: string[] = []) {
  return `${preload
    .map((href) => `<link rel="preload" href="${href}" as="font" type="font/woff2" crossorigin>`)
    .join('')}<style>${files
    .map(
      ({ weight, href, range }) =>
        `@font-face{font-family:'${family}';font-style:normal;font-display:swap;font-weight:${weight};src:url(${href}) format('woff2')${range ? `;unicode-range:${range}` : ''}}`,
    )
    .join('')}</style>`;
}

// Every file under `dir` whose name matches `pattern`.
const files = async (dir: string, pattern: RegExp) =>
  (await readdir(dir, { recursive: true }))
    .filter((name) => pattern.test(name))
    .map((name) => join(dir, name));

// harfbuzz keeps only name IDs 0-6 by default; the subset is a Modified Version under the SIL OFL,
// which must still carry the copyright and license, so keep the designer, vendor, URL and license
// records (8, 9, 11-14) as well.
export const subsetOptions: Parameters<typeof subsetFont>[2] = {
  targetFormat: 'woff2',
  preserveNameIds: [0, 1, 2, 3, 4, 5, 6, 8, 9, 11, 12, 13, 14],
};

/** @param root the built client directory (dist/client) */
export async function subsetSiteFonts(root: string) {
  const pages = await files(root, /\.html$/);
  const read = (list: string[]) => Promise.all(list.map((f) => readFile(f, 'utf8')));
  const [html, css, js] = await Promise.all([
    read(pages),
    read(await files(join(root, 'assets'), /\.css$/)),
    read(await files(join(root, 'assets'), /\.js$/)),
  ]);
  // Regular covers every character the site can show; bold only what is set in bold, about two
  // thirds as many (the body text's kanji are the bulk of the font). Each is split by page.
  const landing = landingPages.map((page) => html[pages.indexOf(join(root, page))] ?? '');
  const shown = {
    500: landing.map((page) => collectCharacters([drawnText(page)])),
    700: landing.map((page) => collectCharacters(boldTexts([page], css, []))),
  };
  const parts = {
    500: slices(collectCharacters([...html, ...css, ...js]), shown[500]),
    700: slices(collectCharacters(boldTexts(html, css, js)), shown[700]),
  };
  const written: {
    weight: number;
    href: string;
    range: string;
    size: number;
    characters: number;
    // The landing pages that preload it (those that show its characters, from its own page on).
    preloadedBy: string[];
  }[] = [];
  for (const weight of weights) {
    const weightParts = parts[weight as keyof typeof parts];
    for (const [part, set] of weightParts.entries()) {
      if (!set) continue;
      const bytes = await subsetFont(await readFile(source(weight)), set, subsetOptions);
      const name = `zen-maru-gothic-${weight}-${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}.woff2`;
      await writeFile(join(root, 'assets', name), bytes);
      written.push({
        weight,
        href: `/assets/${name}`,
        range: unicodeRange(set),
        size: bytes.length,
        characters: [...set].length,
        preloadedBy: landingPages.filter(
          (_, page) =>
            part <= page && [...set].some((c) => shown[weight as keyof typeof shown][page].includes(c)),
        ),
      });
    }
  }
  for (const page of pages) {
    const name = page.slice(root.length + 1).replaceAll('\\', '/');
    const preload = written.filter((f) => f.preloadedBy.includes(name)).map((f) => f.href);
    const html = await readFile(page, 'utf8');
    if (!html.includes('</head>')) throw Error(`No </head> in ${page}`);
    await writeFile(page, html.replace('</head>', `${fontHead(written, preload)}</head>`));
  }
  return { files: written };
}
