// The pictures each page shows first, for the app to fetch when a link to that page is about to be
// followed (src/site/warm.ts): the page then opens with its pictures instead of their stand-ins.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { imageTags, wantsPlaceholder } from './placeholders.ts';
import { WARM_META, type WarmImage } from '../../src/site/warm.ts';

/** At most this many pictures per page: the ones in its first view. */
export const WARM_LIMIT = 6;

/** Lazy pictures taken when the page has fewer eager ones (a list of thumbnails from its top). */
export const WARM_LAZY = 3;

/**
 * The pictures of a page's content (its <main>) that load at once, as an <img> asks for them,
 * then its first lazy ones (in view at the top of a list page) if there is still room.
 */
export function firstPictures(html: string): WarmImage[] {
  const main = html.match(/<main\b[\s\S]*<\/main>/)?.[0] ?? '';
  const pictures = imageTags(main).filter(wantsPlaceholder);
  const eager = pictures.filter((tag) => !tag.lazy);
  const lazy = pictures.filter((tag) => tag.lazy).slice(0, Math.max(0, WARM_LAZY - eager.length));
  return [...eager, ...lazy]
    .slice(0, WARM_LIMIT)
    .map(({ src, srcset, sizes }) => (srcset && sizes ? { src, srcset, sizes } : { src }));
}

/**
 * Writes /assets/warm-<hash>.json (page path → its first pictures) and names it in every page.
 * @param pages the HTML file of each page path
 */
export async function addWarmManifest(root: string, pages: Record<string, string>) {
  const html: Record<string, string> = Object.fromEntries(
    await Promise.all(
      Object.entries(pages).map(async ([path, file]) => [path, await readFile(file, 'utf8')] as const),
    ),
  );
  const manifest = JSON.stringify(
    Object.fromEntries(Object.entries(html).map(([path, page]) => [path, firstPictures(page)])),
  );
  const name = `warm-${createHash('sha256').update(manifest).digest('hex').slice(0, 12)}.json`;
  await writeFile(join(root, 'assets', name), manifest);
  for (const [path, file] of Object.entries(pages))
    await writeFile(
      file,
      html[path].replace('</head>', `<meta name="${WARM_META}" content="/assets/${name}"></head>`),
    );
  return { file: name, bytes: manifest.length };
}
