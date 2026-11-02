import { Show } from 'solid-js';
import Icon from '../components/Icon.tsx';
import { OGImage, Postmark, postmarkDate, sizes } from '../components/Preview.tsx';
import Brand from '../components/Brand.tsx';
import { articles, works, workStack } from '../content/content.ts';
import { splitLinks } from '../content/inline-links.ts';
/* U+2060 WORD JOINER: no line break between a link's last character and its trailing arrow. */
const WORD_JOINER = '\u2060';
export default function WorkDetail(props: { work: (typeof works)[number] }) {
  const w = props.work;
  // Only articles still in the list: the scheduled refresh keeps building when a source drops one.
  const related = w.relatedArticles.flatMap((url) => articles.filter((a) => a.url === url));
  return (
    <div class="wrap">
      <header data-stamp-anchor="heading" class="page-heading work-heading">
        <a href="/works" class="under-link">
          <Icon name="ArrowLeft" size={16} />
          作品一覧
        </a>
        <p class="eyebrow">{w.tags.join(' / ')}</p>
        <h1>
          <span class="work-title">{w.title}</span>
        </h1>
        <p class="intro">{w.description}</p>
        <div class="work-heading-actions">
          <a class="primary-button" href={w.url}>
            作品を開く
            <Icon name="ArrowUpRight" size={18} />
          </a>
        </div>
      </header>
      <div class="work-detail-hero" data-stamp-anchor="work-image">
        <OGImage url={w.url} alt={`${w.title}のOG画像`} sizes={sizes.workHero} priority />
        <Postmark date={postmarkDate(w.productionTime)} />
      </div>
      <div class="work-detail-layout">
        <aside>
          <dl class="work-facts">
            <dt>制作時期</dt>
            <dd>{w.productionTime.replace('now', '現在')}</dd>
            <Show when={workStack(w).length > 0}>
              <dt>使用技術</dt>
              <dd>
                {workStack(w).map((t) => (
                  <span>{t.label}</span>
                ))}
              </dd>
            </Show>
            <dt>ソースコード</dt>
            <dd>
              {w.repositories.map((r) =>
                r === 'private' ? (
                  <span>非公開リポジトリ</span>
                ) : (
                  <a href={r}>
                    <Brand url={r} />
                    {r.replace('https://github.com/', '')}
                    {WORD_JOINER}
                    <Icon name="ArrowUpRight" size={13} />
                  </a>
                ),
              )}
            </dd>
          </dl>
        </aside>
        <article class="work-detail-copy">
          <h2>制作について</h2>
          {w.comments.map((c) => (
            <p>
              {splitLinks(c).map((part) =>
                'href' in part ? (
                  <a class="inline-link" href={part.href}>
                    {part.label}
                  </a>
                ) : (
                  part.text
                ),
              )}
            </p>
          ))}
          <Show when={related.length > 0}>
            <h2>関連する記事</h2>
            {related.map((a) => (
              <p>
                <a href={a.url}>
                  <Brand url={a.url} />
                  {a.title}
                  {WORD_JOINER}
                  <Icon name="ArrowUpRight" size={16} />
                </a>
              </p>
            ))}
          </Show>
        </article>
      </div>
    </div>
  );
}
