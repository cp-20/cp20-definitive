import { createMemo, createSignal, For, onSettled, Show } from 'solid-js';
import { articleAnchor } from './Preview.tsx';
import { daysIn, nearest, spot, stampsOf, step, tipPlace, yearOf, type Stamp } from './attendance.ts';
import { formatDate, type Article } from '../content/content.ts';
/** A source's stamp (its face and ink are in app.css), slanted by a steady amount per article. */
export function DayStamp(props: { source: string; url: string }) {
  const tilt = (parseInt(articleAnchor(props.url).slice(8), 36) % 31) - 15;
  return (
    <span class="day-stamp" data-ink={props.source} style={{ rotate: `${tilt}deg` }} aria-hidden="true" />
  );
}
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const MONTHS = DAYS.slice(0, 12);
// How far from a stamp's centre a tap still picks it.
const REACH = 26;

/**
 * A year's attendance card, like the ones stamped at morning radio exercises: twelve rows of
 * months by thirty-one days, with a stamp on each day an article came out. A stamp is a link to
 * its article and shows its title on a slip on hover or focus, which Escape puts away. The card
 * is one Tab stop; the arrow keys walk its stamps (attendance.ts). On a touch screen a tap picks
 * the stamp nearest to it, as the days are only a few pixels wide, and shows its slip; a tap on
 * the picked stamp or its slip opens the article.
 * With `shown`, the stamps it rejects are faded and skipped. With `years` and `onYear`, the
 * other years' cards are stacked behind with index tabs to open them. `hot` is the stamp (by
 * article anchor) to mark, and `onHot` hears which one is pointed at.
 */
export function AttendanceCard(props: {
  items: Article[];
  year: number;
  years?: number[];
  onYear?: (year: number) => void;
  shown?: (a: Article) => boolean;
  hot?: string;
  onHot?: (id: string | undefined) => void;
}) {
  const shown = (a: Article) => !props.shown || props.shown(a);
  const stamps = createMemo(() => stampsOf(props.items, props.year));
  const live = createMemo(() => stamps().filter((s) => shown(s.a)));
  const id = (s: Stamp) => articleAnchor(s.a.url);
  // The card's one Tab stop: the stamp last stepped to, else the first.
  const [current, setCurrent] = createSignal<Stamp>();
  const tabStop = () => (current() && live().includes(current()!) ? current() : live()[0]);
  const [picked, setPicked] = createSignal<string>();
  const pick = (to?: string) => {
    setPicked(to);
    props.onHot?.(to);
  };
  // Escape hides the slip in view until another stamp is pointed at or stepped to.
  const [quiet, setQuiet] = createSignal(false);
  // The last press on the card: by what, and where the finger really was (the click after a tap
  // is moved by the browser to the middle of the link it chose).
  let grid!: HTMLDivElement, press: PointerEvent | undefined;
  // The stamps that can be chosen, in the same (date) order as live().
  const links = () => [...grid.querySelectorAll<HTMLElement>('.attendance-stamp:not([data-off])')];
  const keyboard = (e: KeyboardEvent) => {
    const from = links().indexOf(e.target as HTMLElement);
    const to = from < 0 ? undefined : step(live(), from, e.key);
    if (to === undefined) return;
    e.preventDefault();
    setCurrent(live()[to]);
    links()[to].focus();
  };
  const tap = (e: MouseEvent) => {
    const at = press;
    press = undefined;
    if (at?.pointerType !== 'touch') return;
    const on = (e.target as HTMLElement).closest('[data-picked]');
    const centres = links().map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    const i = nearest(centres, at.clientX, at.clientY, REACH);
    const to = i < 0 ? undefined : id(live()[i]);
    // On the picked stamp's slip, or on the picked stamp and nearer it than its neighbours that
    // day, the tap follows the link.
    if (on && (to === picked() || (e.target as HTMLElement).closest('.attendance-tip'))) return;
    e.preventDefault();
    setQuiet(false);
    pick(to);
  };
  onSettled(() => {
    // A tap anywhere off the card puts the picked stamp's slip away.
    const away = (e: PointerEvent) => picked() && !grid.contains(e.target as Node) && pick();
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setQuiet(true);
      if (picked()) pick();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  });
  return (
    <div class="attendance" data-year={props.year % 4}>
      <Show when={props.years && props.onYear}>
        <div class="attendance-tabs" role="group" aria-label="年">
          <For each={props.years}>
            {(y) => {
              const count = () => props.items.filter((a) => yearOf(a) === y && shown(a)).length;
              return (
                <button
                  type="button"
                  class="attendance-tab"
                  data-year={y % 4}
                  data-empty={!count() || undefined}
                  aria-pressed={y === props.year ? 'true' : 'false'}
                  onClick={() => props.onYear!(y)}
                >
                  {y}
                  <span class="visually-hidden">{count()}本</span>
                </button>
              );
            }}
          </For>
        </div>
      </Show>
      <div class="attendance-card" data-stamp-anchor={`card-${props.year}`}>
        <header class="attendance-head">
          <h3>
            {props.year}
            <small>年 かいた日カード</small>
          </h3>
          <p class="attendance-count">
            <strong>{live().length}</strong>本
          </p>
        </header>
        <div
          class="attendance-grid"
          ref={grid}
          data-quiet={quiet() || undefined}
          onKeyDown={keyboard}
          onPointerDown={(e) => (press = e)}
          onClick={tap}
        >
          <span class="attendance-corner" aria-hidden="true">
            月＼日
          </span>
          {DAYS.map((d) => (
            <span class="attendance-day" data-tick={d === 1 || d % 5 === 0 || undefined} aria-hidden="true">
              {d}
            </span>
          ))}
          {MONTHS.map((m) => (
            <span class="attendance-month" style={{ 'grid-row': m + 1 }} aria-hidden="true">
              {m}月
            </span>
          ))}
          {/* The days the short months do not have. */}
          {[2, 4, 6, 9, 11].map((m) => (
            <span
              class="attendance-void"
              style={{ 'grid-area': `${m + 1} / ${daysIn(props.year, m) + 2} / auto / -1` }}
            />
          ))}
          <For each={stamps()}>
            {(s) => {
              const place = tipPlace(s),
                at = spot(s);
              return (
                <a
                  href={s.a.url}
                  class="attendance-stamp"
                  tabindex={s === tabStop() ? 0 : -1}
                  aria-hidden={shown(s.a) ? undefined : 'true'}
                  data-off={!shown(s.a) || undefined}
                  data-hot={props.hot === id(s) || undefined}
                  data-picked={picked() === id(s) || undefined}
                  data-crowd={s.of > 1 ? s.of : undefined}
                  data-edge={place.edge}
                  data-below={place.below}
                  style={{
                    'grid-area': `${s.m + 1} / ${s.d + 1}`,
                    ...(s.of > 1 && { '--dx': at.x, '--dy': at.y }),
                  }}
                  onPointerEnter={(e) => {
                    if (e.pointerType !== 'mouse') return;
                    setQuiet(false);
                    props.onHot?.(id(s));
                  }}
                  onPointerLeave={(e) => e.pointerType === 'mouse' && props.onHot?.(picked())}
                  onFocus={() => {
                    setQuiet(false);
                    props.onHot?.(id(s));
                  }}
                  onBlur={() => props.onHot?.(picked())}
                >
                  <DayStamp source={s.a.source} url={s.a.url} />
                  <span class="attendance-tip">
                    <strong>{s.a.title}</strong>
                    <small>
                      {formatDate(s.a.date)} {s.a.source}
                    </small>
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
