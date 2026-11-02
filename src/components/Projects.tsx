import { createSignal, For } from 'solid-js';
import Icon from './Icon.tsx';
import { OGImage, OriginalIcon, Postmark, postmarkDate, sizes } from './Preview.tsx';
import { keyStack, works } from '../content/content.ts';
import { featuredIds } from '../data/editorial.ts';
import { fingerSpeed, swipeTurn } from './deck-swipe.ts';
export const projects = featuredIds.map((id) => works.find((w) => w.id === id)!);
export default function Projects() {
  const [selected, setSelected] = createSignal(0);
  // Read out when the arrows or a swipe turn the deck; the tabs announce themselves on focus.
  const [spoken, setSpoken] = createSignal('');
  let tabs!: HTMLDivElement;
  function choose(i: number, focus = false, speak = !focus) {
    const next = (i + 3) % 3;
    if (next === selected()) return focus && (tabs.children[next] as HTMLButtonElement).focus();
    setSelected(next);
    setAway(32);
    if (focus) (tabs.children[next] as HTMLButtonElement).focus();
    if (speak) setSpoken(`0${next + 1} / 03 ${projects[next].title}`);
  }
  const keyboard = (e: KeyboardEvent) => {
    if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      choose(
        e.key === 'Home' ? 0 : e.key === 'End' ? 2 : selected() + (e.key === 'ArrowRight' ? 1 : -1),
        true,
      );
    }
  };
  // Touch swipe: the card follows the finger one to one, and a flick turns the deck as surely as
  // a long drag (deck-swipe.ts). The card thrown away keeps going the way it was thrown: how far
  // it steps aside (--away) grows with the speed it was let go at.
  // Vertical scrolling and pinch zoom stay native (touch-action: pan-y pinch-zoom); a second
  // finger means a pinch, so it cancels the swipe.
  const [drag, setDrag] = createSignal(0);
  const [away, setAway] = createSignal(32);
  let swipe = { x: 0, y: 0, id: -1, moves: [] as { t: number; x: number }[] };
  const swipeCancel = () => {
    swipe.id = -1;
    setDrag(0);
  };
  const swipeStart = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    if (e.isPrimary) swipe = { x: e.clientX, y: e.clientY, id: e.pointerId, moves: [] };
    else swipeCancel();
  };
  const swipeMove = (e: PointerEvent) => {
    if (e.pointerId !== swipe.id) return;
    swipe.moves = [...swipe.moves.filter((m) => e.timeStamp - m.t <= 100), { t: e.timeStamp, x: e.clientX }];
    const dx = e.clientX - swipe.x;
    if (Math.abs(dx) > Math.abs(e.clientY - swipe.y)) setDrag(dx);
  };
  const swipeEnd = (e: PointerEvent) => {
    if (e.pointerId !== swipe.id) return;
    swipe.id = -1;
    const dx = e.clientX - swipe.x,
      speed = fingerSpeed(swipe.moves, e.timeStamp, e.clientX),
      turn = swipeTurn(dx, e.clientY - swipe.y, speed);
    setDrag(0);
    if (!turn) return;
    choose(selected() + turn);
    // About as far as the card would go in the slide's first moments at the speed it was let go.
    setAway(Math.max(32, Math.abs(dx) + Math.min(120, Math.abs(speed) * 60)));
  };
  return (
    <section
      class="featured featured-editorial"
      aria-labelledby="featured-title"
      data-stamp-anchor="featured"
    >
      <div class="section-heading">
        <h2 id="featured-title">主な3作品</h2>
        <a href="/works" class="under-link">
          すべての作品
        </a>
      </div>
      <div
        class="featured-selector"
        ref={tabs}
        role="tablist"
        aria-label="主な3作品"
        onKeyDown={keyboard}
        style={{ '--selected': selected() }}
      >
        <For each={projects}>
          {(p, i) => (
            <button
              id={`project-tab-${i()}`}
              class="featured-tab"
              role="tab"
              aria-selected={selected() === i() ? 'true' : 'false'}
              aria-controls={`project-${i()}`}
              tabindex={selected() === i() ? 0 : -1}
              onClick={() => choose(i(), false, false)}
              data-project-tab={i()}
            >
              <span class="project-spot">
                <OriginalIcon url={p.url} name={p.title} />
                <span class="project-order">0{i() + 1}</span>
              </span>
              <span class="project-name">{p.title}</span>
              {p.id === 'minna-no-monosashi' && <small>新作</small>}
            </button>
          )}
        </For>
      </div>
      <div
        class="project-deck"
        data-dragging={drag() ? 'true' : undefined}
        style={{ '--drag': `${drag()}px`, '--away': `${away()}px` }}
        onPointerDown={swipeStart}
        onPointerMove={swipeMove}
        onPointerUp={swipeEnd}
        onPointerCancel={swipeCancel}
      >
        <For each={projects}>
          {(p, i) => (
            <article
              id={`project-${i()}`}
              class={['featured-project', { active: selected() === i() }]}
              // Around the ring of three: the work after the selected one waits on the right, the
              // one before on the left, so turning past the last comes in from the same side.
              data-pos={i() === selected() ? 'active' : (i() - selected() + 3) % 3 === 1 ? 'next' : 'prev'}
              data-stamp-anchor={`work-${p.id}`}
              role="tabpanel"
              aria-labelledby={`project-tab-${i()}`}
              aria-hidden={selected() === i() ? 'false' : 'true'}
              inert={selected() !== i()}
            >
              <div class="featured-image">
                <OGImage url={p.url} alt={`${p.title}のOG画像`} sizes={sizes.featured} priority={i() === 0} />
                <Postmark date={postmarkDate(p.productionTime)} />
              </div>
              <div class="featured-copy">
                <p class="project-kind">{p.tags.join(' / ')}</p>
                <h3>
                  <OriginalIcon url={p.url} name={p.title} />
                  {p.title}
                </h3>
                <p class="project-description">{p.description}</p>
                <p class="project-stack">{keyStack(p).join(' / ')}</p>
                <div class="project-links">
                  <a class="primary-button" href={p.url}>
                    作品を開く
                    <Icon name="ArrowUpRight" size={17} />
                  </a>
                  <a class="under-link" href={`/works/${p.id}`}>
                    制作について
                  </a>
                </div>
              </div>
            </article>
          )}
        </For>
      </div>
      <div class="featured-bottom">
        <span class="project-page">
          0{selected() + 1} <span>/ 03</span>
        </span>
        <span class="visually-hidden" role="status">
          {spoken()}
        </span>
        <div class="deck-arrows">
          <button class="icon-button" aria-label="前の作品" onClick={() => choose(selected() - 1)}>
            <Icon name="ChevronLeft" size={18} />
          </button>
          <button class="icon-button" aria-label="次の作品" onClick={() => choose(selected() + 1)}>
            <Icon name="ChevronRight" size={18} />
          </button>
        </div>
      </div>
      <noscript
        innerHTML={`<p class="nojs-links">${projects.map((p) => `<a href="/works/${p.id}">${p.title}</a>`).join('')}</p>`}
      />
    </section>
  );
}
