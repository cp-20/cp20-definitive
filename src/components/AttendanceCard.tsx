import { createMemo, For, Repeat, Show } from 'solid-js';
import { articleAnchor } from './Preview.tsx';
import { formatDate, type Article } from '../content/content.ts';
/**
 * A year's attendance card, like the ones stamped at morning radio exercises: twelve rows of
 * months by thirty-one days, with a stamp on each day an article came out. Each source has its
 * own stamp and ink. A stamp shows its article on hover or focus and links to it.
 * With `onYear`, the other years' cards are stacked behind with their index tabs to switch.
 */
type Ink = { ink: string; d: string };
// Stamp faces in a 24×24 box (filled, with even-odd cutouts).
export const inks: Record<string, Ink> = {
  'trap.jp': {
    ink: '#2f4c9c',
    d: 'M12 1.5l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.6l-6.4 3.5L7 14l-5.3-5 7.2-.9zM12 9.6a2.6 2.6 0 1 0 .01 0z',
  },
  'zenn.dev': {
    ink: '#1f86c8',
    d: 'M12 2a10 10 0 1 0 .01 0zm0 4a6 6 0 1 1-.01 0zm0 3.6a2.4 2.4 0 1 0 .01 0z',
  },
  'qiita.com': {
    ink: '#3a8a2e',
    d: 'M5.5 2h13A3.5 3.5 0 0 1 22 5.5v13a3.5 3.5 0 0 1-3.5 3.5h-13A3.5 3.5 0 0 1 2 18.5v-13A3.5 3.5 0 0 1 5.5 2zm1 10.6 3.6 3.6 7.6-8.1-1.7-1.6-5.9 6.3-1.9-1.9z',
  },
  'note.com': {
    ink: '#35323a',
    d: 'M12 21.5S2.5 15.6 2.5 9A5.2 5.2 0 0 1 12 6.2 5.2 5.2 0 0 1 21.5 9c0 6.6-9.5 12.5-9.5 12.5zM7.4 7.4a2 2 0 1 0 .01 0z',
  },
  'sizu.me': {
    ink: '#7b4aa6',
    d: 'M12 1.8a4 4 0 0 1 3.9 4.9 4 4 0 0 1 3.7 6.6 4 4 0 0 1-2.6 6.9 4 4 0 0 1-5 2.6 4 4 0 0 1-5-2.6 4 4 0 0 1-2.6-6.9 4 4 0 0 1 3.7-6.6A4 4 0 0 1 12 1.8zm0 7.6a2.8 2.8 0 1 0 .01 0z',
  },
  'blog.cp20.dev': {
    ink: '#d1402c',
    d: 'M12 11.2C9 11.4 3.4 10 4.4 5.6S10.6 2 12 6.4C13.4 2 18.6 1.2 19.6 5.6S15 11.4 12 11.2zm0 1.6c3 .2 8.6-1.2 7.6 3.2S13.4 19.6 12 15.2C10.6 19.6 5.4 20.4 4.4 16s5.2-3.4 7.6-3.2z',
  },
  'm3tech.blog': { ink: '#9a5a26', d: 'M12 1.5 22.5 12 12 22.5 1.5 12zm0 5L6.5 12l5.5 5.5 5.5-5.5z' },
};
const other: Ink = { ink: '#d1402c', d: 'M12 2a10 10 0 1 0 .01 0z' };
export const inkOf = (source: string) => inks[source] ?? other;
/** One source's stamp, slanted by a steady amount per article. */
export function DayStamp(props: { source: string; url: string }) {
  const n = parseInt(articleAnchor(props.url).slice(8), 36);
  return (
    <svg
      class="day-stamp"
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ color: inkOf(props.source).ink, rotate: `${(n % 31) - 15}deg` }}
    >
      <path d={inkOf(props.source).d} fill="currentColor" fill-rule="evenodd" />
    </svg>
  );
}
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
// "2024/03/09" in Japan time → [2024, 3, 9].
export const ymd = (a: Article) => formatDate(a.date).split('/').map(Number) as [number, number, number];
export const yearOf = (a: Article) => ymd(a)[0];

export function AttendanceCard(props: {
  items: Article[];
  year: number;
  years?: { year: number; count: number }[];
  onYear?: (year: number) => void;
  shown?: (a: Article) => boolean;
  hot?: string;
  onHot?: (id: string | undefined) => void;
}) {
  const ofYear = createMemo(() => props.items.filter((a) => yearOf(a) === props.year));
  const count = createMemo(() => ofYear().filter((a) => !props.shown || props.shown(a)).length);
  // Stamps already on a day, so a second article that day lands beside the first.
  const placed = createMemo(() => {
    const seen = new Map<string, number>();
    return new Map(
      ofYear().map((a) => {
        const [, m, d] = ymd(a);
        const key = `${m}-${d}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
        return [a, { m, d, nth: seen.get(key)! - 1 }];
      }),
    );
  });
  const hover = (id?: string) => props.onHot?.(id);
  return (
    <div class="attendance" data-year={props.year % 4}>
      <Show when={props.years && props.onYear}>
        <div class="attendance-tabs" role="group" aria-label="年を選ぶ">
          <For each={props.years}>
            {(y) => (
              <button
                type="button"
                class="attendance-tab"
                data-year={y.year % 4}
                aria-pressed={y.year === props.year ? 'true' : 'false'}
                onClick={() => props.onYear!(y.year)}
              >
                {y.year}
                <small>{y.count}</small>
              </button>
            )}
          </For>
        </div>
      </Show>
      <div class="attendance-card">
        <header class="attendance-head">
          <h3>
            {props.year}
            <small>年 かいた日カード</small>
          </h3>
          <p class="attendance-name">
            なまえ<span>しーぴー</span>
          </p>
          <p class="attendance-count">
            <strong>{count()}</strong>本
          </p>
        </header>
        <div class="attendance-grid">
          <span class="attendance-corner" aria-hidden="true">
            月＼日
          </span>
          <Repeat count={31} from={1}>
            {(d) => (
              <span
                class="attendance-day"
                style={{ 'grid-column': d + 1 }}
                data-tick={d === 1 || d % 5 === 0 ? '' : undefined}
                aria-hidden="true"
              >
                {d}
              </span>
            )}
          </Repeat>
          <Repeat count={12} from={1}>
            {(m) => (
              <>
                <span class="attendance-month" style={{ 'grid-row': m + 1 }} aria-hidden="true">
                  {m}月
                </span>
                <Show when={daysIn(props.year, m) < 31}>
                  <span
                    class="attendance-void"
                    style={{ 'grid-row': m + 1, 'grid-column': `${daysIn(props.year, m) + 2} / 33` }}
                  />
                </Show>
              </>
            )}
          </Repeat>
          <For each={ofYear()}>
            {(a) => {
              const at = () => placed().get(a)!;
              const id = articleAnchor(a.url);
              return (
                <a
                  href={a.url}
                  class="attendance-stamp"
                  data-hover-target
                  data-edge={at().d < 8 ? 'start' : at().d > 24 ? 'end' : undefined}
                  data-off={props.shown && !props.shown(a) ? '' : undefined}
                  data-hot={props.hot === id ? '' : undefined}
                  data-nth={at().nth || undefined}
                  style={{ 'grid-row': at().m + 1, 'grid-column': at().d + 1 }}
                  onPointerEnter={() => hover(id)}
                  onPointerLeave={() => hover()}
                  onFocus={() => hover(id)}
                  onBlur={() => hover()}
                >
                  <DayStamp source={a.source} url={a.url} />
                  <span class="attendance-tip">
                    <span class="attendance-tip-title">{a.title}</span>
                    <span class="attendance-tip-meta">
                      {formatDate(a.date)}　{a.source}
                    </span>
                  </span>
                </a>
              );
            }}
          </For>
        </div>
      </div>
    </div>
  );
}
