// Inline links in work descriptions: `[label](https://…)` or `[label](/works/…)`.

const LINK = /\[([^\]\n]+)\]\(((?:https?:\/\/|\/)[^\s)]+)\)/g;

/**
 * Splits a description paragraph into text and link parts.
 * @param {string} text
 * @returns {({ text: string } | { label: string, href: string })[]}
 */
export function splitLinks(text) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ label: m[1], href: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
