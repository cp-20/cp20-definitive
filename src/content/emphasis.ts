// Emphasis in the history's short lines and dialogs: `**figure**` is set bold in ink, and
// `` `name` `` in the monospace face (a name that is literally code, like a team called [object Object]).

const MARK = /\*\*([^*\n]+)\*\*|`([^`\n]+)`/g;

export type EmphasisPart = { text: string } | { strong: string } | { code: string };

/** Splits a line into plain text, `**strong**` and `` `code` `` parts. */
export function splitEmphasis(text: string) {
  const parts: EmphasisPart[] = [];
  let last = 0;
  for (const m of text.matchAll(MARK)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push(m[1] !== undefined ? { strong: m[1] } : { code: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/** The line as read aloud or shown without styling. */
export const plainText = (text: string) =>
  splitEmphasis(text)
    .map((p) => ('text' in p ? p.text : 'strong' in p ? p.strong : p.code))
    .join('');
