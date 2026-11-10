import Brand from '../components/Brand.tsx';
import Icon from '../components/Icon.tsx';
import { sizes } from '../components/Preview.tsx';
import WorkCard, { OutcomeMark, WorkImage } from '../components/WorkCard.tsx';
import Title from '../components/Title.tsx';
import { SourceIcon } from '../components/AttendanceCard.tsx';
import { articles, editionWorks, sections, shortDate, type Work } from '../content/content.ts';
import { splitLinks } from '../content/inline-links.ts';
import {
  kindLabel,
  membersSite,
  neighbours,
  openLink,
  period,
  publicRepositories,
  statusLabel,
} from '../content/works.ts';
/* U+2060 WORD JOINER: no line break between a link's last character and its trailing arrow. */
const WORD_JOINER = '⁠';

/**
 * A work's page. Above the fold: what it is, the facts that make it worth a look (the result first)
 * and the way to open it, beside a picture of it. Then the owner's notes in their own words, the
 * articles about it, and the works before and after it on /works.
 */
export default function WorkDetail(props: { work: Work }) {
  const w = props.work;
  // Only articles still in the list: the scheduled refresh keeps building when a source drops one.
  const related = w.relatedArticles.flatMap((url) => articles.filter((a) => a.url === url));
  const open = openLink(w);
  const site = membersSite(w);
  const more = [...(site ? [site] : []), ...(w.links ?? []).filter((l) => l.url !== open?.href)].map((l) =>
    'href' in l ? l : { href: l.url, label: l.label },
  );
  const repositories = publicRepositories(w, open?.href);
  const edition = editionWorks.find((e) => e.id === w.id);
  const facts = [
    w.outcome && { label: '成果', value: w.outcome, outcome: true },
    w.role && { label: '役割', value: w.role },
    { label: w.kind === 'event' ? '開催' : '期間', value: period(w.productionTime) },
    edition && { label: '技術', value: edition.tech },
    statusLabel(w) && { label: '公開', value: statusLabel(w)! },
  ].filter((f) => !!f);
  const kind = kindLabel(w);
  const phone = !!w.screenshots?.some((s) => s.device === 'mobile');
  return (
    <div class="wrap work-page">
      <div class={['work-top', { 'with-phone': phone }]}>
        <header class="work-intro" data-stamp-anchor="heading">
          <a href="/works" class="back-link">
            <Icon name="ArrowLeft" size={16} />
            作品一覧
          </a>
          {kind && <p class="work-kind">{kind}</p>}
          <h1>
            <span class="work-title">{w.title}</span>
          </h1>
          <p class="work-summary">{w.summary ?? w.description}</p>
          <dl class="work-facts">
            {facts.map((f) => (
              <div class={{ 'work-fact-outcome': 'outcome' in f }}>
                <dt>{f.label}</dt>
                <dd>
                  {'outcome' in f && <OutcomeMark />}
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
          {(open || repositories.length > 0 || more.length > 0) && (
            <div class="work-actions">
              {open && (
                <a class="primary-button" href={open.href}>
                  {open.label}
                  <Icon name="ArrowUpRight" size={18} />
                </a>
              )}
              {repositories.map((r) => (
                <a class="repo-link" href={r.url}>
                  <Brand url={r.url} />
                  {r.name}
                </a>
              ))}
              {more.map((l) => (
                <a class="text-button" href={l.href}>
                  {l.label}
                  <Icon name="ArrowUpRight" size={15} />
                </a>
              ))}
            </div>
          )}
        </header>
        <div class="work-hero" data-stamp-anchor="work-image">
          <WorkImage work={w} sizes={sizes.workHero} describe priority />
          {phone && (
            <div class="work-hero-phone">
              <WorkImage work={w} device="mobile" sizes={sizes.workPhone} describe eager />
            </div>
          )}
        </div>
      </div>
      <div class="work-body">
        <section aria-labelledby="work-notes">
          <h2 id="work-notes">{w.kind === 'event' ? '開催メモ' : '制作メモ'}</h2>
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
        </section>
        {related.length > 0 && (
          <section aria-labelledby="work-related">
            <h2 id="work-related">関連する記事</h2>
            <ul class="related-articles">
              {related.map((a) => (
                <li>
                  <a href={a.url}>
                    <SourceIcon source={a.source} />
                    <span>
                      <span class="related-title">
                        <Title text={a.title} />
                      </span>
                      {WORD_JOINER}
                      <Icon name="ArrowUpRight" size={15} />
                    </span>
                    <time datetime={a.date}>{shortDate(a.date)}</time>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <nav class="work-neighbours" aria-labelledby="work-more">
        <h2 id="work-more" class="works-heading">
          ほかの作品
        </h2>
        <div class="work-cards-small">
          {neighbours(sections.order, w.id).map((n) => (
            <WorkCard work={n} />
          ))}
        </div>
        <a class="text-button works-back" href="/works">
          作品一覧へ
          <Icon name="ChevronRight" size={16} />
        </a>
      </nav>
    </div>
  );
}
