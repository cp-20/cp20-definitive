import { For, Show, createSignal, onSettled } from 'solid-js';
import { httpStatus } from '@solidjs/web';
import Icon, { type IconName } from '../components/Icon.tsx';
import { OriginalIcon } from '../components/Preview.tsx';
import WorkCard from '../components/WorkCard.tsx';
import { works } from '../content/content.ts';
import { featuredIds } from '../data/editorial.ts';
import { workPath } from '../site/pages.ts';
// The other pages, with the icons of their index tabs.
const pages: { href: string; label: string; icon: IconName }[] = [
  { href: '/works', label: '作品一覧', icon: 'Folder' },
  { href: '/about', label: 'プロフィール', icon: 'UserRound' },
  { href: '/articles', label: '記事', icon: 'FileText' },
];
const featured = featuredIds.flatMap((id) => works.filter((w) => w.id === id));
export default function NotFound() {
  httpStatus(404);
  // One static page answers every missing address, so it learns the address in the browser: a
  // missing work's page lists every work by name instead of the three featured ones.
  const [missingWork, setMissingWork] = createSignal(false);
  onSettled(() => {
    setMissingWork(location.pathname.startsWith('/works/'));
  });
  return (
    <div class="wrap not-found">
      <p class="eyebrow">404</p>
      <h1>
        ページが
        <wbr />
        見つかりません。
      </h1>
      <p class="not-found-lead">アドレスが変わったか、まちがっているかもしれません。</p>
      <Show
        when={missingWork()}
        fallback={
          <section class="not-found-section" aria-labelledby="not-found-featured">
            <h2 id="not-found-featured">代表作</h2>
            <div class="work-cards-small not-found-featured">
              <For each={featured}>{(w) => <WorkCard work={w} eager />}</For>
            </div>
          </section>
        }
      >
        <section class="not-found-section" aria-labelledby="not-found-works">
          <h2 id="not-found-works">作品</h2>
          <ul class="not-found-all">
            <For each={works}>
              {(w) => (
                <li>
                  <a href={workPath(w.id)}>
                    <OriginalIcon url={w.url} />
                    {w.title}
                  </a>
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>
      <nav class="not-found-pages" aria-label="ほかのページ">
        <For each={pages}>
          {(p) => (
            <a href={p.href}>
              <Icon name={p.icon} size={18} />
              {p.label}
            </a>
          )}
        </For>
      </nav>
    </div>
  );
}
