import { For } from 'solid-js';
import Icon from '../components/Icon.tsx';
import { responsive, sizes } from '../components/Preview.tsx';
import Bookshelf from '../components/Bookshelf.tsx';
import Brand from '../components/Brand.tsx';
import Modal, { openModal } from '../components/Modal.tsx';
import { milestones } from '../data/editorial.ts';
import { localImage } from '../content/images.ts';
import profile from '../data/profile.json';
import tracks from '../data/tracks.json';
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

          <p>
            フロントエンドを中心に、バックエンドやインフラも触っています。
            <br class="desktop-break" />
            個人開発ではWebアプリやCコンパイラなどをつくっています。
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
      <div class="profile-history-layout">
        <aside class="profile-details">
          <h2>所属</h2>
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
              {(m, i) => {
                const id = `milestone-${i()}`;
                // An entry opens its dialog only when there is more to say than the line itself.
                const expandable = m.detail.length > 0 || m.links.length > 0;
                return (
                  <>
                    <div class="timeline-item" data-expandable={expandable || undefined}>
                      <div class="timeline-date">
                        <time datetime={m.year.replace('.', '-')}>{m.year}</time>
                        <span>{m.grade}</span>
                      </div>
                      <div>
                        <h3>
                          {expandable ? (
                            <button type="button" aria-haspopup="dialog" onClick={() => openModal(id)}>
                              {m.title}
                              <Icon name="Plus" size={15} stroke={2.5} />
                            </button>
                          ) : (
                            m.title
                          )}
                        </h3>
                        <p>{m.text}</p>
                      </div>
                    </div>
                    {expandable && (
                      <Modal id={id} title={m.title}>
                        <p class="modal-meta">
                          <time datetime={m.year.replace('.', '-')}>{m.year}</time>
                          <span>{m.grade}</span>
                        </p>
                        {(m.detail.length ? m.detail : [m.text]).map((d) => (
                          <p>{d}</p>
                        ))}
                        {m.links.length > 0 && (
                          <ul class="modal-links">
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
