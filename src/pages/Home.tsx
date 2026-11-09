import { createSignal, For } from 'solid-js';
import Icon from '../components/Icon.tsx';
import { articleAnchor, responsive, sizes } from '../components/Preview.tsx';
import Projects from '../components/Projects.tsx';
import { AttendanceCard, DayStamp } from '../components/AttendanceCard.tsx';
import { yearOf } from '../components/attendance.ts';
import { articles, formatDate } from '../content/content.ts';
import { editions } from '../data/editorial.ts';
import { localImage, seriesCover } from '../content/images.ts';
import tracks from '../data/tracks.json';
import series from '../data/series.json';
export default function Home() {
  const [hot, setHot] = createSignal<string>();
  return (
    <div class="wrap">
      <section data-stamp-anchor="intro" class="home-intro" aria-labelledby="hero-title">
        <div class="identity">
          <span class="avatar-stamp">
            <img
              src="/images/avatar-384.webp"
              alt="しーぴーのアイコン"
              width="88"
              height="88"
              fetchpriority="high"
            />
          </span>
          <div>
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
        </a>
      </section>
      <Projects />
      <div class="home-middle">
        <section class="home-writing" aria-labelledby="writing-title">
          <div class="section-heading">
            <h2 id="writing-title">最近の記事</h2>
            <a href="/articles" class="under-link">
              すべて見る
            </a>
          </div>
          {/* The latest year's card, and the newest few by name under it (their stamps on the card
              are marked while one is pointed at). */}
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
                      <DayStamp source={a.source} url={a.url} />
                      <span class="recent-title">{a.title}</span>
                      <time datetime={a.date}>{formatDate(a.date)}</time>
                    </a>
                  </li>
                );
              }}
            </For>
          </ul>
        </section>
        <aside class="home-profile">
          <h2>プロフィール</h2>
          <p>フロントエンドを中心に開発しています。漫画とボカロが好きです。</p>
          <div class="home-favorites">
            <a href="/about#music">
              <img
                src={localImage(tracks[0].thumbnail)?.src}
                {...responsive(localImage(tracks[0].thumbnail)?.srcset, sizes.homeTrack)}
                alt={tracks[0].title}
                width="120"
                height="90"
                loading="lazy"
              />
              <Icon name="Music" size={16} />
            </a>
            <a href="/about#manga">
              <img
                src={seriesCover(series[0])?.src}
                {...responsive(seriesCover(series[0])?.srcset, sizes.homeCover)}
                alt={series[0].title}
                width="96"
                height="136"
                loading="lazy"
              />
              <Icon name="BookOpen" size={16} />
            </a>
          </div>
          <a href="/about" class="under-link">
            プロフィールを見る
          </a>
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
              </a>
            )}
          </For>
        </div>
      </section>
    </div>
  );
}
