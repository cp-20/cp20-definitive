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

export default {
  async fetch(request: Request, env: Env) {
    const r = route(request);
    if (r.to === 'legacy') return env.LEGACY.fetch(new Request(r.url, request));
    if (r.to === 'redirect') return Response.redirect(r.url, 301);
    return env.ASSETS.fetch(request);
  },
};
