// Reading the head of a third-party page: only the head is fetched and parsed, so a large or
// hostile page can neither be downloaded in full nor make the parse run over its whole body.
import { parse } from 'node-html-parser';
import type { RequestOptions } from './sync.ts';

/** Request options for a page whose head is read: a large page is cut short, not refused. */
export const headRequest: RequestOptions = { format: 'html', maxBytes: 1_000_000, truncate: true };

// At most this many characters of the head are parsed.
const maxScan = 512_000;
/** The elements of a page's head that match `selector`. */
export const headElements = (html: string, selector: string) => {
  const end = html.search(/<\/head\s*>/i);
  return parse(html.slice(0, Math.min(end < 0 ? html.length : end, maxScan))).querySelectorAll(selector);
};
