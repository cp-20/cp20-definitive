// Emphasis in the history's short lines and dialogs: a `**figure**` is written by hand into the
// printed line.

const MARK = /\*\*([^*\n]+)\*\*/g;

export type EmphasisPart = { text: string } | { strong: string };

/** Splits a line into plain text and `**strong**` parts. */
export function splitEmphasis(text: string) {
  const parts: EmphasisPart[] = [];
  let last = 0;
  for (const m of text.matchAll(MARK)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ strong: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
