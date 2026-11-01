import { For, Show } from 'solid-js';
import {
  OGImage,
  OriginalIcon,
  Postmark,
  firstRowWorks,
  postmarkDate,
  sizes,
} from '../components/Preview.tsx';
import Brand from '../components/Brand.tsx';
import { isIconImage } from '../content/icon-image.ts';
import { works, repos, formatDate } from '../content/content.ts';
import { featuredIds } from '../data/editorial.ts';
import { nameParts } from '../content/name-breaks.ts';
// GitHub's language colours, for the dot beside each repository.
const languageColors: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Kotlin: '#a97bff',
  Shell: '#89e051',
  Makefile: '#427819',
  Dart: '#00b4ab',
  Go: '#00add8',
  Ruby: '#701516',
  Rust: '#dea584',
  C: '#555555',
  Vue: '#41b883',
  CSS: '#663399',
  Jinja: '#a52a22',
};
const languageColor = (language: string) => languageColors[language] || 'transparent';
export default function Works() {
  const projects = [...works].sort((a, b) => {
    const ai = featuredIds.indexOf(a.id),
      bi = featuredIds.indexOf(b.id);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
  return (
    <div class="wrap">
      <header data-stamp-anchor="heading" class="page-heading">
        <h1>作品一覧</h1>
      </header>
      <section class="work-grid" aria-label="制作した作品">
        <For each={projects}>
          {(w, i) => (
            <article class="work-index-item" data-stamp-anchor={`work-${w.id}`}>
              <div>
                <Show when={featuredIds.includes(w.id)}>
                  <span class="work-featured-label">おすすめ</span>
                </Show>
                <h2>
                  <a href={`/works/${w.id}`}>
                    <OriginalIcon url={w.url} name={w.title} placeholder />
                    {w.title}
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
                  <OGImage
                    url={w.url}
                    alt=""
                    icon={isIconImage(w)}
                    sizes={sizes.workGrid}
                    priority={i() === 0}
                    eager={i() < firstRowWorks}
                  />
                  <Postmark date={postmarkDate(w.productionTime)} top="CP20.DEV" bottom="WORKS" />
                </a>
              </Show>
            </article>
          )}
        </For>
      </section>
      <section class="repo-section">
        <div class="section-heading">
          <h2>最近更新したリポジトリ</h2>
          <a class="under-link" href="https://github.com/cp-20?tab=repositories">
            <Brand url="https://github.com" />
            GitHub
          </a>
        </div>
        {/* A ledger: one line per repository, columns aligned for scanning. */}
        <ol class="repo-list">
          <For each={repos.slice(0, 12)}>
            {(r) => (
              <li>
                <a href={r.url}>
                  <span class="repo-name">
                    {nameParts(r.name).map((part, i) => (i ? [<wbr />, part] : part))}
                    <Show when={r.stars > 0}>
                      <small aria-label={`スター ${r.stars}`}>☆{r.stars}</small>
                    </Show>
                  </span>
                  <span class="repo-description">{r.description}</span>
                  <span class="repo-language" style={{ '--lang': languageColor(r.language) }}>
                    {r.language}
                  </span>
                  <time class="repo-date" datetime={r.updatedAt}>
                    {formatDate(r.updatedAt)}
                  </time>
                </a>
              </li>
            )}
          </For>
        </ol>
      </section>
    </div>
  );
}
