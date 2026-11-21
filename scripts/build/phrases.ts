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

/** Marks phrase boundaries in `text` while keeping `[label](url)` links and `**...**` intact. */
export function phrasedInline(text: string) {
  const link = /\[([^\]\n]+)\]\(((?:https?:\/\/|\/)[^\s)]+)\)/g;
  const strong = /\*\*([^*\n]+)\*\*/g;
  const phraseEmphasis = (chunk: string) => {
    let out = '',
      last = 0;
    for (const m of chunk.matchAll(strong)) {
      if (m.index > last) out += phrased(chunk.slice(last, m.index));
      out += `**${phrased(m[1])}**`;
      last = m.index + m[0].length;
    }
    if (last < chunk.length) out += phrased(chunk.slice(last));
    return out;
  };
  let out = '',
    last = 0;
  for (const m of text.matchAll(link)) {
    if (m.index > last) out += phraseEmphasis(text.slice(last, m.index));
    out += `[${phrased(m[1])}](${m[2]})`;
    last = m.index + m[0].length;
  }
  if (last < text.length) out += phraseEmphasis(text.slice(last));
  return out;
}

/** The fields of a work that are sentences shown on the pages (not names, alt text or URLs). */
export const phrasedWorkFields = ['description', 'summary', 'outcome', 'role'] as const;

/** Works (works.json) with those sentences and `comments` marked. */
export const phraseWorks = <T extends { comments?: string[] }>(works: T[]) =>
  works.map((w) => {
    const out = { ...w } as Record<string, unknown>;
    for (const field of phrasedWorkFields)
      if (typeof out[field] === 'string') out[field] = phrased(out[field] as string);
    if (Array.isArray(w.comments)) out.comments = w.comments.map(phrasedInline);
    return out as T;
  });

/** Milestones (editorial.ts) with natural Japanese phrase boundaries for /about and modals. */
export const phraseMilestones = <
  T extends {
    text: string;
    detail: string[];
    links: { label: string; url: string }[];
    internCard?: { company: string; period: string; summary: string };
  },
>(
  list: readonly T[],
): T[] =>
  list.map((m) => ({
    ...m,
    text: phrasedInline(m.text),
    detail: m.detail.map(phrasedInline),
    links: m.links.map((l) => ({ ...l, label: phrased(l.label) })),
    ...(m.internCard ? { internCard: { ...m.internCard, summary: phrased(m.internCard.summary) } } : {}),
  }));

/** Affiliations (profile.json) with phrase boundaries on labels. */
export const phraseAffiliations = <T extends { name: string }>(list: readonly T[]): T[] =>
  list.map((a) => ({ ...a, name: phrased(a.name) }));
