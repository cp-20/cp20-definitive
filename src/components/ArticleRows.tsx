import { createMemo, For } from 'solid-js';
import { OGImage, articleAnchor, sizes } from './Preview.tsx';
import { SourceIcon } from './AttendanceCard.tsx';
import Title from './Title.tsx';
import { shortDate, type Article } from '../content/content.ts';
/**
 * The articles beside an attendance card: each with its OG image as a postage stamp, its title,
 * and, by its date, the icon of where it came out, as on the card's day. The row whose stamp is pointed at on the card is
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
                <h3>
                  <Title text={a.title} />
                </h3>
                <p class="article-meta">
                  <SourceIcon source={a.source} />
                  <time datetime={a.date}>{shortDate(a.date)}</time>
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
