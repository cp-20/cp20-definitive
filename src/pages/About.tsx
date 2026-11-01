import { For } from 'solid-js';
import Icon from '../components/Icon';
import { responsive, sizes } from '../components/Preview';
import Bookshelf from '../components/Bookshelf';
import { milestones, mangaCovers } from '../data/editorial';
import { localImage } from '../data/images';
import profile from '../data/profile.json';
import tracks from '../data/tracks.json';
import series from '../data/series.json';
export default function About() {
  return (
    <div class="wrap about-page">
      <header class="profile-header" data-stamp-anchor="profile">
        <div class="profile-avatar">
          <span class="avatar-stamp">
            <img
              src="/images/avatar-384.webp"
              width="208"
              height="208"
              alt="しーぴーのアイコン"
              fetchpriority="high"
            />
          </span>
        </div>
        <div class="profile-intro">
          <p class="eyebrow">PROFILE / WEB ENGINEER</p>
          <h1>
            <small class="visually-hidden">プロフィール：</small>
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
            音楽
          </h3>
        </div>
        <div class="music-list">
          <For each={tracks}>
            {(t) => (
              <a class="music-item" href={t.link}>
                <div class="music-image">
                  <img
                    src={localImage(t.thumbnail)?.src}
                    {...responsive(localImage(t.thumbnail)?.srcset, sizes.track)}
                    alt=""
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
                  <h4>{t.title}</h4>
                  <p>{t.composer}</p>
                </div>
              </a>
            )}
          </For>
        </div>
      </section>
      <section data-stamp-anchor="manga" id="manga" class="media-section" aria-labelledby="manga-title">
        <div class="section-heading">
          <h3 id="manga-title">
            <Icon name="BookOpen" />
            漫画
          </h3>
        </div>
        <Bookshelf />
      </section>
      <section id="credits" class="credits" data-stamp-anchor="credits" aria-labelledby="credits-title">
        <h2 id="credits-title">クレジット・出典</h2>
        <dl>
          <dt>アイコン</dt>
          <dd>
            <a href="https://twitter.com/sora_douhu">空どうふ（@sora_douhu）</a>
          </dd>
          <dt>音楽</dt>
          <dd>
            <a href="https://2026.cp20.dev/featured-tracks">2026版のおすすめ曲</a>
            から。サムネイルは YouTube（各動画の投稿者）
          </dd>
          <dt>漫画の表紙</dt>
          <dd class="credits-list">
            <For each={series}>
              {(s) => (
                <span>
                  {s.title}：
                  <a href={mangaCovers[s.title]?.url ?? s.link}>{mangaCovers[s.title]?.source ?? s.credit}</a>
                </span>
              )}
            </For>
          </dd>
          <dt>作品・記事の画像</dt>
          <dd>各作品・記事の公開ページの OG 画像</dd>
          <dt>素材</dt>
          <dd>
            <a href="https://lucide.dev">Lucide</a>（ISC、一部は Feather 由来で MIT）、シールの絵柄は{' '}
            <a href="https://github.com/jdecked/twemoji">Twemoji</a>（© Twitter, Inc and other contributors、
            <a href="/stamps/LICENSE-GRAPHICS.txt">CC BY 4.0</a>
            ）、フォントは Zen Maru Gothic / IBM Plex Mono（SIL OFL 1.1）
          </dd>
          <dt>ライブラリ</dt>
          <dd>
            SolidJS（MIT）、Firebase（Apache-2.0）ほか。
            <a href="/third-party-licenses.txt">ライセンス全文</a>
          </dd>
        </dl>
        <p class="meta">画像・楽曲の権利は各権利者に帰属します。</p>
      </section>
    </div>
  );
}
