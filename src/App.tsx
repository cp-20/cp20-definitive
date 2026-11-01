import './styles/app.css';
import { For, createMemo } from 'solid-js';
import Shell from './components/Shell';
import { StampProvider } from './components/Stamps';
import { Home, About, Articles, Works, WorkDetail, NotFound } from './pages';
import { pageInfo } from './route';
import { createNavigation } from './navigation';
// Built pages get Zen Maru Gothic as one subset WOFF2 per weight (scripts/fonts.mjs, run by prerender);
// the dev server, which has no prerender step, uses the full @fontsource split instead.
if (import.meta.env.DEV)
  void Promise.all([
    import('@fontsource/zen-maru-gothic/500.css'),
    import('@fontsource/zen-maru-gothic/700.css'),
  ]);
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
