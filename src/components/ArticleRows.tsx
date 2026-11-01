import { createMemo, For } from 'solid-js';
import Icon from './Icon';
import { OGImage, articleAnchor, sizes } from './Preview';
import { formatDate, type Article } from '../data/content';
/**
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
