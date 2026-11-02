import { createMemo, For } from 'solid-js';
import Brand from './Brand.tsx';
import { OGImage, articleAnchor, sizes } from './Preview.tsx';
import { formatDate, type Article } from '../content/content.ts';
/**
 * A page of a stamp album: each article's OG image is a stamp tucked into the clear pocket of a stock leaf,
 * with its title, source and date written underneath.
 * With `shown`, every row stays in the DOM and rows it rejects are only hidden, so filtering
 * neither rebuilds the list nor detaches images (see /articles).
 */
export function ArticleRows(props: { items: Article[]; shown?: (a: Article) => boolean }) {
  const visible = createMemo(() => new Set(props.shown ? props.items.filter(props.shown) : props.items));
  return (
    <div class="article-list">
      <For each={props.items}>
        {(a) => (
          <a
            href={a.url}
            class="article-row"
            hidden={!visible().has(a)}
            data-stamp-anchor={articleAnchor(a.url)}
            data-article
            data-date={a.date}
          >
            <OGImage url={a.url} alt="" sizes={sizes.articleRow} />
            <div class="article-text">
              <h3>{a.title}</h3>
              <p class="article-meta">
                <Brand url={a.source} size={14} />
                <span class="visually-hidden">{a.source}</span>
                <time datetime={a.date}>{formatDate(a.date)}</time>
              </p>
            </div>
          </a>
        )}
      </For>
    </div>
  );
}
