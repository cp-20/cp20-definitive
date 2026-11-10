import { For } from 'solid-js';
import Icon, { KindMark } from '../components/Icon.tsx';
import { responsive, sizes } from '../components/Preview.tsx';
import Bookshelf from '../components/Bookshelf.tsx';
import Brand from '../components/Brand.tsx';
import Modal, { openModal } from '../components/Modal.tsx';
import Title from '../components/Title.tsx';
import { milestones, speedups } from '../data/editorial.ts';
import { localImage } from '../content/images.ts';
import { splitEmphasis } from '../content/emphasis.ts';
import { works } from '../content/content.ts';
import { workPath } from '../site/pages.ts';
import profile from '../data/profile.json';
import tracks from '../data/tracks.json';
// A line of the history with its figures in bold and a name that is code in the monospace face.
function Emphasis(props: { text: string }) {
  return (
    <>
      {splitEmphasis(props.text).map((p) =>
        'strong' in p ? <strong>{p.strong}</strong> : 'code' in p ? <code>{p.code}</code> : p.text,
      )}
    </>
  );
}
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
          <h1>
            <small class="visually-hidden">プロフィール：</small>
            しーぴー<span>cp20</span>
          </h1>

          {/* Breaks between phrases in every browser (Safari has no word-break: auto-phrase). */}
          <p>
            フロントエンドを
            <wbr />
            中心に、
            <wbr />
            バックエンドや
            <wbr />
            インフラも
            <wbr />
            触っています。
            <br class="desktop-break" />
            個人開発では
            <wbr />
            Webアプリや
            <wbr />
            Cコンパイラなどを
            <wbr />
            つくっています。
          </p>
          <div class="profile-links">
            <For each={profile.links}>
              {(l) => (
                <a href={l.url}>
                  <Brand url={l.url} />
                  {l.name}
                </a>
              )}
            </For>
          </div>
        </div>
      </header>
      <section class="speed-section" data-stamp-anchor="speed" aria-labelledby="speed-title">
        <div class="section-heading">
          <h2 id="speed-title">速くしてきたもの</h2>
        </div>
        <ul class="speed-stamps">
          <For each={speedups}>
            {(s) => (
              <li>
                <button type="button" aria-haspopup="dialog" onClick={() => openModal(s.id)}>
                  <span class="speed-place">{s.place}</span>
                  <span class="speed-what">{s.what}</span>
                  <span class="speed-figure">
                    {s.from && (
                      <span class="speed-from">
                        {s.from}
                        <span aria-hidden="true"> →</span>
                        <span class="visually-hidden">から</span>
                      </span>
                    )}
                    <strong>
                      {/* The digits are the denomination; 約, the unit and the like stay small. */}
                      {s.to.split(/([\d.,]+)/).map((part, i) => (i % 2 ? <span>{part}</span> : part))}
                    </strong>
                  </span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </section>
      <div class="profile-history-layout">
        <aside class="profile-details" aria-labelledby="affiliations-title">
          <h2 id="affiliations-title">所属</h2>
          <ul class="profile-affiliations">
            <For each={profile.affiliations}>
              {(a) => (
                <li>
                  <a href={a.url}>
                    <Brand url={a.url} size={18} />
                    {a.name}
                  </a>
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
            <h2 id="history-title">経歴</h2>
          </div>
          <div class="timeline">
            <For each={milestones}>
              {(m) => {
                const work = m.work ? works.find((w) => w.id === m.work) : undefined;
                // An entry opens its dialog only when there is more to say than the line itself.
                const expandable = m.detail.length > 0 || m.links.length > 0 || !!work;
                return (
                  <>
                    <div class="timeline-item" data-expandable={expandable || undefined}>
                      <KindMark kind={m.kind} />
                      <div class="timeline-date">
                        <time datetime={m.year.replace('.', '-')}>{m.year}</time>
                        <span>{m.grade}</span>
                      </div>
                      <div>
                        <h3>
                          {expandable ? (
                            <button
                              type="button"
                              aria-haspopup="dialog"
                              data-opens={m.id}
                              onClick={() => openModal(m.id)}
                            >
                              {m.title}
                              <span class="timeline-more" aria-hidden="true">
                                <Icon name="Plus" size={14} stroke={3} />
                              </span>
                            </button>
                          ) : (
                            m.title
                          )}
                        </h3>
                        <p>
                          <Emphasis text={m.text} />
                        </p>
                      </div>
                    </div>
                    {expandable && (
                      <Modal id={m.id} title={<Title text={m.title} />}>
                        <p class="modal-meta">
                          <time datetime={m.year.replace('.', '-')}>{m.year}</time>
                          <span>{m.grade}</span>
                        </p>
                        {(m.detail.length ? m.detail : [m.text]).map((d) => (
                          <p>
                            <Emphasis text={d} />
                          </p>
                        ))}
                        {(work || m.links.length > 0) && (
                          <ul class="modal-links">
                            {work && (
                              <li>
                                <a href={workPath(work.id)}>
                                  <Icon name="Folder" size={16} />
                                  {work.title}
                                </a>
                              </li>
                            )}
                            {m.links.map((l) => (
                              <li>
                                <a href={l.url}>
                                  <Brand url={l.url} />
                                  {l.label}
                                </a>
                              </li>
                            ))}
                          </ul>
                        )}
                      </Modal>
                    )}
                  </>
                );
              }}
            </For>
          </div>
        </section>
      </div>
      <div class="favorites-heading">
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
    </div>
  );
}
