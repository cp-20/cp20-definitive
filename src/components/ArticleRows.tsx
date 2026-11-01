import { createMemo, For } from 'solid-js';
import Icon from './Icon';
import { OGImage, articleAnchor, sizes } from './Preview';
import { formatDate, type Article } from '../data/content';
/**
 * With `shown`, every row stays in the DOM and rows it rejects are only hidden, so filtering
 * neither rebuilds the list nor detaches images (see /articles).
 */
export function ArticleRows(props: { items: Article[]; shown?: (a: Article) => boolean }) {
  // Position of each row among the visible ones, for the stagger of the rows settling in.
  const position = createMemo(() => {
    const at = new Map<Article, number>();
    for (const a of props.items) if (!props.shown || props.shown(a)) at.set(a, at.size);
    return at;
  });
  return (
    <div class="article-list">
      <For each={props.items}>
        {(a) => (
          <a
            href={a.url}
            class="article-row"
            hidden={!position().has(a)}
            style={{ '--i': Math.min(position().get(a) ?? 0, 10) }}
            data-stamp-anchor={articleAnchor(a.url)}
            data-article
            data-date={a.date}
          >
            <OGImage url={a.url} alt="" sizes={sizes.articleRow} />
            <div class="article-text">
              <div class="article-meta">
                <time datetime={a.date}>{formatDate(a.date)}</time>
                <span>{a.source}</span>
              </div>
              <h3>{a.title}</h3>
            </div>
            <Icon name="ArrowUpRight" class="article-arrow" size={19} />
          </a>
        )}
      </For>
    </div>
  );
}
