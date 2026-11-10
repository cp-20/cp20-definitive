import { createSignal, createEffect, onSettled, flush } from 'solid-js';
import { ArticleRows } from '../components/ArticleRows.tsx';
import { AttendanceCard } from '../components/AttendanceCard.tsx';
import { yearOf, yearsOf } from '../components/attendance.ts';
import { reflow } from '../components/reflow.ts';
import { articles, type Article } from '../content/content.ts';
// One year's attendance card is open at a time (the latest by default), with that year's
// articles listed beside it. The year is kept in the URL.
const years = yearsOf(articles);
const latest = years.at(-1)!;
export default function Articles() {
  const [year, setYear] = createSignal(latest);
  const [ready, setReady] = createSignal(false);
  const readYear = () => {
    const asked = Number(new URLSearchParams(location.search).get('year'));
    setYear(years.includes(asked) ? asked : latest);
  };
  onSettled(() => {
    readYear();
    setReady(true);
    document.addEventListener('cp20:navigation', readYear);
    return () => {
      document.removeEventListener('cp20:navigation', readYear);
      // A fade still running when the page is swapped out would hold the old page in the
      // document's animation timeline until the next animation frame, which may be a while.
      for (const a of results.getAnimations({ subtree: true })) a.cancel();
    };
  });
  createEffect(
    () => ({ ready: ready(), year: year() }),
    (value) => {
      if (!value.ready) return;
      const query = value.year === latest ? '' : `?year=${value.year}`;
      history.replaceState(history.state, '', location.pathname + query);
    },
  );
  const inYear = (a: Article) => yearOf(a) === year();
  const [hot, setHot] = createSignal<string>();
  let results!: HTMLDivElement;
  // Another year starts its list from the top: from far down a long year, the card (which
  // stays on screen beside the list) would open a shorter list above the screen. The rows
  // cross-fade (a page arrival just shows them).
  const chooseYear = (to: number) => {
    const top = results.getBoundingClientRect().top;
    if (top < 0) scrollBy({ top: top - 24, behavior: 'instant' });
    reflow(results.querySelector('.article-list')!, () => {
      setYear(to);
      flush();
    });
  };
  return (
    <div class="wrap">
      <header data-stamp-anchor="heading" class="page-heading">
        <h1>記事</h1>
      </header>
      <section aria-labelledby="article-list-title">
        <h2 id="article-list-title" class="visually-hidden">
          記事一覧
        </h2>
        <div class="article-results attendance-desk" ref={results}>
          <AttendanceCard
            items={articles}
            year={year()}
            years={years}
            onYear={chooseYear}
            hot={hot()}
            onHot={setHot}
          />
          {/* The rows stay mounted: another year only hides and shows them, so the list is never
              rebuilt and its images stay loaded. */}
          <ArticleRows items={articles} shown={inYear} hot={hot()} onHot={setHot} />
        </div>
      </section>
    </div>
  );
}
