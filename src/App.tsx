import './styles/app.css';
import './styles/works.css';
import { For, createMemo } from 'solid-js';
import { isServer } from '@solidjs/web';
import Shell from './site/Shell.tsx';
import { StampProvider } from './stamps/StampProvider.tsx';
import Home from './pages/Home.tsx';
import About from './pages/About.tsx';
import Articles from './pages/Articles.tsx';
import Works from './pages/Works.tsx';
import WorkDetail from './pages/WorkDetail.tsx';
import NotFound from './pages/NotFound.tsx';
import { pageInfo } from './site/route.ts';
import { createNavigation } from './site/navigation.ts';
// Built pages get Zen Maru Gothic, Yusei Magic and cp20 Mono as subset WOFF2 files
// (scripts/build/fonts.ts, run by prerender); the dev server, which has no prerender step, uses the
// full @fontsource split and the whole Yusei Magic and cp20 Mono files instead.
if (import.meta.env.DEV) {
  void import('@fontsource/zen-maru-gothic/700.css');
  if (!isServer) {
    document.fonts.add(new FontFace('Yusei Magic', 'url(/fonts/yusei-magic/yusei-magic-400.woff2)'));
    document.fonts.add(
      new FontFace('cp20 Mono', 'url(/fonts/cp20-mono/cp20-mono-600.woff2)', { weight: '600' }),
    );
  }
}
// The subset is split by page, so a page loads only the files for the characters it shows. Once
// the page has loaded, the other files follow, so the next page's text is ready when it is opened
// (the site's own faces only: not those of a typeface trial).
else if (!isServer) {
  const own = new Set(['Zen Maru Gothic', 'Yusei Magic', 'cp20 Mono']);
  const rest = () => {
    for (const face of document.fonts)
      if (face.status === 'unloaded' && own.has(face.family.replaceAll(/["']/g, '')))
        face.load().catch(() => {});
  };
  const idle = () => ('requestIdleCallback' in window ? requestIdleCallback(rest) : setTimeout(rest, 200));
  if (document.readyState === 'complete') idle();
  else addEventListener('load', idle, { once: true });
}
// The typeface trial (site/font-trial.ts), temporary: only a visit that asks for it with ?font=,
// or that chose a set on an earlier page (its STORAGE_KEY, written out here so the pages carry none
// of the trial's code), loads its panel and faces.
if (!isServer) {
  const param = new URLSearchParams(location.search).get('font');
  let stored: string | null = null;
  try {
    stored = localStorage.getItem('cp20:font-trial');
  } catch {}
  if (param !== null || stored !== null)
    void import('./site/font-trial-panel.ts').then((trial) => trial.startFontTrial(param));
}
function Page(props: { path: string }) {
  const info = pageInfo(props.path);
  return info.path === '/' ? (
    <Home />
  ) : info.path === '/about' ? (
    <About />
  ) : info.path === '/articles' ? (
    <Articles />
  ) : info.path === '/works' ? (
    <Works />
  ) : info.work ? (
    <WorkDetail work={info.work} />
  ) : (
    <NotFound />
  );
}
export default function App() {
  const path = createNavigation();
  const info = createMemo(() => pageInfo(path()));
  return (
    <StampProvider path={path()} enabled={info().found}>
      <Shell path={path()}>
        <For each={[path()]}>
          {(route) => (
            <div class="route-frame" data-route={route}>
              <Page path={route} />
            </div>
          )}
        </For>
      </Shell>
    </StampProvider>
  );
}
