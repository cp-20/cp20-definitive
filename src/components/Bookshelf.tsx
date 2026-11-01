import { createSignal, For } from 'solid-js';
import Icon from './Icon.tsx';
import { responsive, sizes } from './Preview.tsx';
import { mangaCovers } from '../data/editorial.ts';
import { seriesCover } from '../content/images.ts';
import { spineAuthor } from '../content/series-credit.ts';
import series from '../data/series.json';
// Spines on a shelf; choosing one pulls that book out so its cover faces you. The shelf is a
// tablist like the featured works: one stop for Tab, the arrow keys (and Home/End) move along it,
// and the caption below is the panel. The chosen book's name is read on focus, so the caption
// is not a live region (it would read the title a second time).
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
  return (
    <>
      <div class="bookshelf" ref={shelf} role="tablist" aria-label="本棚" onKeyDown={keyboard}>
        <For each={series}>
          {(s, i) => (
            <button
              id={`book-${i()}`}
              class="book"
              role="tab"
              aria-label={`${s.title} ${s.author}`}
              aria-selected={open() === i() ? 'true' : 'false'}
              aria-controls="book-caption"
              tabindex={open() === i() ? 0 : -1}
              style={{ '--spine': mangaCovers[s.title]?.spine, '--spine-ink': mangaCovers[s.title]?.ink }}
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
                <strong>{s.title}</strong>
                <small>{spineAuthor(s.author)}</small>
              </span>
            </button>
          )}
        </For>
      </div>
      <p id="book-caption" class="book-caption" role="tabpanel" aria-labelledby={`book-${open()}`}>
        <For each={[series[open()]]}>
          {(s) => (
            <>
              <a href={s.link}>
                {s.title}
                <Icon name="ArrowUpRight" size={15} />
              </a>
              <span>{s.author}</span>
            </>
          )}
        </For>
      </p>
    </>
  );
}
