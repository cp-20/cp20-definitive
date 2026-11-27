// The Worker in front of the static site. Only the paths the 2026 edition answered for terminals
// reach it (wrangler.jsonc `run_worker_first`); everything else is served from the assets directly.
// The 2026 edition (now at 2026.cp20.dev) printed its pages to `curl cp20.dev` and served JSON for
// `?raw=true`, so those requests still go to it, through a service binding. Browsers that open one
// of its paths the new site lacks are sent to the matching section of /about.

type Fetcher = { fetch(request: Request): Promise<Response> };
export type Env = { ASSETS: Fetcher; LEGACY: Fetcher };

const LEGACY_ORIGIN = 'https://2026.cp20.dev';
// The paths the 2026 edition printed for terminals: /, /articles, /works, /works/<id> and the picks.
const legacyPaths = /^\/(?:articles|works(?:\/[^/]+)?|featured-(?:series|tracks))?$/;
// Command-line HTTP clients, which never ask for HTML.
const terminalAgents = /^(?:curl|wget|httpie|xh|aria2|lwp-request)\b|powershell/i;
const moved: Record<string, string> = {
  '/featured-tracks': '/about#music',
  '/featured-series': '/about#manga',
};

export type Route = { to: 'assets' } | { to: 'legacy'; url: string } | { to: 'redirect'; url: string };

/** Where a request goes: the 2026 edition, a redirect to this site, or the static assets. */
export function route(request: Request): Route {
  const url = new URL(request.url);
  if (!legacyPaths.test(url.pathname) || !['GET', 'HEAD'].includes(request.method)) return { to: 'assets' };
  const accept = request.headers.get('accept') ?? '';
  const terminal =
    terminalAgents.test(request.headers.get('user-agent') ?? '') && !accept.includes('text/html');
  if (terminal || url.searchParams.has('raw') || url.searchParams.has('no-image'))
    return { to: 'legacy', url: LEGACY_ORIGIN + url.pathname + url.search };
  if (moved[url.pathname]) return { to: 'redirect', url: new URL(moved[url.pathname], url).href };
  return { to: 'assets' };
}

// ── Brotli ──
// The build writes a Brotli copy (quality 11, `<file>.br`) of every page and text file
// (scripts/build/compress.ts). Cloudflare compresses what the assets serve on the fly, with zstd
// for Chrome and a fast Brotli otherwise, which came out larger than gzip -9; the copies are a
// fifth smaller (the home page 34 → 27 kB, the app script 102 → 85 kB). They are served for the
// paths below (wrangler.jsonc `run_worker_first`); anything else, and any client that does not
// take Brotli, gets the assets as they are.

/** The type of each text file the build compresses, by extension; a page has none. */
export const COMPRESSED_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json',
  xml: 'application/xml',
  txt: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml',
};

/** The Brotli copy that answers a path and the type of what it holds, or null for none. */
export function brotliCopy(pathname: string): { path: string; type: string } | null {
  if (pathname === '/') return { path: '/index.html.br', type: COMPRESSED_TYPES.html };
  const extension = pathname.match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase();
  // A page's own address (/about), never its file (/about/index.html), which redirects.
  if (!extension)
    return pathname.endsWith('/') ? null : { path: `${pathname}/index.html.br`, type: COMPRESSED_TYPES.html };
  return extension !== 'html' && COMPRESSED_TYPES[extension]
    ? { path: `${pathname}.br`, type: COMPRESSED_TYPES[extension] }
    : null;
}

const takesBrotli = (request: Request) =>
  (request.headers.get('accept-encoding') ?? '').split(',').some((e) => e.trim().split(';')[0] === 'br');

/** The assets' answer, from the Brotli copy when there is one and the client takes it. */
export async function serveAsset(request: Request, assets: Fetcher) {
  const copy =
    ['GET', 'HEAD'].includes(request.method) && takesBrotli(request)
      ? brotliCopy(new URL(request.url).pathname)
      : null;
  if (copy) {
    // The copy's own ETag answers the conditional requests made with it.
    const response = await assets.fetch(new Request(new URL(copy.path, request.url), request));
    if (response.status === 200 || response.status === 304) {
      const headers = new Headers(response.headers);
      headers.set('content-type', copy.type);
      headers.set('content-encoding', 'br');
      headers.append('vary', 'Accept-Encoding');
      // Sent as it is: Cloudflare neither compresses it again nor decodes it.
      return new Response(response.body, {
        status: response.status,
        headers,
        encodeBody: 'manual',
      } as ResponseInit & { encodeBody: 'manual' });
    }
    // No copy (a missing page, answered by the 404 page): the request as it was.
  }
  return assets.fetch(request);
}

export default {
  async fetch(request: Request, env: Env) {
    const r = route(request);
    if (r.to === 'legacy') return env.LEGACY.fetch(new Request(r.url, request));
    if (r.to === 'redirect') return Response.redirect(r.url, 301);
    return serveAsset(request, env.ASSETS);
  },
};
