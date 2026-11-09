// Japanese lines break between phrases in every browser. Chromium can find the phrases itself
// (word-break: auto-phrase), but Safari, and so every browser on an iPhone, cannot: it breaks
// between any two kana or kanji, splitting words (「コンパ｜イル」). So at build time BudouX, the
// segmenter auto-phrase is built on, marks the phrase boundaries of the sentences the pages show
// with a zero-width space, and those elements wrap with `word-break: keep-all` (see app.css): only
// at the marks and spaces. The marks are invisible and screen readers skip them; text taken out
// of the page for anything else (a meta description) goes through `plain` first
// (src/content/phrase-marks.ts). vite.config.ts applies it to works.json and the article titles.
import { loadDefaultJapaneseParser } from 'budoux';
import { BREAK, plain } from '../../src/content/phrase-marks.ts';

let parser: ReturnType<typeof loadDefaultJapaneseParser> | undefined;

/** `text` with a mark at each phrase boundary that is not already beside a space. */
export function phrased(text: string) {
  parser ??= loadDefaultJapaneseParser();
  return parser
    .parse(plain(text))
    .reduce(
      (out, part) => (!out || /\s$/.test(out) || /^\s/.test(part) ? out + part : out + BREAK + part),
      '',
    );
}

/** The fields of a work that are sentences shown on the pages (not names, alt text or URLs). */
export const phrasedWorkFields = ['description', 'summary', 'outcome', 'role'] as const;

/** Works (works.json) with those sentences marked. */
export const phraseWorks = <T extends object>(works: T[]) =>
  works.map((w) => {
    const out = { ...w } as Record<string, unknown>;
    for (const field of phrasedWorkFields)
      if (typeof out[field] === 'string') out[field] = phrased(out[field] as string);
    return out as T;
  });
