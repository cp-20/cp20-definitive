// Runs after `vite build`: renders every page of the SSR build to static HTML in dist/client,
// writes the RSS feed, the sitemap and the picture of a shared link, and subsets the web font to
// the characters the site uses.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { mergeArticles, stripInvalidText, type Article } from '../../src/content/normalize.ts';
import {
  FEED,
  OG_IMAGE,
  assertRelatedArticles,
  canonicalUrl,
  mergeWorks,
  missingRelatedArticles,
  sitePaths,
} from '../../src/site/pages.ts';
import { subsetSiteFonts } from './fonts.ts';
import { writeOgImage } from './og.ts';

const escapeXml = (s: string) =>
  stripInvalidText(String(s)).replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
// RSS 2.0 with an Atom self link; every article is included (the list is small and complete).
export function buildFeed(articles: Article[]) {
  const newest = articles.reduce((max, a) => (a.date > max ? a.date : max), '');
  const lastBuild = newest ? `<lastBuildDate>${new Date(newest).toUTCString()}</lastBuildDate>` : '';
  return `<?xml version="1.0" encoding="utf-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${escapeXml(FEED.title)}</title><link>${canonicalUrl('/articles')}</link><atom:link href="${canonicalUrl(FEED.path)}" rel="self" type="application/rss+xml"/><description>しーぴーの記事</description><language>ja</language>${lastBuild}${articles
    .map(
      (a) =>
        `<item><title>${escapeXml(a.title)}</title><link>${escapeXml(a.url)}</link><guid isPermaLink="true">${escapeXml(a.url)}</guid><pubDate>${new Date(a.date).toUTCString()}</pubDate><description>${escapeXml(`${a.source} に掲載`)}</description></item>`,
    )
    .join('')}</channel></rss>`;
}

async function prerender() {
  // The SSR build only exists once `vite build` has run.
  const server = '../../dist/server/server.js';
  const { handleRequest } = (await import(server)) as { handleRequest: (r: Request) => Promise<Response> };
  const load = async (name: string) =>
    JSON.parse(await readFile(new URL(`../../src/data/${name}.json`, import.meta.url), 'utf8'));
  const [baseWorks, manual, snapshot] = await Promise.all(['works', 'manual', 'generated'].map(load));
  const works = mergeWorks(baseWorks, manual),
    articles = mergeArticles(snapshot.articles, manual);
  // Strict for commits (CI); the scheduled refresh only warns, because a source dropping a linked
  // article must not fail every later refresh. The work page then leaves that link out.
  if (process.env.RELATED_ARTICLES === 'warn')
    for (const message of missingRelatedArticles(works, articles)) console.warn(`::warning::${message}`);
  else assertRelatedArticles(works, articles);
  const paths = [...sitePaths(works), '/404'];
  for (const path of paths) {
    const response = await handleRequest(new Request(canonicalUrl(path)));
    if (response.status !== (path === '/404' ? 404 : 200))
      throw Error(`Prerender ${path}: ${response.status}`);
    const output =
      path === '/'
        ? 'dist/client/index.html'
        : path === '/404'
          ? 'dist/client/404.html'
          : `dist/client${path}/index.html`;
    await mkdir(output.slice(0, output.lastIndexOf('/')), { recursive: true });
    await writeFile(output, await response.text());
  }
  await writeFile(
    'dist/client/sitemap.xml',
    `<?xml version="1.0" encoding="utf-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths
      .filter((p) => p !== '/404')
      .map((p) => `<url><loc>${canonicalUrl(p === '/' ? '' : p)}</loc></url>`)
      .join('')}</urlset>`,
  );
  await writeFile(`dist/client${FEED.path}`, buildFeed(articles));
  // The picture of a shared link (og:image in src/Document.tsx).
  await writeOgImage(`dist/client${OG_IMAGE.path}`);
  // The Vite manifest is only for the build; dist/client is published as-is.
  await rm('dist/client/.vite', { recursive: true, force: true });
  const fonts = await subsetSiteFonts('dist/client');
  console.log(`Prerendered ${paths.length} pages, RSS and sitemap → dist/client`);
  console.log(
    `Fonts: ${fonts.files.map((f) => `${f.weight} ${f.characters} chars ${(f.size / 1024).toFixed(0)} kB`).join(', ')}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await prerender();
