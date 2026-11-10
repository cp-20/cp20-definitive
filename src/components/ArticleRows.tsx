import { createMemo, For } from 'solid-js';
import Brand from './Brand.tsx';
import { OGImage, articleAnchor, sizes } from './Preview.tsx';
import { DayStamp } from './AttendanceCard.tsx';
import { shortDate, type Article } from '../content/content.ts';
/**
 * The articles beside an attendance card: each with its OG image as a postage stamp, its title,
 * and the day's stamp from the card by its date. The row whose stamp is pointed at on the card is
 * marked (`hot`), and pointing at a row marks its stamp (`onHot`).
 * With `shown`, every row stays in the DOM and rows it rejects are only hidden, so another year
 * on /articles neither rebuilds the list nor detaches images.
 */
export function ArticleRows(props: {
  items: Article[];
  shown?: (a: Article) => boolean;
  hot?: string;
  onHot?: (id: string | undefined) => void;
}) {
  const visible = createMemo(() => new Set(props.shown ? props.items.filter(props.shown) : props.items));
  return (
    <div class="article-list">
      <For each={props.items}>
        {(a) => {
          const id = articleAnchor(a.url);
          return (
            <a
              href={a.url}
              class="article-row"
              hidden={!visible().has(a)}
              data-stamp-anchor={id}
              data-article
              data-date={a.date}
              data-hot={props.hot === id || undefined}
              onPointerEnter={(e) => e.pointerType === 'mouse' && props.onHot?.(id)}
              onPointerLeave={(e) => e.pointerType === 'mouse' && props.onHot?.(undefined)}
            >
              <OGImage url={a.url} alt="" sizes={sizes.articleRow} />
              <div class="article-text">
                <h3>{a.title}</h3>
                <p class="article-meta">
                  <DayStamp source={a.source} url={a.url} />
                  <time datetime={a.date}>{shortDate(a.date)}</time>
                  <Brand url={a.source} size={14} />
                  <span class="visually-hidden">{a.source}</span>
                </p>
              </div>
            </a>
          );
        }}
      </For>
    </div>
  );
}
