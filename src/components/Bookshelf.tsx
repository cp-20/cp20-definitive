import { createSignal, For } from 'solid-js';
import Icon from './Icon.tsx';
import { responsive, sizes } from './Preview.tsx';
import { mangaCovers } from '../data/editorial.ts';
import { seriesCover } from '../content/images.ts';
import { spineAuthor } from '../content/series-credit.ts';
import series from '../data/series.json';
// Spines on a shelf; choosing one pulls that book out so its cover faces you. Every book keeps its
// slot; the books after the open one only slide over (data-after), so the page never reflows. The
// shelf is a tablist like the featured works: one stop for Tab, the arrow keys (and Home/End) move
// along it, and the caption on the board (below it on phones) is the panel. The chosen book's name
// is read on focus, so the caption is not a live region (it would read the title a second time).
// On phones the shelf scrolls sideways, and the chosen book is scrolled into view once it has
// opened.
export default function Bookshelf() {
  const [open, setOpen] = createSignal(0);
  let shelf!: HTMLDivElement;
  const keyboard = (e: KeyboardEvent) => {
    const last = series.length - 1;
    const next = {
      ArrowRight: open() === last ? 0 : open() + 1,
      ArrowLeft: open() === 0 ? last : open() - 1,
      Home: 0,
      End: last,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setOpen(next);
    (shelf.children[next] as HTMLElement).focus();
  };
  const reveal = (e: TransitionEvent) => {
    const book = e.target as HTMLElement;
    if (e.propertyName === 'clip-path' && book.getAttribute('aria-selected') === 'true')
      // The cover, not the slot: the slot is only a spine wide.
      book
        .querySelector('.book-cover')!
        .scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  };
  return (
    <div class="shelf-row">
      <div
        class="bookshelf"
        ref={shelf}
        role="tablist"
        aria-label="本棚"
        onKeyDown={keyboard}
        onTransitionEnd={reveal}
      >
        <For each={series}>
          {(s, i) => (
            <button
              id={`book-${i()}`}
              class="book"
              role="tab"
              aria-label={`${s.title} ${s.author}`}
              aria-selected={open() === i() ? 'true' : 'false'}
              data-after={i() > open() || undefined}
              aria-controls="book-caption"
              tabindex={open() === i() ? 0 : -1}
              style={{
                '--spine': mangaCovers[s.title]?.spine,
                '--spine-ink': mangaCovers[s.title]?.ink,
                '--length': [...s.title].length,
                '--face-x': mangaCovers[s.title]?.face[0] ?? 0.5,
                '--face-y': mangaCovers[s.title]?.face[1] ?? 0.35,
                '--zoom': mangaCovers[s.title]?.zoom ?? 2.2,
                '--author-length': [...spineAuthor(s.author)].length,
              }}
              onClick={() => setOpen(i())}
            >
              <img
                class="book-cover"
                src={seriesCover(s)?.src}
                {...responsive(seriesCover(s)?.srcset, sizes.bookCover)}
                alt=""
                width="480"
                height="682"
                loading="lazy"
              />
              <span class="book-spine" aria-hidden="true">
                {/* As on a real volume: a character at the head, the title set to fill the spine
                    with the author under it, and the band at the foot. */}
                <span class="book-art">
                  <img
                    src={seriesCover(s)?.src}
                    {...responsive(seriesCover(s)?.srcset, sizes.bookCover)}
                    alt=""
                    loading="lazy"
                  />
                </span>
                {/* A long title and its author would not both fit in one line down the spine;
                    as on such a volume, the author then stands beside the title at its foot. */}
                <span
                  class="book-name"
                  data-beside={[...s.title].length + [...spineAuthor(s.author)].length > 15 || undefined}
                >
                  <strong>{s.title}</strong>
                  <small>{spineAuthor(s.author)}</small>
                </span>
              </span>
            </button>
          )}
        </For>
      </div>
      {/* Every caption sits in the same cell and only the chosen one is visible, so the panel is
          as tall as the longest title from the start and nothing below it moves on a change. */}
      <div id="book-caption" class="book-caption" role="tabpanel" aria-labelledby={`book-${open()}`}>
        <For each={series}>
          {(s, i) => (
            <p data-open={open() === i() || undefined}>
              <a href={s.link}>
                {s.title}
                <Icon name="ArrowUpRight" size={15} />
              </a>
              <span>{s.author}</span>
            </p>
          )}
        </For>
      </div>
    </div>
  );
}
