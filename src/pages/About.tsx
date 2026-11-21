import { For } from 'solid-js';
import Icon, { KindMark } from '../components/Icon.tsx';
import { responsive, sizes } from '../components/Preview.tsx';
import Bookshelf from '../components/Bookshelf.tsx';
import Brand from '../components/Brand.tsx';
import Modal, { openModal } from '../components/Modal.tsx';
import Title from '../components/Title.tsx';
import { affiliations, awardCards, internCards, milestones } from 'virtual:cp20-editorial';
import { localImage } from '../content/images.ts';
import { splitEmphasis } from '../content/emphasis.ts';
import { works } from '../content/content.ts';
import { workPath } from '../site/pages.ts';
import profile from '../data/profile.json';
import tracks from '../data/tracks.json';
// A line of the history with its figures written by hand.
function Emphasis(props: { text: string }) {
  return <>{splitEmphasis(props.text).map((p) => ('strong' in p ? <strong>{p.strong}</strong> : p.text))}</>;
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
      <section class="awards-section" data-stamp-anchor="awards" aria-labelledby="awards-title">
        <div class="section-heading">
          <h2 id="awards-title">主な受賞</h2>
        </div>
        <ul class="award-stamps">
          <For each={awardCards}>
            {(a) => (
              <li>
                <button type="button" aria-haspopup="dialog" onClick={() => openModal(a.id)}>
                  <span class="award-year">{a.year}</span>
                  <span class="award-event">{a.event}</span>
                  <span class="award-result">{a.result}</span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </section>
      <section class="interns-section" data-stamp-anchor="interns" aria-labelledby="interns-title">
        <div class="section-heading">
          <h2 id="interns-title">インターン</h2>
        </div>
        <ul class="intern-list">
          <For each={internCards}>
            {(i) => (
              <li>
                <button type="button" aria-haspopup="dialog" onClick={() => openModal(i.id)}>
                  <KindMark kind="intern" />
                  <span class="intern-body">
                    <span class="intern-head">
                      <span class="intern-company">{i.company}</span>
                      <span class="intern-period">{i.period}</span>
                    </span>
                    <span class="intern-summary">{i.summary}</span>
                  </span>
                  <Icon name="ChevronRight" size={16} stroke={2.2} class="intern-chevron" />
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
            <For each={affiliations}>
              {(a) => (
                <li>
                  <a href={a.url}>
                    <Brand url={a.url} size={18} />
                    <span class="affiliation-label">{a.name}</span>
                  </a>
                  {a.sub?.map((s) => (
                    <small>
                      <a href={s.url}>
                        <span class="affiliation-label">{s.name}</span>
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
                              title="詳しい説明を開く"
                              onClick={() => openModal(m.id)}
                            >
                              <span class="timeline-title">{m.title}</span>
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
