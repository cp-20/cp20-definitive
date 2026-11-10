import { For } from 'solid-js';
import Brand from '../components/Brand.tsx';
import Icon from '../components/Icon.tsx';
import WorkCard from '../components/WorkCard.tsx';
import { editionWorks, repos, sections, shortDate } from '../content/content.ts';
import { nameParts } from '../content/name-breaks.ts';

/** Recently updated repositories that say what they are (a bare name tells a visitor nothing). */
export const describedRepos = repos.filter((r) => r.description.trim()).slice(0, 6);

export default function Works() {
  const { featured, years, events } = sections;
  return (
    <div class="wrap works-page">
      <header data-stamp-anchor="heading" class="page-heading">
        <h1>作品一覧</h1>
        <p class="intro works-lead">2022年から、個人開発を中心につくってきたもの。</p>
      </header>
      <section class="works-section" aria-labelledby="works-featured">
        <h2 id="works-featured" class="works-heading">
          代表作
        </h2>
        <div class="work-cards-large">
          <For each={featured}>
            {(w, i) => <WorkCard work={w} variant="large" priority={i() === 0} eager />}
          </For>
        </div>
      </section>
      {/* One postmark per year instead of one on every work. */}
      <For each={years}>
        {(group) => (
          <section class="works-year" aria-labelledby={`works-${group.year}`}>
            <h2 id={`works-${group.year}`} class="year-mark">
              <span>{group.year}</span>
            </h2>
            <div class="work-cards-small">
              <For each={group.works}>{(w) => <WorkCard work={w} />}</For>
            </div>
          </section>
        )}
      </For>
      <section class="works-section" aria-labelledby="works-events">
        <h2 id="works-events" class="works-heading">
          主催したイベント
        </h2>
        <div class="work-cards-small">
          <For each={events}>{(w) => <WorkCard work={w} />}</For>
        </div>
      </section>
      {/* The only place where the framework is the point: each year's edition was built anew. */}
      <section class="works-section" aria-labelledby="works-editions">
        <h2 id="works-editions" class="works-heading">
          歴代の cp20.dev
        </h2>
        <p class="works-note">毎年、違うフレームワークで作り直してきたポートフォリオ。</p>
        <ol class="edition-stamps">
          <For each={editionWorks}>
            {(e) => (
              <li>
                <a href={`/works/${e.id}`} data-stamp-anchor={`work-${e.id}`}>
                  <strong>{e.year}</strong>
                  <span>{e.tech}</span>
                </a>
              </li>
            )}
          </For>
        </ol>
      </section>
      <section class="works-section" aria-labelledby="works-github">
        <div class="works-heading-row">
          <h2 id="works-github" class="works-heading">
            GitHub の最近の動き
          </h2>
          <a class="text-button" href="https://github.com/cp-20?tab=repositories">
            <Brand url="https://github.com" />
            すべてのリポジトリ
            <Icon name="ArrowUpRight" size={15} />
          </a>
        </div>
        <ol class="repo-activity">
          <For each={describedRepos}>
            {(r) => (
              <li>
                <a href={r.url}>
                  <span class="repo-name">
                    {nameParts(r.name).map((part, i) => (i ? [<wbr />, part] : part))}
                  </span>
                  <span class="repo-description">{r.description}</span>
                  <time datetime={r.updatedAt}>{shortDate(r.updatedAt)}</time>
                </a>
              </li>
            )}
          </For>
        </ol>
      </section>
    </div>
  );
}
