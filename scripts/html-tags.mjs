// Linear-time extraction of <meta>/<link> attributes from untrusted HTML.
// Only the document head is scanned, tags are bounded in length and may not contain '<',
// so an unclosed '<meta ' cannot make the scan run to the end of the input for every match.
const maxScan = 512_000;
/**
 * @param {string} html
 * @param {string[]} names lowercase tag names
 * @returns {Record<string, string>[]}
 */
export function headTags(html, names) {
  const end = html.search(/<\/head\s*>/i);
  const head = html.slice(0, Math.min(end < 0 ? html.length : end, maxScan));
  const tag = new RegExp(`<(?:${names.join('|')})\\s[^<>]{0,4096}>`, 'gi');
  return (head.match(tag) || []).map((t) =>
    Object.fromEntries(
      [...t.matchAll(/(?<![\w:-])([\w:-]{1,64})\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>=`]+))/g)].map((m) => [
        m[1].toLowerCase(),
        m[2] ?? m[3] ?? m[4],
      ]),
    ),
  );
}
