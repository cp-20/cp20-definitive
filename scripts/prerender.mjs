import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { handleRequest } from '../dist/server/server.js';
import { mergeArticles } from '../src/data/normalize.mjs';
const load = async (name) =>
  JSON.parse(await readFile(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8'));
const [baseWorks, manual, snapshot] = await Promise.all(['works', 'manual', 'generated'].map(load));
const works = [...baseWorks, ...manual.projects],
  articles = mergeArticles(snapshot.articles, [], manual);
const paths = ['/', '/about', '/articles', '/works', ...works.map((w) => `/works/${w.id}`), '/404'];
for (const path of paths) {
  const response = await handleRequest(new Request(`https://cp20.dev${path}`));
  if (response.status !== (path === '/404' ? 404 : 200)) throw Error(`Prerender ${path}: ${response.status}`);
  const output =
    path === '/'
      ? 'dist/client/index.html'
      : path === '/404'
        ? 'dist/client/404.html'
        : `dist/client${path}/index.html`;
  await mkdir(output.slice(0, output.lastIndexOf('/')), { recursive: true });
  await writeFile(output, await response.text());
}
const escape = (s) =>
  s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
await writeFile(
  'dist/client/sitemap.xml',
  `<?xml version="1.0" encoding="utf-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths
    .filter((p) => p !== '/404')
    .map((p) => `<url><loc>https://cp20.dev${p === '/' ? '' : p}</loc></url>`)
    .join('')}</urlset>`,
);
await writeFile(
  'dist/client/feed.xml',
  `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>cp20.dev — Writing</title><link>https://cp20.dev/articles</link><description>しーぴーの記事</description><language>ja</language>${articles
    .slice(0, 50)
    .map(
      (a) =>
        `<item><title>${escape(a.title)}</title><link>${escape(a.url)}</link><guid isPermaLink="true">${escape(a.url)}</guid><pubDate>${new Date(a.date).toUTCString()}</pubDate></item>`,
    )
    .join('')}</channel></rss>`,
);
console.log(`Prerendered ${paths.length} pages, RSS and sitemap → dist/client`);
