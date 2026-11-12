// The site's web fonts at build time, each subset to the characters it sets: Zen Maru Gothic 700
// to every character the built site can show (the one weight its printed text is set in), Yusei
// Magic to what it writes by hand (headings, names, labels and figures: the rules that name
// var(--hand) in app.css), and the monospace to what is written as code (the rules that name
// var(--mono)). The two Japanese faces are split into the home page's characters, the profile's
// other ones and the rest (unicode-range): a page loads only the files with characters it shows.
// Runs after prerender, so the text of every page and every string in the client JavaScript
// (client-rendered views, sticker messages) is included. Also the stylesheet filter vite.config.ts
// applies to the other @fontsource fonts.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import subsetFont from 'subset-font';
import { parse } from 'node-html-parser';

/**
 * The faces the build subsets. `role` says which text each needs: `all` every character, `bold`
 * the text of bold rules, `hand` the text of rules set in the hand-written face, `mono` the text of
 * rules set in the monospace. The printed text is all one weight, 700 (500 read thin on the paper),
 * so there is no bold face: what a sentence stresses (a figure) is written by hand instead
 * (app.css). `split` divides a face by page (landingPages); the monospace, a few dozen Latin
 * letters, stays one small file.
 *
 * cp20 Mono is IBM Plex Mono SemiBold (600, beside the printed text's 700; 400 read thin) under
 * another name: "Plex" is a Reserved Font Name under the SIL OFL, and a subset is a Modified
 * Version, which may not carry it. Only the name records (IDs 1, 3, 4, 6, 16) were changed, once,
 * from @ibm/plex-mono 2.5.0's fonts/complete/woff2/IBMPlexMono-SemiBold.woff2 (README).
 */
export const faces: readonly {
  family: 'Zen Maru Gothic' | 'Yusei Magic' | 'cp20 Mono';
  weight: 400 | 600 | 700;
  file: string;
  role: 'all' | 'bold' | 'hand' | 'mono';
  split: boolean;
}[] = [
  {
    family: 'Zen Maru Gothic',
    weight: 700,
    file: 'zen-maru-gothic/zen-maru-gothic-700.woff2',
    role: 'all',
    split: true,
  },
  {
    family: 'Yusei Magic',
    weight: 400,
    file: 'yusei-magic/yusei-magic-400.woff2',
    role: 'hand',
    split: true,
  },
  { family: 'cp20 Mono', weight: 600, file: 'cp20-mono/cp20-mono-600.woff2', role: 'mono', split: false },
];
export type Face = (typeof faces)[number];
/** The file name stem of a face's subsets: `zen-maru-gothic-700`. */
export const faceName = (face: Pick<Face, 'family' | 'weight'>) =>
  `${face.family.toLowerCase().replaceAll(' ', '-')}-${face.weight}`;
const source = (face: Face) => new URL(`../../fonts/${face.file}`, import.meta.url);

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
const HAND = /(?:^|;)\s*font-family:\s*var\(--hand\)/;
const MONO = /(?:^|;)\s*font-family:\s*var\(--mono\)/;

/**
 * The selectors of every rule whose declarations match `test` (by default: a weight of 600 or
 * more), and the text of every `content` (a pseudo-element's text). Rules inside @media count
 * too: a selector that is bold anywhere is bold.
 */
export function boldRules(css: string, test = BOLD) {
  const selectors: string[] = [],
    content: string[] = [];
  // Innermost blocks are the style rules: a prelude, then declarations with no braces in them.
  for (const [, prelude, declarations] of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    for (const m of declarations.matchAll(/content:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g))
      content.push(m[1].slice(1, -1));
    const selector = prelude.slice(prelude.lastIndexOf(';') + 1).trim();
    if (!selector || selector.startsWith('@') || !test.test(declarations)) continue;
    selectors.push(...splitSelectors(selector));
  }
  return { selectors, content };
}
/** The rules set in the hand-written face (`font-family: var(--hand)`), as boldRules. */
export const handRules = (css: string) => boldRules(css, HAND);
/** The rules set in the monospace (`font-family: var(--mono)`), as boldRules. */
export const monoRules = (css: string) => boldRules(css, MONO);

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

const REGULAR = /(?:^|;)\s*font-weight:\s*(?:normal|[1-5]00)\s*(?:;|$)/;
const elementSelectors = (rules: { selectors: string[] }[]) =>
  rules
    .flatMap((r) => r.selectors)
    .filter((s) => !GENERATED.test(s))
    .map((s) => tidy(s.replace(STATE, '')));
// The elements a selector matches in a parsed page.
function matching(root: ReturnType<typeof parse>, selector: string) {
  try {
    return root.querySelectorAll(selector);
  } catch {
    // A pseudo-class the parser does not know: match without any, which only finds more.
    try {
      return root.querySelectorAll(tidy(selector.replace(PSEUDO, '')) || '*:not(*)');
    } catch {
      return [];
    }
  }
}

// The elements set in a face without a rule naming it: bold ones, and the headings (hand-written).
const tags = { bold: 'b, strong, th', hand: 'h1, h2, h3, h4, h5, h6', mono: '' };
/**
 * The text of every page that is set in bold: the elements the bold rules match (with all their
 * text: a part set back to regular inside one only adds a few letters), <b> and <strong> unless a
 * rule sets them back to regular (a figure in the hand-written face), pseudo-element text, and the
 * strings only the client script shows (status messages and the like, which cannot be placed from
 * the HTML alone). With `hand`, the same for the hand-written face: headings and the rules that
 * name it; with `mono`, for the rules that name the monospace. `generated: false` leaves out the
 * pseudo-element text (any rule's, as it takes its element's face), to tell which text a page
 * itself shows.
 */
export function boldTexts(
  pages: string[],
  css: string[],
  scripts: string[],
  kind: 'bold' | 'hand' | 'mono' = 'bold',
  { generated = true } = {},
) {
  const rules = css.map((sheet) =>
    kind === 'hand' ? handRules(sheet) : kind === 'mono' ? monoRules(sheet) : boldRules(sheet),
  );
  const selectors = elementSelectors(rules).filter(Boolean);
  const regular = kind === 'bold' ? elementSelectors(css.map((sheet) => boldRules(sheet, REGULAR))) : [];
  const texts = generated ? rules.flatMap((r) => r.content) : [];
  for (const html of pages) {
    const root = parse(html);
    const setBack = new Set(regular.flatMap((selector) => matching(root, selector)));
    for (const element of tags[kind] ? matching(root, tags[kind]) : [])
      if (!setBack.has(element)) texts.push(element.textContent);
    for (const selector of new Set(selectors))
      for (const element of matching(root, selector)) texts.push(element.textContent);
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
export function fontHead(
  files: { family?: string; weight: number; href: string; range?: string }[],
  preload: string[] = [],
) {
  return `${preload
    .map((href) => `<link rel="preload" href="${href}" as="font" type="font/woff2" crossorigin>`)
    .join('')}<style>${files
    .map(
      ({ family = faces[0].family, weight, href, range }) =>
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
    // The typeface trial's panel (src/site/font-trial-panel.ts, temporary) is set in the system's
    // face, so its text needs none of these.
    read(
      (await files(join(root, 'assets'), /\.js$/)).filter((f) => !/[\\/]font-trial-panel-[^\\/]*$/.test(f)),
    ),
  ]);
  // Regular covers every character the site can show; bold and the hand-written face only what is
  // set in them (the body text's kanji are the bulk of a font). Each is split by page. Whether a
  // landing page preloads a file is judged by what it shows, without the printable ASCII every
  // subset carries anyway.
  const landing = landingPages.map((page) => html[pages.indexOf(join(root, page))] ?? '');
  const texts = (face: Face, pages: string[], scripts: string[], generated = true) =>
    face.role === 'all'
      ? [...pages.map(drawnText), ...scripts]
      : boldTexts(pages, css, scripts, face.role, { generated });
  const written: {
    family: string;
    weight: number;
    href: string;
    range: string;
    size: number;
    characters: number;
    // The landing pages that preload it (those that show its characters, from its own page on).
    preloadedBy: string[];
  }[] = [];
  for (const face of faces) {
    const shown = landing.map((page) => new Set(texts(face, [page], [], false).join('')));
    const all = collectCharacters(face.role === 'all' ? [...html, ...css, ...js] : texts(face, html, js));
    const split = face.split
      ? slices(
          all,
          shown.map((s) => collectCharacters([[...s].join('')])),
        )
      : [all];
    for (const [part, set] of split.entries()) {
      if (!set) continue;
      const bytes = await subsetFont(await readFile(source(face)), set, subsetOptions);
      const name = `${faceName(face)}-${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}.woff2`;
      await writeFile(join(root, 'assets', name), bytes);
      written.push({
        family: face.family,
        weight: face.weight,
        href: `/assets/${name}`,
        range: unicodeRange(set),
        size: bytes.length,
        characters: [...set].length,
        preloadedBy: landingPages.filter(
          (_, page) => part <= page && [...set].some((c) => c.trim() && shown[page].has(c)),
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
