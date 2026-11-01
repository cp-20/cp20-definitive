import { createSignal, createStore, createMemo, createEffect, onSettled, For, Show } from 'solid-js';
import Icon from '../components/Icon';
import { ArticleRows } from '../components/ArticleRows';
import { articles, type Article } from '../data/content';
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
  const count = createMemo(() => articles.filter(shown).length);
  return (
    <div class="wrap">
      <header data-stamp-anchor="heading" class="page-heading">
        <p class="eyebrow">WRITING</p>
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
                    setFilters((d) => {
                      d.source = source;
                    })
                  }
                >
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
              {count()} 件
            </p>
            <div class="sort-control">
              <label for="article-sort">並び順</label>
              <div class="native-select">
                <select
                  id="article-sort"
                  value={filters.order}
                  onChange={(e) =>
                    setFilters((d) => {
                      d.order = e.currentTarget.value;
                    })
                  }
                >
                  <option value="newest">新しい順</option>
                  <option value="oldest">古い順</option>
                </select>
                <Icon name="ChevronRight" size={14} />
              </div>
            </div>
          </div>
        </div>
        <div class="article-results">
          {/* The rows stay mounted: filtering hides them and sorting moves them (keyed), so the
              list is never rebuilt and only the rows that newly come into view settle in. */}
          <ArticleRows items={ordered()} shown={shown} />
          <Show when={!count()}>
            <p id="article-empty" class="empty-state">
              記事がありません。
            </p>
          </Show>
        </div>
      </section>
    </div>
  );
}
