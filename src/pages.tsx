import { createSignal, createStore, createMemo, createEffect, onSettled, For, Show } from 'solid-js';
import { httpStatus } from '@solidjs/web';
import Icon from './components/Icon';
import { OGImage, OriginalIcon, Postmark, articleAnchor, postmarkDate } from './components/Preview';
import Projects from './components/Projects';
import { articles, works, repos, sources, updatedAt, formatDate, type Article } from './data/content';
import { featuredIds, milestones, editions } from './data/editorial';
import profile from './data/profile.json';
import { localImage } from './data/images';
import tracks from './data/tracks.json';
import series from './data/series.json';
export function ArticleRows(props: { items: Article[] }) {
  return (
    <div class="article-list">
      <For each={props.items}>
        {(a, i) => (
          <a
            href={a.url}
            class="article-row"
            style={{ '--i': Math.min(i(), 10) }}
            data-stamp-anchor={articleAnchor(a.url)}
            data-article
            data-date={a.date}
          >
            <OGImage url={a.url} alt="" />
            <Postmark date={postmarkDate(a.date)} top={a.source} bottom="POST" />
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
export function Home() {
  return (
    <div class="wrap">
      <section data-stamp-anchor="intro" class="home-intro" aria-labelledby="hero-title">
        <div class="identity">
          <span class="avatar-stamp">
            <img
              src="/images/avatar.png"
              alt="しーぴーのアイコン"
              width="88"
              height="88"
              fetchpriority="high"
            />
          </span>
          <div>
            <p class="eyebrow">Web Engineer / Tokyo</p>
            <h1 id="hero-title">
              しーぴー<span>cp20</span>
            </h1>
            <p>Webアプリや開発ツールをつくっています。</p>
          </div>
        </div>
        <a href="/about" class="intro-profile">
          <span>
            東京科学大学 情報工学系 B4
            <br />
            プロフィール・経歴
          </span>
          <Icon name="ArrowUpRight" size={18} />
        </a>
      </section>
      <Projects />
      <div class="home-middle">
        <section class="home-writing" aria-labelledby="writing-title">
          <div class="section-heading">
            <div>
              <p class="eyebrow">WRITING</p>
              <h2 id="writing-title">最近の記事</h2>
            </div>
            <a href="/articles" class="under-link">
              すべて見る
              <Icon name="ArrowRight" size={16} />
            </a>
          </div>
          <ArticleRows items={articles.slice(0, 4)} />
        </section>
        <aside class="home-profile">
          <p class="eyebrow">ABOUT ME</p>
          <h2>プロフィール</h2>
          <p>フロントエンドを中心に開発しています。漫画とボカロが好きです。</p>
          <div class="home-favorites">
            <a href="/about#music">
              <img
                src={localImage(tracks[0].thumbnail)}
                alt={tracks[0].title}
                width="120"
                height="90"
                loading="lazy"
              />
              <Icon name="Music" size={16} />
            </a>
            <a href="/about#manga">
              <img
                src={localImage(series[0].thumbnail)}
                alt={series[0].title}
                width="100"
                height="120"
                loading="lazy"
              />
              <Icon name="BookOpen" size={16} />
            </a>
          </div>
          <a href="/about" class="under-link">
            プロフィールを見る
            <Icon name="ArrowRight" size={16} />
          </a>
          <p class="thumbnail-credit">
            画像：YouTube / {series[0].credit}
            <br />
            作者・出典はプロフィールに記載
          </p>
        </aside>
      </div>
      <section class="editions-section" aria-labelledby="editions-title">
        <div>
          <h2 id="editions-title">これまでの cp20.dev</h2>
        </div>
        <div class="edition-list">
          <For each={editions}>
            {(e) => (
              <a href={`https://${e.year}.cp20.dev`}>
                <strong>{e.year}</strong>
                <span>{e.tech}</span>
                <Icon name="ArrowUpRight" size={16} />
              </a>
            )}
          </For>
        </div>
      </section>
    </div>
  );
}
export function About() {
  return (
    <div class="wrap about-page">
      <header class="profile-header" data-stamp-anchor="profile">
        <div class="profile-avatar">
          <span class="avatar-stamp">
            <img
              src="/images/avatar.png"
              width="208"
              height="208"
              alt="しーぴーのアイコン"
              fetchpriority="high"
            />
          </span>
          <a href="https://twitter.com/sora_douhu" class="avatar-credit">
            icon by @sora_douhu
          </a>
        </div>
        <div class="profile-intro">
          <p class="eyebrow">PROFILE / WEB ENGINEER</p>
          <h1>
            しーぴー<span>cp20</span>
          </h1>

          <p>
            フロントエンドを中心に、バックエンドやインフラも触っています。
            <br class="desktop-break" />
            個人開発ではWebアプリやCコンパイラなどをつくっています。
          </p>
          <div class="profile-links">
            <For each={profile.links}>
              {(l) => (
                <a href={l.url}>
                  {l.name}
                  <Icon name="ArrowUpRight" size={14} />
                </a>
              )}
            </For>
          </div>
        </div>
      </header>
      <div class="profile-history-layout">
        <aside class="profile-details">
          <p class="eyebrow">NOW</p>
          <h2>所属</h2>
          <ul class="profile-affiliations">
            <For each={profile.affiliations}>
              {(a) => (
                <li>
                  <a href={a.url}>{a.name}</a>
                  {a.sub?.map((s) => (
                    <small>
                      <a href={s.url}>
                        {s.name}
                        <Icon name="ArrowUpRight" size={13} />
                      </a>
                    </small>
                  ))}
                </li>
              )}
            </For>
          </ul>
          <div class="profile-related">
            <a href="/works">
              <Icon name="Folder" size={18} />
              つくったもの
              <Icon name="ArrowRight" size={15} />
            </a>
            <a href="/articles">
              <Icon name="FileText" size={18} />
              書いた記事
              <Icon name="ArrowRight" size={15} />
            </a>
          </div>
        </aside>
        <section data-stamp-anchor="history" class="history" aria-labelledby="history-title">
          <div class="section-heading">
            <div>
              <p class="eyebrow">HISTORY</p>
              <h2 id="history-title">経歴</h2>
            </div>
            <span class="meta">学年は当時</span>
          </div>
          <div class="timeline">
            <For each={milestones}>
              {(m) => {
                const body = (
                  <>
                    <div class="timeline-date">
                      <time datetime={m.year.replace('.', '-')}>{m.year}</time>
                      <span>{m.grade}</span>
                    </div>
                    <div>
                      <h3>{m.title}</h3>
                      <p>{m.text}</p>
                    </div>
                  </>
                );
                // Link only when there is a write-up or an official result page.
                return m.url ? (
                  <a class="timeline-item" href={m.url}>
                    {body}
                    <Icon name="ArrowUpRight" size={16} />
                  </a>
                ) : (
                  <div class="timeline-item">{body}</div>
                );
              }}
            </For>
          </div>
        </section>
      </div>
      <div class="favorites-heading">
        <p class="eyebrow">INTERESTS</p>
        <h2>好きなもの</h2>
      </div>
      <section data-stamp-anchor="music" id="music" class="media-section" aria-labelledby="music-title">
        <div class="section-heading">
          <h3 id="music-title">
            <Icon name="Music" />
            音楽<span class="meta">{tracks.length}</span>
          </h3>
        </div>
        <div class="music-list">
          <For each={tracks}>
            {(t, i) => (
              <a class="music-item" href={t.link}>
                <div class="music-image">
                  <img
                    src={localImage(t.thumbnail)}
                    alt={`${t.title}の動画サムネイル`}
                    width="480"
                    height="360"
                    loading="lazy"
                    referrerpolicy="no-referrer"
                  />
                  <span class="play-symbol" aria-hidden="true">
                    <Icon name="Play" size={18} />
                  </span>
                </div>
                <div>
                  <small class="track-number">{String(i() + 1).padStart(2, '0')}</small>
                  <h4>{t.title}</h4>
                  <p>{t.composer}</p>
                  <small>
                    YouTube
                    <Icon name="ArrowUpRight" size={11} />
                  </small>
                </div>
              </a>
            )}
          </For>
        </div>
        <p class="media-caption">
          <a href="https://2026.cp20.dev/featured-tracks">2026版のおすすめ曲</a>
          から。サムネイル提供：YouTube。画像・楽曲の権利は各権利者に帰属します。
        </p>
      </section>
      <section data-stamp-anchor="manga" id="manga" class="media-section" aria-labelledby="manga-title">
        <div class="section-heading">
          <h3 id="manga-title">
            <Icon name="BookOpen" />
            漫画<span class="meta">{series.length}</span>
          </h3>
        </div>
        <div class="bookshelf">
          <For each={series}>
            {(s) => (
              <a class="book-item" href={s.link}>
                <div class="book-cover">
                  <img
                    src={localImage(s.thumbnail)}
                    alt={`${s.title}の公式紹介画像`}
                    width="400"
                    height="400"
                    loading="lazy"
                    referrerpolicy="no-referrer"
                  />
                </div>
                <h4>
                  {s.title}
                  <Icon name="ArrowUpRight" size={14} />
                </h4>
                <p>{s.author}</p>
                <small>画像：{s.credit}</small>
              </a>
            )}
          </For>
        </div>
        <p class="media-caption">画像は各作品の公式掲載ページより。リンク先で作品を読めます。</p>
      </section>
    </div>
  );
}
export function Articles() {
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
  const filtered = createMemo(() => {
    const list = articles.filter((a) => !filters.source || a.source === filters.source);
    return filters.order === 'oldest' ? [...list].reverse() : list;
  });
  return (
    <div class="wrap">
      <header data-stamp-anchor="heading" class="page-heading">
        <p class="eyebrow">WRITING</p>
        <h1>
          記事<span>{articles.length}</span>
        </h1>
      </header>
      <section aria-label="記事一覧">
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
              {filtered().length} 件
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
          <Show
            when={filtered().length}
            fallback={
              <p id="article-empty" class="empty-state">
                記事がありません。
              </p>
            }
          >
            {/* Remount on filter change so the new list settles in with a short stagger. */}
            <For each={[`${filters.source}|${filters.order}`]}>
              {() => <ArticleRows items={filtered()} />}
            </For>
          </Show>
        </div>
        <details class="source-details">
          <summary>
            掲載先と取得状況<span>更新 {formatDate(updatedAt)}</span>
          </summary>
          <ul>
            <For each={Object.entries(sources)}>
              {([source, status]) => (
                <li>
                  <strong>{source}</strong>
                  <span>
                    {status.reason === 'sso_required'
                      ? '認証待ち・前回のデータを表示'
                      : status.status === 'ok'
                        ? '取得済み'
                        : '前回のデータを保持'}
                    {status.lastSuccess ? ` / ${formatDate(status.lastSuccess)}` : ''}
                  </span>
                </li>
              )}
            </For>
          </ul>
          <p class="meta">
            取得できなかった掲載先は、直前のデータを残します。
            <a href="/feed.xml">
              RSSで購読
              <Icon name="ArrowUpRight" size={13} />
            </a>
          </p>
        </details>
      </section>
    </div>
  );
}
export function Works() {
  const projects = [...works].sort((a, b) => {
    const ai = featuredIds.indexOf(a.id),
      bi = featuredIds.indexOf(b.id);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
  return (
    <div class="wrap">
      <header data-stamp-anchor="heading" class="page-heading">
        <p class="eyebrow">PROJECT ARCHIVE</p>
        <h1>
          作品一覧<span>{works.length}</span>
        </h1>
        <p class="intro">個人開発・チーム開発の制作物。</p>
      </header>
      <section class="work-grid" aria-label="制作した作品">
        <For each={projects}>
          {(w, i) => (
            <article class="work-index-item" data-stamp-anchor={`work-${w.id}`}>
              <span class="work-number">{String(i() + 1).padStart(2, '0')}</span>
              <div>
                <Show when={featuredIds.includes(w.id)}>
                  <span class="work-featured-label">おすすめ</span>
                </Show>
                <h2>
                  <a href={`/works/${w.id}`}>
                    <OriginalIcon url={w.url} name={w.title} />
                    {w.title}
                    <Icon name="ArrowUpRight" size={18} />
                  </a>
                </h2>
                <p>{w.description}</p>
                <div class="tag-line">
                  {w.techStack
                    .filter((t) => ['language', 'main', 'framework'].includes(t.type))
                    .slice(0, 4)
                    .map((t) => (
                      <span>{t.label}</span>
                    ))}
                </div>
              </div>
              <Show when={true}>
                <a class="work-thumbnail" href={`/works/${w.id}`} tabindex="-1" aria-hidden="true">
                  <OGImage url={w.url} alt="" />
                  <Postmark
                    date={postmarkDate(w.productionTime)}
                    top="CP20.DEV"
                    bottom={`No.${String(i() + 1).padStart(2, '0')}`}
                  />
                </a>
              </Show>
            </article>
          )}
        </For>
      </section>
      <section class="repo-section">
        <div class="section-heading">
          <div>
            <p class="eyebrow">FROM GITHUB</p>
            <h2>最近更新したリポジトリ</h2>
          </div>
          <a class="under-link" href="https://github.com/cp-20?tab=repositories">
            GitHub
            <Icon name="ArrowUpRight" size={16} />
          </a>
        </div>
        <div class="repo-list">
          <For each={repos.slice(0, 12)}>
            {(r) => (
              <a href={r.url}>
                <h3>
                  {r.name}
                  <Icon name="ArrowUpRight" size={15} />
                </h3>
                <p>{r.description}</p>
                <small>
                  {r.language || 'Repository'} · {formatDate(r.updatedAt)}
                  {r.stars > 0 && ` · ☆ ${r.stars}`}
                </small>
              </a>
            )}
          </For>
        </div>
      </section>
    </div>
  );
}
export function WorkDetail(props: { work: (typeof works)[number] }) {
  const w = props.work;
  return (
    <div class="wrap">
      <header data-stamp-anchor="heading" class="page-heading work-heading">
        <a href="/works" class="under-link">
          <Icon name="ArrowLeft" size={16} />
          作品一覧
        </a>
        <p class="eyebrow">{w.tags.join(' / ')}</p>
        <h1>{w.title}</h1>
        <p class="intro">{w.description}</p>
        <div class="work-heading-actions">
          <a class="primary-button" href={w.url}>
            作品を開く
            <Icon name="ArrowUpRight" size={18} />
          </a>
        </div>
      </header>
      <div class="work-detail-hero" data-stamp-anchor="work-image">
        <OGImage url={w.url} alt={`${w.title}のOG画像`} priority />
        <Postmark date={postmarkDate(w.productionTime)} top="CP20.DEV" bottom="WORKS" />
      </div>
      <div class="work-detail-layout">
        <aside>
          <dl class="work-facts">
            <dt>制作時期</dt>
            <dd>{w.productionTime.replace('now', '（元サイト記載時点）')}</dd>
            <dt>使用技術</dt>
            <dd>
              {w.techStack.map((t) => (
                <span>{t.label}</span>
              ))}
            </dd>
            <dt>ソースコード</dt>
            <dd>
              {w.repositories.map((r) =>
                r === 'private' ? (
                  <span>非公開リポジトリ</span>
                ) : (
                  <a href={r}>
                    {r.replace('https://github.com/', '')}
                    <Icon name="ArrowUpRight" size={13} />
                  </a>
                ),
              )}
            </dd>
          </dl>
        </aside>
        <article class="work-detail-copy">
          <h2>制作について</h2>
          <Show when={w.id !== 'minna-no-monosashi'}>
            <p class="meta">制作当時の記録です。利用人数などは当時の記載です。</p>
          </Show>
          {w.comments.map((c) => (
            <p>{c}</p>
          ))}
          <Show when={w.relatedArticles.length > 0}>
            <h2>関連する記事</h2>
            {w.relatedArticles.map((url) => (
              <p>
                <a href={url}>
                  {articles.find((a) => a.url === url)?.title || url}
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
export function NotFound() {
  httpStatus(404);
  return (
    <div class="wrap not-found">
      <p class="eyebrow">404</p>
      <h1>ページが見つかりません。</h1>
      <a href="/" class="under-link">
        ホームへ戻る
        <Icon name="ArrowRight" size={18} />
      </a>
    </div>
  );
}
