import { createSignal, For } from 'solid-js';
import Icon, { KindMark } from '../components/Icon.tsx';
import Brand from '../components/Brand.tsx';
import WorkCard from '../components/WorkCard.tsx';
import Title from '../components/Title.tsx';
import { articleAnchor, responsive, sizes } from '../components/Preview.tsx';
import { AttendanceCard, SourceIcon } from '../components/AttendanceCard.tsx';
import { yearOf } from '../components/attendance.ts';
import { articles, sections, shortDate } from '../content/content.ts';
import { highlightIds, milestones } from '../data/editorial.ts';
import { localImage, seriesCover } from '../content/images.ts';
import profile from '../data/profile.json';
import tracks from '../data/tracks.json';
import series from '../data/series.json';

// What a visitor is shown first: who, what came of it (each line opens its entry on /about), and
// where to reach him (Twitter's DMs are the way in; there is no mail address).
const highlights = highlightIds.map((id) => milestones.find((m) => m.id === id)!);
const accounts = profile.links.filter((l) => l.name === 'Twitter' || l.name === 'GitHub');
// The newest works after the featured ones (the years on /works list them newest first).
const recent = sections.years.flatMap((y) => y.works).slice(0, 2);

export default function Home() {
  const [hot, setHot] = createSignal<string>();
  const track = tracks[0],
    book = series[0];
  return (
    <div class="wrap">
      <section data-stamp-anchor="intro" class="home-intro" aria-labelledby="hero-title">
        <div class="home-hello">
          <span class="avatar-stamp">
            <img
              src="/images/avatar-384.webp"
              alt="しーぴーのアイコン"
              width="132"
              height="132"
              fetchpriority="high"
            />
          </span>
          <h1 id="hero-title">
            しーぴー<span>cp20</span>
          </h1>
          <p class="home-facts">
            東京科学大学 情報工学系 学士4年。
            <br />
            フロントエンドを中心に、
            <wbr />
            バックエンドも。
          </p>
          <div class="home-accounts">
            <For each={accounts}>
              {(l) => (
                <a class="text-button" href={l.url}>
                  <Brand url={l.url} size={18} />
                  {l.name}
                </a>
              )}
            </For>
          </div>
        </div>
        <div class="highlights">
          <ul>
            <For each={highlights}>
              {(m) => (
                <li>
                  <a href={`/about#${m.id}`}>
                    <KindMark kind={m.kind} />
                    <span class="highlight-title">
                      {/* The result (優勝, 学生2位) never splits, and goes to the next line whole. */}
                      {m.title.replace(/\S+$/, '')}
                      <span class="nowrap">{m.title.match(/\S+$/)?.[0]}</span>
                      {m.ongoing && <small>{m.year}〜</small>}
                    </span>
                    <Icon name="ChevronRight" size={18} />
                  </a>
                </li>
              )}
            </For>
          </ul>
          <a href="/about" class="under-link highlights-more">
            プロフィール・経歴
            <Icon name="ArrowRight" size={16} />
          </a>
        </div>
      </section>
      <section class="home-works" aria-labelledby="featured-title" data-stamp-anchor="featured">
        <div class="section-heading">
          <h2 id="featured-title">代表作</h2>
          <a href="/works" class="under-link">
            すべての作品
            <Icon name="ArrowRight" size={16} />
          </a>
        </div>
        <div class="work-cards-large">
          <For each={sections.featured}>
            {(w, i) => <WorkCard work={w} variant="large" priority={i() === 0} eager />}
          </For>
        </div>
        <div class="home-recent-works">
          <h3>最近つくったもの</h3>
          <ul>
            <For each={recent}>
              {(w) => (
                <li>
                  <WorkCard work={w} variant="row" />
                </li>
              )}
            </For>
          </ul>
        </div>
      </section>
      <div class="home-middle">
        <section class="home-writing" aria-labelledby="writing-title">
          <div class="section-heading">
            <h2 id="writing-title">最近の記事</h2>
            <a href="/articles" class="under-link">
              すべての記事
              <Icon name="ArrowRight" size={16} />
            </a>
          </div>
          {/* The latest year's card, and the newest few by name beside it (their stamps on the
              card are marked while one is pointed at). */}
          <AttendanceCard items={articles} year={yearOf(articles[0])} hot={hot()} onHot={setHot} />
          <ul class="recent-articles">
            <For each={articles.slice(0, 3)}>
              {(a) => {
                const id = articleAnchor(a.url);
                return (
                  <li>
                    <a
                      href={a.url}
                      data-stamp-anchor={id}
                      data-hot={hot() === id || undefined}
                      onPointerEnter={(e) => e.pointerType === 'mouse' && setHot(id)}
                      onPointerLeave={(e) => e.pointerType === 'mouse' && setHot()}
                    >
                      <SourceIcon source={a.source} />
                      <span class="recent-title">
                        <Title text={a.title} />
                      </span>
                      <time datetime={a.date}>{shortDate(a.date)}</time>
                    </a>
                  </li>
                );
              }}
            </For>
          </ul>
        </section>
        <aside class="home-likes" aria-labelledby="likes-title">
          <h2 id="likes-title">好きなもの</h2>
          <div class="home-favorites">
            <a href="/about#music">
              <span class="favorite-stamp">
                <img
                  src={localImage(track.thumbnail)?.src}
                  {...responsive(localImage(track.thumbnail)?.srcset, sizes.homeTrack)}
                  alt=""
                  width="120"
                  height="90"
                  loading="lazy"
                />
                <Icon name="Music" size={16} />
              </span>
              <span class="favorite-name">{track.title}</span>
            </a>
            <a href="/about#manga">
              <span class="favorite-stamp">
                <img
                  src={seriesCover(book)?.src}
                  {...responsive(seriesCover(book)?.srcset, sizes.homeCover)}
                  alt=""
                  width="96"
                  height="136"
                  loading="lazy"
                />
                <Icon name="BookOpen" size={16} />
              </span>
              <span class="favorite-name">{book.title}</span>
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}
