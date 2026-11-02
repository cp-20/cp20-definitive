import { createSignal, createStore, createMemo, createEffect, onSettled, flush, For, Show } from 'solid-js';
import Icon from '../components/Icon.tsx';
import { ArticleRows } from '../components/ArticleRows.tsx';
import { AttendanceCard, yearOf } from '../components/AttendanceCard.tsx';
import Brand from '../components/Brand.tsx';
import { reflow } from '../components/reflow.ts';
import { articles, type Article } from '../content/content.ts';
export default function Articles() {
  const [filters, setFilters] = createStore({ source: '', order: 'newest' });
  const [ready, setReady] = createSignal(false);
  const names = [...new Set(articles.map((a) => a.source))];
  const readFilters = () => {
    const params = new URLSearchParams(location.search);
    setFilters((d) => {
      d.source = names.includes(params.get('source') || '') ? params.get('source')! : '';
      d.order = params.get('order') === 'oldest' ? 'oldest' : 'newest';
    });
  };
  onSettled(() => {
    readFilters();
    setReady(true);
    document.addEventListener('cp20:navigation', readFilters);
    return () => document.removeEventListener('cp20:navigation', readFilters);
  });
  createEffect(
    () => ({ ready: ready(), source: filters.source, order: filters.order }),
    (value) => {
      if (!value.ready) return;
      const params = new URLSearchParams();
      if (value.source) params.set('source', value.source);
      if (value.order === 'oldest') params.set('order', 'oldest');
      history.replaceState(history.state, '', location.pathname + (params.size ? '?' + params : ''));
    },
  );
  const ordered = createMemo(() => (filters.order === 'oldest' ? [...articles].reverse() : articles));
  const shown = (a: Article) => !filters.source || a.source === filters.source;
  // One year's card is open at a time; the list beside it holds that year's articles.
  const years = [...new Set(articles.map(yearOf))].sort();
  const [year, setYear] = createSignal(years.at(-1)!);
  const [hot, setHot] = createSignal<string>();
  const inYear = (a: Article) => shown(a) && yearOf(a) === year();
  const yearCounts = createMemo(() =>
    years.map((y) => ({ year: y, count: articles.filter((a) => shown(a) && yearOf(a) === y).length })),
  );
  const count = createMemo(() => articles.filter(inYear).length);
  let results!: HTMLDivElement;
  // A choice made here moves the cards to their new places (a page arrival just shows them).
  const choose = (change: (d: typeof filters) => void) =>
    reflow(results.querySelector('.article-list')!, () => {
      setFilters(change);
      flush();
    });
  const chooseYear = (y: number) =>
    reflow(results.querySelector('.article-list')!, () => {
      setYear(y);
      flush();
    });
  return (
    <div class="wrap">
      <header data-stamp-anchor="heading" class="page-heading">
        <h1>記事</h1>
      </header>
      <section aria-labelledby="article-list-title">
        <h2 id="article-list-title" class="visually-hidden">
          記事一覧
        </h2>
        <div class="article-toolbar">
          <div class="source-filters" role="group" aria-label="掲載先で絞り込む">
            <For each={['', ...names]}>
              {(source) => (
                <button
                  class="source-chip"
                  aria-pressed={filters.source === source ? 'true' : 'false'}
                  onClick={() =>
                    choose((d) => {
                      d.source = source;
                    })
                  }
                >
                  {source && <Brand url={source} />}
                  <span>{source || 'すべて'}</span>
                  <small>
                    {source ? articles.filter((a) => a.source === source).length : articles.length}
                  </small>
                </button>
              )}
            </For>
          </div>
          <div class="article-sort-row">
            <p id="filter-count" class="meta" role="status">
              {year()}年 {count()} 件
            </p>
            <div class="sort-control">
              <label for="article-sort">並び順</label>
              <div class="native-select">
                <select
                  id="article-sort"
                  value={filters.order}
                  onChange={(e) => {
                    const order = e.currentTarget.value;
                    choose((d) => {
                      d.order = order;
                    });
                  }}
                >
                  <option value="newest">新しい順</option>
                  <option value="oldest">古い順</option>
                </select>
                <Icon name="ChevronRight" size={14} />
              </div>
            </div>
          </div>
        </div>
        <div class="article-results attendance-desk" ref={results}>
          <AttendanceCard
            items={articles}
            year={year()}
            years={yearCounts()}
            onYear={chooseYear}
            shown={shown}
            hot={hot()}
            onHot={setHot}
          />
          {/* The rows stay mounted: filtering hides them and sorting moves them (keyed), so the
              list is never rebuilt and the cards glide to their new places (reflow.ts). */}
          <div class="attendance-list">
            <ArticleRows items={ordered()} shown={inYear} hot={hot()} onHot={setHot} />
            <Show when={!count()}>
              <p id="article-empty" class="empty-state">
                この年の記事はありません。
              </p>
            </Show>
          </div>
        </div>
      </section>
    </div>
  );
}
